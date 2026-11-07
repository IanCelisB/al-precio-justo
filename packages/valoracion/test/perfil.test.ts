import { test } from "node:test";
import assert from "node:assert/strict";
import { beta, datosClave, mesCierre } from "../src/perfil.ts";
import type { Trimestre } from "../src/index.ts";

const t: Trimestre[] = Array.from({ length: 8 }, (_, i) => ({
  periodo: `${2025 + Math.floor(i / 4)}-${["03-31", "06-30", "09-30", "12-31"][i % 4]}`,
  beneficios: 25, dividendos: 5, acciones: 100,
}));

/** 120 semanas: el S&P 500 sube y baja; la acción hace lo mismo pero el doble. */
const semanas = Array.from({ length: 120 }, (_, i) => new Date(Date.UTC(2024, 8, 2) + i * 7 * 86_400_000).toISOString().slice(0, 10));
const spy = semanas.map((fecha, i) => ({ fecha, cierre: 100 * (1 + 0.01 * Math.sin(i)) }));
const accion = spy.map((c, i) => ({ fecha: c.fecha, cierre: i === 0 ? 50 : 0 }));
for (let i = 1; i < accion.length; i++) accion[i].cierre = accion[i - 1].cierre * (1 + 2 * (spy[i].cierre / spy[i - 1].cierre - 1));

test("beta: una acción que se mueve el doble que el índice tiene beta 2", () => {
  assert.ok(Math.abs(beta(accion, spy)! - 2) < 1e-9);
  assert.equal(beta(accion.slice(0, 10), spy), null);
});

test("datos clave: capitalización, PER, dividendo y rango de 52 semanas", () => {
  const hoy = new Date(`${semanas.at(-1)}T12:00:00Z`);
  const d = datosClave(t, accion, spy, 40, hoy);
  assert.equal(d.capitalizacion, 4000);
  assert.equal(d.per, 40);                       // 4.000 / (4 × 25)
  assert.equal(d.rentabilidadDividendo, 0.005);  // 20 / 4.000
  assert.ok(d.rango52!.min <= 40 && d.rango52!.max >= 40);
  assert.ok(d.rango52!.posicion >= 0 && d.rango52!.posicion <= 1);
  const perdidas = datosClave(t.map((q) => ({ ...q, beneficios: -1 })), accion, spy, 40, hoy);
  assert.equal(perdidas.per, null);
});

test("mes de cierre fiscal", () => {
  assert.equal(mesCierre("0926"), "septiembre");
  assert.equal(mesCierre(null), null);
});

test("partes agrupa el resto en Otros y suma 100 %", async () => {
  const { partes } = await import("../src/perfil.ts");
  const p = partes([1, 2, 3, 4, 5, 6, 7, 8].map((v) => ({ nombre: `P${v}`, valor: v })), 4);
  assert.deepEqual(p.map((x) => x.nombre), ["P8", "P7", "P6", "Otros"]);
  assert.ok(Math.abs(p.reduce((s, x) => s + x.pct, 0) - 1) < 1e-9);
  assert.deepEqual(partes(undefined), []);
});
