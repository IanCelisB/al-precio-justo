"""Precios de cierre diarios.

PROTOTIPO: usa el endpoint público de gráficos de Yahoo Finance, que no tiene
licencia de redistribución. Antes de publicar la app hay que cambiar
`YahooPrices` por un proveedor con licencia (p. ej. Polygon, Tiingo o
Intrinio), con la misma interfaz `history(ticker)`.

Ejemplos:
    py -m ingesta.precios --sp500            # 10 años de cierres diarios
    py -m ingesta.precios --tickers AAPL,MSFT --rango 5d
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from . import db, universo
from .sec import SecClient

ROOT = Path(__file__).resolve().parent.parent

# Referencias de mercado que se descargan siempre (no son empresas):
# SPY = fondo que replica el S&P 500, para comparar la cartera del simulador.
REFERENCIAS = ["SPY"]
DATA = ROOT / "data"

SCHEMA = """
CREATE TABLE IF NOT EXISTS prices_daily (
    ticker  TEXT NOT NULL,
    day     TEXT NOT NULL,
    close   REAL NOT NULL,
    PRIMARY KEY (ticker, day)
);
CREATE TABLE IF NOT EXISTS quotes (
    ticker      TEXT PRIMARY KEY,
    price       REAL NOT NULL,
    change_pct  REAL,
    as_of       TEXT NOT NULL,   -- momento del precio (UTC)
    source      TEXT NOT NULL
);
"""


class PriceError(RuntimeError):
    pass


class YahooPrices:
    source = "yahoo-prototipo"
    URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range={range}&interval=1d"
    MIN_INTERVAL = 0.35

    def __init__(self):
        self._last = 0.0

    @staticmethod
    def symbol(ticker: str) -> str:
        return ticker.replace(".", "-")  # BRK.B -> BRK-B

    def history(self, ticker: str, rng: str = "10y") -> tuple[list[tuple[str, float]], dict]:
        wait = self.MIN_INTERVAL - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()
        req = urllib.request.Request(self.URL.format(symbol=self.symbol(ticker), range=rng),
                                     headers={"User-Agent": "Mozilla/5.0 (Ancla prototipo)"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                doc = json.loads(r.read())
        except urllib.error.HTTPError as e:
            raise PriceError(f"HTTP {e.code}") from e
        except urllib.error.URLError as e:
            raise PriceError(str(e.reason)) from e
        res = (doc.get("chart") or {}).get("result") or []
        if not res:
            raise PriceError("sin datos")
        res = res[0]
        meta = res.get("meta", {})
        closes = (res.get("indicators", {}).get("quote") or [{}])[0].get("close") or []
        days = [datetime.fromtimestamp(t, timezone.utc).date().isoformat() for t in res.get("timestamp") or []]
        series = [(d, float(c)) for d, c in zip(days, closes) if c is not None]
        quote = {
            "price": meta.get("regularMarketPrice"),
            "change_pct": meta.get("regularMarketChangePercent"),
            "as_of": datetime.fromtimestamp(meta.get("regularMarketTime", time.time()), timezone.utc)
            .isoformat(timespec="seconds"),
        }
        return series, quote


def save(con: sqlite3.Connection, ticker: str, series, quote, source: str) -> None:
    with con:
        con.executemany("INSERT OR REPLACE INTO prices_daily VALUES (?,?,?)",
                        [(ticker, d, c) for d, c in series])
        if quote.get("price") is not None:
            con.execute("INSERT OR REPLACE INTO quotes VALUES (?,?,?,?,?)",
                        (ticker, quote["price"], quote.get("change_pct"), quote["as_of"], source))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Descarga precios de cierre")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--tickers")
    src.add_argument("--todas", "--sp500", dest="todas", action="store_true",
                     help="Todo el universo del prototipo (~1.000 empresas, ingesta/universo.json)")
    ap.add_argument("--rango", default="10y", help="10y la primera vez; 5d para actualizar a diario")
    ap.add_argument("--db", type=Path, default=DATA / "ancla.db")
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8")

    client = SecClient(DATA / "raw")
    companies = universo.lista(client) if args.todas else universo.by_tickers(client, args.tickers.split(","))
    con = db.connect(args.db)
    con.executescript(SCHEMA)
    prov = YahooPrices()
    failed = []
    companies = companies + [{"ticker": t} for t in REFERENCIAS]
    t0 = time.monotonic()
    for c in companies:
        try:
            series, quote = prov.history(c["ticker"], args.rango)
            save(con, c["ticker"], series, quote, prov.source)
        except PriceError as e:
            failed.append(f"{c['ticker']}: {e}")
    print(f"{len(companies) - len(failed)} empresas con precio en {time.monotonic() - t0:.0f} s; "
          f"{len(failed)} sin precio.")
    for f in failed:
        print("  ", f)
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
