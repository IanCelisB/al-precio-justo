/**
 * Foto de los datos para la demo estática (GitHub Pages).
 *
 * Pide a una API en marcha lo mismo que pediría la app y lo guarda como archivos en
 * apps/movil/public/ (datos/*.json y logos/*.png), que `expo export` publica junto a la
 * app. Solo lee: no cambia la base de datos ni la API.
 *
 *   node apps/api/src/foto-demo.ts                    # API en http://127.0.0.1:4000
 *   ANCLA_API=http://127.0.0.1:4000 node apps/api/src/foto-demo.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Datos } from "./datos.ts";

const RAIZ = resolve(fileURLToPath(import.meta.url), "../../../..");
const API = process.env.ANCLA_API ?? "http://127.0.0.1:4000";
const DB = process.env.ANCLA_DB ?? resolve(RAIZ, "data/ancla.db");
const SALIDA = resolve(RAIZ, "apps/movil/public");

async function json(ruta: string): Promise<any> {
  const r = await fetch(`${API}${ruta}`);
  if (!r.ok) throw new Error(`${ruta}: HTTP ${r.status}`);
  return r.json();
}

/** Ejecuta `tarea` sobre la lista con `n` peticiones a la vez. */
async function enParalelo<T>(lista: T[], n: number, tarea: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < lista.length) await tarea(lista[i++]); }));
}

const escribir = (ruta: string, datos: unknown) => writeFileSync(resolve(SALIDA, "datos", ruta), JSON.stringify(datos));

const t0 = Date.now();
mkdirSync(resolve(SALIDA, "datos/empresas"), { recursive: true });
mkdirSync(resolve(SALIDA, "logos"), { recursive: true });

const empresas: { ticker: string }[] = await json("/empresas");
escribir("resumenes.json", empresas);
escribir("inicio.json", { ...(await json("/inicio")), generado: new Date().toISOString() });
escribir("recomendaciones.json", await json("/recomendaciones"));
escribir("divisas.json", await json("/divisas"));

// S&P 500 (SPY) semanal, para la máquina del tiempo y la curva del simulador.
const desde = new Date(Date.now() - 10 * 365.25 * 86_400_000).toISOString().slice(0, 10);
escribir("spy.json", new Datos(DB).historicoPrecios("SPY", desde));

let logos = 0;
await enParalelo(empresas, 8, async ({ ticker }) => {
  escribir(`empresas/${ticker}.json`, await json(`/empresas/${encodeURIComponent(ticker)}`));
  const r = await fetch(`${API}/logos/${encodeURIComponent(ticker)}`);
  if (r.ok) { writeFileSync(resolve(SALIDA, "logos", `${ticker}.png`), Buffer.from(await r.arrayBuffer())); logos++; }
});
console.log(`Foto de ${empresas.length} empresas (${logos} logos) en ${((Date.now() - t0) / 1000).toFixed(0)} s → ${SALIDA}`);
