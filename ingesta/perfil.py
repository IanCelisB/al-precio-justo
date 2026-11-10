"""Perfil de cada empresa: a qué se dedica y de dónde vienen sus ingresos.

Fuentes (todas públicas y gratuitas):
- Wikidata (por el CIK de la SEC, licencia CC0): fundación, sede, CEO, empleados y web.
- SEC (lista de presentaciones): industria, bolsa, estado de constitución y cierre fiscal.
- El último 10-K, leído por `lector.read_inline_segments`: ventas por segmento,
  producto y región, con los nombres que usa la propia empresa.

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


def desglose(segs: list, total: float | None) -> dict[str, list[dict]]:
    """Por eje, las partes del último año fiscal que suman (aprox.) el total de ventas.
    Se suman de menor a mayor: así se prefieren las partes finas (iPhone, Mac…) a las
    agrupaciones (Productos) cuando la empresa informa ambas."""
    anuales = [s for s in segs if s.start and 330 <= (date.fromisoformat(s.end) - date.fromisoformat(s.start)).days <= 380]
    if not anuales:
        return {}
    fin = max(s.end for s in anuales)
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
        for p in sorted(partes, key=lambda x: x.value):
            if suma + p.value <= base * 1.02:
                elegidas.append(p)
                suma += p.value
        if len(elegidas) >= 2 and suma >= base * 0.8:
            out[nombre] = [{"miembro": p.member, "valor": p.value} for p in sorted(elegidas, key=lambda x: -x.value)]
    return out


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
    # Último 10-K con Inline XBRL: desglose de ventas.
    for i, forma in enumerate(r.get("form", [])):
        if forma != "10-K" or not r.get("isInlineXBRL", [0])[i]:
            continue
        acc, doc = r["accessionNumber"][i], r["primaryDocument"][i]
        html = client.fetch(f"https://www.sec.gov/Archives/edgar/data/{empresa['cik']}/{acc.replace('-', '')}/{doc}")
        segs = read_inline_segments(html.decode("utf-8", "replace"), concepts=set(FLOW_TAGS["revenue"]))
        if segs:
            etiquetas = etiquetas_10k(client, empresa["cik"], acc)
            ventas = _ventas_anuales(html.decode("utf-8", "replace"))
            partes = desglose(segs, ventas)
            for lista in partes.values():
                for p in lista:
                    p["nombre"] = _nombre_miembro(p.pop("miembro"), etiquetas)
            out["ingresos"] = partes
            out["ingresosAnio"] = max(s.end for s in segs)[:4]
            out["ingresosFuente"] = f"10-K presentado el {r['filingDate'][i]}"
        break
    return out


def _ventas_anuales(html: str) -> float | None:
    from .lector import read_inline_xbrl
    anuales = [f for f in read_inline_xbrl(html) if f.prefix == "us-gaap" and f.concept in FLOW_TAGS["revenue"]
               and f.start and 330 <= (date.fromisoformat(f.end) - date.fromisoformat(f.start)).days <= 380]
    if not anuales:
        return None
    fin = max(f.end for f in anuales)
    for tag in FLOW_TAGS["revenue"]:
        for f in anuales:
            if f.concept == tag and f.end == fin:
                return f.value
    return None


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
