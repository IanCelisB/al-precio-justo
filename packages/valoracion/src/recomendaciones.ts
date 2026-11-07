/**
 * Criterio prudente de Al Precio Justo para sugerir empresas.
 *
 * No es una recomendación personalizada: aplica las mismas reglas a todas las
 * empresas y explica por qué cada una pasa o no pasa el filtro.
 *
 * 1. Tipo de empresa: defensiva (consumo básico, salud, servicios públicos),
 *    cíclica (energía, materiales, o ventas que han caído más de un 25 % alguna vez)
 *    o estable (el resto).
 * 2. Calidad (0-100): caja positiva y constante, márgenes, crecimiento, deuda,
 *    dilución y pagos en acciones.
 * 3. Precio de compra: el valor estimado menos un margen de seguridad que
 *    depende del tipo: 15 % defensivas, 20 % estables, 35 % cíclicas.
 *    Cuanto más incierto el negocio, más descuento se exige.
 */
import { ttm, type Trimestre } from "./index.ts";

export type Tipo = "defensiva" | "estable" | "ciclica";

export const TIPOS: Record<Tipo, { nombre: string; margen: number; explicacion: string }> = {
  defensiva: { nombre: "Defensiva", margen: 0.15,
    explicacion: "Vende cosas que se compran haya crisis o no. Pedimos un 15 % de descuento." },
  estable: { nombre: "Estable", margen: 0.2,
    explicacion: "Negocio sin grandes vaivenes en sus ventas. Pedimos un 20 % de descuento." },
  ciclica: { nombre: "Cíclica", margen: 0.35,
    explicacion: "Sus resultados suben y bajan con la economía o las materias primas. Pedimos un 35 % de descuento." },
};

const DEFENSIVOS = new Set(["Consumer Staples", "Health Care", "Utilities"]);
const CICLICOS = new Set(["Energy", "Materials"]);
/** Una caída de ventas mayor que esta (de máximo a mínimo) delata un negocio cíclico. */
export const CAIDA_CICLICA = 0.25;
/** Una cíclica que cotiza por debajo de esta fracción de su valor suele estar en un pico de caja. */
export const PICO_CICLICO = 0.5;

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** Mayor caída de las ventas de 12 meses respecto a su máximo anterior (0,25 = cayeron un 25 %). */
export function caidaMaximaVentas(t: Trimestre[]): number {
  let pico = 0;
  let caida = 0;
  for (let i = 4; i <= t.length; i++) {
    const v = ttm(t, "ventas", i);
    if (v === null || v <= 0) continue;
    pico = Math.max(pico, v);
    caida = Math.max(caida, 1 - v / pico);
  }
  return caida;
}

export function tipoDeEmpresa(sector: string | null | undefined, t: Trimestre[]): Tipo {
  if (sector && CICLICOS.has(sector)) return "ciclica";
  if (caidaMaximaVentas(t) > CAIDA_CICLICA) return "ciclica";
  if (sector && DEFENSIVOS.has(sector)) return "defensiva";
  return "estable";
}

export interface Calidad {
  puntos: number;            // 0-100
  razones: string[];         // a favor, en lenguaje sencillo
  alertas: string[];         // en contra
  descarta: string | null;   // motivo grave que la deja fuera de las sugerencias
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

export function calidad(t: Trimestre[]): Calidad {
  const razones: string[] = [];
  const alertas: string[] = [];
  let descarta: string | null = null;
  let p = 50;

  // 1. Caja constante
  const ult = t.slice(-12);
  const conFcf = ult.filter((q) => num(q.fcf) !== null);
  const positivos = conFcf.filter((q) => q.fcf! > 0).length;
  if (conFcf.length >= 8) {
    if (positivos >= conFcf.length - 1) { p += 15; razones.push(`Generó caja en ${positivos} de sus últimos ${conFcf.length} trimestres.`); }
    else if (positivos >= conFcf.length * 0.75) p += 5;
    else { p -= 20; alertas.push(`Solo generó caja en ${positivos} de ${conFcf.length} trimestres.`); }
    if (positivos < conFcf.length * 0.66) descarta = "Su caja es demasiado irregular.";
  } else {
    p -= 10; alertas.push("Tiene poca historia de flujo de caja.");
  }

  // 2. Margen de caja
  const fcf = ttm(t, "fcf");
  const ventas = ttm(t, "ventas");
  if (fcf !== null && ventas && ventas > 0) {
    const m = fcf / ventas;
    if (m >= 0.15) { p += 10; razones.push(`Convierte ${pct(m)} de sus ventas en caja libre.`); }
    else if (m >= 0.08) p += 5;
    else if (m < 0.03) { p -= 5; alertas.push(`Margen de caja bajo (${pct(m)} de las ventas).`); }
  }

  // 3. Crecimiento de ventas en 3 años
  const antes = t.length >= 16 ? ttm(t, "ventas", t.length - 12) : null;
  if (ventas && antes && antes > 0) {
    const g = Math.pow(ventas / antes, 1 / 3) - 1;
    if (g >= 0.05) { p += 10; razones.push(`Sus ventas crecen ${pct(g)} al año.`); }
    else if (g >= 0) p += 5;
    else if (g < -0.03) { p -= 10; alertas.push(`Sus ventas caen ${pct(-g)} al año.`); }
  }

  // 4. Deuda
  const base = t.length >= 12 && ult.every((q) => num(q.fcf) !== null)
    ? ult.reduce((s, q) => s + q.fcf!, 0) / 3 : fcf;
  let deudaNeta: number | null = null;
  for (const q of t.slice(-4).reverse()) if (num(q.deudaNeta) !== null) { deudaNeta = q.deudaNeta!; break; }
  if (deudaNeta !== null && base && base > 0) {
    const veces = deudaNeta / base;
    if (veces <= 0) { p += 10; razones.push("Tiene más caja que deuda."); }
    else if (veces <= 1) { p += 10; razones.push("Podría pagar su deuda con menos de un año de caja."); }
    else if (veces > 4) {
      p -= 15; alertas.push(`Su deuda equivale a ${veces.toFixed(1).replace(".", ",")} años de caja.`);
      if (veces > 6) descarta = "Tiene demasiada deuda para su caja.";
    }
  }

  // 5. Dilución
  const accAhora = t.at(-1)?.acciones ?? t.at(-2)?.acciones;
  const accAntes = t.length >= 6 ? (t.at(-5)?.acciones ?? t.at(-6)?.acciones) : undefined;
  if (accAhora && accAntes) {
    const d = accAhora / accAntes - 1;
    if (d <= -0.01) { p += 5; razones.push(`Reduce su número de acciones (${pct(-d)} en un año).`); }
    else if (d > 0.03) {
      p -= 10; alertas.push(`Emite acciones: +${pct(d)} en un año.`);
      if (d > 0.08) descarta = "Diluye mucho a sus accionistas.";
    }
  }

  // 6. Pagos en acciones frente a la caja
  const comp = ttm(t, "compAcciones");
  if (comp !== null && fcf && fcf > 0 && comp / fcf > 0.3) {
    p -= 10; alertas.push(`Paga en acciones a sus empleados el equivalente al ${pct(comp / fcf)} de su caja.`);
  }

  return { puntos: Math.max(0, Math.min(100, p)), razones, alertas, descarta };
}

export interface Analisis {
  tipo: Tipo;
  calidad: Calidad;
  precioCompra: number | null;   // por debajo de este precio, "buen precio de compra"
  buenPrecio: boolean;
  /** Pasa el criterio prudente: buena calidad, sin motivos graves y a buen precio. */
  sugerida: boolean;
  /** Buena calidad, a menos de un 10 % de su precio de compra: para vigilar. */
  vigilar: boolean;
  orden: number;                 // mayor = mejor candidata
  motivo: string;                // resumen en una frase
}

export const CALIDAD_MINIMA = 60;

export function analizar(
  e: { sector: string | null; precio: number | null; valor: number | null; trimestres: Trimestre[] },
): Analisis {
  const tipo = tipoDeEmpresa(e.sector, e.trimestres);
  const c = calidad(e.trimestres);
  const precioCompra = e.valor ? e.valor * (1 - TIPOS[tipo].margen) : null;
  const buenPrecio = !!(e.precio && precioCompra && e.precio <= precioCompra);
  // Una cíclica "demasiado barata" suele tener la caja inflada por un buen momento del ciclo
  // (p. ej. petroleras con el crudo alto): no se sugiere, se deja para vigilar.
  const picoCiclico = tipo === "ciclica" && !!(e.precio && e.valor && e.precio / e.valor < PICO_CICLICO);
  const solida = c.puntos >= CALIDAD_MINIMA && !c.descarta && !picoCiclico;
  const sugerida = solida && buenPrecio;
  const vigilar = (picoCiclico && c.puntos >= CALIDAD_MINIMA && !c.descarta) || solida && !buenPrecio && !!(e.precio && precioCompra && e.precio <= precioCompra * 1.1);
  const descuento = e.precio && precioCompra ? 1 - e.precio / precioCompra : -1;
  const orden = (sugerida ? 1000 : vigilar ? 500 : 0) + c.puntos + Math.max(-50, Math.min(40, descuento * 100));

  let motivo: string;
  if (!e.valor) motivo = "Sin valor estimado: no la sugerimos.";
  else if (c.descarta) motivo = c.descarta;
  else if (picoCiclico) motivo = "Muy barata para ser cíclica: su caja puede estar en un buen momento del ciclo que no durará.";
  else if (c.puntos < CALIDAD_MINIMA) motivo = `Calidad ${c.puntos}/100: no llega al mínimo de ${CALIDAD_MINIMA}.`;
  else if (sugerida) motivo = `${TIPOS[tipo].nombre}, calidad ${c.puntos}/100 y bajo su precio de compra.`;
  else if (vigilar) motivo = `Buena empresa, cerca de su precio de compra.`;
  else motivo = `Buena empresa, pero hoy está por encima de su precio de compra.`;

  return { tipo, calidad: c, precioCompra, buenPrecio, sugerida, vigilar, orden, motivo };
}
