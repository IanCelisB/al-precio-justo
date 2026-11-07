"""Ejecuta la ingesta.

Ejemplos:
    py -m ingesta.ejecutar --tickers AAPL,MSFT,JPM
    py -m ingesta.ejecutar --sp500 --limit 50
    py -m ingesta.ejecutar --sp500 --export
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from . import db, universo
from .metricas import build_quarters, merge_company_facts, validate
from .sec import SecClient, SecError

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def fmt_b(v: float | None) -> str:
    return "—" if v is None else f"{v / 1e9:,.1f}B"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Ingesta de reportes trimestrales de la SEC")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--tickers", help="Lista separada por comas, p. ej. AAPL,MSFT")
    src.add_argument("--todas", "--sp500", dest="todas", action="store_true",
                     help="Todo el universo del prototipo (~1.000 empresas, ingesta/universo.json)")
    ap.add_argument("--limit", type=int, help="Procesar solo las primeras N empresas")
    ap.add_argument("--refresh", action="store_true", help="Ignorar la caché y volver a descargar")
    ap.add_argument("--export", action="store_true", help="Escribir un JSON por empresa en data/export")
    ap.add_argument("--db", type=Path, default=DATA / "ancla.db")
    args = ap.parse_args(argv)

    sys.stdout.reconfigure(encoding="utf-8")
    client = SecClient(DATA / "raw")
    companies = universo.lista(client) if args.todas else \
        universo.by_tickers(client, args.tickers.split(","))
    if args.limit:
        companies = companies[: args.limit]

    con = db.connect(args.db)
    ok, failed, flagged = 0, [], 0
    t0 = time.monotonic()
    print(f"{'Ticker':<7}{'Trim.':>6}  {'Último':<8}{'Ventas':>9}{'Benef.':>9}{'FCF':>9}"
          f"{'Recompra':>10}{'Div.':>8}{'Deuda n.':>10}  Avisos")
    for c in companies:
        try:
            docs = [client.company_facts(cik, args.refresh)
                    for cik in universo.PREDECESSOR_CIKS.get(c["ticker"], [])]
            docs.append(client.company_facts(c["cik"], args.refresh))
            quarters = build_quarters(merge_company_facts(*docs))
            issues = validate(quarters)
            db.save_company(con, c, quarters, issues)
            if args.export:
                db.export_json(c, quarters, issues, DATA / "export")
            last = quarters[-1] if quarters else None
            g = (lambda k: last.metrics[k].value if last and k in last.metrics else None)
            print(f"{c['ticker']:<7}{len(quarters):>6}  {last.label if last else '—':<8}"
                  f"{fmt_b(g('revenue')):>9}{fmt_b(g('net_income')):>9}{fmt_b(g('free_cash_flow')):>9}"
                  f"{fmt_b(g('buybacks')):>10}{fmt_b(g('dividends')):>8}{fmt_b(g('net_debt')):>10}  {len(issues)}")
            ok += 1
            flagged += bool(issues)
        except (SecError, ValueError, KeyError) as e:
            failed.append((c["ticker"], str(e)))
            print(f"{c['ticker']:<7} ERROR: {e}")

    print(f"\n{ok} empresas guardadas en {args.db} en {time.monotonic() - t0:.0f} s. "
          f"{flagged} con avisos de calidad, {len(failed)} con error.")
    for t, e in failed:
        print(f"  {t}: {e}")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
