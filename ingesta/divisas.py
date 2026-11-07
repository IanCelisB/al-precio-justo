"""Tipos de cambio del día (unidades de cada moneda por 1 USD).

Fuentes oficiales y gratuitas:
- Banco Central Europeo (tasas de referencia diarias), vía api.frankfurter.dev:
  EUR, GBP, MXN, BRL, CAD, CHF, JPY.
- Banco Central de Chile (dólar observado), vía mindicador.cl: CLP.

Se publican una vez por día hábil; `programador` las actualiza cada día.

    py -m ingesta.divisas
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import urllib.request
from pathlib import Path

from . import db

DATA = Path(__file__).resolve().parent.parent / "data"
UA = "AlPrecioJusto/0.1 (https://github.com/IanCelisB/al-precio-justo)"
BCE = ["EUR", "GBP", "MXN", "BRL", "CAD", "CHF", "JPY"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS divisas (
    codigo  TEXT NOT NULL,
    fecha   TEXT NOT NULL,     -- día de la tasa publicada
    por_usd REAL NOT NULL,     -- unidades de la moneda por 1 USD
    fuente  TEXT NOT NULL,
    PRIMARY KEY (codigo, fecha)
);
"""


def _json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def bce() -> list[tuple[str, str, float, str]]:
    d = _json(f"https://api.frankfurter.dev/v1/latest?base=USD&symbols={','.join(BCE)}")
    return [(c, d["date"], float(v), "Banco Central Europeo") for c, v in d["rates"].items()]


def banco_central_chile() -> list[tuple[str, str, float, str]]:
    d = _json("https://mindicador.cl/api/dolar")
    ultimo = d["serie"][0]
    return [("CLP", ultimo["fecha"][:10], float(ultimo["valor"]), "Banco Central de Chile (dólar observado)")]


def actualizar(con: sqlite3.Connection) -> list[str]:
    """Guarda las tasas del día. Devuelve los problemas (una fuente caída no detiene a la otra)."""
    con.executescript(SCHEMA)
    problemas = []
    for nombre, f in (("BCE", bce), ("Banco Central de Chile", banco_central_chile)):
        try:
            filas = f()
        except Exception as e:  # red o formato: se conserva la última tasa conocida
            problemas.append(f"{nombre}: {e}")
            continue
        for codigo, fecha, valor, fuente in filas:
            if not (valor > 0):
                problemas.append(f"{codigo}: tasa inválida {valor}")
                continue
            with con:
                con.execute("INSERT OR REPLACE INTO divisas VALUES (?,?,?,?)", (codigo, fecha, valor, fuente))
    return problemas


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Tipos de cambio del día")
    ap.add_argument("--db", type=Path, default=DATA / "ancla.db")
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8")
    con = db.connect(args.db)
    problemas = actualizar(con)
    for codigo, fecha, valor in con.execute(
            "SELECT codigo, MAX(fecha), por_usd FROM divisas GROUP BY codigo ORDER BY codigo"):
        print(f"{codigo}  {valor:>12,.4f} por USD  ({fecha})")
    for p in problemas:
        print("  ⚠", p)
    return 0 if not problemas else 1


if __name__ == "__main__":
    raise SystemExit(main())
