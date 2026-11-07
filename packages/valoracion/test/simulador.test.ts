import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cierreEn, curva, efectivo, maquinaDelTiempo, prepararCompra, prepararVenta, resumen, SALDO_INICIAL, type Operacion,
} from "../src/simulador.ts";

const comprar = (ops: Operacion[], t: string, importe: number, precio: number, fecha = "2026-01-02T15:00:00Z") => {
  const o = prepararCompra(ops, t, importe, precio, fecha);
  assert.equal(typeof o, "object", String(o));
  return [...ops, o as Operacion];
};

test("el ejemplo: 1.000 USD en Nvidia que sube un 100 %", () => {
  const ops = comprar([], "NVDA", 1000, 100);
  const r = resumen(ops, { NVDA: 200 });
  assert.equal(r.efectivo, SALDO_INICIAL - 1000);
  assert.equal(r.posiciones[0].valor, 2000);
  assert.equal(r.posiciones[0].ganancia, 1000);
  assert.equal(r.posiciones[0].gananciaPct, 1);
  assert.equal(r.valorTotal, 31_000);
  assert.ok(Math.abs(r.gananciaPct - 1000 / 30_000) < 1e-12);
});

test("coste medio y ganancia realizada al vender una parte", () => {
  let ops = comprar([], "KO", 1000, 50);                 // 20 acciones a 50
  ops = comprar(ops, "KO", 1000, 100, "2026-02-01");      // 10 acciones a 100 → 30 a 66,67
  const v = prepararVenta(ops, "KO", 15, 80, "2026-03-01") as Operacion;
  ops = [...ops, v];
  const r = resumen(ops, { KO: 80 });
  const medio = 2000 / 30;
  assert.ok(Math.abs(r.posiciones[0].acciones - 15) < 1e-9);
  assert.ok(Math.abs(r.posiciones[0].costeMedio - medio) < 1e-9);
  assert.ok(Math.abs(r.realizada - (15 * 80 - 15 * medio)) < 1e-9);
  assert.ok(Math.abs(r.ganancia - (r.realizada + r.latente)) < 1e-6);
});

test("no se puede gastar más de lo que hay ni vender lo que no se tiene", () => {
  assert.match(prepararCompra([], "AAPL", 30_001, 10, "x") as string, /No te alcanza/);
  assert.match(prepararCompra([], "AAPL", 0.5, 10, "x") as string, /mínimo/);
  assert.match(prepararCompra([], "AAPL", 100, null, "x") as string, /precio/);
  assert.match(prepararVenta([], "AAPL", 1, 10, "x") as string, /No tienes/);
  const ops = comprar([], "AAPL", 100, 10);
  assert.match(prepararVenta(ops, "AAPL", 11, 10, "x") as string, /Solo tienes/);
  const todo = prepararVenta(ops, "AAPL", null, 12, "x") as Operacion;
  assert.equal(todo.acciones, 10);
  assert.equal(efectivo([...ops, todo]), SALDO_INICIAL + 20);
  assert.equal(resumen([...ops, todo], {}).posiciones.length, 0);
});

test("sin precio, la posición vale su coste", () => {
  const r = resumen(comprar([], "XYZ", 500, 5), {});
  assert.equal(r.valorTotal, SALDO_INICIAL);
  assert.equal(r.posiciones[0].ganancia, null);
});

const cierres = (pares: [string, number][]) => pares.map(([fecha, cierre]) => ({ fecha, cierre }));

test("máquina del tiempo frente al S&P 500", () => {
  const nvda = cierres([["2025-01-02", 100], ["2025-06-02", 150], ["2026-01-02", 200]]);
  const spy = cierres([["2025-01-02", 500], ["2026-01-02", 550]]);
  const r = maquinaDelTiempo(1000, nvda, "2025-01-01", spy)!;
  assert.equal(r.fechaCompra, "2025-01-02");
  assert.equal(r.valorHoy, 2000);
  assert.equal(r.gananciaPct, 1);
  assert.ok(Math.abs(r.referenciaHoy! - 1100) < 1e-9);
  assert.equal(maquinaDelTiempo(1000, nvda, "2030-01-01"), null);
});

test("curva diaria de la cartera con su referencia", () => {
  const ops = comprar([], "NVDA", 1000, 100, "2026-01-02T15:00:00Z");
  const c = { NVDA: cierres([["2026-01-02", 100], ["2026-01-05", 110]]), SPY: cierres([["2026-01-02", 500], ["2026-01-05", 505]]) };
  const v = curva(ops, c, ["2026-01-01", "2026-01-02", "2026-01-05"]);
  assert.equal(v[0].fecha, "2026-01-02");
  assert.equal(v[0].valor, SALDO_INICIAL);
  assert.equal(v[1].valor, SALDO_INICIAL + 100);
  assert.ok(Math.abs(v[1].referencia! - SALDO_INICIAL * 1.01) < 1e-6);
  assert.equal(cierreEn(c.NVDA, "2026-01-03"), 100);
});

test("la curva existe aunque la compra sea de hoy y el mercado no haya cerrado", () => {
  const hoy = new Date().toISOString();
  const ops = comprar([], "NVDA", 1000, 100, hoy);
  const v = curva(ops, { NVDA: cierres([["2026-01-02", 100]]) }, ["2026-01-02"]);
  assert.ok(v.length >= 1);
  assert.equal(v[0].fecha, hoy.slice(0, 10));
});

test("trazos comparados comparten escala", async () => {
  const { trazosComparados } = await import("../src/simulador.ts");
  const [a, b] = trazosComparados([[100, 200], [100, 150]], 0);
  assert.equal(a.d, "M 0.00 100.00 L 100.00 0.00");
  assert.equal(b.fin!.y, 50);
});
