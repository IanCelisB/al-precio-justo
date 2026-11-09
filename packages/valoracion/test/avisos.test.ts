import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avisoEstado, avisoMovimiento, avisoReporte, cumpleObjetivo, direccionObjetivo, leerAjustesAvisos, objetivoValido,
  AJUSTES_AVISOS_POR_DEFECTO, type EmpresaAviso,
} from "../src/avisos.ts";

const e: EmpresaAviso = {
  ticker: "AAPL", nombre: "Apple Inc.", precio: 180, cambioPct: -5.4, precioFecha: "2026-11-09T21:00:00Z",
  estado: "barata", ultimoTrimestre: "2026-09-27",
};

test("dirección y cumplimiento del precio objetivo", () => {
  assert.equal(direccionObjetivo(150, 180), "baja");
  assert.equal(direccionObjetivo(200, 180), "sube");
  assert.equal(direccionObjetivo(200, null), "sube");
  assert.equal(cumpleObjetivo({ precio: 150, direccion: "baja" }, 151), false);
  assert.equal(cumpleObjetivo({ precio: 150, direccion: "baja" }, 150), true);
  assert.equal(cumpleObjetivo({ precio: 200, direccion: "sube" }, 201), true);
  assert.equal(cumpleObjetivo({ precio: 200, direccion: "sube" }, null), false);
  assert.equal(objetivoValido(0, 100), "Escribe un precio mayor que cero.");
  assert.equal(objetivoValido(20_000, 100), "Ese precio está demasiado lejos del actual.");
  assert.equal(objetivoValido(95.5, 100), null);
});

test("ajustes: por defecto solo precio objetivo; ignora valores desconocidos", () => {
  assert.deepEqual(AJUSTES_AVISOS_POR_DEFECTO, { objetivo: true, estado: false, reporte: false, movimiento: false, umbral: 5 });
  assert.deepEqual(leerAjustesAvisos({ estado: true, umbral: 10, otro: 1, reporte: "si" }),
    { objetivo: true, estado: true, reporte: false, movimiento: false, umbral: 10 });
  assert.deepEqual(leerAjustesAvisos(null), AJUSTES_AVISOS_POR_DEFECTO);
});

test("textos de los avisos", () => {
  const est = avisoEstado(e, "rango")!;
  assert.equal(est.titulo, "Apple ahora está barata");
  assert.equal(avisoEstado(e, "barata"), null);
  assert.equal(avisoEstado(e, null), null);
  assert.equal(avisoReporte(e, "2026-06-28")!.clave, "reporte:AAPL:2026-09-27");
  assert.equal(avisoReporte(e, "2026-09-27"), null);
  const m = avisoMovimiento(e, 5)!;
  assert.equal(m.titulo, "Apple baja 5,4 % hoy");
  assert.equal(m.clave, "movimiento:AAPL:2026-11-09");
  assert.equal(avisoMovimiento(e, 10), null);
});
