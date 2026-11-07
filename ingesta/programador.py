"""Programador: deja Al Precio Justo al día sin que nadie ejecute nada.

- Cada `--cada` minutos (60 por defecto): busca 10-Q / 10-K nuevos en el índice de
  EDGAR y los procesa (`actualizar`). La SEC publica el índice de cada día por la
  noche; en temporada de resultados hay decenas de reportes al día.
- Una vez al día: tipos de cambio (Banco Central Europeo y Banco Central de Chile).
- De lunes a viernes, después del cierre del mercado (22:30 UTC): actualiza los
  precios de los últimos 5 días (`precios --rango 5d`).
- Si se indica `--migrar N`, en cada vuelta pasa N empresas más a datos leídos de
  documentos, hasta completar el S&P 500.

Uso:
    py -m ingesta.programador                 # en primer plano (Ctrl+C para parar)
    py -m ingesta.programador --una-vez       # una vuelta (para cron / Programador de tareas)

En producción conviene lanzarlo con el programador del sistema (cron, systemd timer,
Programador de tareas de Windows) usando --una-vez cada hora.
"""
from __future__ import annotations

import argparse
import sys
import time
import traceback
from datetime import datetime, time as hora, timezone
from pathlib import Path

from . import actualizar, divisas, precios, universo
from .sec import SecClient

DATA = Path(__file__).resolve().parent.parent / "data"
CIERRE_UTC = hora(22, 30)   # 16:00 en Nueva York + margen (21:00 UTC en horario de verano)


def toca_precios(ahora: datetime, ultimo: str | None) -> bool:
    """Días hábiles, tras el cierre, una vez al día."""
    return ahora.weekday() < 5 and ahora.time() >= CIERRE_UTC and ultimo != ahora.date().isoformat()


def vuelta(db: Path, migrar: int = 0) -> None:
    ahora = datetime.now(timezone.utc)
    print(f"\n=== {ahora:%Y-%m-%d %H:%M} UTC ===")
    client = SecClient(DATA / "raw")
    con = actualizar.conectar(db)
    empresas = universo.lista(client)

    r = actualizar.ejecutar(con, client, empresas)
    print(f"Reportes: {r['reportes']} ({r['publicado']} publicados, {r['cuarentena']} en cuarentena, {r['error']} con error)")
    if migrar:
        actualizar.migrar(con, client, empresas, migrar)

    if actualizar.leer_estado(con, "divisas_ultimo_dia") != ahora.date().isoformat():
        problemas = divisas.actualizar(con)
        print("Tipos de cambio del día" + (f" (con avisos: {'; '.join(problemas)})" if problemas else ""))
        if not problemas:
            actualizar.guardar_estado(con, "divisas_ultimo_dia", ahora.date().isoformat())

    if toca_precios(ahora, actualizar.leer_estado(con, "precios_ultimo_dia")):
        print("Precios del día…")
        precios.main(["--todas", "--rango", "5d", "--db", str(db)])
        actualizar.guardar_estado(con, "precios_ultimo_dia", ahora.date().isoformat())
    con.close()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Mantiene los datos al día")
    ap.add_argument("--cada", type=int, default=60, help="Minutos entre vueltas")
    ap.add_argument("--una-vez", action="store_true")
    ap.add_argument("--migrar", type=int, default=0, metavar="N", help="Empresas a migrar a documentos por vuelta")
    ap.add_argument("--db", type=Path, default=DATA / "ancla.db")
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8")
    while True:
        try:
            vuelta(args.db, args.migrar)
        except Exception:  # una vuelta fallida no detiene el programador
            traceback.print_exc()
            actualizar.alertar("La vuelta del programador falló; ver el registro.")
            if args.una_vez:
                return 1
        if args.una_vez:
            return 0
        time.sleep(args.cada * 60)


if __name__ == "__main__":
    raise SystemExit(main())
