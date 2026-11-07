"""Cola de reportes: descubrir, descargar y leer cada 10-Q / 10-K.

Cada presentación pasa por estos estados, guardados en la tabla `filings`:

    pendiente -> descargado -> leido
                     └-> error (se reintenta con --reintentar)
    sin_xbrl: presentaciones antiguas sin cifras etiquetadas (anteriores a 2009-2011)

El proceso es incremental: al volver a ejecutarlo solo trabaja con los reportes
nuevos o con los que fallaron.
"""
from __future__ import annotations

import gzip
import os
import re
import sqlite3
from datetime import date
from pathlib import Path
from xml.etree.ElementTree import ParseError

from .lector import read_document
from .metricas import CONCEPTOS_USADOS, FORMS
from .sec import SecClient, SecError

ARCHIVES = "https://www.sec.gov/Archives/edgar/data"

# Para ahorrar espacio, por defecto se guardan solo las cifras que usan las métricas y el
# documento se borra al leerlo (se puede volver a descargar de la SEC cuando haga falta).
# ANCLA_GUARDAR_DOCUMENTOS=1 conserva los documentos y todas sus cifras.
GUARDAR_DOCUMENTOS = os.environ.get("ANCLA_GUARDAR_DOCUMENTOS") == "1"


def util(prefix: str, concept: str) -> bool:
    return GUARDAR_DOCUMENTOS or (prefix == "us-gaap" and concept in CONCEPTOS_USADOS)

SCHEMA = """
CREATE TABLE IF NOT EXISTS filings (
    accession   TEXT PRIMARY KEY,
    cik         INTEGER NOT NULL,
    form        TEXT NOT NULL,
    filed       TEXT NOT NULL,
    period      TEXT,
    document    TEXT,            -- nombre del documento leído
    kind        TEXT,            -- ixbrl | xbrl
    status      TEXT NOT NULL,   -- pendiente | descargado | leido | error | sin_xbrl
    n_facts     INTEGER,
    error       TEXT,
    updated_at  TEXT
);
CREATE INDEX IF NOT EXISTS ix_filings_cik ON filings (cik, status);
CREATE TABLE IF NOT EXISTS facts (
    accession   TEXT NOT NULL REFERENCES filings(accession),
    prefix      TEXT NOT NULL,
    concept     TEXT NOT NULL,
    unit        TEXT NOT NULL,
    start       TEXT,
    "end"       TEXT NOT NULL,
    value       REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_facts_acc ON facts (accession);
"""


def ensure_schema(con: sqlite3.Connection) -> None:
    con.executescript(SCHEMA)


def _now() -> str:
    from .db import now
    return now()


# --- 1. descubrir -------------------------------------------------------------------
def _rows(block: dict) -> list[dict]:
    keys = list(block)
    return [{k: block[k][i] for k in keys} for i in range(len(block.get("accessionNumber", [])))]


def list_filings(client: SecClient, cik: int, since: date) -> list[dict]:
    """Todas las presentaciones periódicas (10-Q, 10-K y enmiendas) desde `since`."""
    sub = client.submissions(cik)
    rows = _rows(sub.get("filings", {}).get("recent", {}))
    for page in sub.get("filings", {}).get("files", []):
        if page.get("filingTo", "9999") < since.isoformat():
            continue
        extra = client.get_json(f"https://data.sec.gov/submissions/{page['name']}",
                                page["name"].removesuffix(".json"), refresh=True, guardar=False)
        rows += _rows(extra)
    return [r for r in rows if r.get("form") in FORMS and r.get("filingDate", "") >= since.isoformat()]


def discover(con: sqlite3.Connection, client: SecClient, cik: int, since: date) -> int:
    """Registra en la cola las presentaciones que todavía no conocemos. Devuelve cuántas son nuevas."""
    new = 0
    with con:
        for r in list_filings(client, cik, since):
            has_xbrl = bool(r.get("isXBRL"))
            cur = con.execute(
                "INSERT OR IGNORE INTO filings (accession, cik, form, filed, period, document, kind, status, updated_at) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (r["accessionNumber"], cik, r["form"], r["filingDate"], r.get("reportDate"),
                 r.get("primaryDocument") if r.get("isInlineXBRL") else None,
                 "ixbrl" if r.get("isInlineXBRL") else ("xbrl" if has_xbrl else None),
                 "pendiente" if has_xbrl else "sin_xbrl", _now()))
            new += cur.rowcount
    return new


# --- 2. descargar -------------------------------------------------------------------
def _folder(cik: int, accession: str) -> str:
    return f"{ARCHIVES}/{cik}/{accession.replace('-', '')}"


def instance_candidates(items: list[str]) -> list[str]:
    """Del índice de una presentación sin Inline XBRL, los XML que pueden tener las cifras,
    del más al menos probable. `defnref.xml` y similares son archivos de referencia de la SEC."""
    skip_end = ("_cal.xml", "_def.xml", "_lab.xml", "_pre.xml", "_ref.xml")
    skip_names = {"filingsummary.xml", "defnref.xml"}
    xml = [n for n in items if n.lower().endswith(".xml") and not n.lower().endswith(skip_end)
           and n.lower() not in skip_names]

    def rank(n: str) -> int:
        low = n.lower()
        if low.endswith("_htm.xml"):
            return 0
        if re.fullmatch(r"[a-z0-9]+-\d{8}\.xml", low):  # aapl-20091226.xml
            return 1
        return 2
    return sorted(xml, key=rank)


def looks_like_instance(body: bytes) -> bool:
    head = body[:4000]
    return (b"<xbrl" in head or b":xbrl" in head) and b"contextRef" in body


def local_path(store: Path, cik: int, accession: str, document: str) -> Path:
    return store / str(cik) / f"{accession}__{document}.gz"


def _save(path: Path, body: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with gzip.open(tmp, "wb") as f:
        f.write(body)
    tmp.replace(path)


MIN_INLINE_FACTS = 100   # menos que esto: el documento principal es una "carcasa"
SEP = "|"                # varios documentos de una misma presentación


def count_inline_facts(body: bytes) -> int:
    return len(re.findall(rb"<ix:nonfraction", body, re.IGNORECASE))


def other_inline_documents(items: list[str], primary: str) -> list[str]:
    """Otros HTML de la presentación que pueden llevar los estados financieros
    (p. ej. el informe anual como anexo 13). Excluye las vistas R*.htm que genera la SEC."""
    return [n for n in items if n.lower().endswith((".htm", ".html")) and n != primary
            and not re.fullmatch(r"r\d+\.htm", n.lower()) and "index" not in n.lower()]


def _fetch_saved(client: SecClient, store: Path, cik: int, acc: str, name: str) -> bytes:
    path = local_path(store, cik, acc, name)
    if path.exists():
        with gzip.open(path, "rb") as f:
            return f.read()
    body = client.fetch(f"{_folder(cik, acc)}/{name}")
    _save(path, body)
    return body


def _items(client: SecClient, cik: int, acc: str) -> list[str]:
    index = client.get_json(f"{_folder(cik, acc)}/index.json", f"index_{acc}", guardar=False)
    return [i["name"] for i in index.get("directory", {}).get("item", [])]


def download(con: sqlite3.Connection, client: SecClient, store: Path, filing: dict) -> str:
    """Descarga los documentos con las cifras y devuelve sus nombres (separados por |)."""
    cik, acc = filing["cik"], filing["accession"]
    documents: list[str] = []
    if filing["kind"] == "xbrl":
        for name in instance_candidates(_items(client, cik, acc)):
            if looks_like_instance(_fetch_saved(client, store, cik, acc, name)):
                documents = [name]
                break
        if not documents:
            raise SecError("La presentación no incluye un archivo XBRL con cifras")
    else:
        primary = filing["document"].split(SEP)[0]
        documents = [primary]
        if count_inline_facts(_fetch_saved(client, store, cik, acc, primary)) < MIN_INLINE_FACTS:
            for name in other_inline_documents(_items(client, cik, acc), primary):
                if count_inline_facts(_fetch_saved(client, store, cik, acc, name)) > 0:
                    documents.append(name)
    document = SEP.join(documents)
    with con:
        con.execute("UPDATE filings SET document=?, status='descargado', error=NULL, updated_at=? "
                    "WHERE accession=?", (document, _now(), acc))
    return document


# --- 3. leer --------------------------------------------------------------------------
def read(con: sqlite3.Connection, store: Path, filing: dict) -> int:
    contents = []
    for name in filing["document"].split(SEP):
        with gzip.open(local_path(store, filing["cik"], filing["accession"], name), "rb") as f:
            contents.append(f.read())
    facts = read_document(contents, filing["kind"])
    if not facts:
        raise ValueError(f"{filing['document']} no contiene cifras etiquetadas")
    with con:
        con.execute("DELETE FROM facts WHERE accession=?", (filing["accession"],))
        con.executemany("INSERT INTO facts VALUES (?,?,?,?,?,?,?)", [
            (filing["accession"], x.prefix, x.concept, x.unit, x.start, x.end, x.value)
            for x in facts if util(x.prefix, x.concept)])
        con.execute("UPDATE filings SET status='leido', n_facts=?, error=NULL, updated_at=? WHERE accession=?",
                    (len(facts), _now(), filing["accession"]))
    return len(facts)


def borrar_documentos(store: Path, cik: int, accession: str) -> None:
    """Borra los documentos descargados de una presentación (ya leídos o con error)."""
    if GUARDAR_DOCUMENTOS:
        return
    for f in (store / str(cik)).glob(f"{accession}__*"):
        f.unlink(missing_ok=True)


def mark_error(con: sqlite3.Connection, accession: str, message: str) -> None:
    with con:
        con.execute("UPDATE filings SET status='error', error=?, updated_at=? WHERE accession=?",
                    (message[:500], _now(), accession))


def queue(con: sqlite3.Connection, cik: int, statuses: tuple[str, ...]) -> list[dict]:
    cur = con.execute(
        f"SELECT accession, cik, form, filed, document, kind, status FROM filings "
        f"WHERE cik=? AND status IN ({','.join('?' * len(statuses))}) ORDER BY filed", (cik, *statuses))
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def process_company(con, client, store: Path, cik: int, since: date, retry: bool = False,
                    reread: bool = False) -> dict:
    """Descubre, descarga y lee todas las presentaciones pendientes de un CIK."""
    stats = {"nuevos": discover(con, client, cik, since), "leidos": 0, "errores": 0}
    if retry:
        with con:
            con.execute("UPDATE filings SET status='pendiente' WHERE cik=? AND status='error'", (cik,))
    if reread:  # tras mejorar el lector: vuelve a leer lo ya descargado, sin descargar de nuevo
        with con:
            # vuelve a elegir documentos (usa los ya guardados; solo descarga lo que falte)
            con.execute("UPDATE filings SET status='pendiente' WHERE cik=? AND status='leido'", (cik,))
    for f in queue(con, cik, ("pendiente", "descargado")):
        try:
            if f["status"] == "pendiente":
                f["document"] = download(con, client, store, f)
            read(con, store, f)
            stats["leidos"] += 1
        except (SecError, ParseError, OSError, ValueError) as e:
            mark_error(con, f["accession"], str(e))
            stats["errores"] += 1
        finally:
            borrar_documentos(store, cik, f["accession"])
    return stats


# --- 4. reconstruir para el cálculo de métricas ----------------------------------------
def company_facts_from_db(con: sqlite3.Connection, ciks: list[int], excluir: set[str] = frozenset()) -> dict:
    """Las cifras leídas de los documentos, con la forma que espera `metricas.build_quarters`.
    `excluir`: presentaciones en cuarentena o rechazadas, que no deben usarse."""
    cur = con.execute(
        f"SELECT x.prefix, x.concept, x.unit, x.start, x.\"end\", x.value, f.filed, f.form, f.accession "
        f"FROM facts x JOIN filings f ON f.accession = x.accession "
        f"WHERE f.cik IN ({','.join('?' * len(ciks))}) AND f.status='leido'"
        f"{' AND f.accession NOT IN (' + ','.join('?' * len(excluir)) + ')' if excluir else ''}", [*ciks, *excluir])
    out: dict = {}
    for prefix, concept, unit, start, end, value, filed, form, acc in cur:
        fact = {"end": end, "val": value, "filed": filed, "form": form, "accn": acc}
        if start:
            fact["start"] = start
        (out.setdefault(prefix, {}).setdefault(concept, {"units": {}})["units"]
         .setdefault(unit, []).append(fact))
    return {"facts": out}


def status_summary(con: sqlite3.Connection, ciks: list[int]) -> dict[str, int]:
    cur = con.execute(f"SELECT status, COUNT(*) FROM filings WHERE cik IN ({','.join('?' * len(ciks))}) "
                      f"GROUP BY status", ciks)
    return dict(cur.fetchall())
