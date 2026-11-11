/**
 * Piezas de la ficha de empresa que no cambian el modelo de valoración:
 * - explicarValor: la fórmula del valor estimado paso a paso, con los números de la empresa;
 * - caidaDesdeMaximo: cuánto ha caído desde su máximo (drawdown);
 * - historialPer: el PER semana a semana (precio / beneficio por acción de 12 meses).
 */
import { ANCHO_BANDA, ANIOS, SUPUESTOS_BASE, ttm, type Trimestre, type Valoracion } from "./index.ts";
import { RETRASO_REPORTE, type Cierre } from "./grafico.ts";

export interface PasoFlujo { anio: number; flujo: number; presente: number }

export interface Explicacion {
  fcfPorAccion: number;
  aniosBase: number;              // 3: promedio de 3 años; 1: últimos 12 meses
  crecimiento: number;            // el que se usa
  crecimientoHistorico: number | null;  // el de su historia, antes del tope
  fuenteCrecimiento: string;      // "ventas de los últimos 5 años"…
  topado: "maximo" | "minimo" | null;
  recompraNeta: number;
  crecimientoPorAccion: number;   // (1 + g)(1 + b) − 1
  descuento: number;
  crecimientoTerminal: number;
  flujos: PasoFlujo[];
  sumaFlujos: number;
  valorTerminal: number;          // al final del año 5
  terminalPresente: number;
  deudaNetaPorAccion: number;
  valor: number;
  banda: { min: number; max: number };
}

export const TOPE_CRECIMIENTO = { min: 0, max: 0.12 };

function cagr(desde: number | null, hasta: number | null, anios: number): number | null {
  if (desde === null || hasta === null || desde <= 0 || hasta <= 0) return null;
  return Math.pow(hasta / desde, 1 / anios) - 1;
}

/** El crecimiento histórico del que sale el supuesto por defecto (misma regla que el modelo). */
export function crecimientoHistorico(t: Trimestre[]): { valor: number; fuente: string } | null {
  const n = t.length;
  for (const campo of ["ventas", "fcf"] as const) {
    for (const anios of [5, 3]) {
      const atras = n - anios * 4;
      if (atras < 4) continue;
      const g = cagr(ttm(t, campo, atras), ttm(t, campo), anios);
      if (g !== null) return { valor: g, fuente: `${campo === "ventas" ? "sus ventas" : "su flujo de caja libre"} de los últimos ${anios} años` };
    }
  }
  return null;
}

/** La cuenta del valor estimado, paso a paso (los mismos números que `valorar`). */
export function explicarValor(trimestres: Trimestre[], v: Valoracion): Explicacion {
  const s = v.supuestos;
  const hist = crecimientoHistorico(trimestres);
  const g = (1 + s.crecimiento) * (1 + s.recompraNeta) - 1;
  const flujos: PasoFlujo[] = [];
  let flujo = v.fcfPorAccion;
  for (let a = 1; a <= ANIOS; a++) {
    flujo *= 1 + g;
    flujos.push({ anio: a, flujo, presente: flujo / (1 + s.descuento) ** a });
  }
  const valorTerminal = (flujo * (1 + s.crecimientoTerminal)) / (s.descuento - s.crecimientoTerminal);
  const terminalPresente = valorTerminal / (1 + s.descuento) ** ANIOS;
  const topado = hist === null ? null
    : hist.valor > TOPE_CRECIMIENTO.max && s.crecimiento >= TOPE_CRECIMIENTO.max - 1e-9 ? "maximo"
    : hist.valor < TOPE_CRECIMIENTO.min && s.crecimiento <= TOPE_CRECIMIENTO.min + 1e-9 ? "minimo" : null;
  return {
    fcfPorAccion: v.fcfPorAccion,
    aniosBase: v.aniosBase,
    crecimiento: s.crecimiento,
    crecimientoHistorico: hist?.valor ?? null,
    fuenteCrecimiento: hist?.fuente ?? `un ${Math.round(SUPUESTOS_BASE.crecimiento * 100)} % fijo (no hay historia suficiente)`,
    topado,
    recompraNeta: s.recompraNeta,
    crecimientoPorAccion: g,
    descuento: s.descuento,
    crecimientoTerminal: s.crecimientoTerminal,
    flujos,
    sumaFlujos: flujos.reduce((a, f) => a + f.presente, 0),
    valorTerminal,
    terminalPresente,
    deudaNetaPorAccion: v.deudaNetaPorAccion,
    valor: v.valor,
    banda: v.banda,
  };
}

export { ANCHO_BANDA };

export interface Caida { maximo: number; fecha: string; caida: number }

/** Caída desde el máximo de los cierres disponibles (hasta 10 años) hasta el precio de hoy. */
export function caidaDesdeMaximo(precios: Cierre[], precio: number | null): Caida | null {
  const hoy = precio ?? precios.at(-1)?.cierre ?? null;
  if (!hoy || !precios.length) return null;
  let max = precios[0];
  for (const c of precios) if (c.cierre > max.cierre) max = c;
  if (hoy >= max.cierre) return { maximo: hoy, fecha: new Date().toISOString().slice(0, 10), caida: 0 };
  return { maximo: max.cierre, fecha: max.fecha.slice(0, 10), caida: hoy / max.cierre - 1 };
}

export interface PuntoPer { fecha: string; per: number | null }

const DIA = 86_400_000;

/**
 * PER de cada semana: el cierre dividido por el beneficio por acción de los 12 meses
 * ya publicados entonces (cada trimestre se conoce ~45 días después de su cierre).
 * null si ese beneficio es negativo o cero (el PER no tiene sentido con pérdidas).
 */
export function historialPer(trimestres: Trimestre[], cierres: Cierre[]): PuntoPer[] {
  const publicados = trimestres.map((q) => new Date(Date.parse(q.periodo + "T00:00:00Z") + RETRASO_REPORTE * DIA).toISOString().slice(0, 10));
  const eps: (number | null)[] = trimestres.map((_, i) => {
    const b = ttm(trimestres, "beneficios", i + 1);
    let acciones: number | undefined;
    for (let k = i; k >= Math.max(0, i - 3) && !acciones; k--) acciones = trimestres[k].acciones;
    return b !== null && acciones ? b / acciones : null;
  });
  const out: PuntoPer[] = [];
  let j = -1;
  for (const c of cierres) {
    while (j + 1 < trimestres.length && publicados[j + 1] <= c.fecha.slice(0, 10)) j++;
    const e = j >= 0 ? eps[j] : null;
    out.push({ fecha: c.fecha.slice(0, 10), per: e && e > 0 ? c.cierre / e : null });
  }
  return out;
}

/** Mediana de una lista (sin nulos). */
export function mediana(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
