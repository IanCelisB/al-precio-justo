"""Actualización automática: detecta los 10-Q / 10-K nuevos y los publica tras revisarlos.

1. Detectar: lee el índice diario de EDGAR (todas las presentaciones del día) y se
   queda con los 10-Q / 10-K de las empresas del universo (~1.000).
2. Procesar: el proceso de reportes descarga y lee cada documento (los documentos son
   la única fuente de las cifras). La primera vez que una empresa presenta algo,
   se lee también toda su historia desde 2009 (unos 30 s).
3. Revisar: `calidad.revisar` compara con lo publicado y con la API de la SEC.
4. Publicar o poner en cuarentena: si todo está bien, se actualiza `fundamentals_q`
   y la API lo muestra en ≤ 5 minutos. Si no, la app sigue mostrando lo anterior y
   queda una alerta para revisar.

Ejemplos:
    py -m ingesta.actualizar                      # días pendientes desde la última vez
    py -m ingesta.actualizar --desde 2026-10-20   # vuelve a mirar desde una fecha
    py -m ingesta.actualizar --tickers AAPL       # fuerza una empresa
    py -m ingesta.actualizar --migrar 20          # pasa 20 empresas más a datos de documentos
    py -m ingesta.actualizar --cuarentena         # lista lo pendiente de revisar
    py -m ingesta.actualizar --aprobar AAPL       # publica lo que estaba en cuarentena
    py -m ingesta.actualizar --rechazar AAPL      # lo descarta (sus cifras no se usan)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import time
import urllib.request
from datetime import date, timedelta
from pathlib import Path

from . import db, documentos, universo
from .calidad import Revision, iguales, revisar, tabla
from .metricas import FORMS, build_quarters, merge_company_facts, validate
from .sec import SecClient, SecError

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DESDE_HISTORIA = date(2009, 1, 1)
INDICE = "https://www.sec.gov/Archives/edgar/daily-index/{y}/QTR{q}/form.{d}.idx"

SCHEMA = """
CREATE TABLE IF NOT EXISTS actualizaciones (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker      TEXT NOT NULL,
    accession   TEXT NOT NULL,
    form        TEXT NOT NULL,
    filed       TEXT NOT NULL,
    estado      TEXT NOT NULL,   -- publicado | sin_cambios | cuarentena | aprobado | rechazado | error
    trimestre   TEXT,            -- último trimestre tras el reporte (p. ej. 2026-Q3)
    motivos     TEXT,            -- JSON: problemas graves
    avisos      TEXT,            -- JSON: avisos que no bloquean
    creado      TEXT NOT NULL,
    resuelto    TEXT,
    UNIQUE (ticker, accession)
);
CREATE INDEX IF NOT EXISTS ix_act_estado ON actualizaciones (estado, creado);
CREATE TABLE IF NOT EXISTS estado_ingesta (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
);
"""

# --- 1. detectar ------------------------------------------------------------------------
_LINEA = re.compile(r"^(\S+(?: \S+)*?)\s{2,}(.+?)\s{2,}(\d+)\s+(\d{8})\s+(\S+)\s*$")


def leer_indice(texto: str) -> list[dict]:
    """Filas del índice diario `form.AAAAMMDD.idx`: forma, empresa, CIK, fecha y accession."""
    out = []
    for linea in texto.splitlines():
        m = _LINEA.match(linea)
        if not m or not m.group(5).startswith("edgar/"):
            continue
        forma, nombre, cik, fecha, archivo = m.groups()
        out.append({
            "form": forma, "nombre": nombre.strip(), "cik": int(cik),
            "filed": f"{fecha[:4]}-{fecha[4:6]}-{fecha[6:]}",
            "accession": archivo.rsplit("/", 1)[-1].removesuffix(".txt"),
        })
    return out


_publicados: dict[str, set[str]] = {}


def indice_del_dia(client: SecClient, d: date) -> list[dict] | None:
    """Presentaciones del día, o None si la SEC aún no publicó el índice (o fue festivo).
    Mira antes el listado del trimestre: la SEC responde 403 (no 404) a un archivo que no existe."""
    carpeta = INDICE.format(y=d.year, q=(d.month - 1) // 3 + 1, d="").rsplit("/", 1)[0]
    nombre = f"form.{d:%Y%m%d}.idx"
    if carpeta not in _publicados or nombre not in _publicados[carpeta]:
        listado = json.loads(client.fetch(f"{carpeta}/index.json"))
        _publicados[carpeta] = {x["name"] for x in listado["directory"]["item"]}
    if nombre not in _publicados[carpeta]:
        return None
    return leer_indice(client.fetch(f"{carpeta}/{nombre}").decode("latin-1"))


def periodicos(filas: list[dict], por_cik: dict[int, dict]) -> dict[str, list[dict]]:
    """10-Q / 10-K (y enmiendas) de empresas del universo, agrupados por ticker."""
    out: dict[str, list[dict]] = {}
    for f in filas:
        c = por_cik.get(f["cik"])
        if c and f["form"] in FORMS:
            out.setdefault(c["ticker"], []).append(f)
    return out


# --- estado -----------------------------------------------------------------------------
def conectar(ruta: Path) -> sqlite3.Connection:
    con = db.connect(ruta)
    documentos.ensure_schema(con)
    con.executescript(SCHEMA)
    return con


def leer_estado(con, clave: str) -> str | None:
    r = con.execute("SELECT valor FROM estado_ingesta WHERE clave=?", (clave,)).fetchone()
    return r[0] if r else None


def guardar_estado(con, clave: str, valor: str) -> None:
    with con:
        con.execute("INSERT INTO estado_ingesta VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor",
                    (clave, valor))


def excluidas(con, ticker: str) -> set[str]:
    return {r[0] for r in con.execute(
        "SELECT accession FROM actualizaciones WHERE ticker=? AND estado IN ('cuarentena','rechazado')", (ticker,))}


def publicado(con, ticker: str) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for fin, m, v in con.execute("SELECT period_end, metric, value FROM fundamentals_q WHERE ticker=?", (ticker,)):
        out.setdefault(fin, {})[m] = v
    return out


def registrar(con, ticker: str, filas: list[dict], estado: str, trimestre: str | None, rev: Revision | None) -> None:
    with con:
        for f in filas:
            con.execute(
                "INSERT INTO actualizaciones (ticker, accession, form, filed, estado, trimestre, motivos, avisos, creado) "
                "VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(ticker, accession) DO UPDATE SET estado=excluded.estado, "
                "trimestre=excluded.trimestre, motivos=excluded.motivos, avisos=excluded.avisos, creado=excluded.creado",
                (ticker, f["accession"], f["form"], f["filed"], estado, trimestre,
                 json.dumps(rev.graves if rev else [], ensure_ascii=False),
                 json.dumps(rev.avisos if rev else [], ensure_ascii=False), db.now()))


def alertar(texto: str) -> None:
    """Aviso a quien opera la app: siempre por consola y, si está configurado, a un webhook (Slack, Discord…)."""
    print(f"  ⚠ {texto}")
    url = os.environ.get("ANCLA_ALERTAS_WEBHOOK")
    if not url:
        return
    try:
        req = urllib.request.Request(url, data=json.dumps({"text": f"Al Precio Justo: {texto}"}).encode(),
                                     headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=10).close()
    except OSError as e:
        print(f"  (no se pudo enviar la alerta: {e})")


# --- 2-4. procesar, revisar y publicar ------------------------------------------------------
def actualizar_empresa(con, client: SecClient, empresa: dict, filas: list[dict], verificar: bool = True,
                       forzar: bool = False) -> str:
    """Procesa los reportes nuevos de una empresa. Devuelve el estado final."""
    t = empresa["ticker"]
    ciks = universo.PREDECESSOR_CIKS.get(t, []) + [empresa["cik"]]
    try:
        for cik in ciks:
            documentos.process_company(con, client, DATA / "filings", cik, DESDE_HISTORIA)
    except SecError as e:
        registrar(con, t, filas, "error", None, Revision(graves=[str(e)]))
        alertar(f"{t}: no se pudo procesar ({e})")
        return "error"

    # Los reportes de esta tanda que no se pudieron leer.
    accs = [f["accession"] for f in filas]
    errores = dict(con.execute(
        f"SELECT accession, error FROM filings WHERE accession IN ({','.join('?' * len(accs))}) AND status='error'",
        accs).fetchall()) if accs else {}

    fuera = set() if forzar else excluidas(con, t) - set(accs)
    quarters = build_quarters(documentos.company_facts_from_db(con, ciks, fuera), since=DESDE_HISTORIA)
    nuevo, antes = tabla(quarters), publicado(con, t)
    referencia = None
    if verificar:
        try:
            referencia = tabla(build_quarters(
                merge_company_facts(*[client.company_facts(k, refresh=True) for k in ciks]), since=DESDE_HISTORIA))
        except SecError as e:
            print(f"  {t}: sin verificación cruzada ({e})")
    rev = revisar(antes, nuevo, referencia)
    for acc, err in errores.items():
        rev.graves.append(f"No se pudo leer {acc}: {err}")
    ultimo = quarters[-1].label if quarters else None

    if not rev.ok and not forzar:
        registrar(con, t, filas, "cuarentena", ultimo, rev)
        alertar(f"{t} en cuarentena: " + "; ".join(rev.graves[:3]))
        return "cuarentena"
    cambio = not iguales(nuevo, antes)
    if cambio or forzar:
        db.save_company(con, empresa, quarters, validate(quarters))
    estado = "aprobado" if forzar else ("publicado" if cambio else "sin_cambios")
    registrar(con, t, filas, estado, ultimo, rev)
    return estado


def resolver(con, client: SecClient, empresa: dict, aprobar: bool) -> int:
    t = empresa["ticker"]
    filas = [dict(zip(("accession", "form", "filed"), r)) for r in con.execute(
        "SELECT accession, form, filed FROM actualizaciones WHERE ticker=? AND estado='cuarentena'", (t,))]
    if not filas:
        print(f"{t} no tiene nada en cuarentena.")
        return 1
    if aprobar:
        estado = actualizar_empresa(con, client, empresa, filas, verificar=False, forzar=True)
        print(f"{t}: {len(filas)} reporte(s) aprobados y publicados ({estado}).")
    else:
        with con:
            con.execute("UPDATE actualizaciones SET estado='rechazado', resuelto=? WHERE ticker=? AND estado='cuarentena'",
                        (db.now(), t))
        print(f"{t}: {len(filas)} reporte(s) rechazados; sus cifras no se usarán.")
    return 0


def migrar(con, client: SecClient, empresas: list[dict], n: int) -> None:
    """Pasa `n` empresas que aún no tienen documentos leídos a datos de documentos."""
    leidas = {r[0] for r in con.execute("SELECT DISTINCT cik FROM filings")}
    pendientes = [c for c in empresas if c["cik"] not in leidas][:n]
    for c in pendientes:
        t0 = time.monotonic()
        estado = actualizar_empresa(con, client, c, [{"accession": "migracion", "form": "historia", "filed": date.today().isoformat()}])
        print(f"{c['ticker']:<7} migrada a documentos: {estado} ({time.monotonic() - t0:.0f} s)")
    print(f"Quedan {len([c for c in empresas if c['cik'] not in leidas]) - len(pendientes)} empresas por migrar.")


def ejecutar(con, client: SecClient, empresas: list[dict], desde: date | None = None, hasta: date | None = None) -> dict:
    """Recorre los días pendientes del índice de EDGAR. Devuelve un resumen."""
    por_cik = {}
    for c in empresas:
        for k in universo.PREDECESSOR_CIKS.get(c["ticker"], []) + [c["cik"]]:
            por_cik[k] = c
    hoy = date.today()
    hasta = hasta or hoy
    ultimo = leer_estado(con, "indice_ultimo_dia")
    dia = desde or (date.fromisoformat(ultimo) + timedelta(days=1) if ultimo else hoy - timedelta(days=1))
    resumen = {"dias": 0, "reportes": 0, "publicado": 0, "sin_cambios": 0, "cuarentena": 0, "error": 0}
    while dia <= hasta:
        if dia.weekday() < 5:
            filas = indice_del_dia(client, dia)
            if filas is None and dia >= hoy - timedelta(days=1):
                break  # el índice de hoy (o de anoche) aún no está: se mira en la siguiente vuelta
            grupos = periodicos(filas or [], por_cik)
            print(f"{dia}: {sum(len(v) for v in grupos.values())} reportes de {len(grupos)} empresas del universo")
            for t, fs in sorted(grupos.items()):
                try:
                    estado = actualizar_empresa(con, client, por_cik[fs[0]["cik"]], fs)
                except Exception as e:  # una empresa con problemas no detiene a las demás
                    registrar(con, t, fs, "error", None, Revision(graves=[f"{type(e).__name__}: {e}"]))
                    alertar(f"{t}: error inesperado ({type(e).__name__}: {e})")
                    estado = "error"
                resumen[estado] = resumen.get(estado, 0) + 1
                resumen["reportes"] += len(fs)
                print(f"  {t:<7} {', '.join(f['form'] for f in fs):<12} → {estado}")
        guardar_estado(con, "indice_ultimo_dia", dia.isoformat())
        resumen["dias"] += 1
        dia += timedelta(days=1)
    guardar_estado(con, "ultima_revision", db.now())
    return resumen


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Detecta y publica los reportes nuevos")
    ap.add_argument("--desde", type=date.fromisoformat, help="Primer día del índice a revisar (AAAA-MM-DD)")
    ap.add_argument("--hasta", type=date.fromisoformat)
    acc = ap.add_mutually_exclusive_group()
    acc.add_argument("--tickers", help="Fuerza la revisión de estas empresas (separadas por comas)")
    acc.add_argument("--migrar", type=int, metavar="N", help="Pasa N empresas más a datos leídos de documentos")
    acc.add_argument("--cuarentena", action="store_true", help="Lista los reportes en cuarentena")
    acc.add_argument("--aprobar", metavar="TICKER")
    acc.add_argument("--rechazar", metavar="TICKER")
    ap.add_argument("--db", type=Path, default=DATA / "ancla.db")
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8")

    client = SecClient(DATA / "raw")
    con = conectar(args.db)
    empresas = universo.lista(client)
    por_ticker = {c["ticker"]: c for c in empresas}

    if args.cuarentena:
        filas = con.execute("SELECT ticker, form, filed, motivos FROM actualizaciones WHERE estado='cuarentena' ORDER BY creado").fetchall()
        for t, form, filed, motivos in filas:
            print(f"{t:<7} {form:<8} {filed}  " + "; ".join(json.loads(motivos)))
        print(f"{len(filas)} en cuarentena.")
        return 0
    if args.aprobar or args.rechazar:
        t = (args.aprobar or args.rechazar).upper()
        if t not in por_ticker:
            print(f"No conocemos {t}.")
            return 1
        return resolver(con, client, por_ticker[t], aprobar=bool(args.aprobar))
    if args.migrar:
        migrar(con, client, empresas, args.migrar)
        return 0
    if args.tickers:
        for t in args.tickers.upper().split(","):
            c = por_ticker.get(t.strip()) or universo.by_tickers(client, [t])[0]
            estado = actualizar_empresa(con, client, c, [{"accession": "manual", "form": "revision", "filed": date.today().isoformat()}])
            print(f"{c['ticker']:<7} → {estado}")
        return 0

    t0 = time.monotonic()
    r = ejecutar(con, client, empresas, args.desde, args.hasta)
    print(f"\n{r['dias']} días, {r['reportes']} reportes: {r['publicado']} publicados, {r['sin_cambios']} sin cambios, "
          f"{r['cuarentena']} en cuarentena, {r['error']} con error ({time.monotonic() - t0:.0f} s).")
    return 0 if not r["error"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
