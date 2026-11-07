"""Lista de empresas a seguir.

Universo del prototipo (~1.000 empresas, `lista`):
- S&P 500 y S&P 400 (medianas), de las tablas publicas de Wikipedia;
- populares entre inversores minoristas que no estan en esos indices (`POPULARES`).
Solo empresas que presentan 10-Q / 10-K a la SEC: las extranjeras (20-F) llegan en
otra fase. En produccion la lista debe venir de una fuente con licencia.

La lista se guarda en ingesta/universo.json (versionada) para que no cambie sola de un dia a otro;
`lista(client, refrescar=True)` la vuelve a armar.
"""
from __future__ import annotations

import json
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

from .sec import SecClient

SP500_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
SP400_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_400_companies"
MAXIMO = 1000
ARCHIVO = Path(__file__).resolve().parent / "universo.json"

# Populares fuera del S&P 500/400 (se descartan solas si ya estan en un indice o no presentan 10-K).
POPULARES = """MELI SNOW NET RBLX RIVN LCID SOFI AFRM U ROKU PINS SNAP ZM DOCU TWLO OKTA MDB TEAM ZS HUBS PATH
GME AMC BYND CHWY ETSY W LYFT UPST MSTR MARA RIOT CLSK IONQ RKLB ASTS SMR OKLO HIMS CELH ELF TOST DUOL CAVA
BROS SOUN BBAI QS PLUG FCEL RUN ENPH OPEN Z COIN HOOD DKNG PLTR APP CVNA DASH ABNB UBER CRWD DDOG ARM
BILL GTLB S ESTC CFLT FROG DOCN FSLY AI SG WRBY FIGS PTON TDOC NVAX ACHR JOBY LUNR RDW SPCE
CHPT BLNK EVGO ARRY SEDG FSLR CROX DECK SKX ONON RDDT ALAB CRDO TEM RXRX CRSP BEAM NTLA EDIT VKTX""".split()
# El código SIC de la SEC no siempre coincide con GICS: correcciones para las populares.
SECTOR_MANUAL = {
    "MELI": "Consumer Discretionary", "ETSY": "Consumer Discretionary", "QS": "Consumer Discretionary",
    "RBLX": "Communication Services", "SNAP": "Communication Services", "Z": "Real Estate",
    "LUNR": "Industrials", "SMR": "Industrials", "TEM": "Health Care",
    "MSTR": "Information Technology", "MARA": "Information Technology", "RIOT": "Information Technology",
    "CLSK": "Information Technology",
}
_UA_PUBLICO = "Ancla/0.1 (prototipo)"   # para sitios que no son la SEC: sin datos de contacto


def descargar_publico(url: str, destino: Path, refrescar: bool = False) -> str:
    """Paginas publicas (Wikipedia). No usa el User-Agent de la SEC, que lleva un email."""
    if refrescar or not destino.exists():
        req = urllib.request.Request(url, headers={"User-Agent": _UA_PUBLICO})
        with urllib.request.urlopen(req, timeout=30) as r:
            destino.write_bytes(r.read())
    return destino.read_text(encoding="utf-8")

# Empresas que cambiaron de CIK (nueva sociedad matriz, fusión): su historia
# está repartida entre varios registros de la SEC. Ticker -> CIK anteriores.
PREDECESSOR_CIKS: dict[str, list[int]] = {
    "XOM": [34088],  # Exxon Mobil Corp -> ExxonMobil Holdings Corp
}


class _ConstituentsParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_table = False
        self.depth = 0
        self.rows: list[list[str]] = []
        self.row: list[str] | None = None
        self.cell: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            if self.in_table:
                self.depth += 1
            elif dict(attrs).get("id") == "constituents":
                self.in_table, self.depth = True, 0
        elif self.in_table and self.depth == 0:
            if tag == "tr":
                self.row = []
            elif tag in ("td", "th") and self.row is not None:
                self.cell = []

    def handle_endtag(self, tag):
        if not self.in_table:
            return
        if tag == "table":
            if self.depth:
                self.depth -= 1
            else:
                self.in_table = False
        elif self.depth == 0:
            if tag in ("td", "th") and self.cell is not None and self.row is not None:
                self.row.append(" ".join("".join(self.cell).split()))
                self.cell = None
            elif tag == "tr" and self.row is not None:
                if self.row:
                    self.rows.append(self.row)
                self.row = None

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)


def parse_sp500(html: str) -> list[dict]:
    p = _ConstituentsParser()
    p.feed(html)
    if len(p.rows) < 2:
        raise ValueError("No se encontró la tabla de constituyentes del S&P 500")
    header = [h.lower() for h in p.rows[0]]

    def col(*names):
        for n in names:
            for i, h in enumerate(header):
                if n in h:
                    return i
        raise ValueError(f"Columna no encontrada: {names}")

    i_sym, i_name, i_sector, i_cik = col("symbol"), col("security"), col("gics sector"), col("cik")
    out = []
    for r in p.rows[1:]:
        if len(r) <= max(i_sym, i_name, i_sector, i_cik):
            continue
        out.append({
            "ticker": r[i_sym].strip().upper(),
            "name": r[i_name].strip(),
            "sector": r[i_sector].strip(),
            "cik": int(r[i_cik]),
        })
    return out


def sp500(client: SecClient, refresh: bool = False) -> list[dict]:
    html = descargar_publico(SP500_URL, client.cache_dir / "sp500.html", refresh)
    return [{**c, "indice": "S&P 500"} for c in parse_sp500(html)]


def parse_tabla(html: str) -> list[dict]:
    """Tabla de constituyentes sin CIK (S&P 400): ticker, nombre y sector."""
    p = _ConstituentsParser()
    p.feed(html)
    if len(p.rows) < 2:
        raise ValueError("No se encontró la tabla de constituyentes")
    h = [x.lower() for x in p.rows[0]]
    i_sym, i_name, i_sector = h.index("symbol"), h.index("security"), h.index("gics sector")
    return [{"ticker": r[i_sym].strip().upper(), "name": r[i_name].strip(), "sector": r[i_sector].strip()}
            for r in p.rows[1:] if len(r) > max(i_sym, i_name, i_sector)]


# Código SIC de la SEC -> sector GICS aproximado (para las empresas sin sector publicado).
_SIC = [
    ((100, 999), "Consumer Staples"), ((1000, 1299), "Materials"), ((1300, 1399), "Energy"),
    ((1400, 1499), "Materials"), ((1500, 1799), "Industrials"), ((2000, 2199), "Consumer Staples"),
    ((2200, 2399), "Consumer Discretionary"), ((2400, 2699), "Materials"), ((2700, 2799), "Communication Services"),
    ((2800, 2829), "Materials"), ((2830, 2836), "Health Care"), ((2840, 2844), "Consumer Staples"),
    ((2845, 2899), "Materials"), ((2900, 2999), "Energy"), ((3000, 3499), "Materials"),
    ((3500, 3569), "Industrials"), ((3570, 3579), "Information Technology"),
    ((3580, 3659), "Industrials"), ((3660, 3699), "Information Technology"), ((3700, 3716), "Consumer Discretionary"),
    ((3717, 3799), "Industrials"), ((3800, 3849), "Health Care"),
    ((3850, 3999), "Consumer Discretionary"), ((4000, 4799), "Industrials"),
    ((4800, 4899), "Communication Services"), ((4900, 4999), "Utilities"), ((5000, 5199), "Industrials"),
    ((5200, 5399), "Consumer Discretionary"), ((5400, 5499), "Consumer Staples"), ((5500, 5999), "Consumer Discretionary"),
    ((6000, 6499), "Financials"), ((6500, 6799), "Real Estate"), ((7000, 7299), "Consumer Discretionary"),
    ((7300, 7379), "Information Technology"), ((7380, 7799), "Industrials"), ((7800, 7999), "Communication Services"),
    ((8000, 8099), "Health Care"), ((8700, 8799), "Industrials"),
]


def sector_por_sic(sic) -> str | None:
    try:
        n = int(sic)
    except (TypeError, ValueError):
        return None
    return next((nombre for (a, b), nombre in _SIC if a <= n <= b), None)


def _presenta_10k(client: SecClient, cik: int) -> tuple[bool, str | None]:
    """Presenta 10-K/10-Q (no 20-F)? Y su sector segun el codigo SIC."""
    sub = client.submissions(cik, refresh=False)
    forms = set(sub.get("filings", {}).get("recent", {}).get("form", [])[:80])
    return bool(forms & {"10-K", "10-Q"}), sector_por_sic(sub.get("sic"))


def armar(client: SecClient, maximo: int = MAXIMO) -> list[dict]:
    """S&P 500 + S&P 400 + populares que presentan 10-K, sin repetidos, hasta `maximo`."""
    tmap = client.ticker_map()

    def cik_de(t):
        return (tmap.get(t) or tmap.get(t.replace(".", "-")) or (None, None))[0]

    out = sp500(client, refresh=True)
    vistos = {c["ticker"] for c in out} | {c["cik"] for c in out}
    candidatos = [{**c, "indice": "S&P 400"} for c in parse_tabla(
        descargar_publico(SP400_URL, client.cache_dir / "sp400.html", refrescar=True))]
    candidatos += [{"ticker": t, "name": (tmap.get(t) or (0, t))[1], "sector": None, "indice": "Popular"}
                   for t in dict.fromkeys(POPULARES)]
    for c in candidatos:
        if len(out) >= maximo:
            break
        cik = cik_de(c["ticker"])
        if not cik or c["ticker"] in vistos or cik in vistos:
            continue
        domestica, sector = _presenta_10k(client, cik)
        if not domestica:
            continue
        out.append({**c, "cik": cik, "sector": c["sector"] or SECTOR_MANUAL.get(c["ticker"]) or sector})
        vistos |= {c["ticker"], cik}
    return out


def lista(client: SecClient, refrescar: bool = False) -> list[dict]:
    """El universo del prototipo (guardado en ingesta/universo.json)."""
    if refrescar or not ARCHIVO.exists():
        empresas = armar(client)
        ARCHIVO.write_text(json.dumps(empresas, ensure_ascii=False, indent=0), encoding="utf-8")
    return json.loads(ARCHIVO.read_text(encoding="utf-8"))


def by_tickers(client: SecClient, tickers: list[str]) -> list[dict]:
    """Empresas concretas. Busca primero en el S&P 500 (trae CIK y sector) y,
    si no está, en el listado oficial de la SEC (requiere SEC_USER_AGENT con email)."""
    index = {c["ticker"]: c for c in (lista(client) if ARCHIVO.exists() else sp500(client))}
    tmap = None
    out = []
    for t in tickers:
        key = t.strip().upper()
        if key in index:
            out.append(index[key])
            continue
        if tmap is None:
            tmap = client.ticker_map()
        found = tmap.get(key) or tmap.get(key.replace(".", "-"))
        if not found:
            raise ValueError(f"Ticker desconocido para la SEC: {t}")
        out.append({"ticker": key, "name": found[1], "sector": None, "cik": found[0]})
    return out
