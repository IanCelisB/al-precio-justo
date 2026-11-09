/**
 * Datos de mercado para la API publicada (Render).
 *
 * El servidor de Render no ejecuta la ingesta: la hace GitHub Actions cada día hábil y
 * publica la base (SQLite comprimida) como archivo de la versión "datos" del repositorio.
 * Con ANCLA_DATOS_URL la API la descarga al arrancar y vuelve a mirar cada 6 horas;
 * solo baja el archivo si cambió (ETag).
 *
 * En local no se usa: la API lee data/ancla.db, que llena la ingesta.
 */
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { DatabaseSync } from "node:sqlite";

export const URL_DATOS = process.env.ANCLA_DATOS_URL ?? "";
export const CADA = 6 * 3600_000;

/**
 * Descarga la base si hay una nueva. Devuelve la ruta del archivo nuevo (aún sin
 * reemplazar la actual) o null si no hay cambios.
 */
export async function bajarSiCambio(destino: string, url = URL_DATOS): Promise<string | null> {
  if (!url) return null;
  const etiqueta = `${destino}.etag`;
  const previa = await readFile(etiqueta, "utf8").catch(() => "");
  const existe = await stat(destino).then(() => true, () => false);
  const r = await fetch(url, {
    headers: { "User-Agent": "AlPrecioJusto/0.1 (https://github.com/IanCelisB/al-precio-justo)", ...(existe && previa ? { "If-None-Match": previa } : {}) },
    redirect: "follow",
  });
  if (r.status === 304) return null;
  if (!r.ok || !r.body) throw new Error(`No se pudo descargar la base de datos de mercado (${r.status}).`);
  const tmp = `${destino}.nueva`;
  await mkdir(dirname(destino), { recursive: true });
  await rm(tmp, { force: true });
  const cuerpo = Readable.fromWeb(r.body as any);
  await pipeline(cuerpo, ...(url.endsWith(".gz") ? [createGunzip()] : []), createWriteStream(tmp));
  // Comprobación mínima antes de usarla: que abra y tenga empresas.
  const db = new DatabaseSync(tmp, { readOnly: true });
  try {
    const n = (db.prepare("SELECT COUNT(*) AS n FROM companies").get() as { n: number }).n;
    if (n < 100) throw new Error(`La base descargada tiene solo ${n} empresas.`);
  } finally { db.close(); }
  await writeFile(etiqueta, r.headers.get("etag") ?? "");
  return tmp;
}

/** Reemplaza la base actual por la descargada (con la anterior ya cerrada). */
export async function reemplazar(tmp: string, destino: string) {
  await rm(`${destino}-wal`, { force: true });
  await rm(`${destino}-shm`, { force: true });
  await rename(tmp, destino);
}
