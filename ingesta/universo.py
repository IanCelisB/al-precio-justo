"""Lista de empresas a seguir.

Universo del prototipo (~1.000 empresas): S&P 500, S&P 400 (medianas) y populares entre
inversores minoristas, que presentan 10-Q / 10-K a la SEC. Las extranjeras (20-F) llegan
en otra fase.

La lista está fija en ingesta/universo.json (versionada) para que no cambie sola de un
día a otro. En producción debe venir de una fuente con licencia.
"""
from __future__ import annotations

import json
from pathlib import Path

from .sec import SecClient

ARCHIVO = Path(__file__).resolve().parent / "universo.json"

# Empresas que cambiaron de CIK (nueva sociedad matriz, fusión): su historia
# está repartida entre varios registros de la SEC. Ticker -> CIK anteriores.
PREDECESSOR_CIKS: dict[str, list[int]] = {
    "XOM": [34088],  # Exxon Mobil Corp -> ExxonMobil Holdings Corp
}


def lista(client: SecClient | None = None) -> list[dict]:
    """El universo del prototipo (ingesta/universo.json)."""
    return json.loads(ARCHIVO.read_text(encoding="utf-8"))


def by_tickers(client: SecClient, tickers: list[str]) -> list[dict]:
    """Empresas concretas. Busca primero en el universo (trae CIK y sector) y,
    si no está, en el listado oficial de la SEC (requiere SEC_USER_AGENT con email)."""
    index = {c["ticker"]: c for c in lista()}
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
