import { test } from "node:test";
import assert from "node:assert/strict";
import {
  descontar, diferencia, estado, fcfBase, supuestosPorDefecto, ttm, valorar, SUPUESTOS_BASE, type Trimestre,
} from "../src/index.ts";

/** n trimestres con FCF y ventas crecientes al ritmo anual `g`. */
function serie(n: number, g: number, extra: Partial<Trimestre> = {}): Trimestre[] {
  const q = (1 + g) ** 0.25;
  return Array.from({ length: n }, (_, i) => ({
    periodo: `t${i}`, fcf: 25 * q ** i, ventas: 100 * q ** i, acciones: 10, ...extra,
  }));
}

test("ttm suma los últimos 4 trimestres y exige que estén todos", () => {
  const t: Trimestre[] = [1, 2, 3, 4, 5].map((v, i) => ({ periodo: `${i}`, fcf: v }));
  assert.equal(ttm(t, "fcf"), 14);
  t[3].fcf = undefined;
  assert.equal(ttm(t, "fcf"), null);
});

test("descontar sin crecimiento es una perpetuidad", () => {
  const s = { ...SUPUESTOS_BASE, crecimiento: 0, crecimientoTerminal: 0, descuento: 0.1 };
  assert.ok(Math.abs(descontar(10, s) - 100) < 1e-9);
});

test("las recompras netas suben el valor por acción", () => {
  const base = descontar(10, SUPUESTOS_BASE);
  assert.ok(descontar(10, { ...SUPUESTOS_BASE, recompraNeta: 0.03 }) > base);
});

test("el crecimiento por defecto sale de las ventas y tiene tope", () => {
  assert.ok(Math.abs(supuestosPorDefecto(serie(24, 0.08)).crecimiento - 0.08) < 0.002);
  assert.equal(supuestosPorDefecto(serie(24, 0.4)).crecimiento, 0.12);
  assert.equal(supuestosPorDefecto(serie(24, -0.1)).crecimiento, 0);
  assert.equal(supuestosPorDefecto(serie(6, 0.08)).crecimiento, SUPUESTOS_BASE.crecimiento);
  // El flujo de caja cae por una inversión fuerte, pero las ventas crecen 8 %: manda la venta.
  const t = serie(24, 0.08).map((q, i) => (i >= 20 ? { ...q, fcf: 1 } : q));
  assert.ok(Math.abs(supuestosPorDefecto(t).crecimiento - 0.08) < 0.002);
});

test("el flujo base es el promedio de 3 años: un trimestre extraordinario pesa poco", () => {
  const t = serie(12, 0); // 25 por trimestre = 100 al año
  assert.deepEqual(fcfBase(t), { valor: 100, anios: 3 });
  t[11] = { ...t[11], fcf: 325 }; // +300 de una sola vez
  assert.deepEqual(fcfBase(t), { valor: 200, anios: 3 }); // con 12 meses serían 400
  assert.deepEqual(fcfBase(serie(5, 0)), { valor: 100, anios: 1 });
});

test("recompra neta = recompras − emisión sobre la capitalización", () => {
  const t = serie(8, 0, { recomprasNetas: 5 }); // 20 al año
  assert.equal(supuestosPorDefecto(t, 100).recompraNeta, 0.02); // 10 acciones × $100
});

test("valorar resta la deuda neta por acción y arma la banda", () => {
  const t = serie(24, 0, { deudaNeta: 100 });
  const v = valorar(t, { supuestos: { crecimiento: 0, recompraNeta: 0 } });
  assert.ok(v.ok);
  const esperado = descontar(10, { ...SUPUESTOS_BASE, crecimiento: 0 }) - 10;
  assert.ok(Math.abs(v.valor - esperado) < 1e-9);
  assert.ok(Math.abs(v.banda.min - v.valor * 0.85) < 1e-9);
});

test("sin modelo: bancos, FCF negativo, sin acciones", () => {
  assert.equal(valorar(serie(8, 0), { sector: "Financials" }).ok, false);
  assert.equal(valorar(serie(8, 0, { fcf: -1 })).ok, false);
  assert.equal(valorar(serie(8, 0, { acciones: undefined })).ok, false);
});

test("estado y diferencia", () => {
  assert.equal(estado(80, 100), "barata");
  assert.equal(estado(110, 100), "rango");
  assert.equal(estado(120, 100), "cara");
  assert.equal(diferencia(84, 100), "−16%");
  assert.equal(diferencia(112, 100), "+12%");
});
