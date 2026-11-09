import { test } from "node:test";
import assert from "node:assert/strict";
import { destacadas, filas, tono, type EmpresaPortada } from "../src/portada.ts";

const e = (ticker: string, o: Partial<EmpresaPortada> = {}): EmpresaPortada => ({
  ticker, nombre: ticker, sector: "Information Technology", indice: "S&P 500", precio: 100, valor: 100, estado: "rango",
  cambio1a: 0, capitalizacion: 1e9, seguidores: 0,
  analisis: { tipo: "estable", sugerida: false, buenPrecio: false, orden: 50, calidad: 50 }, ...o,
});

const todas = [
  e("BARATA", { valor: 200, estado: "barata", analisis: { tipo: "defensiva", sugerida: true, buenPrecio: true, orden: 1100, calidad: 80 } }),
  e("RARA", { valor: 1000, estado: "barata" }),                      // 10 % de su valor: dato raro, fuera de Oportunidades
  e("SUBE", { cambio1a: 1.5, capitalizacion: 5e9 }),
  e("GRANDE", { capitalizacion: 9e12 }),
  e("MEDIANA", { indice: "S&P 400", valor: 180, estado: "barata", cambio1a: 0.4, analisis: { tipo: "ciclica", sugerida: false, buenPrecio: true, orden: 70, calidad: 60 } }),
];

test("Para ti: Mi lista primero; sin vistas, el Top 10 es por capitalización", () => {
  const f = filas("todo", todas, { mias: ["SUBE"] });
  assert.equal(f[0].id, "mias");
  assert.deepEqual(f[0].empresas.map((x) => x.ticker), ["SUBE"]);
  const top = f.find((x) => x.id === "top")!;
  assert.equal(top.titulo, "Top 10 más grandes");
  assert.equal(top.empresas[0].ticker, "GRANDE");
  assert.ok(top.ranking);
  assert.deepEqual(f.find((x) => x.id === "oportunidades")!.empresas.map((x) => x.ticker), ["BARATA", "MEDIANA"]);
  assert.equal(f.find((x) => x.id === "alza")!.empresas[0].ticker, "SUBE");
  assert.deepEqual(f.find((x) => x.id === "descubre")!.empresas.map((x) => x.ticker), ["MEDIANA"]);
});

test("con vistas suficientes el Top 10 es de la semana; filas vacías no aparecen", () => {
  const f = filas("popular", todas, { vistas: ["SUBE", "GRANDE", "BARATA", "RARA", "MEDIANA"] });
  assert.equal(f[0].titulo, "Top 10 de la semana");
  assert.equal(f[0].empresas[0].ticker, "SUBE");
  assert.ok(!f.some((x) => x.id === "compras"));   // nadie compró todavía
});

test("por sector y por ciclo", () => {
  assert.equal(filas("tipo", todas, { nombreSector: () => "Tecnología" })[0].titulo, "Tecnología");
  assert.deepEqual(filas("ciclo", todas).map((x) => x.titulo), ["Cíclicas", "Defensivas", "Estables"]);
});

test("destacadas: sin repetir empresa", () => {
  const d = destacadas(todas, { hoy: new Date("2026-11-08") });
  assert.ok(d.length >= 2);
  assert.equal(new Set(d.map((x) => x.empresa.ticker)).size, d.length);
  assert.equal(d[0].etiqueta, "Oportunidad del día");
});

test("tono estable y dentro de 0-360", () => {
  assert.equal(tono("AAPL", "Information Technology"), tono("AAPL", "Information Technology"));
  for (const t of ["A", "ZZZZ", "MSFT"]) { const h = tono(t, "Energy"); assert.ok(h >= 0 && h < 360); }
});

test("una sola clase de acción por empresa en las más grandes", () => {
  const l = [e("GOOGL", { nombre: "Alphabet Inc. (Class A)", capitalizacion: 3e12 }), e("GOOG", { nombre: "Alphabet Inc. (Class C)", capitalizacion: 2.9e12 })];
  assert.deepEqual(filas("popular", l).find((x) => x.id === "grandes")!.empresas.map((x) => x.ticker), ["GOOGL"]);
});
