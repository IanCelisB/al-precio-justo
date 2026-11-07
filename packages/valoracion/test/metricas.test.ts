import { test } from "node:test";
import assert from "node:assert/strict";
import { ADICIONALES, PRINCIPALES, mostrar, porId, serie } from "../src/metricas.ts";
import { SECTORES, sectorDe } from "../src/sectores.ts";
import type { Trimestre } from "../src/index.ts";

// 8 trimestres: ventas 100, beneficios 20, fcf 25, dividendos 5, recompras netas 10, 1.000 acciones.
const t: Trimestre[] = Array.from({ length: 8 }, (_, i) => ({
  periodo: ["2024-03-31", "2024-06-30", "2024-09-30", "2024-12-31", "2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31"][i],
  ventas: i < 4 ? 80 : 100, beneficios: 20, fcf: 25, dividendos: 5, recomprasNetas: 10, recompras: 12, emision: 2,
  deudaNeta: 50, acciones: i < 4 ? 1050 : 1000,
}));
const ctx = { trimestres: t, precio: 2 }; // capitalización = 2.000
const v = (id: string) => porId(id)!.valor(ctx);

test("las 7 métricas principales, en el orden pedido", () => {
  assert.deepEqual(PRINCIPALES.map((m) => m.nombre), [
    "Ventas", "Beneficios", "Flujo de caja libre", "Emisión de acciones", "Recompras de acciones", "Deuda neta", "Dividendos",
  ]);
  assert.equal(v("ventas"), 400);
  assert.equal(v("deudaNeta"), 50);
});

test("métricas adicionales", () => {
  assert.equal(v("margenNeto"), 0.2);
  assert.equal(v("crecVentas"), 0.25);
  assert.equal(v("per"), 25);          // 2.000 / 80
  assert.equal(v("pFcf"), 20);         // 2.000 / 100
  assert.equal(v("rentDividendo"), 0.01);
  assert.equal(v("rentAccionista"), 0.03);
  assert.equal(v("deudaFcf"), 0.5);
  assert.ok(Math.abs(v("dilucion")! - (1000 / 1050 - 1)) < 1e-12);
  assert.equal(new Set(ADICIONALES.map((m) => m.id)).size, ADICIONALES.length);
});

test("emisión, recompras y dividendos: un trimestre sin cifra cuenta como 0 si la empresa los informa", () => {
  const u = t.map((q, i) => ({ ...q, emision: i === 7 ? 9 : undefined }));
  assert.equal(porId("emision")!.valor({ trimestres: u, precio: 2 }), 9);
  const nunca = t.map((q) => ({ ...q, emision: undefined }));
  assert.equal(porId("emision")!.valor({ trimestres: nunca, precio: 2 }), null);
});

test("sin precio no hay múltiplos", () => {
  assert.equal(porId("per")!.valor({ trimestres: t, precio: null }), null);
});

test("serie trimestral con etiquetas de trimestre natural", () => {
  const s = serie(porId("ventas")!, t, 2);
  assert.deepEqual(s, [{ etiqueta: "T3 25", valor: 100 }, { etiqueta: "T4 25", valor: 100 }]);
});

test("formatos", () => {
  assert.equal(mostrar(478.8e9, "dinero"), "$478,8 mil M");
  assert.equal(mostrar(-23.4e9, "dinero"), "−$23,4 mil M");
  assert.equal(mostrar(0.055, "porcentaje"), "5,5 %");
  assert.equal(mostrar(18.24, "veces"), "18,2x");
  assert.equal(mostrar(null, "veces"), "—");
});

test("los 11 sectores tienen ilustración y nombre en español", () => {
  assert.equal(Object.keys(SECTORES).length, 11);
  assert.equal(sectorDe("Health Care").nombre, "Salud");
  assert.equal(sectorDe(null).nombre, "Otros");
});

test("geometría de línea: puntos centrados en su columna, cero con negativos y huecos", async () => {
  const { geometriaLinea } = await import("../src/metricas.ts");
  const g = geometriaLinea([10, 20, null, 30]);
  assert.deepEqual(g.puntos.map((p) => p?.x), [12.5, 37.5, undefined, 87.5]);
  assert.equal(g.puntos[3]!.y, 10);           // máximo arriba (con margen)
  assert.equal(g.cero, null);
  assert.equal(g.tramos.length, 1);           // el hueco corta la línea; el punto suelto no forma tramo
  const n = geometriaLinea([5, -5]);
  assert.equal(n.cero, 50);                    // cero a media altura
  assert.ok(n.puntos[0]!.y < n.cero! && n.puntos[1]!.y > n.cero!);
});

test("dinero y ganancias con signo", async () => {
  const f = await import("../src/formato.ts");
  assert.equal(f.dinero(1626.72), "$1.626,72");
  assert.equal(f.dineroConSigno(-0.00005), "$0,00");
  assert.equal(f.dineroConSigno(-4), "−$4,00");
  assert.equal(f.porcentajeConSigno(-0.00001), "0,0 %");
  assert.equal(f.porcentajeConSigno(1), "+100,0 %");
  assert.equal(f.tono(-0.001), "");
  assert.equal(f.tono(5), "sube");
});

test("leerMonto entiende cómo escribe la gente", async () => {
  const { leerMonto } = await import("../src/formato.ts");
  const casos: [string, number | null][] = [
    ["1500", 1500], ["1.500", 1500], ["1,500", 1500], ["1.500.000", 1_500_000], ["1500,5", 1500.5],
    ["1500.50", 1500.5], ["1.500,50", 1500.5], ["1,500.50", 1500.5], ["$ 2.000", 2000], ["0,5", 0.5],
    ["", null], ["abc", null], ["0", null], ["-5", null], ["1.5.0", null],
  ];
  for (const [t, esperado] of casos) assert.equal(leerMonto(t), esperado, t);
});

test("serieMetrica: trimestral hasta 3 años, anual después", async () => {
  const { serieMetrica, porId } = await import("../src/metricas.ts");
  // 44 trimestres (2016-2026), ventas que crecen 10 por trimestre.
  const t: Trimestre[] = Array.from({ length: 44 }, (_, i) => {
    const a = 2016 + Math.floor(i / 4), q = i % 4;
    return { periodo: `${a}-${["03-31", "06-30", "09-30", "12-31"][q]}`, ventas: 100 + i * 10, fcf: 10, acciones: 100 };
  });
  const ventas = porId("ventas")!;
  const dos = serieMetrica(ventas, t, 2);
  assert.equal(dos.modo, "trimestral");
  assert.equal(dos.puntos.length, 8);
  assert.equal(dos.puntos.at(-1)!.etiqueta, "T4 26");
  assert.ok(dos.puntos.every((p) => p.visible));
  const tres = serieMetrica(ventas, t, 3);
  assert.equal(tres.puntos.length, 12);
  assert.equal(tres.puntos.filter((p) => p.visible).length, 6);
  assert.ok(tres.puntos.at(-1)!.visible);
  const diez = serieMetrica(ventas, t, 10);
  assert.equal(diez.modo, "anual");
  assert.deepEqual(diez.puntos.map((p) => p.etiqueta), ["2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025", "Hoy"]);
  // 2016: 12 meses = 100+110+120+130; hoy: los últimos 4 trimestres.
  assert.equal(diez.puntos[0].valor, 460);
  assert.equal(diez.puntos.at(-1)!.valor, (100 + 40 * 10) + (100 + 41 * 10) + (100 + 42 * 10) + (100 + 43 * 10));
  assert.ok(diez.cambio! > 3);
  const cinco = serieMetrica(ventas, t, 5);
  assert.equal(cinco.puntos.length, 6);
});
