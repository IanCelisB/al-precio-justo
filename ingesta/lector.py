"""Lee los documentos de un 10-Q / 10-K y extrae sus cifras.

Desde 2019 la SEC exige que los reportes sean HTML con *Inline XBRL*: cada cifra
de los estados financieros lleva una etiqueta invisible que dice qué es
(`us-gaap:Revenues`), de qué periodo (contexto) y en qué unidad. Antes de 2019
las mismas cifras venían en un archivo XBRL (XML) dentro de la presentación.

Este módulo lee ambos formatos y devuelve una lista de `Fact`, sin depender de
ninguna API de la SEC: solo del documento.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from html.parser import HTMLParser


@dataclass(frozen=True)
class Fact:
    prefix: str          # us-gaap, dei, o el prefijo propio de la empresa
    concept: str         # Revenues, NetIncomeLoss...
    unit: str            # USD, shares, USD/shares
    value: float
    start: str | None    # None para saldos (balance)
    end: str


@dataclass
class _Context:
    start: str | None = None
    end: str | None = None
    dimensional: bool = False
    dims: list = None          # [(eje, miembro)] de xbrldi:explicitMember


@dataclass(frozen=True)
class SegmentFact:
    """Cifra desglosada por una sola dimensión (p. ej. ventas del segmento iPhone)."""
    concept: str
    axis: str             # ProductOrServiceAxis, StatementBusinessSegmentsAxis, StatementGeographicalAxis…
    member: str           # aapl:IPhoneMember
    value: float
    start: str | None
    end: str


def _local(tag: str) -> str:
    return tag.rsplit(":", 1)[-1].rsplit("}", 1)[-1].lower()


def _unit_name(measures: list[str]) -> str:
    def one(m: str) -> str:
        m = m.strip()
        return "shares" if m.lower().endswith(":shares") else m.split(":")[-1]
    return "/".join(one(m) for m in measures) if measures else ""


def _precision(decimals: str | None) -> float:
    """Cuántos decimales de precisión declara una cifra. INF = exacta."""
    if not decimals:
        return float("-inf")
    if decimals.upper() == "INF":
        return float("inf")
    try:
        return float(decimals)
    except ValueError:
        return float("-inf")


def _keep_most_precise(out: dict, key: tuple, fact: Fact, precision: float) -> None:
    """Una misma cifra puede aparecer redondeada en el texto ("$0.4 billion") y exacta en
    los estados financieros. Nos quedamos con la más precisa."""
    if key not in out or precision > out[key][1]:
        out[key] = (fact, precision)


# --- números en Inline XBRL ---------------------------------------------------------
_ZERO_FORMATS = ("zerodash", "fixed-zero", "fixedzero", "numwordsen", "num-word", "nocontent")
_WORD_NUMBERS = {"no": 0, "none": 0, "nil": 0, "zero": 0, "one": 1, "two": 2, "three": 3,
                 "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}


def parse_ix_number(text: str, fmt: str | None, scale: str | None, sign: str | None) -> float | None:
    """Convierte el texto visible de una cifra en su valor, aplicando formato, escala y signo."""
    fmt = (fmt or "").lower()
    t = text.strip().replace(" ", " ")
    if any(z in fmt for z in _ZERO_FORMATS) and (not re.search(r"\d", t)):
        word = t.lower().strip(" .")
        v = float(_WORD_NUMBERS.get(word, 0))
    else:
        if not re.search(r"\d", t):
            if t in ("—", "–", "-", ""):
                v = 0.0
            else:
                return None
        else:
            if "numcommadecimal" in fmt or "num-comma-decimal" in fmt:
                # 1.234,5 -> 1234.5
                t = t.replace(".", "").replace(" ", "").replace(",", ".")
            else:
                t = t.replace(",", "").replace(" ", "")
            t = re.sub(r"[^\d.]", "", t)
            if not t or t.count(".") > 1:
                return None
            v = float(t)
    if scale:
        v *= 10 ** int(scale)
    if sign == "-":
        v = -v
    return v


class _IxParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.contexts: dict[str, _Context] = {}
        self.units: dict[str, list[str]] = {}
        self.raw: list[tuple[dict, str]] = []
        self._ctx: tuple[str, _Context] | None = None
        self._unit: str | None = None
        self._text_target: str | None = None   # startdate/enddate/instant/measure
        self._buf: list[str] = []
        self._facts: list[tuple[dict, list[str]]] = []  # pila de ix:nonFraction abiertos
        self._exclude = 0
        self._dim: str | None = None   # eje del explicitMember abierto

    def handle_starttag(self, tag, attrs):
        name = _local(tag)
        a = dict(attrs)
        if name == "context":
            self._ctx = (a.get("id", ""), _Context())
        elif self._ctx and name in ("segment", "scenario"):
            self._ctx[1].dimensional = True
        elif self._ctx and name == "explicitmember":
            self._dim, self._buf = a.get("dimension", ""), []
        elif self._ctx and name in ("startdate", "enddate", "instant"):
            self._text_target, self._buf = name, []
        elif name == "unit":
            self._unit = a.get("id", "")
            self.units[self._unit] = []
        elif self._unit is not None and name == "measure":
            self._text_target, self._buf = "measure", []
        elif name == "nonfraction" and tag.lower().startswith("ix"):
            self._facts.append((a, []))
        elif name == "exclude" and tag.lower().startswith("ix"):
            self._exclude += 1

    def handle_endtag(self, tag):
        name = _local(tag)
        if name == "context" and self._ctx:
            cid, ctx = self._ctx
            self.contexts[cid] = ctx
            self._ctx = None
        elif name == "explicitmember" and self._ctx and self._dim is not None:
            ctx = self._ctx[1]
            ctx.dims = (ctx.dims or []) + [(self._dim, "".join(self._buf).strip())]
            self._dim = None
        elif name == "unit":
            self._unit = None
        elif name in ("startdate", "enddate", "instant", "measure") and self._text_target == name:
            text = "".join(self._buf).strip()
            if name == "measure" and self._unit is not None:
                self.units[self._unit].append(text)
            elif self._ctx:
                ctx = self._ctx[1]
                if name == "startdate":
                    ctx.start = text
                else:
                    ctx.end = text
            self._text_target = None
        elif name == "nonfraction" and self._facts:
            a, parts = self._facts.pop()
            text = "".join(parts)
            self.raw.append((a, text))
            if self._facts:  # cifra anidada: su texto también es el del padre
                self._facts[-1][1].append(text)
        elif name == "exclude" and self._exclude:
            self._exclude -= 1

    def handle_data(self, data):
        if self._dim is not None:
            self._buf.append(data)
        if self._text_target:
            self._buf.append(data)
        if self._facts and not self._exclude:
            self._facts[-1][1].append(data)


def read_inline_xbrl(*htmls: str) -> list[Fact]:
    """Cifras numéricas sin dimensiones de un documento HTML con Inline XBRL.

    Si la presentación tiene varios documentos (p. ej. el 10-K y el informe anual como
    anexo), se leen juntos: los periodos y unidades se definen en uno solo de ellos."""
    p = _IxParser()
    for html in htmls:
        p.feed(html)
        p.close()
        p.reset()
    out: dict[tuple, tuple[Fact, float]] = {}
    for a, text in p.raw:
        name = a.get("name", "")
        ctx = p.contexts.get(a.get("contextref", ""))
        if ":" not in name or not ctx or ctx.dimensional or not ctx.end:
            continue
        if a.get("xsi:nil") == "true":
            continue
        v = parse_ix_number(text, a.get("format"), a.get("scale"), a.get("sign"))
        if v is None:
            continue
        prefix, concept = name.split(":", 1)
        unit = _unit_name(p.units.get(a.get("unitref", ""), []))
        key = (prefix, concept, unit, ctx.start, ctx.end)
        _keep_most_precise(out, key, Fact(prefix, concept, unit, v, ctx.start, ctx.end), _precision(a.get("decimals")))
    return [f for f, _ in out.values()]


def read_inline_segments(*htmls: str, concepts: set[str] | None = None) -> list[SegmentFact]:
    """Cifras en USD desglosadas por UNA sola dimensión (segmento, producto o región).
    Con `concepts`, solo esos conceptos us-gaap (p. ej. las etiquetas de ventas)."""
    p = _IxParser()
    for html in htmls:
        p.feed(html)
        p.close()
        p.reset()
    out: dict[tuple, tuple[SegmentFact, float]] = {}
    for a, text in p.raw:
        name = a.get("name", "")
        ctx = p.contexts.get(a.get("contextref", ""))
        if ":" not in name or not ctx or not ctx.end or not ctx.dims or len(ctx.dims) != 1:
            continue
        prefix, concept = name.split(":", 1)
        if prefix != "us-gaap" or (concepts and concept not in concepts):
            continue
        if _unit_name(p.units.get(a.get("unitref", ""), [])) != "USD":
            continue
        v = parse_ix_number(text, a.get("format"), a.get("scale"), a.get("sign"))
        if v is None:
            continue
        axis, member = ctx.dims[0]
        axis = axis.split(":", 1)[-1]
        key = (concept, axis, member, ctx.start, ctx.end)
        fact = SegmentFact(concept, axis, member, v, ctx.start, ctx.end)
        prec = _precision(a.get("decimals"))
        if key not in out or prec > out[key][1]:
            out[key] = (fact, prec)
    return [f for f, _ in out.values()]


# --- XBRL clásico (XML, antes de 2019) ------------------------------------------------
_NS_PREFIX = [
    (re.compile(r"(fasb\.org|xbrl\.us)/us-gaap/"), "us-gaap"),   # xbrl.us: taxonomías 2009-2010
    (re.compile(r"(xbrl\.sec\.gov|xbrl\.us)/dei/"), "dei"),
    (re.compile(r"fasb\.org/srt/"), "srt"),
]
_SKIP_NS = ("xbrl.org/2003/instance", "xbrl.org/2003/linkbase", "xbrl.org/2006/xbrldi", "w3.org")


def _prefix_for(ns: str) -> str | None:
    if any(s in ns for s in _SKIP_NS):
        return None
    for rx, p in _NS_PREFIX:
        if rx.search(ns):
            return p
    return "custom"


def read_xbrl_instance(xml: bytes) -> list[Fact]:
    """Cifras numéricas sin dimensiones de un archivo de instancia XBRL."""
    root = ET.fromstring(xml)
    contexts: dict[str, _Context] = {}
    units: dict[str, list[str]] = {}
    for el in root:
        name = _local(el.tag)
        if name == "context":
            c = _Context()
            for sub in el.iter():
                n = _local(sub.tag)
                if n in ("segment", "scenario"):
                    c.dimensional = True
                elif n == "startdate":
                    c.start = (sub.text or "").strip()
                elif n in ("enddate", "instant"):
                    c.end = (sub.text or "").strip()
            contexts[el.get("id", "")] = c
        elif name == "unit":
            units[el.get("id", "")] = [(m.text or "") for m in el.iter() if _local(m.tag) == "measure"]
    out: dict[tuple, tuple[Fact, float]] = {}
    for el in root:
        ref = el.get("contextRef")
        unit_ref = el.get("unitRef")
        if not ref or not unit_ref or not el.tag.startswith("{"):
            continue
        ns, concept = el.tag[1:].split("}", 1)
        prefix = _prefix_for(ns)
        ctx = contexts.get(ref)
        if not prefix or not ctx or ctx.dimensional or not ctx.end:
            continue
        try:
            v = float((el.text or "").strip())
        except ValueError:
            continue
        unit = _unit_name(units.get(unit_ref, []))
        key = (prefix, concept, unit, ctx.start, ctx.end)
        _keep_most_precise(out, key, Fact(prefix, concept, unit, v, ctx.start, ctx.end), _precision(el.get("decimals")))
    return [f for f, _ in out.values()]


def read_document(contents: list[bytes], kind: str) -> list[Fact]:
    if kind == "ixbrl":
        return read_inline_xbrl(*(c.decode("utf-8", errors="replace") for c in contents))
    if kind == "xbrl":
        return [f for c in contents for f in read_xbrl_instance(c)]
    raise ValueError(f"Formato de documento no soportado: {kind}")
