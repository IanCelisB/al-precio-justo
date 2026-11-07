"""Proceso de reportes: obtiene cada 10-Q / 10-K, lo lee y extrae las métricas.

A diferencia de `ejecutar` (que usa las cifras ya procesadas por la API de la
SEC), este proceso descarga el documento de cada reporte y lee sus cifras él
mismo. Es incremental: la segunda vez solo procesa reportes nuevos.

Ejemplos:
    py -m ingesta.proceso --tickers AAPL,MSFT --desde 2024-01-01
    py -m ingesta.proceso --sp500 --export
    py -m ingesta.proceso --tickers AAPL --comparar     # contrasta con la API de la SEC
    py -m ingesta.proceso --sp500 --releer              # aplica mejoras del lector sin descargar
"""
from __future__ import annotations

import argparse
import sys
import time
from datetime import date
from pathlib import Path

from . import db, documentos, universo
from .metricas import PUBLIC_METRICS, build_quarters, merge_company_facts, validate
from .sec import SecClient, SecError

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def compare(from_docs, from_api, last_n: int = 12) -> tuple[int, int, list[str]]:
    """Compara las métricas públicas de los últimos trimestres. Devuelve (iguales, total, diferencias)."""
    api = {q.end: q for q in from_api}
    same, total, diffs = 0, 0, []
    for q in from_docs[-last_n:]:
        other = api.get(q.end)
        if not other:
            continue
        for m in PUBLIC_METRICS:
            a, b = q.metrics.get(m), other.metrics.get(m)
            if a is None and b is None:
                continue
            total += 1
            if a and b and abs(a.value - b.value) <= max(1.0, abs(b.value) * 0.001):
                same += 1
            else:
                diffs.append(f"{q.label} {m}: documento={a.value if a else '—'} api={b.value if b else '—'}")
    return same, total, diffs


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Obtiene, lee y extrae los reportes trimestrales")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--tickers", help="Lista separada por comas, p. ej. AAPL,MSFT")
    src.add_argument("--todas", "--sp500", dest="todas", action="store_true",
                     help="Todo el universo del prototipo (~1.000 empresas, ingesta/universo.json)")
    ap.add_argument("--desde", type=date.fromisoformat, default=date(2009, 1, 1),
                    help="Solo reportes presentados desde esta fecha (AAAA-MM-DD)")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--reintentar", action="store_true", help="Vuelve a intentar los reportes con error")
    ap.add_argument("--releer", action="store_true",
                    help="Vuelve a leer los documentos ya descargados (tras mejorar el lector)")
    ap.add_argument("--comparar", action="store_true", help="Contrasta el resultado con la API de la SEC")
    ap.add_argument("--export", action="store_true")
    ap.add_argument("--db", type=Path, default=DATA / "ancla.db")
    args = ap.parse_args(argv)

    sys.stdout.reconfigure(encoding="utf-8")
    client = SecClient(DATA / "raw")
    store = DATA / "filings"
    companies = universo.lista(client) if args.todas else universo.by_tickers(client, args.tickers.split(","))
    if args.limit:
        companies = companies[: args.limit]

    con = db.connect(args.db)
    documentos.ensure_schema(con)
    t0 = time.monotonic()
    failed = 0
    for c in companies:
        ciks = universo.PREDECESSOR_CIKS.get(c["ticker"], []) + [c["cik"]]
        try:
            stats = {"nuevos": 0, "leidos": 0, "errores": 0}
            for cik in ciks:
                for k, v in documentos.process_company(con, client, store, cik, args.desde,
                                                       args.reintentar, args.releer).items():
                    stats[k] += v
        except SecError as e:
            print(f"{c['ticker']:<7} ERROR: {e}")
            failed += 1
            continue
        quarters = [q for q in build_quarters(documentos.company_facts_from_db(con, ciks), since=args.desde)]
        issues = validate(quarters)
        db.save_company(con, c, quarters, issues)
        if args.export:
            db.export_json(c, quarters, issues, DATA / "export")
        state = documentos.status_summary(con, ciks)
        last = quarters[-1].label if quarters else "—"
        print(f"{c['ticker']:<7} reportes nuevos {stats['nuevos']:>3} · leídos {stats['leidos']:>3} · "
              f"con error {stats['errores']:>2} · trimestres {len(quarters):>3} (último {last}) · "
              f"cola: {', '.join(f'{k} {v}' for k, v in sorted(state.items()))}")
        if args.comparar:
            api = build_quarters(merge_company_facts(*[client.company_facts(k) for k in ciks]), since=args.desde)
            same, total, diffs = compare(quarters, api)
            print(f"        comparación con la API: {same}/{total} cifras iguales en los últimos 12 trimestres")
            for d in diffs[:8]:
                print(f"          {d}")
        failed += bool(stats["errores"])

    print(f"\n{len(companies)} empresas en {time.monotonic() - t0:.0f} s; {failed} con errores.")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
