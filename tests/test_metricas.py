import unittest
from datetime import date

from ingesta.metricas import build_quarters, calendar_quarter, merge_company_facts, quarterize, validate
from ingesta.universo import parse_sp500


def fact(start, end, val, filed="2025-01-01", form="10-Q"):
    f = {"end": end, "val": val, "filed": filed, "form": form}
    if start:
        f["start"] = start
    return f


def company(**tags):
    """tags: nombre -> lista de hechos (USD) o ("shares", lista)."""
    gaap = {}
    for tag, facts in tags.items():
        unit = "USD"
        if isinstance(facts, tuple):
            unit, facts = facts
        gaap[tag] = {"units": {unit: facts}}
    return {"facts": {"us-gaap": gaap}}


# Año fiscal tipo calendario 2024: trimestres que cierran mar/jun/sep/dic.
Q_ENDS = ["2024-03-31", "2024-06-30", "2024-09-30", "2024-12-31"]


class QuarterizeTest(unittest.TestCase):
    def test_direct_quarters(self):
        q = quarterize([fact("2024-01-01", "2024-03-31", 100), fact("2024-04-01", "2024-06-30", 120)])
        self.assertEqual(q[date(2024, 3, 31)], (100, False))
        self.assertEqual(q[date(2024, 6, 30)], (120, False))

    def test_cash_flow_ytd_is_deaccumulated(self):
        # El flujo de caja llega acumulado: 3m=10, 6m=25, 9m=45, 12m=70
        facts = [
            fact("2024-01-01", "2024-03-31", 10),
            fact("2024-01-01", "2024-06-30", 25),
            fact("2024-01-01", "2024-09-30", 45),
            fact("2024-01-01", "2024-12-31", 70, form="10-K"),
        ]
        q = quarterize(facts)
        self.assertEqual([q[date.fromisoformat(e)][0] for e in Q_ENDS], [10, 15, 20, 25])
        self.assertTrue(q[date(2024, 12, 31)][1])  # Q4 derivado

    def test_q4_from_annual_minus_nine_months(self):
        facts = [
            fact("2024-01-01", "2024-03-31", 100), fact("2024-04-01", "2024-06-30", 110),
            fact("2024-07-01", "2024-09-30", 120), fact("2024-01-01", "2024-09-30", 330),
            fact("2024-01-01", "2024-12-31", 470, form="10-K"),
        ]
        self.assertEqual(quarterize(facts)[date(2024, 12, 31)], (140, True))

    def test_restatement_latest_filing_wins(self):
        facts = [
            fact("2024-01-01", "2024-03-31", 100, filed="2024-05-01"),
            fact("2024-01-01", "2024-03-31", 90, filed="2025-05-01"),  # corregido un año después
        ]
        self.assertEqual(quarterize(facts)[date(2024, 3, 31)][0], 90)

    def test_q4_uses_comparable_vintages_after_restatement(self):
        # 9 meses originales = 300 (filed abril). Anual original = 400 (filed enero siguiente).
        # Un año después la empresa vende un negocio y reexpresa: 9m = 210, anual = 280.
        # Lo incorrecto sería 280 - 300 = -20. Lo correcto: 400 - 300 = 100.
        facts = [
            fact("2024-01-01", "2024-09-30", 300, filed="2024-10-30"),
            fact("2024-01-01", "2024-12-31", 400, filed="2025-02-01", form="10-K"),
            fact("2024-01-01", "2024-09-30", 210, filed="2025-10-30"),
            fact("2024-01-01", "2024-12-31", 280, filed="2026-02-01", form="10-K"),
        ]
        self.assertEqual(quarterize(facts)[date(2024, 12, 31)], (100, True))

    def test_half_year_gap_is_not_a_quarter(self):
        facts = [fact("2024-01-01", "2024-03-31", 10), fact("2024-01-01", "2024-09-30", 45)]
        q = quarterize(facts)
        self.assertNotIn(date(2024, 9, 30), q)

    def test_52_53_week_fiscal_year(self):
        # Año fiscal tipo Apple: cierres en sábado, trimestres de 13 semanas
        facts = [
            fact("2023-10-01", "2023-12-30", 120),
            fact("2023-10-01", "2024-03-30", 210),
            fact("2023-10-01", "2024-06-29", 296),
            fact("2023-10-01", "2024-09-28", 391, form="10-K"),
        ]
        q = quarterize(facts)
        self.assertEqual(q[date(2024, 9, 28)], (95, True))
        self.assertEqual(calendar_quarter(date(2024, 9, 28)), (2024, 3))
        self.assertEqual(calendar_quarter(date(2022, 10, 1)), (2022, 3))


class BuildQuartersTest(unittest.TestCase):
    def test_tag_switch_over_time(self):
        cf = company(
            SalesRevenueNet=[fact("2017-01-01", "2017-03-31", 50)],
            RevenueFromContractWithCustomerExcludingAssessedTax=[fact("2018-01-01", "2018-03-31", 60)],
        )
        qs = build_quarters(cf, since=date(2010, 1, 1))
        self.assertEqual([(q.label, q.metrics["revenue"].value, q.metrics["revenue"].tag) for q in qs], [
            ("2017-Q1", 50, "SalesRevenueNet"),
            ("2018-Q1", 60, "RevenueFromContractWithCustomerExcludingAssessedTax"),
        ])

    def test_seven_metrics(self):
        s, e = "2024-01-01", "2024-03-31"
        cf = company(
            Revenues=[fact(s, e, 1000)],
            NetIncomeLoss=[fact(s, e, 200)],
            NetCashProvidedByUsedInOperatingActivities=[fact(s, e, 300)],
            PaymentsToAcquirePropertyPlantAndEquipment=[fact(s, e, 50)],
            ProceedsFromIssuanceOfCommonStock=[fact(s, e, 10)],
            PaymentsForRepurchaseOfCommonStock=[fact(s, e, 80)],
            PaymentsOfDividends=[fact(s, e, 40)],
            LongTermDebtNoncurrent=[fact(None, e, 900)],
            LongTermDebtCurrent=[fact(None, e, 100)],
            CommercialPaper=[fact(None, e, 20)],
            CashAndCashEquivalentsAtCarryingValue=[fact(None, e, 300)],
            MarketableSecuritiesCurrent=[fact(None, e, 120)],
            CommonStockSharesOutstanding=("shares", [fact(None, e, 5_000_000)]),
        )
        [q] = build_quarters(cf)
        v = {k: x.value for k, x in q.metrics.items()}
        self.assertEqual(v["revenue"], 1000)
        self.assertEqual(v["net_income"], 200)
        self.assertEqual(v["free_cash_flow"], 250)
        self.assertEqual(v["stock_issuance"], 10)
        self.assertEqual(v["buybacks"], 80)
        self.assertEqual(v["net_buybacks"], 70)
        self.assertEqual(v["dividends"], 40)
        self.assertEqual(v["debt"], 1020)
        self.assertEqual(v["net_debt"], 600)
        self.assertEqual(v["shares_outstanding"], 5_000_000)

    def test_diluted_shares_use_only_quarterly_averages(self):
        cf = company(
            Revenues=[fact("2024-01-01", "2024-03-31", 10), fact("2024-04-01", "2024-06-30", 10)],
            WeightedAverageNumberOfDilutedSharesOutstanding=("shares", [
                fact("2024-01-01", "2024-03-31", 100e6), fact("2024-04-01", "2024-06-30", 98e6),
                fact("2024-01-01", "2024-06-30", 99e6)]),  # semestral: no se resta
        )
        qs = build_quarters(cf)
        self.assertEqual([q.metrics["diluted_shares"].value for q in qs], [100e6, 98e6])

    def test_shares_reported_in_millions_are_rescaled(self):
        cf = company(Revenues=[fact("2024-01-01", "2024-03-31", 10)],
                     WeightedAverageNumberOfDilutedSharesOutstanding=("shares", [fact("2024-01-01", "2024-03-31", 731.7)]))
        [q] = build_quarters(cf)
        self.assertAlmostEqual(q.metrics["diluted_shares"].value, 731_700_000)
        self.assertTrue(any("Escala de acciones" in n for n in q.notes))

    def test_share_scale_follows_the_other_quarters(self):
        # 61.664 junto a trimestres de ~62 millones: venía en miles, no en millones
        ends = [("2024-01-01", "2024-03-31"), ("2024-04-01", "2024-06-30"), ("2024-07-01", "2024-09-30")]
        cf = company(Revenues=[fact(s, e, 10) for s, e in ends],
                     WeightedAverageNumberOfDilutedSharesOutstanding=("shares", [
                         fact(*ends[0], 61_000_000), fact(*ends[1], 61_664), fact(*ends[2], 62_000_000)]))
        qs = build_quarters(cf)
        self.assertEqual(qs[1].metrics["diluted_shares"].value, 61_664_000)

    def test_share_scale_too_large_is_divided(self):
        ends = [("2024-01-01", "2024-03-31"), ("2024-04-01", "2024-06-30"), ("2024-07-01", "2024-09-30")]
        cf = company(Revenues=[fact(s, e, 10) for s, e in ends],
                     WeightedAverageNumberOfDilutedSharesOutstanding=("shares", [
                         fact(*ends[0], 59_000_000), fact(*ends[1], 59_500_000), fact(*ends[2], 98_204_000_000)]))
        self.assertEqual(build_quarters(cf)[2].metrics["diluted_shares"].value, 98_204_000)

    def test_merge_predecessor_cik(self):
        # La historia está en el CIK viejo; los trimestres recientes en el nuevo
        old = company(Revenues=[fact("2025-01-01", "2025-09-30", 300),
                                fact("2025-01-01", "2025-12-31", 410, form="10-K")])
        new = company(Revenues=[fact("2026-01-01", "2026-03-31", 120)])
        qs = build_quarters(merge_company_facts(old, new))
        self.assertEqual([(q.label, q.metrics["revenue"].value) for q in qs],
                         [("2025-Q4", 110), ("2026-Q1", 120)])

    def test_fast_growth_is_not_flagged_but_spikes_are(self):
        ends = [("2024-01-01", "2024-03-31"), ("2024-04-01", "2024-06-30"),
                ("2024-07-01", "2024-09-30"), ("2024-10-01", "2024-12-31"), ("2025-01-01", "2025-03-31")]
        growth = company(Revenues=[fact(s, e, v) for (s, e), v in zip(ends, [1, 2, 4, 8, 16])])
        self.assertFalse(any("atípicas" in i for i in validate(build_quarters(growth))))
        spike = company(Revenues=[fact(s, e, v) for (s, e), v in zip(ends, [10, 11, 90, 12, 13])])
        self.assertTrue(any("atípicas en 2024-Q3" in i for i in validate(build_quarters(spike))))

    def test_ignores_other_forms(self):
        cf = company(Revenues=[fact("2024-01-01", "2024-03-31", 1, form="8-K")])
        self.assertEqual(build_quarters(cf), [])

    def test_validate_flags_missing_and_bank_capex(self):
        s, e = "2024-01-01", "2024-03-31"
        cf = company(Revenues=[fact(s, e, 10)], NetCashProvidedByUsedInOperatingActivities=[fact(s, e, 5)])
        issues = validate(build_quarters(cf))
        self.assertTrue(any("Beneficios" in i for i in issues))
        self.assertTrue(any("sin inversión" in i for i in issues))


class Sp500ParserTest(unittest.TestCase):
    def test_parses_constituents_table(self):
        html = """<table class="wikitable" id="constituents"><tbody>
        <tr><th>Symbol</th><th>Security</th><th>GICS Sector</th><th>GICS Sub-Industry</th>
            <th>Headquarters Location</th><th>Date added</th><th>CIK</th><th>Founded</th></tr>
        <tr><td><a href="#">AAPL</a></td><td><a>Apple Inc.</a></td><td>Information Technology</td>
            <td>Tech Hardware</td><td>Cupertino</td><td>1982-11-30</td><td>0000320193</td><td>1977</td></tr>
        <tr><td>BRK.B</td><td>Berkshire Hathaway</td><td>Financials</td><td>x</td><td>y</td>
            <td>2010-02-16</td><td>0001067983</td><td>1839</td></tr>
        </tbody></table><table id="changes"><tr><td>ignorar</td></tr></table>"""
        rows = parse_sp500(html)
        self.assertEqual(rows[0], {"ticker": "AAPL", "name": "Apple Inc.",
                                   "sector": "Information Technology", "cik": 320193})
        self.assertEqual(rows[1]["ticker"], "BRK.B")
        self.assertEqual(len(rows), 2)


class EscalaAccionesTest(unittest.TestCase):
    def _serie(self, *vals):
        from ingesta.metricas import Value
        return {date(2026, 3 * (i + 1), 28): Value(v, "WeightedAverageNumberOfDilutedSharesOutstanding") for i, v in enumerate(vals)}

    def test_todas_en_miles(self):
        from ingesta.metricas import fix_share_scale
        s = self._serie(178_964, 182_397, 181_311)   # Tempus: 181 millones informadas en miles
        fix_share_scale(s)
        self.assertEqual([round(v.value) for v in s.values()], [178_964_000, 182_397_000, 181_311_000])

    def test_empresa_con_pocas_acciones_no_se_toca(self):
        from ingesta.metricas import fix_share_scale
        s = self._serie(3_011_644, 2_990_000, 2_950_000)   # NVR
        self.assertEqual(fix_share_scale(s), [])


if __name__ == "__main__":
    unittest.main()
