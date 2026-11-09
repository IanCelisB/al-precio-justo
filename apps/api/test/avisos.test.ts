import { test } from "node:test";
import assert from "node:assert/strict";
import type { EmpresaAviso } from "@ancla/valoracion/avisos";
import { abrirBD } from "../src/bd.ts";
import { Avisos } from "../src/avisos.ts";
import { Usuarios } from "../src/usuarios.ts";

const emp = (ticker: string, c: Partial<EmpresaAviso> = {}): EmpresaAviso => ({
  ticker, nombre: `${ticker} Inc.`, precio: 100, cambioPct: 0.5, precioFecha: "2026-11-09", estado: "rango",
  ultimoTrimestre: "2026-06-30", ...c,
});

async function preparar() {
  const bd = await abrirBD({ dir: "memoria" });
  const usuarios = new Usuarios(bd);
  const avisos = new Avisos(bd);
  for (const id of ["ana", "beto"]) await usuarios.guardar({ id, email: `${id}@x.cl`, nombre: id, foto: null });
  return { bd, usuarios, avisos };
}

test("por defecto solo avisa el precio objetivo, una sola vez", async () => {
  const { usuarios, avisos } = await preparar();
  assert.deepEqual(await avisos.ajustes("ana"), { objetivo: true, estado: false, reporte: false, movimiento: false, umbral: 5 });
  const o = await avisos.fijarObjetivo("ana", "AAPL", 90, 100);
  assert.equal(o.direccion, "baja");
  await usuarios.seguir("ana", "AAPL");

  await avisos.revisar([emp("AAPL")]);                                       // primera foto: nada
  assert.equal(await avisos.revisar([emp("AAPL", { precio: 95, estado: "barata", cambioPct: -8 })]), 0);
  assert.equal(await avisos.revisar([emp("AAPL", { precio: 89.5, estado: "barata" })]), 1);
  assert.equal(await avisos.revisar([emp("AAPL", { precio: 85, estado: "barata" })]), 0); // ya se cumplió

  const { avisos: lista, sinLeer } = await avisos.lista("ana");
  assert.equal(sinLeer, 1);
  assert.equal(lista[0].tipo, "objetivo");
  assert.match(lista[0].titulo, /AAPL llegó a tu precio objetivo/);
  assert.equal((await avisos.objetivos("ana"))[0].cumplido !== null, true);
  await avisos.marcarLeidos("ana");
  assert.equal(await avisos.sinLeer("ana"), 0);
});

test("cambio de estado, reporte y movimiento solo para quien los activó y sigue la empresa", async () => {
  const { usuarios, avisos } = await preparar();
  await usuarios.seguir("ana", "KO");
  await usuarios.seguir("beto", "KO");
  await avisos.guardarAjustes("ana", { estado: true, reporte: true, movimiento: true, umbral: 3 });
  await avisos.guardarAjustes("beto", { objetivo: false, umbral: 7 });       // umbral no permitido: queda 5
  assert.deepEqual(await avisos.ajustes("beto"), { objetivo: false, estado: false, reporte: false, movimiento: false, umbral: 5 });

  await avisos.revisar([emp("KO")]);
  const n = await avisos.revisar([emp("KO", { estado: "barata", ultimoTrimestre: "2026-09-30", cambioPct: -4.2 })]);
  assert.equal(n, 3);
  const tipos = (await avisos.lista("ana")).avisos.map((a) => a.tipo).sort();
  assert.deepEqual(tipos, ["estado", "movimiento", "reporte"]);
  assert.equal((await avisos.lista("beto")).avisos.length, 0);
  // Revisar otra vez con los mismos datos no repite nada.
  assert.equal(await avisos.revisar([emp("KO", { estado: "barata", ultimoTrimestre: "2026-09-30", cambioPct: -4.2 })]), 0);
});

test("con el aviso de precio objetivo apagado no se dispara; al borrar la cuenta se va todo", async () => {
  const { bd, usuarios, avisos } = await preparar();
  await avisos.guardarAjustes("beto", { objetivo: false });
  await avisos.fijarObjetivo("beto", "MSFT", 120, 100);
  await avisos.revisar([emp("MSFT", { precio: 130 })]);
  assert.equal((await avisos.lista("beto")).avisos.length, 0);
  await avisos.guardarAjustes("beto", { objetivo: true });
  assert.equal(await avisos.revisar([emp("MSFT", { precio: 130 })]), 1);
  await usuarios.borrar("beto");
  assert.equal((await bd.q("SELECT COUNT(*)::int AS n FROM avisos"))[0].n, 0);
  assert.equal((await bd.q("SELECT COUNT(*)::int AS n FROM objetivos"))[0].n, 0);
});
