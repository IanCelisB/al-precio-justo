import { test } from "node:test";
import assert from "node:assert/strict";
import { valorar, type Trimestre } from "../src/index.ts";
import { ajustar, cierreHasta, geometriaValor, historialValor, valorEn, type Cierre } from "../src/grafico.ts";

/** 20 trimestres (2021-2025) con flujo de caja que crece y 100 acciones. */
const trimestres: Trimestre[] = Array.from({ length: 20 }, (_, i) => {
  const a = 2021 + Math.floor(i / 4), q = i % 4;
  const fin = ["03-31", "06-30", "09-30", "12-31"][q];
  return { periodo: `${a}-${fin}`, ventas: 1000 + i * 20, fcf: 100 + i * 2, acciones: 100, deudaNeta: 0, recomprasNetas: 0 };
});

/** Un cierre semanal desde 2021 hasta 2026-06, precio 20 → 40. */
const cierres: Cierre[] = [];
for (let d = Date.UTC(2021, 0, 4), i = 0; d <= Date.UTC(2026, 5, 30); d += 7 * 86_400_000, i++) {
  cierres.push({ fecha: new Date(d).toISOString().slice(0, 10), cierre: 20 + i * 0.07 });
}

test("cierreHasta busca el último cierre conocido", () => {
  assert.equal(cierreHasta(cierres, "2020-01-01"), null);
  assert.equal(cierreHasta(cierres, "2021-01-04"), 20);
  assert.equal(cierreHasta(cierres, "2021-01-10"), 20);
  assert.equal(cierreHasta(cierres, "2099-01-01"), cierres.at(-1)!.cierre);
});

test("el historial solo usa lo publicado: 45 días tras cada cierre", () => {
  const h = historialValor(trimestres, cierres);
  assert.equal(h.length, 17); // desde el 4.º trimestre
  assert.equal(h[0].fecha, "2022-02-14"); // 2021-12-31 + 45 días
  const ultimo = valorar(trimestres, { precio: cierreHasta(cierres, h.at(-1)!.fecha)! });
  assert.ok(ultimo.ok);
  assert.ok(Math.abs(h.at(-1)!.valor! - ultimo.valor) < 1e-9);
  // Antes de publicar el primer reporte con 4 trimestres no hay valor.
  assert.equal(valorEn(h, "2022-02-13"), null);
  assert.equal(valorEn(h, "2022-03-01")!.fecha, "2022-02-14");
});

test("Tu modelo cambia todo el historial", () => {
  const base = historialValor(trimestres, cierres);
  const optimista = historialValor(trimestres, cierres, { supuestos: { crecimiento: 0.15 } });
  base.forEach((p, i) => assert.ok(optimista[i].valor! > p.valor!));
  const banco = historialValor(trimestres, cierres, { sector: "Financials" });
  assert.ok(banco.every((p) => p.valor === null));
});

test("geometría: banda escalonada, precio hasta el borde y marcas legibles", () => {
  const h = historialValor(trimestres, cierres);
  const g = geometriaValor(cierres, h, "2021-06-01")!;
  assert.equal(g.bandas.length, 1);
  assert.match(g.bandas[0], /^M\d/);
  assert.match(g.bandas[0], /Z$/);
  assert.ok(g.precio.startsWith("M0 "));
  assert.equal(g.fin!.x, 100);
  for (const n of g.precio.match(/-?[\d.]+/g)!.map(Number)) assert.ok(n >= 0 && n <= 100);
  assert.ok(g.marcasY.length >= 2 && g.marcasY.length <= 6);
  assert.deepEqual(g.marcasX.map((m) => m.texto), ["2022", "2023", "2024", "2025", "2026"]);
  const tt = g.tiempo!;
  assert.ok(Math.abs(tt.barata + tt.rango + tt.cara - 1) < 1e-9);
  assert.ok(g.cobertura > 0.8 && g.cobertura < 1); // sin valor hasta el primer reporte con 4 trimestres
});

test("geometría: un tramo sin valor corta la banda en dos", () => {
  const h = historialValor(trimestres, cierres);
  h[5] = { ...h[5], valor: null, min: null, max: null };
  const g = geometriaValor(cierres, h, "2021-01-01")!;
  assert.equal(g.bandas.length, 2);
  assert.equal(g.centro.length, 2);
});

test("geometría: sin precios suficientes no hay gráfico", () => {
  assert.equal(geometriaValor(cierres.slice(0, 1), [], "2000-01-01"), null);
});

test("ajustar respeta límites y paso", () => {
  assert.equal(ajustar("crecimiento", 0.30000000004), 0.25);
  assert.equal(ajustar("descuento", 0.0912), 0.09);
  assert.equal(ajustar("recompraNeta", -1), -0.03);
});
