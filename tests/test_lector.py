import sqlite3
import unittest
from datetime import date

from ingesta import documentos
from ingesta.lector import parse_ix_number, read_inline_xbrl, read_xbrl_instance
from ingesta.metricas import build_quarters

IXBRL = """<html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"><body>
<div style="display:none"><ix:header><ix:resources>
  <xbrli:context id="c-q"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:startDate>2024-04-01</xbrli:startDate><xbrli:endDate>2024-06-30</xbrli:endDate></xbrli:period></xbrli:context>
  <xbrli:context id="c-i"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:instant>2024-06-30</xbrli:instant></xbrli:period></xbrli:context>
  <xbrli:context id="c-seg"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier>
    <xbrli:segment><xbrldi:explicitMember dimension="srt:ProductOrServiceAxis">aapl:IPhoneMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity>
    <xbrli:period><xbrli:startDate>2024-04-01</xbrli:startDate><xbrli:endDate>2024-06-30</xbrli:endDate></xbrli:period></xbrli:context>
  <xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
  <xbrli:unit id="shares"><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit>
</ix:resources></ix:header></div>
<table>
 <tr><td>Net sales</td><td>$ <ix:nonFraction name="us-gaap:Revenues" contextRef="c-q" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal">85,777</ix:nonFraction></td></tr>
 <tr><td>iPhone</td><td><ix:nonFraction name="us-gaap:Revenues" contextRef="c-seg" unitRef="usd" scale="6">39,296</ix:nonFraction></td></tr>
 <tr><td>Net income</td><td><ix:nonFraction name="us-gaap:NetIncomeLoss" contextRef="c-q" unitRef="usd" decimals="-6" scale="6">21,448</ix:nonFraction></td></tr>
 <tr><td>Repurchases</td><td>(<ix:nonFraction name="us-gaap:PaymentsForRepurchaseOfCommonStock" contextRef="c-q" unitRef="usd" scale="6">26,522</ix:nonFraction>)</td></tr>
 <tr><td>Loss</td><td>(<ix:nonFraction name="us-gaap:OtherNonoperatingIncomeExpense" contextRef="c-q" unitRef="usd" scale="6" sign="-">142</ix:nonFraction>)</td></tr>
 <tr><td>Commercial paper</td><td><ix:nonFraction name="us-gaap:CommercialPaper" contextRef="c-i" unitRef="usd" scale="6" format="ixt:fixed-zero">—</ix:nonFraction></td></tr>
 <tr><td>Shares</td><td><ix:nonFraction name="us-gaap:CommonStockSharesOutstanding" contextRef="c-i" unitRef="shares" scale="3">15,222,259</ix:nonFraction></td></tr>
 <tr><td>Rounded in text: $0.1 billion</td><td><ix:nonFraction name="us-gaap:NetIncomeLoss" contextRef="c-q" unitRef="usd" decimals="-8" scale="9">0.1</ix:nonFraction></td></tr>
 <tr><td>Again (duplicated in notes)</td><td><ix:nonFraction name="us-gaap:Revenues" contextRef="c-q" unitRef="usd" scale="6">85,777</ix:nonFraction></td></tr>
</table></body></html>"""

XBRL = b"""<?xml version="1.0" encoding="utf-8"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2016-01-31"
  xmlns:dei="http://xbrl.sec.gov/dei/2014-01-31" xmlns:iso4217="http://www.xbrl.org/2003/iso4217"
  xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:acme="http://acme.com/2016">
 <xbrli:context id="D2016Q1"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier></xbrli:entity>
   <xbrli:period><xbrli:startDate>2016-01-01</xbrli:startDate><xbrli:endDate>2016-03-31</xbrli:endDate></xbrli:period></xbrli:context>
 <xbrli:context id="D2016Q1_seg"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier>
   <xbrli:segment><xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">acme:A</xbrldi:explicitMember></xbrli:segment></xbrli:entity>
   <xbrli:period><xbrli:startDate>2016-01-01</xbrli:startDate><xbrli:endDate>2016-03-31</xbrli:endDate></xbrli:period></xbrli:context>
 <xbrli:unit id="USD"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
 <us-gaap:SalesRevenueNet contextRef="D2016Q1" unitRef="USD" decimals="-8">50600000000</us-gaap:SalesRevenueNet>
 <us-gaap:SalesRevenueNet contextRef="D2016Q1" unitRef="USD" decimals="-6">50557000000</us-gaap:SalesRevenueNet>
 <us-gaap:SalesRevenueNet contextRef="D2016Q1_seg" unitRef="USD" decimals="-6">100</us-gaap:SalesRevenueNet>
 <acme:CustomThing contextRef="D2016Q1" unitRef="USD">7</acme:CustomThing>
 <dei:DocumentType contextRef="D2016Q1">10-Q</dei:DocumentType>
</xbrli:xbrl>"""


class InlineXbrlTest(unittest.TestCase):
    def setUp(self):
        self.facts = {(f.concept, f.start, f.end): f for f in read_inline_xbrl(IXBRL)}

    def test_reads_value_with_scale(self):
        f = self.facts[("Revenues", "2024-04-01", "2024-06-30")]
        self.assertEqual((f.prefix, f.unit, f.value), ("us-gaap", "USD", 85_777_000_000))

    def test_skips_segment_breakdowns_and_dedupes(self):
        self.assertEqual(sum(1 for f in self.facts.values() if f.concept == "Revenues"), 1)

    def test_rounded_duplicate_loses_to_precise_value(self):
        self.assertEqual(self.facts[("NetIncomeLoss", "2024-04-01", "2024-06-30")].value, 21_448_000_000)

    def test_parentheses_are_presentation_not_sign(self):
        self.assertEqual(self.facts[("PaymentsForRepurchaseOfCommonStock", "2024-04-01", "2024-06-30")].value,
                         26_522_000_000)
        self.assertEqual(self.facts[("OtherNonoperatingIncomeExpense", "2024-04-01", "2024-06-30")].value,
                         -142_000_000)

    def test_dash_is_zero_and_instants_have_no_start(self):
        self.assertEqual(self.facts[("CommercialPaper", None, "2024-06-30")].value, 0)
        f = self.facts[("CommonStockSharesOutstanding", None, "2024-06-30")]
        self.assertEqual((f.unit, f.value), ("shares", 15_222_259_000))

    def test_document_set_shares_contexts(self):
        header, body = IXBRL.split("<table>")
        exhibit = "<html><body><table>" + body  # el anexo no define contextos
        facts = read_inline_xbrl(header + "</body></html>", exhibit)
        self.assertIn("Revenues", {f.concept for f in facts})

    def test_number_formats(self):
        self.assertEqual(parse_ix_number("1.234,5", "ixt:num-comma-decimal", None, None), 1234.5)
        self.assertEqual(parse_ix_number("no", "ixt-sec:numwordsen", None, None), 0)
        self.assertEqual(parse_ix_number("0.25", "ixt:num-dot-decimal", "-2", None), 0.0025)
        self.assertIsNone(parse_ix_number("n/a", None, None, None))


class XbrlInstanceTest(unittest.TestCase):
    def test_reads_classic_instance(self):
        facts = read_xbrl_instance(XBRL)
        self.assertEqual([(f.prefix, f.concept, f.value) for f in facts if f.prefix == "us-gaap"],
                         [("us-gaap", "SalesRevenueNet", 50_557_000_000)])
        self.assertIn(("custom", "CustomThing"), {(f.prefix, f.concept) for f in facts})

    def test_2009_taxonomy_namespace_is_us_gaap(self):
        old = XBRL.replace(b"http://fasb.org/us-gaap/2016-01-31", b"http://xbrl.us/us-gaap/2009-01-31")
        self.assertIn("us-gaap", {f.prefix for f in read_xbrl_instance(old)})


class QueueTest(unittest.TestCase):
    def test_instance_candidates(self):
        items = ["0001-index.htm", "defnref.xml", "notes.xml", "aapl-20160326.xml", "aapl-20160326_cal.xml",
                 "aapl-20160326_lab.xml", "FilingSummary.xml", "R1.htm", "a10-q.htm"]
        self.assertEqual(documentos.instance_candidates(items), ["aapl-20160326.xml", "notes.xml"])
        self.assertEqual(documentos.instance_candidates(["x.xml", "x_htm.xml"])[0], "x_htm.xml")
        self.assertEqual(documentos.instance_candidates(["a.htm", "FilingSummary.xml"]), [])

    def test_other_inline_documents(self):
        items = ["pfe-10kshell.htm", "pfe-ex13.htm", "R1.htm", "R22.htm", "0000078003-20-000014-index.htm",
                 "pfe-20191231.xsd", "pfe-ex21.htm"]
        self.assertEqual(documentos.other_inline_documents(items, "pfe-10kshell.htm"), ["pfe-ex13.htm", "pfe-ex21.htm"])
        self.assertEqual(documentos.count_inline_facts(IXBRL.encode()), 9)

    def test_looks_like_instance(self):
        self.assertTrue(documentos.looks_like_instance(XBRL))
        self.assertFalse(documentos.looks_like_instance(b"<?xml version='1.0'?><definitions/>"))

    def test_facts_from_documents_feed_the_metrics(self):
        con = sqlite3.connect(":memory:")
        documentos.ensure_schema(con)
        con.execute("INSERT INTO filings (accession, cik, form, filed, status) VALUES "
                    "('acc-1', 1, '10-Q', '2024-08-01', 'leido')")
        con.executemany("INSERT INTO facts VALUES ('acc-1','us-gaap',?, 'USD', '2024-04-01', '2024-06-30', ?)",
                        [("Revenues", 1000), ("NetIncomeLoss", 200),
                         ("NetCashProvidedByUsedInOperatingActivities", 300),
                         ("PaymentsToAcquirePropertyPlantAndEquipment", 50)])
        [q] = build_quarters(documentos.company_facts_from_db(con, [1]), since=date(2024, 1, 1))
        self.assertEqual((q.label, q.metrics["revenue"].value, q.metrics["free_cash_flow"].value),
                         ("2024-Q2", 1000, 250))


if __name__ == "__main__":
    unittest.main()
