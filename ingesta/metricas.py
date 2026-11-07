"""Convierte los datos XBRL de una empresa en métricas trimestrales limpias.

Problemas que resuelve:
- Cada empresa usa etiquetas contables distintas, y las cambia con los años.
  Para cada métrica se prueba una lista de etiquetas en orden de preferencia.
- El estado de flujos de caja se reporta acumulado en el año fiscal
  (el 10-Q del segundo trimestre trae 6 meses). El trimestre se obtiene
  restando acumulados consecutivos que comparten fecha de inicio.
- No existe un 10-Q del cuarto trimestre: se obtiene restando el acumulado
  de 9 meses al dato anual del 10-K.
- Las cifras se corrigen en presentaciones posteriores: siempre gana la
  presentada más tarde.
"""
from __future__ import annotations

import math

from dataclasses import dataclass, field
from datetime import date, timedelta

FORMS = {"10-Q", "10-K", "10-Q/A", "10-K/A", "10-KT", "10-KT/A"}
QUARTER_DAYS = (80, 100)

# Métricas de periodo (se acumulan en el tiempo). Orden = preferencia.
FLOW_TAGS: dict[str, list[str]] = {
    "revenue": [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Revenues",
        "RevenueFromContractWithCustomerIncludingAssessedTax",
        "SalesRevenueNet",
        "SalesRevenueGoodsNet",
        "RevenuesNetOfInterestExpense",
    ],
    "net_income": [
        "NetIncomeLoss",
        "NetIncomeLossAvailableToCommonStockholdersBasic",
        "ProfitLoss",
    ],
    "operating_cash_flow": [
        "NetCashProvidedByUsedInOperatingActivities",
        "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
    ],
    "capex": [
        "PaymentsToAcquirePropertyPlantAndEquipment",
        "PaymentsToAcquireProductiveAssets",
        "PaymentsForCapitalImprovements",
    ],
    "stock_issuance": [
        "ProceedsFromIssuanceOfCommonStock",
        "ProceedsFromStockOptionsExercised",
        "ProceedsFromIssuanceOrSaleOfEquity",
    ],
    "stock_comp": [
        "ShareBasedCompensation",
        "AllocatedShareBasedCompensationExpense",
    ],
    "buybacks": [
        "PaymentsForRepurchaseOfCommonStock",
        "PaymentsForRepurchaseOfEquity",
    ],
    "dividends": [
        "PaymentsOfDividendsCommonStock",
        "PaymentsOfDividends",
        "PaymentsOfOrdinaryDividends",
    ],
}

# Métricas de balance (foto al cierre del trimestre).
INSTANT_TAGS: dict[str, list[str]] = {
    "debt_total_lt": ["LongTermDebt"],  # incluye la porción corriente
    "debt_noncurrent": ["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations"],
    "debt_current": ["LongTermDebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent"],
    "debt_short": ["ShortTermBorrowings", "CommercialPaper"],
    "cash": ["CashAndCashEquivalentsAtCarryingValue",
             "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
    "short_investments": ["MarketableSecuritiesCurrent", "ShortTermInvestments",
                          "AvailableForSaleSecuritiesDebtSecuritiesCurrent"],
    "shares_outstanding": ["CommonStockSharesOutstanding"],
}

# Promedios del trimestre (no se pueden restar acumulados): solo cifras de 3 meses.
AVERAGE_TAGS: dict[str, list[str]] = {
    "diluted_shares": ["WeightedAverageNumberOfDilutedSharesOutstanding"],
}

# Las siete métricas que ve el usuario, con su nombre en la app.
PUBLIC_METRICS = {
    "revenue": "Ventas",
    "net_income": "Beneficios",
    "free_cash_flow": "Flujo de caja libre",
    "stock_issuance": "Emisión de acciones",
    "buybacks": "Recompras de acciones",
    "net_debt": "Deuda neta",
    "dividends": "Dividendos",
}


# Conceptos XBRL (us-gaap) que usan las métricas: lo único que se guarda de cada documento.
CONCEPTOS_USADOS = frozenset(t for tabla in (FLOW_TAGS, INSTANT_TAGS, AVERAGE_TAGS) for tags in tabla.values() for t in tags)


@dataclass
class Value:
    value: float
    tag: str
    derived: bool = False  # True si se calculó (restando acumulados o combinando)


@dataclass
class Quarter:
    end: date
    metrics: dict[str, Value] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    @property
    def label(self) -> str:
        y, q = calendar_quarter(self.end)
        return f"{y}-Q{q}"


def calendar_quarter(end: date) -> tuple[int, int]:
    """Trimestre natural de un cierre. Cierres de los primeros días de un mes
    (años de 52/53 semanas, p. ej. 2 de octubre) cuentan para el trimestre anterior."""
    d = end - timedelta(days=20)
    return d.year, (d.month - 1) // 3 + 1


def _d(s: str) -> date:
    return date.fromisoformat(s)


def _raw_facts(company_facts: dict, tag: str, unit: str) -> list[dict]:
    node = company_facts.get("facts", {}).get("us-gaap", {}).get(tag)
    if not node:
        return []
    return [f for f in node.get("units", {}).get(unit, []) if f.get("form") in FORMS]


def _latest(facts: list[dict], key) -> dict:
    """Agrupa por clave y se queda con la cifra presentada más tarde."""
    out: dict = {}
    for f in facts:
        k = key(f)
        if k not in out or f.get("filed", "") >= out[k].get("filed", ""):
            out[k] = f
    return out


def quarterize(facts: list[dict]) -> dict[date, tuple[float, bool]]:
    """Valores trimestrales a partir de hechos de duración variable.

    Devuelve {fecha_cierre: (valor, derivado)}.
    """
    # Todas las versiones presentadas de cada periodo, de la más antigua a la más nueva.
    versions: dict[tuple[str, str], list[dict]] = {}
    for f in facts:
        if "start" in f:
            versions.setdefault((f["start"], f["end"]), []).append(f)
    for v in versions.values():
        v.sort(key=lambda f: f.get("filed", ""))
    quarters: dict[date, tuple[float, bool]] = {}

    # 1. Trimestres reportados directamente (unos 3 meses): gana la versión más reciente.
    for (s, e), vs in versions.items():
        days = (_d(e) - _d(s)).days
        if QUARTER_DAYS[0] <= days <= QUARTER_DAYS[1]:
            quarters[_d(e)] = (float(vs[-1]["val"]), False)

    # 2. Restar acumulados con el mismo inicio de año fiscal (6m-3m, 9m-6m, 12m-9m).
    #    Las dos cifras deben ser comparables: si la empresa reexpresó después
    #    (venta de un negocio, cambio contable), mezclar una cifra reexpresada con
    #    una original da trimestres absurdos. Se usa el acumulado largo tal como se
    #    presentó por primera vez y el acumulado corto vigente en esa fecha.
    by_start: dict[str, list[str]] = {}
    for (s, e) in versions:
        if (_d(e) - _d(s)).days <= 380:
            by_start.setdefault(s, []).append(e)
    for s, ends in by_start.items():
        ends.sort()
        for e0, e1 in zip(ends, ends[1:]):
            d1 = _d(e1)
            if not QUARTER_DAYS[0] <= (d1 - _d(e0)).days <= QUARTER_DAYS[1] or d1 in quarters:
                continue
            long_f = versions[(s, e1)][0]
            short_vs = versions[(s, e0)]
            prior = [f for f in short_vs if f.get("filed", "") <= long_f.get("filed", "")]
            short_f = prior[-1] if prior else short_vs[0]
            quarters[d1] = (float(long_f["val"]) - float(short_f["val"]), True)
    return quarters


def instants(facts: list[dict]) -> dict[date, float]:
    latest = _latest([f for f in facts if "start" not in f], lambda f: f["end"])
    return {_d(e): float(f["val"]) for e, f in latest.items()}


def quarter_averages(facts: list[dict]) -> dict[date, float]:
    """Promedios de un trimestre (p. ej. acciones diluidas): solo periodos de unos 3 meses."""
    direct = [f for f in facts if "start" in f
              and QUARTER_DAYS[0] <= (_d(f["end"]) - _d(f["start"])).days <= QUARTER_DAYS[1]]
    return {_d(e): float(f["val"]) for e, f in _latest(direct, lambda f: f["end"]).items()}


def _merge_tags(company_facts: dict, tags: list[str], unit: str, flow: bool | None) -> dict[date, Value]:
    """Combina varias etiquetas: para cada trimestre gana la de mayor preferencia.
    flow: True = flujo (se restan acumulados), False = saldo, None = promedio del trimestre."""
    out: dict[date, Value] = {}
    for tag in tags:
        facts = _raw_facts(company_facts, tag, unit)
        if not facts:
            continue
        if flow is None:
            for end, val in quarter_averages(facts).items():
                out.setdefault(end, Value(val, tag))
        elif flow:
            for end, (val, derived) in quarterize(facts).items():
                out.setdefault(end, Value(val, tag, derived))
        else:
            for end, val in instants(facts).items():
                out.setdefault(end, Value(val, tag))
    return out


def merge_company_facts(*docs: dict) -> dict:
    """Une los datos de varios CIK de una misma empresa (p. ej. cuando crea una
    nueva sociedad matriz). Los duplicados se resuelven luego por fecha de presentación."""
    gaap: dict = {}
    for doc in docs:
        for tag, node in doc.get("facts", {}).get("us-gaap", {}).items():
            units = gaap.setdefault(tag, {"units": {}})["units"]
            for unit, facts in node.get("units", {}).items():
                units.setdefault(unit, []).extend(facts)
    return {"entityName": docs[-1].get("entityName"), "facts": {"us-gaap": gaap}}


def build_quarters(company_facts: dict, since: date = date(2009, 1, 1)) -> list[Quarter]:
    flows = {m: _merge_tags(company_facts, tags, "USD", True) for m, tags in FLOW_TAGS.items()}
    inst = {m: _merge_tags(company_facts, tags, "shares" if m == "shares_outstanding" else "USD", False)
            for m, tags in INSTANT_TAGS.items()}
    inst.update({m: _merge_tags(company_facts, tags, "shares", None) for m, tags in AVERAGE_TAGS.items()})
    scale_notes = [n for m in ("shares_outstanding", "diluted_shares") for n in fix_share_scale(inst[m])]

    # Los trimestres existentes son los cierres con ventas, beneficio o flujo operativo.
    ends = set()
    for m in ("revenue", "net_income", "operating_cash_flow"):
        ends.update(flows[m])
    ends = sorted(e for e in ends if e >= since)

    quarters = []
    for end in ends:
        q = Quarter(end)
        for m, series in flows.items():
            if end in series:
                v = series[end]
                if m == "revenue" and v.derived and v.value <= 0:
                    q.notes.append(f"Ventas calculadas descartadas en {q.label}: {v.value:,.0f} "
                                   "(acumulados no comparables)")
                    continue
                q.metrics[m] = v
        for m, series in inst.items():
            if end in series:
                q.metrics[m] = series[end]
        _derive(q)
        quarters.append(q)
    if quarters:
        quarters[-1].notes.extend(scale_notes)
    return quarters


MIN_SHARES = 1_000_000  # ninguna del universo tiene menos (NVR, la menor, ~3 millones): si aparece, venía en miles o millones


def fix_share_scale(series: dict[date, Value]) -> list[str]:
    """Algunas empresas etiquetan sus acciones con la escala equivocada: 731 en vez de
    731 millones, o 98.204 millones en vez de 98 millones. Una empresa no multiplica ni
    divide sus acciones por 1.000 de un trimestre a otro, así que cada cifra que se aleja
    ×1.000 o ×1.000.000 de la mediana de la empresa se reescala. Sin referencia, una cifra
    menor que MIN_SHARES se lee en miles (cinco cifras) o en millones (menos)."""
    vals = sorted(v.value for v in series.values() if v.value > 0)
    ref = vals[len(vals) // 2] if vals else None
    if ref is not None and ref < MIN_SHARES:
        ok = [x for x in vals if x >= MIN_SHARES]
        ref = ok[len(ok) // 2] if ok else None
    notes = []
    for end, v in series.items():
        if v.value <= 0:
            continue
        if ref:
            k = round(math.log(ref / v.value, 1000))  # potencias de 1.000
            scale = 1000.0 ** k if abs(math.log(v.value / ref, 10)) > 2.5 else 1.0
        elif v.value < MIN_SHARES:
            scale = 1e3 if v.value >= 10_000 else 1e6
        else:
            scale = 1.0
        if scale == 1.0:
            continue
        series[end] = Value(v.value * scale, f"{v.tag} × {scale:g}", True)
        y, q = calendar_quarter(end)
        notes.append(f"Escala de acciones corregida en {y}-Q{q}: {v.value:,.1f} -> {v.value * scale:,.0f}")
    return notes


def _derive(q: Quarter) -> None:
    m = q.metrics
    ocf = m.get("operating_cash_flow")
    if ocf:
        capex = m.get("capex")
        q.metrics["free_cash_flow"] = Value(
            ocf.value - (capex.value if capex else 0.0),
            f"{ocf.tag} - {capex.tag if capex else '(sin capex)'}", True)

    if "debt_total_lt" in m:
        debt, tag = m["debt_total_lt"].value, m["debt_total_lt"].tag
    elif "debt_noncurrent" in m or "debt_current" in m:
        parts = [m[k] for k in ("debt_noncurrent", "debt_current") if k in m]
        debt, tag = sum(p.value for p in parts), " + ".join(p.tag for p in parts)
    else:
        debt, tag = None, ""
    if "debt_short" in m:
        debt = (debt or 0.0) + m["debt_short"].value
        tag = f"{tag} + {m['debt_short'].tag}" if tag else m["debt_short"].tag
    if debt is not None:
        q.metrics["debt"] = Value(debt, tag, True)
        cash = sum(m[k].value for k in ("cash", "short_investments") if k in m)
        q.metrics["net_debt"] = Value(debt - cash, "debt - cash", True)

    if "buybacks" in m or "stock_issuance" in m:
        bought = m["buybacks"].value if "buybacks" in m else 0.0
        issued = m["stock_issuance"].value if "stock_issuance" in m else 0.0
        q.metrics["net_buybacks"] = Value(bought - issued, "buybacks - stock_issuance", True)


def validate(quarters: list[Quarter]) -> list[str]:
    """Avisos de calidad para revisar antes de publicar los datos."""
    issues = []
    if not quarters:
        return ["Sin trimestres: la empresa no tiene datos XBRL reconocibles"]
    for q in quarters:
        issues.extend(q.notes)
    recent = quarters[-4:]
    for metric, name in PUBLIC_METRICS.items():
        missing = [q.label for q in recent if metric not in q.metrics]
        if missing and metric not in ("dividends", "stock_issuance", "buybacks"):
            issues.append(f"Falta {name} en {', '.join(missing)}")
    for q in quarters:
        r = q.metrics.get("revenue")
        if r and r.value <= 0:
            issues.append(f"Ventas no positivas en {q.label}: {r.value:,.0f}")
    # Saltos bruscos frente a los trimestres vecinos (un error típico al restar
    # acumulados mal emparejados). Comparar con vecinos tolera el crecimiento rápido.
    revs = [(q, q.metrics["revenue"].value) for q in quarters if "revenue" in q.metrics]
    for (_, a), (q, b), (_, c) in zip(revs, revs[1:], revs[2:]):
        if a > 0 and c > 0 and b > 0 and (b > 3 * max(a, c) or b < min(a, c) / 3):
            issues.append(f"Ventas atípicas en {q.label}: {b:,.0f} (vecinos {a:,.0f} y {c:,.0f})")
    if any("(sin capex)" in q.metrics["free_cash_flow"].tag for q in recent if "free_cash_flow" in q.metrics):
        issues.append("Flujo de caja libre sin inversión en activos (habitual en bancos)")
    # Huecos: trimestres esperados que no aparecen.
    for a, b in zip(quarters, quarters[1:]):
        if (b.end - a.end).days > 100:
            issues.append(f"Hueco entre {a.label} y {b.label}")
    return issues
