import unittest
from datetime import date

from ingesta.actualizar import leer_indice, periodicos
from ingesta.calidad import iguales, revisar

INDICE = """Description:           Daily Index of EDGAR Dissemination Feed by Form Type
Last Data Received:    October 31, 2025
Comments:              webmaster@sec.gov

Form Type   Company Name                                                  CIK         Date Filed  File Name
---------------------------------------------------------------------------------------------------------------------------------------------
10-K        Apple Inc.                                                    320193      20251031    edgar/data/320193/0000320193-25-000079.txt
10-Q        MICROSOFT CORP                                                789019      20251029    edgar/data/789019/0000950170-25-134811.txt
10-Q/A      Some Small Co                                                 1234567     20251031    edgar/data/1234567/0001234567-25-000002.txt
SC 13G/A    Apple Inc.                                                    320193      20251031    edgar/data/320193/0000320193-25-000080.txt
8-K         MICROSOFT CORP                                                789019      20251031    edgar/data/789019/0000950170-25-134999.txt
"""


class IndiceTest(unittest.TestCase):
    def test_lee_filas(self):
        filas = leer_indice(INDICE)
        self.assertEqual(len(filas), 5)
        self.assertEqual(filas[0], {"form": "10-K", "nombre": "Apple Inc.", "cik": 320193, "filed": "2025-10-31",
                                    "accession": "0000320193-25-000079"})
        self.assertEqual(filas[3]["form"], "SC 13G/A")

    def test_solo_periodicos_del_universo(self):
        universo = {320193: {"ticker": "AAPL"}, 789019: {"ticker": "MSFT"}}
        g = periodicos(leer_indice(INDICE), universo)
        self.assertEqual(sorted(g), ["AAPL", "MSFT"])
        self.assertEqual([f["form"] for f in g["AAPL"]], ["10-K"])
        self.assertEqual([f["form"] for f in g["MSFT"]], ["10-Q"])


def q(revenue, fcf=10.0, ni=5.0, acciones=100.0):
    return {"revenue": revenue, "free_cash_flow": fcf, "net_income": ni, "diluted_shares": acciones}


HOY = date(2026, 11, 7)
PUB = {"2026-03-31": q(100), "2026-06-30": q(105)}


class CalidadTest(unittest.TestCase):
    def test_trimestre_nuevo_correcto_y_confirmado(self):
        nuevo = {**PUB, "2026-09-30": q(110)}
        r = revisar(PUB, nuevo, {"2026-09-30": q(110)}, HOY)
        self.assertTrue(r.ok, r.graves)
        self.assertEqual(r.avisos, [])

    def test_sin_referencia_avisa_pero_publica(self):
        r = revisar(PUB, {**PUB, "2026-09-30": q(110)}, None, HOY)
        self.assertTrue(r.ok)
        self.assertIn("sin verificación cruzada", r.avisos[0])

    def test_no_coincide_con_la_sec(self):
        r = revisar(PUB, {**PUB, "2026-09-30": q(110)}, {"2026-09-30": q(99)}, HOY)
        self.assertFalse(r.ok)
        self.assertIn("no coincide con la SEC", r.graves[0])

    def test_desaparece_un_trimestre_publicado(self):
        r = revisar(PUB, {"2026-06-30": q(105), "2026-09-30": q(110)}, None, HOY)
        self.assertIn("Desaparecen", r.graves[0])
        self.assertIn("2026-Q1", r.graves[0])

    def test_reexpresion_grande_sin_confirmar_va_a_cuarentena(self):
        nuevo = {"2026-03-31": q(160), "2026-06-30": q(105), "2026-09-30": q(110)}
        self.assertFalse(revisar(PUB, nuevo, None, HOY).ok)
        confirmada = revisar(PUB, nuevo, {"2026-03-31": q(160), "2026-09-30": q(110)}, HOY)
        self.assertTrue(confirmada.ok, confirmada.graves)
        self.assertTrue(any("Reexpresión" in a for a in confirmada.avisos))

    def test_cambio_antiguo_solo_avisa(self):
        pub = {"2012-09-30": q(100), **PUB}
        r = revisar(pub, {"2012-09-30": q(100, fcf=40), **PUB, "2026-09-30": q(110)}, None, HOY)
        self.assertTrue(r.ok, r.graves)
        self.assertTrue(any("Cambio antiguo" in a for a in r.avisos))

    def test_beneficio_cerca_de_cero_no_bloquea(self):
        pub = {"2026-06-30": q(1000, ni=1)}
        nuevo = {"2026-06-30": q(1000, ni=3), "2026-09-30": q(1010)}
        self.assertTrue(revisar(pub, nuevo, None, HOY).ok)

    def test_acciones_en_otra_escala(self):
        r = revisar(PUB, {**PUB, "2026-09-30": q(110, acciones=100_000)}, None, HOY)
        self.assertFalse(r.ok)
        self.assertIn("acciones", r.graves[0])
        split = revisar(PUB, {**PUB, "2026-09-30": q(110, acciones=400)}, {"2026-09-30": q(110, acciones=400)}, HOY)
        self.assertTrue(split.ok, split.graves)

    def test_falta_una_metrica_clave(self):
        nuevo = {**PUB, "2026-09-30": {"revenue": 110.0, "net_income": 5.0}}
        r = revisar(PUB, nuevo, None, HOY)
        self.assertIn("Falta free_cash_flow", r.graves[0])

    def test_ventas_atipicas(self):
        self.assertFalse(revisar(PUB, {**PUB, "2026-09-30": q(1050)}, None, HOY).ok)

    def test_iguales_tolera_redondeos(self):
        self.assertTrue(iguales(PUB, {"2026-03-31": q(100.0000001), "2026-06-30": q(105)}))
        self.assertFalse(iguales(PUB, {"2026-03-31": q(150), "2026-06-30": q(105)}))
        self.assertFalse(iguales(PUB, {"2026-03-31": q(100)}))

    def test_empresa_nueva_sin_nada_publicado(self):
        self.assertTrue(revisar({}, PUB, None, HOY).ok)
        self.assertFalse(revisar(PUB, {}, None, HOY).ok)


if __name__ == "__main__":
    unittest.main()
