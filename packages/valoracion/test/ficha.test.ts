import { test } from "node:test";
import assert from "node:assert/strict";
import { escala, marcasTiempo, masCercano, pasoRedondo } from "../src/ejes.ts";
import { caidaDesdeMaximo, explicarValor, historialPer, mediana } from "../src/ficha.ts";
import { valorar, type Trimestre } from "../src/index.ts";

test("escala: marcas redondas que cubren los valores", () => {
  const e = escala([212, 688]);
  assert.ok(e.lo <= 212 && e.hi >= 688);
  assert.equal(e.paso, 100);
  assert.ok(e.marcas.length >= 5 && e.marcas.length <= 8);
  assert.equal(pasoRedondo(10, 4), 2.5);
  const n = escala([-3, 5]);
  assert.ok(n.marcas.includes(0));
});

test("marcas de tiempo: meses en un año, años en diez", () => {
  const anio = marcasTiempo(Date.UTC(2025, 10, 10), Date.UTC(2026, 10, 10));
  assert.ok(anio.length >= 4 && anio.length <= 6);
  assert.match(anio[0].texto, /^[a-z]{3} \d\d$/);
  const diez = marcasTiempo(Date.UTC(2016, 10, 10), Date.UTC(2026, 10, 10));
  assert.ok(diez.every((m) => /^\d{4}$/.test(m.texto)) && diez.length <= 6);
  assert.equal(masCercano([0, 10, 20], 14), 1);
  assert.equal(masCercano([0, 10, 20], 16), 2);
});

test("caída desde máximos", () => {
  const c = caidaDesdeMaximo([{ fecha: "2021-11-19", cierre: 688 }, { fecha: "2024-01-01", cierre: 600 }], 240.8)!;
  assert.equal(c.fecha, "2021-11-19");
  assert.ok(Math.abs(c.caida + 0.65) < 0.001);
  assert.equal(caidaDesdeMaximo([{ fecha: "2024-01-01", cierre: 10 }], 12)!.caida, 0);
});

const trimestres: Trimestre[] = Array.from({ length: 24 }, (_, i) => ({
  periodo: new Date(Date.UTC(2020, 3 * i + 2, 28)).toISOString().slice(0, 10),
  ventas: 100 * 1.3 ** (i / 4), beneficios: 20, fcf: 25 * 1.3 ** (i / 4), acciones: 10, deudaNeta: 50,
}));

test("explicación del valor: misma cuenta que el modelo y tope de crecimiento", () => {
  const v = valorar(trimestres, { precio: 100 });
  assert.ok(v.ok);
  const x = explicarValor(trimestres, v);
  assert.ok(Math.abs(x.sumaFlujos + x.terminalPresente - x.deudaNetaPorAccion - v.valor) < 1e-6);
  assert.equal(x.crecimiento, 0.12);
  assert.equal(x.topado, "maximo");
  assert.ok(x.crecimientoHistorico! > 0.25);
});

test("PER semanal con el beneficio ya publicado", () => {
  const cierres = [{ fecha: "2021-01-01", cierre: 80 }, { fecha: "2026-01-01", cierre: 160 }];
  const p = historialPer(trimestres, cierres);
  assert.equal(p.length, 2);
  assert.equal(p[1].per, 160 / 8);   // 4 × 20 / 10 acciones = 8 por acción
  assert.equal(mediana([1, null, 3, 2]), 2);
});
