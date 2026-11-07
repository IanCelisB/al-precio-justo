/**
 * Motor de valoración de Ancla.
 *
 * Se usa igual en la API (para la lista del día), en la web y en el móvil (para
 * que "Tu modelo" recalcule al instante, sin preguntar al servidor). No depende
 * de nada: solo recibe los trimestres de la SEC, el precio y los supuestos.
 *
 * Modelo: flujo de caja libre (promedio de 3 años) descontado a 5 años + valor terminal, por acción,
 * menos la deuda neta por acción. Las recompras netas hacen crecer el flujo por
 * acción: crecimiento por acción = (1 + g)(1 + b) − 1.
 */

/** Un trimestre tal como lo guarda la ingesta (valores en USD; acciones en unidades). */
export interface Trimestre {
  periodo: string;            // fecha de cierre AAAA-MM-DD
  ventas?: number;
  beneficios?: number;
  fcf?: number;               // flujo de caja libre
  emision?: number;           // emisión de acciones
  recompras?: number;
  recomprasNetas?: number;    // recompras − emisión
  deudaNeta?: number;
  dividendos?: number;
  acciones?: number;          // acciones diluidas promedio (o en circulación)
  flujoOperativo?: number;    // caja generada por las operaciones
  capex?: number;             // inversión en activos
  compAcciones?: number;      // pagos a empleados en acciones
  deuda?: number;             // deuda bruta
  caja?: number;              // caja y equivalentes
}

export interface Supuestos {
  crecimiento: number;          // crecimiento anual del flujo de caja libre, 5 años
  descuento: number;            // rentabilidad exigida
  crecimientoTerminal: number;  // crecimiento a perpetuidad después
  recompraNeta: number;         // % de acciones que se recompran (neto) cada año
}

export type Estado = "barata" | "rango" | "cara";

export interface Valoracion {
  ok: true;
  valor: number;                // valor estimado por acción (centro de la banda)
  banda: { min: number; max: number };
  fcfPorAccion: number;         // flujo de caja libre base por acción (promedio de 3 años)
  aniosBase: number;            // 3, o 1 si no hay historia suficiente
  deudaNetaPorAccion: number;
  supuestos: Supuestos;
}

export interface SinModelo {
  ok: false;
  motivo: string;
}

export const ANIOS = 5;
export const ANCHO_BANDA = 0.15;

export const SUPUESTOS_BASE: Supuestos = {
  crecimiento: 0.05,
  descuento: 0.09,
  crecimientoTerminal: 0.025,
  recompraNeta: 0,
};

/** Sectores donde el flujo de caja libre no mide lo mismo (bancos, aseguradoras). */
export const SECTORES_SIN_MODELO = new Set(["Financials"]);

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Suma de los últimos 4 trimestres de una métrica, o null si falta alguno. */
export function ttm(trimestres: Trimestre[], campo: keyof Trimestre, hasta = trimestres.length): number | null {
  if (hasta < 4) return null;
  let s = 0;
  for (const t of trimestres.slice(hasta - 4, hasta)) {
    const v = t[campo];
    if (typeof v !== "number") return null;
    s += v;
  }
  return s;
}

function cagr(desde: number | null, hasta: number | null, anios: number): number | null {
  if (desde === null || hasta === null || desde <= 0 || hasta <= 0) return null;
  return Math.pow(hasta / desde, 1 / anios) - 1;
}

/** Último valor disponible de un campo en los 4 trimestres más recientes. */
function reciente(trimestres: Trimestre[], campo: keyof Trimestre): number | null {
  for (const t of trimestres.slice(-4).reverse()) {
    const v = t[campo];
    if (typeof v === "number") return v;
  }
  return null;
}

/**
 * Supuestos por defecto a partir de la historia de la empresa:
 * - crecimiento: crecimiento anual de las ventas en 5 años (o 3 si no hay tanta
 *   historia; si no hay ventas, el del flujo de caja libre), limitado a 0 %–12 %.
 *   Las ventas son más estables que el flujo de caja, que salta con cada inversión;
 * - recompra neta: recompras − emisión de los últimos 12 meses sobre la capitalización.
 */
export function supuestosPorDefecto(trimestres: Trimestre[], precio?: number): Supuestos {
  const n = trimestres.length;
  let g: number | null = null;
  for (const campo of ["ventas", "fcf"] as const) {
    for (const anios of [5, 3]) {
      const atras = n - anios * 4;
      if (atras >= 4) g ??= cagr(ttm(trimestres, campo, atras), ttm(trimestres, campo), anios);
    }
  }
  const crecimiento = g === null ? SUPUESTOS_BASE.crecimiento : clamp(g, 0, 0.12);

  let recompraNeta = 0;
  const netas = ttm(trimestres, "recomprasNetas");
  const acciones = reciente(trimestres, "acciones");
  if (netas !== null && acciones && precio) {
    recompraNeta = clamp(netas / (acciones * precio), -0.03, 0.05);
  }
  return { ...SUPUESTOS_BASE, crecimiento: redondear(crecimiento, 3), recompraNeta: redondear(recompraNeta, 3) };
}

/**
 * Flujo de caja libre base: el promedio anual de los últimos 3 años (12 trimestres),
 * o los últimos 12 meses si no hay tanta historia. Así un trimestre extraordinario
 * (una venta de activos, un año de inversión fuerte) no mueve todo el valor.
 */
export function fcfBase(trimestres: Trimestre[]): { valor: number; anios: number } | null {
  const ultimos = trimestres.slice(-12);
  if (ultimos.length === 12 && ultimos.every((t) => typeof t.fcf === "number")) {
    return { valor: ultimos.reduce((a, t) => a + t.fcf!, 0) / 3, anios: 3 };
  }
  const u = ttm(trimestres, "fcf");
  return u === null ? null : { valor: u, anios: 1 };
}

function redondear(x: number, d: number) {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

/** Valor presente de los flujos por acción: 5 años + valor terminal. */
export function descontar(fcfPorAccion: number, s: Supuestos): number {
  const g = (1 + s.crecimiento) * (1 + s.recompraNeta) - 1;
  let vp = 0;
  let flujo = fcfPorAccion;
  for (let t = 1; t <= ANIOS; t++) {
    flujo *= 1 + g;
    vp += flujo / (1 + s.descuento) ** t;
  }
  const terminal = (flujo * (1 + s.crecimientoTerminal)) / (s.descuento - s.crecimientoTerminal);
  return vp + terminal / (1 + s.descuento) ** ANIOS;
}

export function valorar(
  trimestres: Trimestre[],
  opciones: { precio?: number; sector?: string; supuestos?: Partial<Supuestos> } = {},
): Valoracion | SinModelo {
  if (opciones.sector && SECTORES_SIN_MODELO.has(opciones.sector)) {
    return { ok: false, motivo: "Bancos y aseguradoras necesitan otro modelo (su caja no mide lo mismo)." };
  }
  const base = fcfBase(trimestres);
  if (base === null) return { ok: false, motivo: "Faltan trimestres de flujo de caja libre." };
  const fcf = base.valor;
  if (fcf <= 0) {
    return { ok: false, motivo: `Su flujo de caja libre ${base.anios === 3 ? "de los últimos 3 años" : "de los últimos 12 meses"} es negativo.` };
  }
  const acciones = reciente(trimestres, "acciones");
  if (!acciones) return { ok: false, motivo: "No informa el número de acciones." };

  const supuestos = { ...supuestosPorDefecto(trimestres, opciones.precio), ...opciones.supuestos };
  if (supuestos.descuento <= supuestos.crecimientoTerminal) {
    return { ok: false, motivo: "La rentabilidad exigida debe ser mayor que el crecimiento a perpetuidad." };
  }
  const fcfPorAccion = fcf / acciones;
  const deudaNetaPorAccion = (reciente(trimestres, "deudaNeta") ?? 0) / acciones;
  const valor = descontar(fcfPorAccion, supuestos) - deudaNetaPorAccion;
  if (valor <= 0) return { ok: false, motivo: "Su deuda supera el valor de sus flujos de caja." };
  return {
    ok: true,
    valor,
    banda: { min: valor * (1 - ANCHO_BANDA), max: valor * (1 + ANCHO_BANDA) },
    fcfPorAccion,
    aniosBase: base.anios,
    deudaNetaPorAccion,
    supuestos,
  };
}

export function estado(precio: number, valor: number): Estado {
  if (precio > valor * (1 + ANCHO_BANDA)) return "cara";
  if (precio < valor * (1 - ANCHO_BANDA)) return "barata";
  return "rango";
}

export const ETIQUETA: Record<Estado, string> = { barata: "Barata", rango: "Justa", cara: "Cara" };

/** "+12%" / "−16%": diferencia entre el precio y el valor estimado. */
export function diferencia(precio: number, valor: number): string {
  const x = (precio / valor - 1) * 100;
  return `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(0)}%`;
}

/** "Hoy pagas $0,84 por cada $1 de valor que muestran sus resultados." */
export function pagasPorCadaDolar(precio: number, valor: number): string {
  return (precio / valor).toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
