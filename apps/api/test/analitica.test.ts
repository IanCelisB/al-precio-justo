import { test } from "node:test";
import assert from "node:assert/strict";
import { Analitica } from "../src/analitica.ts";

const ahora = new Date("2026-11-07T12:00:00Z");
const hace = (dias: number, min = 0) => new Date(ahora.getTime() - dias * 86_400_000 - min * 60_000);

test("vistas por sesión: repetidas no cuentan; ranking con periodo anterior", () => {
  const a = new Analitica(":memory:");
  assert.equal(a.registrar("vista", "AAPL", "s1", hace(1)), true);
  assert.equal(a.registrar("vista", "AAPL", "s1", hace(1, -5)), false);  // 5 min después: repetida
  a.registrar("vista", "AAPL", "s2", hace(2));
  a.registrar("vista", "MSFT", "s1", hace(1));
  a.registrar("vista", "MSFT", "s3", hace(10));                          // semana anterior
  const r = a.ranking("vista", 7, 10, ahora);
  assert.deepEqual(r.map((x) => [x.ticker, x.n, x.previo]), [["AAPL", 2, 0], ["MSFT", 1, 1]]);
});

test("compras y seguidas se cuentan sin sesión", () => {
  const a = new Analitica(":memory:");
  a.registrar("compra", "NVDA", null, hace(1));
  a.registrar("compra", "NVDA", null, hace(1));
  a.registrar("seguir", "KO", null, hace(3));
  assert.deepEqual(a.ranking("compra", 7, 10, ahora).map((x) => [x.ticker, x.n]), [["NVDA", 2]]);
  assert.deepEqual(a.ranking("seguir", 7, 10, ahora).map((x) => [x.ticker, x.n]), [["KO", 1]]);
});

test("quienes vieron X también vieron Y (mínimo 2 sesiones)", () => {
  const a = new Analitica(":memory:");
  for (const s of ["s1", "s2", "s3"]) a.registrar("vista", "AAPL", s, hace(1));
  for (const s of ["s1", "s2"]) a.registrar("vista", "MSFT", s, hace(1));
  a.registrar("vista", "KO", "s3", hace(1));
  a.registrar("vista", "GOOGL", "otra", hace(1));
  assert.deepEqual(a.tambienVieron("AAPL", 30, 6, 2, ahora).map((x) => ({ ...x })), [{ ticker: "MSFT", n: 2 }]);
  assert.deepEqual(a.tambienVieron("AAPL", 30, 6, 1, ahora).map((x) => x.ticker), ["MSFT", "KO"]);
});
