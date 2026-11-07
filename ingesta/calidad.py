"""Control de calidad antes de publicar los datos de un reporte nuevo.

Compara tres versiones de los trimestres de una empresa:

- publicado:  lo que la app muestra hoy (tabla fundamentals_q);
- nuevo:      lo que sale tras leer el reporte nuevo (documentos de la SEC);
- referencia: las mismas cifras según la API de la SEC (verificación cruzada, opcional).

Si hay algún problema grave, el reporte queda en cuarentena: la app sigue
mostrando lo publicado hasta que una persona lo apruebe o lo rechace.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from .metricas import Quarter

# Por trimestre: fecha de cierre ISO -> métrica -> valor
Tabla = dict[str, dict[str, float]]

CLAVE = ("revenue", "net_income", "free_cash_flow")
ACCIONES = ("diluted_shares", "shares_outstanding")
TOLERANCIA_REFERENCIA = 0.02   # 2 %: el documento y la API deben coincidir
CAMBIO_PASADO = 0.20           # una reexpresión de más del 20 % merece una mirada
SALTO_ACCIONES = 0.40          # +/-40 % de acciones en un trimestre: escala mal leída o un split
SALTO_VENTAS = 3.0             # ventas ×3 o ÷3 frente al trimestre anterior
VENTANA_PERDIDA = 3 * 365      # trimestres de los últimos 3 años que no pueden desaparecer
VENTANA_CAMBIOS = 6 * 365      # el modelo usa hasta 6 años (crecimiento de 5 años + último año); antes, solo aviso


@dataclass
class Revision:
    graves: list[str] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.graves


def tabla(quarters: list[Quarter]) -> Tabla:
    return {q.end.isoformat(): {m: v.value for m, v in q.metrics.items()} for q in quarters}


def iguales(a: Tabla, b: Tabla) -> bool:
    """Mismos trimestres, métricas y valores (salvo redondeos de menos de 1 dólar o 0,01 %)."""
    return a.keys() == b.keys() and all(
        a[f].keys() == b[f].keys() and not any(_difiere(a[f][m], b[f][m], 1e-4) for m in a[f]) for f in a)


def _difiere(a: float, b: float, tol: float) -> bool:
    return abs(a - b) > max(1.0, abs(b) * tol)


def _confirmado(ref: Tabla | None, fin: str, metrica: str, valor: float) -> bool:
    """La API de la SEC dice lo mismo que el documento."""
    r = (ref or {}).get(fin, {}).get(metrica)
    return r is not None and not _difiere(valor, r, TOLERANCIA_REFERENCIA)


def _etiqueta(fin: str) -> str:
    d = date.fromisoformat(fin) - timedelta(days=20)
    return f"{d.year}-Q{(d.month - 1) // 3 + 1}"


def revisar(publicado: Tabla, nuevo: Tabla, referencia: Tabla | None = None, hoy: date | None = None) -> Revision:
    rev = Revision()
    hoy = hoy or date.today()
    if not nuevo:
        rev.graves.append("El reporte no produjo ningún trimestre")
        return rev
    fins = sorted(nuevo)
    ultimo_pub = max(publicado) if publicado else None
    nuevos = [f for f in fins if ultimo_pub is None or f > ultimo_pub]

    # 1. Lo ya publicado no puede desaparecer.
    limite = (hoy - timedelta(days=VENTANA_PERDIDA)).isoformat()
    perdidos = [f for f in publicado if f >= limite and f not in nuevo]
    if perdidos:
        rev.graves.append("Desaparecen trimestres ya publicados: " + ", ".join(_etiqueta(f) for f in sorted(perdidos)))

    # 2. Cambios grandes en trimestres ya publicados (reexpresiones o errores de lectura).
    for f in sorted(set(publicado) & set(nuevo)):
        for m in CLAVE:
            a, b = publicado[f].get(m), nuevo[f].get(m)
            if a is None or b is None or not _difiere(b, a, CAMBIO_PASADO):
                continue
            if abs(b - a) < 0.01 * abs(publicado[f].get("revenue") or 0):
                continue  # cambio pequeño frente al tamaño de la empresa (p. ej. beneficio cerca de 0)
            if f < (hoy - timedelta(days=VENTANA_CAMBIOS)).isoformat():
                rev.avisos.append(f"Cambio antiguo en {_etiqueta(f)} {m}: {a:,.0f} → {b:,.0f} (no afecta al valor de hoy)")
            elif _confirmado(referencia, f, m, b):
                rev.avisos.append(f"Reexpresión en {_etiqueta(f)} {m}: {a:,.0f} → {b:,.0f} (la SEC lo confirma)")
            else:
                rev.graves.append(f"Cambia {m} de {_etiqueta(f)} ya publicado: {a:,.0f} → {b:,.0f}")

    # 3. Trimestres nuevos: completos, coherentes y confirmados por la SEC.
    previo = publicado.get(ultimo_pub, {}) if ultimo_pub else {}
    for f in nuevos:
        q = nuevo[f]
        for m in ("revenue", "free_cash_flow"):
            if m in previo and m not in q:
                rev.graves.append(f"Falta {m} en el trimestre nuevo {_etiqueta(f)}")
        ref_q = (referencia or {}).get(f)
        if ref_q is None:
            rev.avisos.append(f"{_etiqueta(f)} sin verificación cruzada (la API de la SEC aún no lo tiene)")
        else:
            for m in CLAVE + ACCIONES:
                if m in q and m in ref_q and _difiere(q[m], ref_q[m], TOLERANCIA_REFERENCIA):
                    rev.graves.append(f"{m} de {_etiqueta(f)} no coincide con la SEC: documento {q[m]:,.0f}, API {ref_q[m]:,.0f}")
        for m in ACCIONES:
            a, b = previo.get(m), q.get(m)
            if a and b and abs(b / a - 1) > SALTO_ACCIONES and not _confirmado(referencia, f, m, b):
                rev.graves.append(f"Las acciones pasan de {a:,.0f} a {b:,.0f} en {_etiqueta(f)} (¿escala o split?)")
                break
        a, b = previo.get("revenue"), q.get("revenue")
        if a and b and a > 0 and (b > SALTO_VENTAS * a or b < a / SALTO_VENTAS) and not _confirmado(referencia, f, "revenue", b):
            rev.graves.append(f"Ventas atípicas en {_etiqueta(f)}: {b:,.0f} (antes {a:,.0f})")
        previo = q
    return rev
