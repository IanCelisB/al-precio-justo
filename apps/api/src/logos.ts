/**
 * Logos de las empresas.
 *
 * La API descarga cada logo una vez desde el proveedor, lo guarda en disco y lo
 * sirve en /logos/:ticker. Las apps no dependen del proveedor y cambiarlo es
 * cambiar ANCLA_LOGO_URL (plantilla con {ticker}).
 *
 * PROTOTIPO: el proveedor por defecto es público y sin contrato. Los logos son
 * marcas registradas de cada empresa; en producción conviene un proveedor con
 * licencia (p. ej. Brandfetch o logo.dev).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PLANTILLA = process.env.ANCLA_LOGO_URL ?? "https://financialmodelingprep.com/image-stock/{ticker}.png";
const NO_EXISTE = Symbol("no existe");

export class Logos {
  private carpeta: string;
  private pendientes = new Map<string, Promise<Buffer | typeof NO_EXISTE>>();
  private faltan = new Set<string>();

  constructor(carpeta: string) {
    this.carpeta = carpeta;
  }

  /** PNG del logo, o null si el proveedor no lo tiene. */
  async obtener(ticker: string): Promise<Buffer | null> {
    if (!/^[A-Z0-9.\-]{1,10}$/.test(ticker) || this.faltan.has(ticker)) return null;
    const archivo = join(this.carpeta, `${ticker}.png`);
    try {
      return await readFile(archivo);
    } catch { /* no está en disco: se descarga */ }
    let p = this.pendientes.get(ticker);
    if (!p) {
      p = this.descargar(ticker, archivo);
      this.pendientes.set(ticker, p);
    }
    const r = await p;
    this.pendientes.delete(ticker);
    if (r === NO_EXISTE) { this.faltan.add(ticker); return null; }
    return r;
  }

  private async descargar(ticker: string, archivo: string): Promise<Buffer | typeof NO_EXISTE> {
    const url = PLANTILLA.replace("{ticker}", encodeURIComponent(ticker.replace(".", "-")));
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      const tipo = r.headers.get("content-type") ?? "";
      if (!r.ok || !tipo.startsWith("image/")) return NO_EXISTE;
      const datos = Buffer.from(await r.arrayBuffer());
      if (datos.length < 100) return NO_EXISTE;
      await mkdir(this.carpeta, { recursive: true });
      await writeFile(archivo, datos);
      return datos;
    } catch {
      return NO_EXISTE;
    }
  }
}
