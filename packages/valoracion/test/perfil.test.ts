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

test("frase de ingresos con montos", async () => {
  const { fraseIngresos, monto } = await import("../src/perfil.ts");
  assert.equal(monto(254.1e9), "$254 mil M");
  assert.equal(monto(37.9e9), "$37,9 mil M");
  assert.equal(monto(950e6), "$950 M");
  const f = fraseIngresos("Apple", [
    { nombre: "iPhone", valor: 254.1e9 }, { nombre: "Servicios", valor: 123.3e9 }, { nombre: "Mac", valor: 37.9e9 },
    { nombre: "Wearables", valor: 35.6e9 }, { nombre: "iPad", valor: 27.9e9 },
  ], "2026");
  assert.equal(f, "Apple vendió $479 mil M en su año fiscal 2026: $254 mil M en iPhone, $123 mil M en Servicios, "
    + "$37,9 mil M en Mac y $63,5 mil M en el resto.");
  assert.equal(fraseIngresos("X", [{ nombre: "A", valor: 1 }]), null);
});

test("historia de ingresos: partes con su crecimiento y total", async () => {
  const { historiaIngresos } = await import("../src/perfil.ts");
  const h = historiaIngresos([
    { anio: "2022", cierre: "2022-11-30", total: 16, partes: [{ nombre: "Digital Media", valor: 12 }, { nombre: "Digital Experience", valor: 4 }] },
    { anio: "2024", cierre: "2024-11-30", total: 21.6, partes: [{ nombre: "Digital Media", valor: 16.2 }, { nombre: "Digital Experience", valor: 5.4 }] },
  ])!;
  assert.deepEqual(h.anios, ["2022", "2024"]);
  assert.equal(h.filas[0].nombre, "Digital Media");
  assert.ok(Math.abs(h.filas[0].cagr! - 0.35) < 1e-9);
  assert.ok(Math.abs(h.cagrTotal! - 0.35) < 1e-9);
  assert.equal(historiaIngresos(undefined), null);
});
