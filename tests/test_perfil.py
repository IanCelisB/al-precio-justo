import unittest

from ingesta.lector import SegmentFact
from ingesta.perfil import actividad_10k, desglose_anual, historia_ingresos

NEGOCIO = ("Adobe is a global technology company with a mission to change the world through personalized digital "
           "experiences. We help individuals, teams, businesses and enterprises create, publish and promote content.")
SEGMENTOS = ("Our Digital Media segment provides products, services and solutions that enable individuals, teams and "
             "enterprises to create, publish and promote their content anywhere.")

HTML = f"""<html><body>
<div style="display:none"><ix:header><ix:hidden>Item 1. Business oculto</ix:hidden></ix:header></div>
<table><tr><td>Item 1.</td><td>Business</td><td>3</td></tr><tr><td>Item 1A.</td><td>Risk Factors</td></tr></table>
<p>Forward-looking statements: this report contains statements that involve risks and uncertainties.</p>
<p><b>ITEM 1. BUSINESS</b></p>
<p>Overview</p>
<p>{NEGOCIO}</p>
<p>{SEGMENTOS}</p>
<p>ITEM 1A. RISK FACTORS</p>
<p>Our business is subject to many risks that could materially affect results.</p>
</body></html>"""


def seg(member, value, end, axis="StatementBusinessSegmentsAxis"):
    start = f"{int(end[:4]) - 1}{end[4:]}"
    return SegmentFact("us-gaap:Revenues", axis, f"adbe:{member}Member", value, start, end)


class ActividadTest(unittest.TestCase):
    def test_toma_item_1_y_no_el_indice(self):
        texto = actividad_10k(HTML)
        self.assertTrue(texto.startswith("Adobe is a global technology company"))
        self.assertIn("Digital Media segment", texto)
        self.assertNotIn("Risk", texto)
        self.assertNotIn("oculto", texto)

    def test_sin_seccion_no_inventa(self):
        self.assertIsNone(actividad_10k("<p>Nada que ver aquí.</p>"))


class HistoriaTest(unittest.TestCase):
    def test_cinco_anios_de_dos_10k(self):
        reciente = [seg("DigitalMedia", v, f"{a}-11-30") for a, v in ((2024, 15), (2025, 17), (2026, 18))] + \
                   [seg("DigitalExperience", v, f"{a}-11-30") for a, v in ((2024, 5), (2025, 5.5), (2026, 6))]
        antiguo = [seg("DigitalMedia", v, f"{a}-11-30") for a, v in ((2022, 12), (2023, 13), (2024, 14.9))] + \
                  [seg("DigitalExperience", v, f"{a}-11-30") for a, v in ((2022, 4.2), (2023, 4.6), (2024, 5))]
        docs = [
            {"anios": desglose_anual(reciente, {}), "totales": {}, "etiquetas": {}},
            {"anios": desglose_anual(antiguo, {}), "totales": {}, "etiquetas": {}},
        ]
        h = historia_ingresos(docs)["segmentos"]
        self.assertEqual([x["anio"] for x in h], ["2022", "2023", "2024", "2025", "2026"])
        # El año repetido (2024) sale del 10-K más reciente.
        self.assertEqual(h[2]["partes"][0], {"nombre": "Digital Media", "valor": 15})
        self.assertEqual(h[-1]["total"], 24)


if __name__ == "__main__":
    unittest.main()
