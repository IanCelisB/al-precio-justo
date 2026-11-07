"""Cliente para las APIs públicas de la SEC (EDGAR).

Respeta la política de acceso de la SEC: como máximo 10 peticiones por segundo
y un User-Agent que identifique a quien consulta. Las respuestas se guardan
comprimidas en disco para no repetir descargas.
"""
from __future__ import annotations

import gzip
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_USER_AGENT = "AlPrecioJusto/0.1 prototipo (define SEC_USER_AGENT con nombre y email)"


class SecError(RuntimeError):
    pass


class SecClient:
    MIN_INTERVAL = 0.12  # segundos entre peticiones: < 10 por segundo

    def __init__(self, cache_dir: Path, user_agent: str | None = None, max_age_hours: float = 24):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.user_agent = user_agent or os.environ.get("SEC_USER_AGENT") or DEFAULT_USER_AGENT
        self.max_age_hours = max_age_hours
        self._last = 0.0

    # --- red -----------------------------------------------------------------
    def fetch(self, url: str) -> bytes:
        for attempt in range(4):
            wait = self.MIN_INTERVAL - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            req = urllib.request.Request(url, headers={
                "User-Agent": self.user_agent,
                "Accept-Encoding": "gzip",
            })
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    body = resp.read()
                    if resp.headers.get("Content-Encoding") == "gzip":
                        body = gzip.decompress(body)
                    return body
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    raise SecError(f"No existe: {url}") from e
                if e.code == 403:
                    raise SecError("La SEC rechazó la petición (403). Define SEC_USER_AGENT con "
                                   f"un nombre y un email de contacto. URL: {url}") from e
                if e.code in (429, 500, 502, 503, 504) and attempt < 3:
                    time.sleep(2 ** attempt)
                    continue
                raise SecError(f"HTTP {e.code} en {url}") from e
            except urllib.error.URLError as e:
                if attempt < 3:
                    time.sleep(2 ** attempt)
                    continue
                raise SecError(f"Sin conexión con {url}: {e.reason}") from e
        raise SecError(f"Fallaron los reintentos: {url}")

    def get_json(self, url: str, cache_name: str, refresh: bool = False, guardar: bool = True) -> dict:
        """JSON de la SEC. Con `guardar`, se guarda comprimido y se reutiliza durante max_age_hours."""
        path = self.cache_dir / f"{cache_name}.json.gz"
        if not refresh and path.exists():
            age_h = (time.time() - path.stat().st_mtime) / 3600
            if age_h < self.max_age_hours:
                with gzip.open(path, "rb") as f:
                    return json.loads(f.read())
        body = self.fetch(url)
        data = json.loads(body)
        if guardar:
            self._guardar(path, body)
        return data

    @staticmethod
    def _guardar(path: Path, body: bytes) -> None:
        """Escribe la cache. En Windows otro proceso puede tener el archivo abierto: se reintenta
        y, si sigue ocupado, se sigue sin cache (no es un error)."""
        tmp = path.with_suffix(f".{os.getpid()}.tmp")
        with gzip.open(tmp, "wb") as f:
            f.write(body)
        for intento in range(5):
            try:
                tmp.replace(path)
                return
            except PermissionError:
                time.sleep(0.2 * (intento + 1))
        tmp.unlink(missing_ok=True)

    # --- endpoints -------------------------------------------------------------
    def company_facts(self, cik: int, refresh: bool = False, guardar: bool = False) -> dict:
        """Todos los datos XBRL presentados por una empresa (sin cache en disco por defecto: ~0,5 MB cada una)."""
        return self.get_json(
            f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json",
            f"companyfacts_{cik:010d}", refresh, guardar)

    def submissions(self, cik: int, refresh: bool = True, guardar: bool = False) -> dict:
        """Lista de presentaciones de una empresa."""
        return self.get_json(
            f"https://data.sec.gov/submissions/CIK{cik:010d}.json",
            f"submissions_{cik:010d}", refresh, guardar)

    def ticker_map(self, refresh: bool = False) -> dict[str, tuple[int, str]]:
        """Ticker -> (CIK, nombre) para todas las empresas registradas."""
        raw = self.get_json("https://www.sec.gov/files/company_tickers.json", "company_tickers", refresh)
        return {row["ticker"].upper(): (int(row["cik_str"]), row["title"]) for row in raw.values()}


def latest_periodic_filing(submissions: dict) -> dict | None:
    """Último 10-Q o 10-K de una empresa, según su lista de presentaciones."""
    recent = submissions.get("filings", {}).get("recent", {})
    for i, form in enumerate(recent.get("form", [])):
        if form in ("10-Q", "10-K", "10-Q/A", "10-K/A"):
            return {
                "form": form,
                "filed": recent["filingDate"][i],
                "period": recent["reportDate"][i],
                "accession": recent["accessionNumber"][i],
            }
    return None
