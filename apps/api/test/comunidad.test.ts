import { test } from "node:test";
import assert from "node:assert/strict";
import { abrirBD } from "../src/bd.ts";
import { Usuarios } from "../src/usuarios.ts";
import { Comunidad, fotoValida } from "../src/comunidad.ts";

async function preparar() {
  const bd = await abrirBD({ dir: "memoria" });
  const u = new Usuarios(bd);
  const ana = await u.guardar({ id: "google:1", email: "ana@x.cl", nombre: "Ana", foto: null });
  const beto = await u.guardar({ id: "google:2", email: "beto@x.cl", nombre: "Beto", foto: null });
  return { bd, u, c: new Comunidad(bd), ana, beto };
}

test("listas: varias por usuario; seguidas es la unión", async () => {
  const { bd, u } = await preparar();
  const comprar = await u.crearLista("google:1", "Quiero comprar");
  const tengo = await u.crearLista("google:1", "Tengo");
  assert.ok(typeof comprar !== "string" && typeof tengo !== "string");
  await u.enLista("google:1", comprar.id, "AAPL", true);
  await u.enLista("google:1", tengo.id, "AAPL", true);
  await u.enLista("google:1", tengo.id, "KO", true);
  assert.deepEqual((await u.seguidas("google:1")).sort(), ["AAPL", "KO"]);
  await u.enLista("google:1", tengo.id, "AAPL", false);
  assert.deepEqual((await u.seguidas("google:1")).sort(), ["AAPL", "KO"]);   // sigue en "Quiero comprar"
  await u.borrarLista("google:1", comprar.id);
  assert.deepEqual(await u.seguidas("google:1"), ["KO"]);
  // Nadie toca las listas de otro.
  assert.equal(await u.enLista("google:2", tengo.id, "MSFT", true), false);
  assert.equal(await u.renombrarLista("google:1", tengo.id, "Mi cartera"), true);
  assert.deepEqual((await u.listas("google:1")).map((l) => [l.nombre, l.tickers]), [["Mi cartera", ["KO"]]]);
  // Seguir sin lista (web) crea "Mi lista" si no hay ninguna.
  await u.seguir("google:2", "NVDA");
  assert.deepEqual((await u.listas("google:2")).map((l) => l.nombre), ["Mi lista"]);
  await bd.cerrar();
});

test("perfil propio: nombre y foto no se pisan al volver a entrar con Google", async () => {
  const { bd, u, ana } = await preparar();
  assert.match(ana.publico, /^[0-9a-f]{32}$/);
  await u.editarPerfil("google:1", { nombre: "Ana Inversora", bio: "Me gustan los dividendos" });
  const otra = await u.guardar({ id: "google:1", email: "ana@x.cl", nombre: "Ana", foto: "https://g/foto.png" });
  assert.equal(otra.nombre, "Ana Inversora");
  assert.equal(otra.bio, "Me gustan los dividendos");
  assert.equal(otra.publico, ana.publico);
  assert.equal(fotoValida("data:image/png;base64,iVBORw0KGgo="), "data:image/png;base64,iVBORw0KGgo=");
  assert.equal(fotoValida("javascript:alert(1)"), false);
  await bd.cerrar();
});

test("comunidad: publicar, me gusta, comentar y borrar solo lo propio", async () => {
  const { bd, c, ana, beto } = await preparar();
  const p = await c.publicar("google:1", { texto: "  Compré KO para dividendos  ", ticker: "KO" });
  assert.ok(typeof p !== "string");
  assert.equal(p.texto, "Compré KO para dividendos");
  assert.equal(p.autor.nombre, "Ana");
  assert.ok(!("email" in p.autor));
  assert.equal(await c.publicar("google:1", { texto: "   " }), "Escribe algo antes de publicar.");
  assert.deepEqual(await c.meGusta("google:2", p.id, true), { meGusta: 1, loHeGustado: true });
  const com = await c.comentar("google:2", p.id, "¡Buena elección!");
  assert.ok(typeof com !== "string" && com.autor.publico === beto.publico);
  const [muro] = await c.muro("google:2");
  assert.equal(muro.meGusta, 1);
  assert.equal(muro.comentarios, 1);
  assert.equal(muro.loHeGustado, true);
  assert.equal(muro.mia, false);
  assert.equal(await c.borrar("google:2", p.id), false);    // no es suya
  const perfil = await c.perfil(null, ana.publico);
  assert.equal(perfil!.publicaciones.length, 1);
  assert.equal(perfil!.meGustaRecibidos, 1);
  assert.equal(await c.borrar("google:1", p.id), true);
  assert.equal((await c.muro(null)).length, 0);
  assert.equal(await c.buzon(null, "sugerencia", "Agreguen empresas chilenas"), true);
  assert.notEqual(await c.buzon(null, "otra", "x"), true);
  await bd.cerrar();
});

test("migración: las seguidas de antes pasan a «Mi lista»", async () => {
  const bd = await abrirBD({ dir: "memoria" });
  const filas = await bd.q<{ n: number }>("SELECT COUNT(*)::int AS n FROM listas");
  assert.equal(Number(filas[0].n), 0);
  await bd.cerrar();
});
