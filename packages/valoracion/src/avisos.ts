/**
 * Avisos dentro de la app: qué tipos hay, sus ajustes y el texto de cada aviso.
 * Lo usan la API (que detecta y guarda los avisos), la web, el móvil y la demo.
 *
 * Tipos (cada usuario elige cuáles quiere; por defecto solo el precio objetivo):
 *   objetivo    el precio de una acción llega al precio que el usuario fijó
 *   estado      una empresa seguida pasa a barata, justa o cara
 *   reporte     una empresa seguida publica un reporte trimestral nuevo en la SEC
 *   movimiento  una empresa seguida sube o baja más de un % en el día
 */
import { ETIQUETA, type Estado } from "./index.ts";
import { dineroUsd } from "./formato.ts";

export type TipoAviso = "objetivo" | "estado" | "reporte" | "movimiento";

export const TIPOS_AVISO: { id: TipoAviso; nombre: string; descripcion: string }[] = [
  { id: "objetivo", nombre: "Precio objetivo", descripcion: "Cuando una acción llega al precio que fijaste." },
  { id: "estado", nombre: "Cambio de estado", descripcion: "Cuando una empresa que sigues pasa a barata, justa o cara." },
  { id: "reporte", nombre: "Nuevo reporte", descripcion: "Cuando una empresa que sigues publica su reporte trimestral." },
  { id: "movimiento", nombre: "Movimiento fuerte", descripcion: "Cuando una empresa que sigues sube o baja mucho en el día." },
];

export interface AjustesAvisos {
  objetivo: boolean;
  estado: boolean;
  reporte: boolean;
  movimiento: boolean;
  umbral: number;      // % diario para "movimiento fuerte"
}

export const AJUSTES_AVISOS_POR_DEFECTO: AjustesAvisos = {
  objetivo: true, estado: false, reporte: false, movimiento: false, umbral: 5,
};
export const UMBRALES = [3, 5, 10];

/** Acepta solo valores conocidos; lo demás queda como por defecto. */
export function leerAjustesAvisos(x: unknown, base: AjustesAvisos = AJUSTES_AVISOS_POR_DEFECTO): AjustesAvisos {
  const a = { ...base };
  if (x && typeof x === "object") {
    const g = x as Record<string, unknown>;
    for (const t of TIPOS_AVISO) if (typeof g[t.id] === "boolean") a[t.id] = g[t.id] as boolean;
    if (typeof g.umbral === "number" && UMBRALES.includes(g.umbral)) a.umbral = g.umbral;
  }
  return a;
}

export type Direccion = "baja" | "sube";

/** Si el objetivo está bajo el precio actual, se espera que baje; si no, que suba. */
export const direccionObjetivo = (objetivo: number, precioActual: number | null): Direccion =>
  precioActual !== null && objetivo < precioActual ? "baja" : "sube";

export const cumpleObjetivo = (o: { precio: number; direccion: Direccion }, precio: number | null) =>
  precio !== null && (o.direccion === "baja" ? precio <= o.precio : precio >= o.precio);

/** Precio objetivo válido: positivo y razonable (hasta 100 veces el precio actual). */
export function objetivoValido(objetivo: number, precioActual: number | null): string | null {
  if (!Number.isFinite(objetivo) || objetivo <= 0) return "Escribe un precio mayor que cero.";
  if (precioActual && objetivo > precioActual * 100) return "Ese precio está demasiado lejos del actual.";
  return null;
}

/** Lo que necesita el detector de cada empresa. */
export interface EmpresaAviso {
  ticker: string;
  nombre: string;
  precio: number | null;
  cambioPct: number | null;      // % del día (puntos porcentuales: 2,5 = +2,5 %)
  precioFecha: string | null;
  estado: Estado | null;
  ultimoTrimestre: string | null;
}

export interface AvisoNuevo {
  ticker: string;
  tipo: TipoAviso;
  titulo: string;
  texto: string;
  /** Evita repetir el mismo aviso al mismo usuario. */
  clave: string;
}

const corto = (n: string) => n.replace(/,? (Inc\.?|Corp\.?|Corporation|Co\.|Company|Ltd\.?|plc|N\.V\.|S\.A\.)$/i, "");

export function avisoObjetivo(e: EmpresaAviso, o: { precio: number; direccion: Direccion; creado: string }): AvisoNuevo {
  const verbo = o.direccion === "baja" ? "bajó" : "subió";
  return {
    ticker: e.ticker, tipo: "objetivo",
    titulo: `${corto(e.nombre)} llegó a tu precio objetivo`,
    texto: `La acción ${verbo} a ${dineroUsd(e.precio ?? o.precio)} (tu objetivo: ${dineroUsd(o.precio)}).`,
    clave: `objetivo:${e.ticker}:${o.creado}`,
  };
}

export function avisoEstado(e: EmpresaAviso, antes: Estado | null): AvisoNuevo | null {
  if (!e.estado || !antes || e.estado === antes) return null;
  return {
    ticker: e.ticker, tipo: "estado",
    titulo: `${corto(e.nombre)} ahora está ${ETIQUETA[e.estado].toLowerCase()}`,
    texto: `Antes estaba ${ETIQUETA[antes].toLowerCase()} frente a su valor estimado. Precio: ${e.precio ? dineroUsd(e.precio) : "—"}.`,
    clave: `estado:${e.ticker}:${e.estado}:${(e.precioFecha ?? "").slice(0, 10)}`,
  };
}

export function avisoReporte(e: EmpresaAviso, antes: string | null): AvisoNuevo | null {
  if (!e.ultimoTrimestre || !antes || e.ultimoTrimestre <= antes) return null;
  return {
    ticker: e.ticker, tipo: "reporte",
    titulo: `${corto(e.nombre)} publicó su reporte`,
    texto: `Ya están sus números hasta el trimestre que terminó el ${e.ultimoTrimestre}. Revisa cómo cambió su valor estimado.`,
    clave: `reporte:${e.ticker}:${e.ultimoTrimestre}`,
  };
}

export function avisoMovimiento(e: EmpresaAviso, umbral: number): AvisoNuevo | null {
  if (e.cambioPct === null || Math.abs(e.cambioPct) < umbral) return null;
  const sube = e.cambioPct > 0;
  const pct = Math.abs(e.cambioPct).toLocaleString("es", { maximumFractionDigits: 1 });
  return {
    ticker: e.ticker, tipo: "movimiento",
    titulo: `${corto(e.nombre)} ${sube ? "sube" : "baja"} ${pct} % hoy`,
    texto: `Cotiza a ${e.precio ? dineroUsd(e.precio) : "—"}. Te avisamos desde movimientos de ${umbral} %.`,
    clave: `movimiento:${e.ticker}:${(e.precioFecha ?? "").slice(0, 10)}`,
  };
}
