import { test } from "node:test";
import assert from "node:assert/strict";
import { analizar, caidaMaximaVentas, calidad, tipoDeEmpresa, TIPOS } from "../src/recomendaciones.ts";
import type { Trimestre } from "../src/index.ts";

/** Empresa sana: 16 trimestres, ventas +8 %/año, 20 % de margen de caja, caja neta, recompra 2 %/año. */
function sana(extra: (i: number) => Partial<Trimestre> = () => ({})): Trimestre[] {
  return Array.from({ length: 16 }, (_, i) => {
    const ventas = 100 * 1.08 ** (i / 4);
    return { periodo: `t${i}`, ventas, fcf: ventas * 0.2, deudaNeta: -50, acciones: 1000 * 0.98 ** (i / 4),
      compAcciones: 1, ...extra(i) };
  });
}

test("tipo de empresa por sector y por historia de ventas", () => {
  assert.equal(tipoDeEmpresa("Consumer Staples", sana()), "defensiva");
  assert.equal(tipoDeEmpresa("Energy", sana()), "ciclica");
  assert.equal(tipoDeEmpresa("Information Technology", sana()), "estable");
  // ventas que caen un 30 % y se recuperan: cíclica aunque el sector no lo sea
  const vaivén = sana((i) => ({ ventas: i >= 6 && i < 10 ? 70 : 100 }));
  assert.ok(caidaMaximaVentas(vaivén) > 0.2);
  assert.equal(tipoDeEmpresa("Industrials", vaivén), "ciclica");
});

test("una empresa sana saca buena nota y explica por qué", () => {
  const c = calidad(sana());
  assert.ok(c.puntos >= 85, `puntos ${c.puntos}`);
  assert.equal(c.descarta, null);
  assert.ok(c.razones.some((r) => r.includes("más caja que deuda")));
  assert.equal(c.alertas.length, 0);
});

test("criterio prudente: caja irregular, mucha deuda o mucha dilución la descartan", () => {
  assert.ok(calidad(sana((i) => ({ fcf: i % 2 ? -5 : 5 }))).descarta);
  assert.ok(calidad(sana(() => ({ deudaNeta: 1000 }))).descarta);
  assert.ok(calidad(sana((i) => ({ acciones: 1000 * 1.1 ** (i / 4) }))).descarta);
});

test("el precio de compra exige más descuento a las cíclicas", () => {
  const base = { precio: 70, valor: 100, trimestres: sana() };
  const def = analizar({ ...base, sector: "Consumer Staples" });
  const cic = analizar({ ...base, sector: "Energy" });
  assert.equal(def.precioCompra, 100 * (1 - TIPOS.defensiva.margen));
  assert.equal(def.sugerida, true);   // 70 ≤ 85
  assert.equal(cic.sugerida, false);  // 70 > 65
  assert.equal(cic.vigilar, true);    // a menos de un 10 % de 65
  assert.ok(def.orden > cic.orden);
});

test("una cíclica demasiado barata no se sugiere: se vigila", () => {
  const a = analizar({ sector: "Energy", precio: 30, valor: 100, trimestres: sana() });
  assert.equal(a.sugerida, false);
  assert.equal(a.vigilar, true);
  assert.match(a.motivo, /ciclo/);
});

test("sin valor estimado nunca se sugiere", () => {
  const a = analizar({ sector: "Financials", precio: 10, valor: null, trimestres: sana() });
  assert.equal(a.sugerida, false);
  assert.equal(a.precioCompra, null);
});
