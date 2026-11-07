"""Almacenamiento. SQLite para desarrollo; el esquema es compatible con PostgreSQL."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .metricas import PUBLIC_METRICS, Quarter, calendar_quarter

SCHEMA = """
CREATE TABLE IF NOT EXISTS companies (
    ticker      TEXT PRIMARY KEY,
    cik         INTEGER NOT NULL,
    name        TEXT NOT NULL,
    sector      TEXT,
    indice      TEXT,            -- S&P 500 | S&P 400 | Popular
    updated_at  TEXT
);
CREATE TABLE IF NOT EXISTS fundamentals_q (
    ticker      TEXT NOT NULL REFERENCES companies(ticker),
    period_end  TEXT NOT NULL,
    cal_year    INTEGER NOT NULL,
    cal_quarter INTEGER NOT NULL,
    metric      TEXT NOT NULL,
    value       REAL NOT NULL,
    source_tag  TEXT NOT NULL,
    derived     INTEGER NOT NULL,
    PRIMARY KEY (ticker, period_end, metric)
);
CREATE INDEX IF NOT EXISTS ix_fq_metric ON fundamentals_q (metric, period_end);
CREATE TABLE IF NOT EXISTS quality_issues (
    ticker      TEXT NOT NULL,
    message     TEXT NOT NULL,
    found_at    TEXT NOT NULL
);
"""


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, timeout=30)
    # WAL: la API puede leer mientras la ingesta escribe, sin bloquearse.
    con.execute("PRAGMA journal_mode=WAL")
    con.executescript(SCHEMA)
    if "indice" not in {r[1] for r in con.execute("PRAGMA table_info(companies)")}:
        con.execute("ALTER TABLE companies ADD COLUMN indice TEXT")
    return con


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def save_company(con: sqlite3.Connection, company: dict, quarters: list[Quarter], issues: list[str]) -> None:
    t = company["ticker"]
    with con:
        con.execute(
            "INSERT INTO companies (ticker, cik, name, sector, indice, updated_at) VALUES (?,?,?,?,?,?) "
            "ON CONFLICT(ticker) DO UPDATE SET cik=excluded.cik, name=excluded.name, "
            "sector=COALESCE(excluded.sector, companies.sector), "
            "indice=COALESCE(excluded.indice, companies.indice), updated_at=excluded.updated_at",
            (t, company["cik"], company["name"], company.get("sector"), company.get("indice"), now()))
        con.execute("DELETE FROM fundamentals_q WHERE ticker=?", (t,))
        rows = []
        for q in quarters:
            y, qq = calendar_quarter(q.end)
            for metric, v in q.metrics.items():
                rows.append((t, q.end.isoformat(), y, qq, metric, v.value, v.tag, int(v.derived)))
        con.executemany("INSERT INTO fundamentals_q VALUES (?,?,?,?,?,?,?,?)", rows)
        con.execute("DELETE FROM quality_issues WHERE ticker=?", (t,))
        con.executemany("INSERT INTO quality_issues VALUES (?,?,?)", [(t, m, now()) for m in issues])


def export_json(company: dict, quarters: list[Quarter], issues: list[str], out_dir: Path) -> Path:
    """Archivo por empresa con lo que necesita la app: las siete métricas por trimestre."""
    out_dir.mkdir(parents=True, exist_ok=True)
    keep = list(PUBLIC_METRICS) + ["operating_cash_flow", "capex", "stock_comp", "debt",
                                   "net_buybacks", "shares_outstanding", "diluted_shares"]
    doc = {
        "ticker": company["ticker"],
        "cik": company["cik"],
        "name": company["name"],
        "sector": company.get("sector"),
        "generated_at": now(),
        "metric_names": PUBLIC_METRICS,
        "issues": issues,
        "quarters": [
            {"period_end": q.end.isoformat(), "label": q.label,
             **{m: q.metrics[m].value for m in keep if m in q.metrics}}
            for q in quarters
        ],
    }
    path = out_dir / f"{company['ticker']}.json"
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    return path
