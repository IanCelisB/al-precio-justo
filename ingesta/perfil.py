"""Perfil de cada empresa: a qué se dedica y de dónde vienen sus ingresos.

Fuentes (todas públicas y gratuitas):
- Wikidata (por el CIK de la SEC, licencia CC0): fundación, sede, CEO, empleados y web.
- SEC (lista de presentaciones): industria, bolsa, estado de constitución y cierre fiscal.
- Los dos últimos 10-K con Inline XBRL (el de este año y el de hace dos), leídos por
  `lector.read_inline_segments`: ventas por segmento, producto y región de los últimos
  5 años fiscales, con los nombres que usa la propia empresa.
- El último 10-K, sección "Item 1. Business": a qué se dedica la empresa, en sus palabras
  (en inglés; los documentos presentados a la SEC son de dominio público).

    py -m ingesta.perfil --todas            # ~20 min para ~1.000 empresas
    py -m ingesta.perfil --tickers AAPL,KO
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

from . import db, universo
from .lector import read_inline_segments
from .metricas import FLOW_TAGS
from .sec import SecClient, SecError

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
UA = "AlPrecioJusto/0.1 (https://github.com/IanCelisB/al-precio-justo)"  # sin datos personales

SCHEMA = """
CREATE TABLE IF NOT EXISTS perfiles (
    ticker      TEXT PRIMARY KEY,
    datos       TEXT NOT NULL,     -- JSON
    actualizado TEXT NOT NULL
);
"""

EJES = {
    "StatementBusinessSegmentsAxis": "segmentos",
    "ProductOrServiceAxis": "productos",
    "StatementGeographicalAxis": "regiones",
}
# Miembros que no son una parte del negocio (totales, eliminaciones, ajustes).
IGNORAR = re.compile(r"(Elimination|Intersegment|Corporate|Consolidat|Reconcil|Adjust|Total|AllOther|OperatingSegments"
                     r"|SegmentReportingSegment|Unallocated|Hedg)", re.I)
NOMBRES = {
    "ProductMember": "Productos", "ServiceMember": "Servicios", "OtherCountriesMember": "Otros países",
    "NonUsMember": "Fuera de EE. UU.", "AmericasMember": "América", "EuropeMember": "Europa",
    "AsiaPacificMember": "Asia-Pacífico", "EMEAMember": "Europa, Oriente Medio y África", "AsiaMember": "Asia",
    "NorthAmericaMember": "Norteamérica", "LatinAmericaMember": "Latinoamérica", "RestOfWorldMember": "Resto del mundo",
    "GreaterChinaMember": "Gran China", "InternationalMember": "Internacional", "OtherMember": "Otros",
}
PAISES = {
    "US": "Estados Unidos", "CN": "China", "JP": "Japón", "GB": "Reino Unido", "DE": "Alemania", "FR": "Francia",
    "CA": "Canadá", "IN": "India", "MX": "México", "BR": "Brasil", "KR": "Corea del Sur", "TW": "Taiwán",
    "IE": "Irlanda", "NL": "Países Bajos", "CH": "Suiza", "SG": "Singapur", "AU": "Australia", "IT": "Italia",
    "ES": "España", "HK": "Hong Kong", "CL": "Chile", "AR": "Argentina", "CO": "Colombia", "PE": "Perú",
    "BE": "Bélgica", "SE": "Suecia", "IL": "Israel", "MY": "Malasia", "TH": "Tailandia", "PR": "Puerto Rico",
}


# --- red (Wikidata) ----------------------------------------------------------------------------
def _get(url: str, data: bytes | None = None, headers: dict | None = None) -> bytes:
    for intento in range(4):
        req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            if e.code in (429, 500, 502, 503, 504) and intento < 3:
                time.sleep(2 ** (intento + 1))
                continue
            raise
        except urllib.error.URLError:
            if intento < 3:
                time.sleep(2 ** intento)
                continue
            raise
    raise RuntimeError(url)


def wikidata(ciks: list[int]) -> dict[int, dict]:
    """Datos de Wikidata para cada CIK (propiedad P5531)."""
    out: dict[int, dict] = {}
    for i in range(0, len(ciks), 150):
        valores = " ".join(f'"{c:010d}"' for c in ciks[i:i + 150])
        q = f"""
        SELECT ?cik ?inicio ?empleados ?web ?ceoLabel ?sedeLabel WHERE {{
          VALUES ?cik {{ {valores} }}
          ?item wdt:P5531 ?cik .
          OPTIONAL {{ ?item wdt:P571 ?inicio }}
          OPTIONAL {{ ?item wdt:P1128 ?empleados }}
          OPTIONAL {{ ?item wdt:P856 ?web }}
          OPTIONAL {{ ?item wdt:P169 ?ceo }}
          OPTIONAL {{ ?item wdt:P159 ?sede }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "es,en". }}
        }}"""
        body = urllib.parse.urlencode({"query": q, "format": "json"}).encode()
        res = json.loads(_get("https://query.wikidata.org/sparql", body,
                              {"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/sparql-results+json"}))
        for b in res["results"]["bindings"]:
            v = {k: x["value"] for k, x in b.items()}
            d = out.setdefault(int(v["cik"]), {})
            for k in ("ceoLabel", "sedeLabel"):
                if k in v and k not in d and not re.fullmatch(r"Q\d+", v[k]):  # Q123: sin nombre en Wikidata
                    d[k] = v[k]
            if "web" in v and ("web" not in d or len(v["web"]) < len(d["web"])):  # la más corta: la principal
                d["web"] = v["web"]
            if "inicio" in v:
                anio = v["inicio"][:4].lstrip("+")
                if anio.isdigit() and ("fundacion" not in d or int(anio) < int(d["fundacion"])):
                    d["fundacion"] = anio
            if "empleados" in v:
                try:
                    d["empleados"] = max(d.get("empleados", 0), int(float(v["empleados"])))
                except ValueError:
                    pass
        time.sleep(1)
    return out



# --- SEC: industria y último 10-K --------------------------------------------------------------
def _nombre_miembro(miembro: str, etiquetas: dict[str, str]) -> str:
    pref, _, local = miembro.partition(":")
    if pref == "country" and local in PAISES:
        return PAISES[local]
    if local in NOMBRES:
        return NOMBRES[local]
    if f"{pref}_{local}" in etiquetas:
        return re.sub(r"\s*\[(Member|Domain)\]$", "", etiquetas[f"{pref}_{local}"]).strip()
    texto = re.sub(r"Member$", "", local)
    return re.sub(r"(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", " ", texto).strip()


def etiquetas_10k(client: SecClient, cik: int, acc: str) -> dict[str, str]:
    """Nombres que la empresa da a sus miembros (archivo *_lab.xml de la presentación)."""
    carpeta = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}"
    try:
        items = client.get_json(f"{carpeta}/index.json", f"index_{acc}", guardar=False)["directory"]["item"]
        lab = next((i["name"] for i in items if i["name"].endswith("_lab.xml")), None)
        if not lab:
            return {}
        raiz = ET.fromstring(client.fetch(f"{carpeta}/{lab}"))
    except (SecError, ET.ParseError, KeyError):
        return {}
    xl = "{http://www.w3.org/1999/xlink}"
    out: dict[str, str] = {}
    for enlace in raiz.iter():
        if not enlace.tag.endswith("labelLink"):
            continue
        loc = {e.get(f"{xl}label"): e.get(f"{xl}href", "").split("#")[-1] for e in enlace if e.tag.endswith("loc")}
        txt = {e.get(f"{xl}label"): (e.text or "").strip() for e in enlace
               if e.tag.endswith("}label") and e.get(f"{xl}role", "").endswith("/label")}
        for arco in enlace:
            if arco.tag.endswith("labelArc"):
                origen, destino = loc.get(arco.get(f"{xl}from")), txt.get(arco.get(f"{xl}to"))
                if origen and destino:
                    out.setdefault(origen, destino)
    return out


def _partes(anuales: list, fin: str, total: float | None) -> dict[str, list[dict]]:
    """Por eje, las partes de un año fiscal (cierre `fin`) que suman (aprox.) el total de ventas.
    Se suman de menor a mayor: así se prefieren las partes finas (iPhone, Mac…) a las
    agrupaciones (Productos) cuando la empresa informa ambas."""
    out: dict[str, list[dict]] = {}
    for eje, nombre in EJES.items():
        # Un concepto por eje: el que más partes tiene.
        por_concepto: dict[str, list] = {}
        for s in anuales:
            if s.end == fin and s.axis == eje and s.value > 0 and not IGNORAR.search(s.member):
                por_concepto.setdefault(s.concept, []).append(s)
        if not por_concepto:
            continue
        partes = max(por_concepto.values(), key=len)
        base = total or sum(p.value for p in partes)
        elegidas, suma = [], 0.0
        vistos = set()
        for p in sorted(partes, key=lambda x: x.value):
            if p.member in vistos:
                continue
            if suma + p.value <= base * 1.02:
                elegidas.append(p)
                vistos.add(p.member)
                suma += p.value
        if len(elegidas) >= 2 and suma >= base * 0.8:
            out[nombre] = [{"miembro": p.member, "valor": p.value} for p in sorted(elegidas, key=lambda x: -x.value)]
    return out


def _anuales(segs: list) -> list:
    return [s for s in segs if s.start and 330 <= (date.fromisoformat(s.end) - date.fromisoformat(s.start)).days <= 380]


def desglose(segs: list, total: float | None) -> dict[str, list[dict]]:
    """Desglose del último año fiscal del documento."""
    anuales = _anuales(segs)
    if not anuales:
        return {}
    return _partes(anuales, max(s.end for s in anuales), total)


def desglose_anual(segs: list, totales: dict[str, float]) -> dict[str, dict]:
    """Desglose de cada año fiscal del documento: {cierre: {eje: [partes]}} (un 10-K trae 2 o 3 años)."""
    anuales = _anuales(segs)
    return {fin: _partes(anuales, fin, totales.get(fin)) for fin in sorted({s.end for s in anuales})}


def historia_ingresos(docs: list[dict], max_anios: int = 5) -> dict[str, list[dict]]:
    """Une los años de varios 10-K (el más reciente manda) en una serie por eje:
    {eje: [{anio, cierre, total, partes: [{nombre, valor}]}…]} del más antiguo al más nuevo."""
    por_fin: dict[str, dict] = {}
    for d in docs:                                # del más reciente al más antiguo
        for fin, ejes in d["anios"].items():
            if fin not in por_fin:
                por_fin[fin] = {"ejes": ejes, "total": d["totales"].get(fin), "etiquetas": d["etiquetas"]}
    fines = sorted(por_fin)[-max_anios:]
    out: dict[str, list[dict]] = {}
    for eje in EJES.values():
        serie = []
        for fin in fines:
            info = por_fin[fin]
            partes = info["ejes"].get(eje)
            if not partes:
                continue
            serie.append({
                "anio": fin[:4], "cierre": fin,
                "total": info["total"] or sum(p["valor"] for p in partes),
                "partes": [{"nombre": _nombre_miembro(p["miembro"], info["etiquetas"]), "valor": p["valor"]} for p in partes],
            })
        if len(serie) >= 2:
            out[eje] = serie
    return out


# --- "Item 1. Business": a qué se dedica la empresa ---------------------------------------------
class _Texto(HTMLParser):
    """Texto visible del 10-K, con un salto de línea por bloque (sin la cabecera XBRL oculta)."""
    BLOQUES = {"p", "div", "br", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.partes: list[str] = []
        self.oculto = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("ix:header", "script", "style"):
            self.oculto += 1
        elif tag in self.BLOQUES:
            self.partes.append("\n")
        elif tag in ("td", "th"):
            self.partes.append(" ")

    def handle_endtag(self, tag):
        if tag in ("ix:header", "script", "style"):
            self.oculto = max(0, self.oculto - 1)
        elif tag in self.BLOQUES:
            self.partes.append("\n")

    def handle_data(self, data):
        if not self.oculto:
            self.partes.append(data)


_ITEM1 = re.compile(r"^item\s*1\s*[.:\-–—]?\s*(business)?\s*\.?$", re.I)
_ITEM1A = re.compile(r"^item\s*1a\b", re.I)
_TITULO = re.compile(r"^(overview|general|business|our company|company overview|the company)\.?$", re.I)


def actividad_10k(html: str, max_chars: int = 2200) -> str | None:
    """Los primeros párrafos de "Item 1. Business" del 10-K (la descripción del negocio)."""
    p = _Texto()
    try:
        p.feed(html)
    except Exception:
        return None
    lineas = [" ".join(x.split()) for x in "".join(p.partes).split("\n")]
    lineas = [x for x in lineas if x]
    mejor: list[str] = []
    for i, l in enumerate(lineas):
        sig = lineas[i + 1] if i + 1 < len(lineas) else ""
        if not (_ITEM1.match(l) or (re.fullmatch(r"item\s*1\.?", l, re.I) and sig.lower().startswith("business"))):
            continue
        cuerpo = []
        for x in lineas[i + 1:]:
            if _ITEM1A.match(x):
                break
            cuerpo.append(x)
        if sum(len(x) for x in cuerpo) > sum(len(x) for x in mejor):   # el índice tiene muy poco texto
            mejor = cuerpo
    parrafos, total = [], 0
    for x in mejor:
        if len(x) < 80 or _TITULO.match(x) or not re.search(r"[.!?]$", x):   # títulos y líneas sueltas
            if parrafos and total > 400:
                break
            continue
        if re.match(r"^(this|the following)?\s*(annual report|form 10-k).*forward-looking", x, re.I):
            continue
        parrafos.append(x)
        total += len(x)
        if total >= max_chars * 0.6:
            break
    texto = "\n\n".join(parrafos)
    if len(texto) < 120:
        return None
    if len(texto) > max_chars:
        corte = texto.rfind(". ", 0, max_chars)
        texto = texto[: corte + 1 if corte > 200 else max_chars]
    return texto


def _documento_10k(client: SecClient, cik: int, acc: str, doc: str) -> dict | None:
    html = client.fetch(f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}/{doc}").decode("utf-8", "replace")
    segs = read_inline_segments(html, concepts=set(FLOW_TAGS["revenue"]))
    return {"html": html, "segs": segs, "acc": acc}


def perfil_sec(client: SecClient, empresa: dict) -> dict:
    sub = client.submissions(empresa["cik"])
    neg = (sub.get("addresses") or {}).get("business") or {}
    r = sub.get("filings", {}).get("recent", {})
    out = {
        "industria": (sub.get("sicDescription") or "").title() or None,
        "bolsas": list(dict.fromkeys(x for x in sub.get("exchanges") or [] if x)),
        "constituida": sub.get("stateOfIncorporationDescription") or None,
        "cierreFiscal": sub.get("fiscalYearEnd") or None,
        "ciudadSec": ", ".join(x for x in (neg.get("city"), neg.get("stateOrCountryDescription")) if x) or None,
        "webSec": sub.get("website") or None,
    }
    # 10-K con Inline XBRL: el último (descripción y años recientes) y el de hace dos años
    # (años anteriores). Juntos cubren 5 años fiscales.
    diezk = [i for i, forma in enumerate(r.get("form", [])) if forma == "10-K" and r.get("isInlineXBRL", [0] * (i + 1))[i]]
    docs = []
    for k, i in enumerate(diezk[:3]):
        if k == 1:
            continue
        acc, doc = r["accessionNumber"][i], r["primaryDocument"][i]
        d = _documento_10k(client, empresa["cik"], acc, doc)
        if k == 0:
            texto = actividad_10k(d["html"])
            if texto:
                carpeta = f"https://www.sec.gov/Archives/edgar/data/{empresa['cik']}/{acc.replace('-', '')}/{doc}"
                out["actividad"] = {"texto": texto, "idioma": "en", "fuente": carpeta, "fecha": r["filingDate"][i]}
        if not d["segs"]:
            continue
        etiquetas = etiquetas_10k(client, empresa["cik"], acc)
        totales = _ventas_anuales(d["html"])
        docs.append({"anios": desglose_anual(d["segs"], totales), "totales": totales, "etiquetas": etiquetas})
        if k == 0:
            ultimo = max(s.end for s in d["segs"])
            partes = desglose(d["segs"], totales.get(ultimo))
            for lista in partes.values():
                for p in lista:
                    p["nombre"] = _nombre_miembro(p.pop("miembro"), etiquetas)
            out["ingresos"] = partes
            out["ingresosAnio"] = ultimo[:4]
            out["ingresosFuente"] = f"10-K presentado el {r['filingDate'][i]}"
    if docs:
        historia = historia_ingresos(docs)
        if historia:
            out["ingresosHistoria"] = historia
    return out


def _ventas_anuales(html: str) -> dict[str, float]:
    """Ventas totales de cada año fiscal del documento: {cierre: ventas}."""
    from .lector import read_inline_xbrl
    anuales = [f for f in read_inline_xbrl(html) if f.prefix == "us-gaap" and f.concept in FLOW_TAGS["revenue"]
               and f.start and 330 <= (date.fromisoformat(f.end) - date.fromisoformat(f.start)).days <= 380]
    out: dict[str, float] = {}
    for fin in sorted({f.end for f in anuales}):
        for tag in FLOW_TAGS["revenue"]:
            v = next((f.value for f in anuales if f.concept == tag and f.end == fin), None)
            if v is not None:
                out[fin] = v
                break
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Perfil de cada empresa (datos y desglose de ventas)")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--tickers")
    src.add_argument("--todas", action="store_true")
    ap.add_argument("--db", type=Path, default=DATA / "ancla.db")
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8")

    client = SecClient(DATA / "raw")
    empresas = universo.lista(client) if args.todas else universo.by_tickers(client, args.tickers.split(","))
    con = db.connect(args.db)
    con.executescript(SCHEMA)
    t0 = time.monotonic()
    wd = wikidata([e["cik"] for e in empresas])
    print(f"Wikidata: {len(wd)} de {len(empresas)} empresas encontradas ({time.monotonic() - t0:.0f} s)")
    errores = 0
    for n, e in enumerate(empresas, 1):
        d = wd.get(e["cik"], {})
        perfil: dict = {
            "fundacion": d.get("fundacion"), "empleados": d.get("empleados"), "ceo": d.get("ceoLabel"),
            "sede": d.get("sedeLabel"), "web": d.get("web"),
        }
        try:
            perfil.update(perfil_sec(client, e))
        except (SecError, ValueError, ET.ParseError) as err:
            errores += 1
            print(f"  {e['ticker']}: sin datos de la SEC ({err})")
        perfil["web"] = perfil["web"] or (f"https://{perfil['webSec']}" if perfil.get("webSec") and "://" not in perfil["webSec"] else perfil.get("webSec"))
        perfil.pop("webSec", None)
        with con:
            con.execute("INSERT INTO perfiles VALUES (?,?,?) ON CONFLICT(ticker) DO UPDATE SET datos=excluded.datos, "
                        "actualizado=excluded.actualizado", (e["ticker"], json.dumps(perfil, ensure_ascii=False), db.now()))
        if n % 50 == 0 or n == len(empresas):
            print(f"{n}/{len(empresas)} perfiles ({time.monotonic() - t0:.0f} s)", flush=True)
    return 0 if not errores else 1


if __name__ == "__main__":
    raise SystemExit(main())
