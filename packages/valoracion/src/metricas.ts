/**
 * Catálogo de métricas de la ficha de empresa.
 *
 * - PRINCIPALES: las 7 que siempre se muestran.
 * - ADICIONALES: las más usadas por inversores; cada usuario elige cuáles añadir.
 *
 * Todas se calculan con los trimestres de la SEC y el precio del día, igual en
 * la web y en el móvil.
 */
import { ttm, type Trimestre } from "./index.ts";
import { cierreHasta, type Cierre } from "./grafico.ts";

export type Formato = "dinero" | "porcentaje" | "veces" | "acciones" | "dineroAccion";

export interface Contexto {
  trimestres: Trimestre[];
  precio: number | null;
}

export interface Metrica {
  id: string;
  nombre: string;
  descripcion: string;
  formato: Formato;
  /** Valor actual (normalmente últimos 12 meses). */
  valor: (c: Contexto) => number | null;
  /** Valor de cada trimestre, para el gráfico de barras (solo métricas de flujo o saldo). */
  trimestral?: (t: Trimestre) => number | null;
  /** true si un valor más alto es peor (deuda, emisión, dilución). */
  menosEsMejor?: boolean;
}

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const div = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : a / b);

function ultimo(t: Trimestre[], campo: keyof Trimestre): number | null {
  for (let i = t.length - 1; i >= Math.max(0, t.length - 4); i--) {
    const v = num(t[i][campo]);
    if (v !== null) return v;
  }
  return null;
}

const acciones = (c: Contexto) => ultimo(c.trimestres, "acciones");
const capitalizacion = (c: Contexto) => {
  const a = acciones(c);
  return c.precio && a ? c.precio * a : null;
};
/** Variación de los últimos 12 meses frente a los 12 anteriores. */
const crecimiento = (t: Trimestre[], campo: keyof Trimestre) => {
  const ahora = ttm(t, campo);
  const antes = ttm(t, campo, t.length - 4);
  return ahora === null || antes === null || antes <= 0 ? null : ahora / antes - 1;
};

const flujo = (campo: keyof Trimestre) => ({
  valor: (c: Contexto) => ttm(c.trimestres, campo),
  trimestral: (t: Trimestre) => num(t[campo]),
});

/**
 * Emisiones, recompras y dividendos: las empresas omiten la cifra en los trimestres
 * en que fue cero. Si la informan en alguno de los últimos 2 años, un trimestre sin
 * cifra cuenta como 0.
 */
const flujoOpcional = (campo: keyof Trimestre) => {
  const informa = (t: Trimestre[]) => t.slice(-8).some((q) => num(q[campo]) !== null);
  return {
    valor: (c: Contexto) => {
      const t = c.trimestres;
      if (t.length < 4 || !informa(t)) return null;
      return t.slice(-4).reduce((s, q) => s + (num(q[campo]) ?? 0), 0);
    },
    trimestral: (q: Trimestre) => num(q[campo]),
  };
};

export const PRINCIPALES: Metrica[] = [
  { id: "ventas", nombre: "Ventas", formato: "dinero", ...flujo("ventas"),
    descripcion: "Todo lo que la empresa facturó a sus clientes en los últimos 12 meses." },
  { id: "beneficios", nombre: "Beneficios", formato: "dinero", ...flujo("beneficios"),
    descripcion: "Lo que queda después de pagar todos los costos e impuestos." },
  { id: "fcf", nombre: "Flujo de caja libre", formato: "dinero", ...flujo("fcf"),
    descripcion: "Caja que generan las operaciones menos lo invertido en activos. Es la base del valor estimado." },
  { id: "emision", nombre: "Emisión de acciones", formato: "dinero", ...flujoOpcional("emision"), menosEsMejor: true,
    descripcion: "Dinero recibido por crear acciones nuevas. Diluye a los accionistas actuales." },
  { id: "recompras", nombre: "Recompras de acciones", formato: "dinero", ...flujoOpcional("recompras"),
    descripcion: "Dinero usado para comprar sus propias acciones. Cada acción restante vale una parte mayor." },
  { id: "deudaNeta", nombre: "Deuda neta", formato: "dinero", menosEsMejor: true,
    valor: (c) => ultimo(c.trimestres, "deudaNeta"), trimestral: (t) => num(t.deudaNeta),
    descripcion: "Deuda menos caja al cierre del último trimestre. Negativa = tiene más caja que deuda." },
  { id: "dividendos", nombre: "Dividendos", formato: "dinero", ...flujoOpcional("dividendos"),
    descripcion: "Dinero repartido a los accionistas en los últimos 12 meses." },
];

export const ADICIONALES: Metrica[] = [
  { id: "margenNeto", nombre: "Margen neto", formato: "porcentaje",
    valor: (c) => div(ttm(c.trimestres, "beneficios"), ttm(c.trimestres, "ventas")),
    trimestral: (t) => div(num(t.beneficios), num(t.ventas)),
    descripcion: "Cuánto de cada dólar vendido termina como beneficio." },
  { id: "margenFcf", nombre: "Margen de flujo de caja libre", formato: "porcentaje",
    valor: (c) => div(ttm(c.trimestres, "fcf"), ttm(c.trimestres, "ventas")),
    trimestral: (t) => div(num(t.fcf), num(t.ventas)),
    descripcion: "Cuánto de cada dólar vendido termina como caja libre." },
  { id: "crecVentas", nombre: "Crecimiento de ventas", formato: "porcentaje",
    valor: (c) => crecimiento(c.trimestres, "ventas"),
    descripcion: "Ventas de los últimos 12 meses frente a los 12 anteriores." },
  { id: "crecBeneficios", nombre: "Crecimiento de beneficios", formato: "porcentaje",
    valor: (c) => crecimiento(c.trimestres, "beneficios"),
    descripcion: "Beneficios de los últimos 12 meses frente a los 12 anteriores." },
  { id: "bpa", nombre: "Beneficio por acción (BPA)", formato: "dineroAccion",
    valor: (c) => div(ttm(c.trimestres, "beneficios"), acciones(c)),
    descripcion: "Beneficios de 12 meses divididos entre las acciones." },
  { id: "per", nombre: "Precio / beneficio (PER)", formato: "veces",
    valor: (c) => {
      const b = ttm(c.trimestres, "beneficios");
      return b !== null && b > 0 ? div(capitalizacion(c), b) : null;
    },
    descripcion: "Cuántos años de beneficios actuales pagas al precio de hoy." },
  { id: "pFcf", nombre: "Precio / flujo de caja libre", formato: "veces",
    valor: (c) => {
      const f = ttm(c.trimestres, "fcf");
      return f !== null && f > 0 ? div(capitalizacion(c), f) : null;
    },
    descripcion: "Cuántos años de caja libre actual pagas al precio de hoy." },
  { id: "rentDividendo", nombre: "Rentabilidad por dividendo", formato: "porcentaje",
    valor: (c) => div(ttm(c.trimestres, "dividendos"), capitalizacion(c)),
    descripcion: "Dividendos de 12 meses sobre el valor en bolsa." },
  { id: "rentRecompras", nombre: "Rentabilidad por recompras", formato: "porcentaje",
    valor: (c) => div(ttm(c.trimestres, "recomprasNetas"), capitalizacion(c)),
    descripcion: "Recompras menos emisión de 12 meses sobre el valor en bolsa." },
  { id: "rentAccionista", nombre: "Retorno total al accionista", formato: "porcentaje",
    valor: (c) => {
      const d = ttm(c.trimestres, "dividendos") ?? 0;
      const r = ttm(c.trimestres, "recomprasNetas") ?? 0;
      return div(d + r, capitalizacion(c));
    },
    descripcion: "Dividendos más recompras netas sobre el valor en bolsa." },
  { id: "deudaFcf", nombre: "Deuda neta / flujo de caja libre", formato: "veces", menosEsMejor: true,
    valor: (c) => {
      const f = ttm(c.trimestres, "fcf");
      return f !== null && f > 0 ? div(ultimo(c.trimestres, "deudaNeta"), f) : null;
    },
    descripcion: "Años de caja libre que necesitaría para pagar su deuda." },
  { id: "capitalizacion", nombre: "Capitalización", formato: "dinero",
    valor: capitalizacion,
    descripcion: "Precio de hoy por el número de acciones: lo que vale la empresa en bolsa." },
  { id: "flujoOperativo", nombre: "Flujo de caja operativo", formato: "dinero", ...flujo("flujoOperativo"),
    descripcion: "Caja que generan las operaciones antes de invertir en activos." },
  { id: "capex", nombre: "Inversión en activos (capex)", formato: "dinero", ...flujo("capex"),
    descripcion: "Lo invertido en fábricas, equipos, centros de datos…" },
  { id: "compAcciones", nombre: "Pagos en acciones", formato: "dinero", ...flujo("compAcciones"), menosEsMejor: true,
    descripcion: "Remuneración a empleados pagada con acciones. Es un costo real que diluye." },
  { id: "acciones", nombre: "Acciones (diluidas)", formato: "acciones", menosEsMejor: true,
    valor: acciones, trimestral: (t) => num(t.acciones),
    descripcion: "Número de acciones en manos de los accionistas, incluidas las que vienen de opciones." },
  { id: "dilucion", nombre: "Variación de acciones (1 año)", formato: "porcentaje", menosEsMejor: true,
    valor: (c) => {
      const t = c.trimestres;
      const ahora = ultimo(t, "acciones");
      const antes = t.length >= 5 ? ultimo(t.slice(0, -4), "acciones") : null;
      return ahora && antes ? ahora / antes - 1 : null;
    },
    descripcion: "Negativa: la empresa reduce acciones (bueno para ti). Positiva: diluye." },
  { id: "caja", nombre: "Caja", formato: "dinero",
    valor: (c) => ultimo(c.trimestres, "caja"), trimestral: (t) => num(t.caja),
    descripcion: "Caja y equivalentes al cierre del último trimestre." },
  { id: "deuda", nombre: "Deuda bruta", formato: "dinero", menosEsMejor: true,
    valor: (c) => ultimo(c.trimestres, "deuda"), trimestral: (t) => num(t.deuda),
    descripcion: "Toda la deuda financiera, sin restar la caja." },
];

export const TODAS = [...PRINCIPALES, ...ADICIONALES];
export const porId = (id: string) => TODAS.find((m) => m.id === id);

/** Últimos n valores trimestrales con su etiqueta "T3 26". */
export function serie(m: Metrica, t: Trimestre[], n = 8): { etiqueta: string; valor: number | null }[] {
  if (!m.trimestral) return [];
  return t.slice(-n).map((q) => {
    const d = new Date(`${q.periodo}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 20); // cierres de 52/53 semanas: al trimestre natural
    return { etiqueta: `T${Math.floor(d.getUTCMonth() / 3) + 1} ${String(d.getUTCFullYear()).slice(2)}`, valor: m.trimestral!(q) };
  });
}

/** Periodos que se pueden elegir en las métricas (años). Hasta 3, trimestre a trimestre; más, año a año. */
export const PERIODOS_METRICAS = [1, 2, 3, 5, 10] as const;
export type PeriodoMetricas = (typeof PERIODOS_METRICAS)[number];
export const PERIODO_POR_DEFECTO: PeriodoMetricas = 2;
export const CLAVE_PERIODO = "ancla.periodoMetricas";

export interface PuntoMetrica {
  etiqueta: string;
  /** false: la etiqueta no se muestra (hay demasiadas para el ancho), pero el punto sí. */
  visible: boolean;
  valor: number | null;
}

export interface SerieMetrica {
  puntos: PuntoMetrica[];
  modo: "trimestral" | "anual";
  /** Variación entre el primer y el último valor del periodo (solo si ambos son positivos). */
  cambio: number | null;
}

/** Trimestre natural de un cierre: "T3 26". */
function etiquetaTrimestre(periodo: string): { y: number; q: number } {
  const d = new Date(`${periodo}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 20); // cierres de 52/53 semanas: al trimestre natural
  return { y: d.getUTCFullYear(), q: Math.floor(d.getUTCMonth() / 3) + 1 };
}

/** Valor de la métrica tal como se veía al cierre del trimestre i (12 meses, con el precio de ese día). */
function valorEn(m: Metrica, t: Trimestre[], i: number, precios: Cierre[] | undefined, precioHoy: number | null): number | null {
  const ultimo = i === t.length - 1;
  const precio = ultimo ? precioHoy : precios ? cierreHasta(precios, t[i].periodo) : null;
  return m.valor({ trimestres: t.slice(0, i + 1), precio });
}

/**
 * Serie de una métrica para el periodo elegido.
 * - 1 a 3 años: cada trimestre (el valor del trimestre si la métrica lo tiene; si no,
 *   el de los 12 meses hasta ese trimestre, p. ej. márgenes o PER).
 * - 5 o 10 años: un punto por año (los 12 meses hasta el último trimestre de cada año)
 *   y el último punto, "hoy", con los 12 meses más recientes.
 * Las métricas que dependen del precio usan el cierre de cada fecha (`precios`).
 */
export function serieMetrica(m: Metrica, t: Trimestre[], anios: number,
  opciones: { precios?: Cierre[]; precio?: number | null } = {}): SerieMetrica {
  const precioHoy = opciones.precio ?? null;
  let puntos: PuntoMetrica[];
  let modo: SerieMetrica["modo"];
  if (anios <= 3) {
    modo = "trimestral";
    const desde = Math.max(0, t.length - anios * 4);
    puntos = t.slice(desde).map((q, k) => {
      const { y, q: n } = etiquetaTrimestre(q.periodo);
      const valor = m.trimestral ? m.trimestral(q) : valorEn(m, t, desde + k, opciones.precios, precioHoy);
      return { etiqueta: `T${n} ${String(y).slice(2)}`, visible: true, valor };
    });
  } else {
    modo = "anual";
    // Último trimestre de cada año natural, más el último disponible.
    const porAnio = new Map<number, number>();
    t.forEach((q, i) => porAnio.set(etiquetaTrimestre(q.periodo).y, i));
    const indices = [...porAnio.values()];
    if (indices.at(-1) !== t.length - 1) indices.push(t.length - 1);
    const elegidos = indices.slice(-(anios + 1));
    puntos = elegidos.map((i, k) => ({
      etiqueta: k === elegidos.length - 1 ? "Hoy" : String(etiquetaTrimestre(t[i].periodo).y),
      visible: true,
      valor: valorEn(m, t, i, opciones.precios, precioHoy),
    }));
    // Si el año en curso ya cerró su último trimestre, "Hoy" y ese año coinciden: se deja "Hoy".
    if (puntos.length > 1 && elegidos.at(-1) === elegidos.at(-2)) puntos.splice(-2, 1);
  }
  // Con muchas etiquetas se muestra una de cada dos (siempre la última).
  if (puntos.length > 8) puntos.forEach((p, i) => { p.visible = (puntos.length - 1 - i) % 2 === 0; });
  const conValor = puntos.filter((p) => p.valor !== null);
  const a = conValor[0]?.valor ?? null, b = conValor.at(-1)?.valor ?? null;
  const cambio = conValor.length > 1 && a !== null && b !== null && a > 0 && b > 0 ? b / a - 1 : null;
  return { puntos, modo, cambio };
}

/** Formato para mostrar un valor de métrica. */
export function mostrar(x: number | null, f: Formato): string {
  if (x === null || !Number.isFinite(x)) return "—";
  const n = (v: number, d: number) => v.toLocaleString("es", { minimumFractionDigits: d, maximumFractionDigits: d });
  const a = Math.abs(x);
  const s = x < 0 ? "−" : "";
  switch (f) {
    case "porcentaje": return `${s}${n(a * 100, 1)} %`;
    case "veces": return `${s}${n(a, 1)}x`;
    case "dineroAccion": return `${s}$${n(a, 2)}`;
    case "acciones":
      return a >= 1e9 ? `${n(a / 1e9, 2)} mil M` : `${n(a / 1e6, 0)} M`;
    case "dinero":
    default:
      if (a >= 1e12) return `${s}$${n(a / 1e12, 2)} B`;
      if (a >= 1e9) return `${s}$${n(a / 1e9, 1)} mil M`;
      if (a >= 1e6) return `${s}$${n(a / 1e6, 0)} M`;
      return `${s}$${n(a, 0)}`;
  }
}

export const CLAVE_GUARDADO = "ancla.metricasExtra";
export const EXTRA_POR_DEFECTO: string[] = [];

export interface GeometriaLinea {
  /** Un punto por trimestre, en % del ancho y del alto (0 = arriba); null si falta el dato. */
  puntos: ({ x: number; y: number } | null)[];
  /** Altura (%) de la línea de cero, si la serie tiene valores negativos. */
  cero: number | null;
  /** Tramos continuos de la línea ("M x y L x y …", en unidades 0-100). */
  tramos: string[];
  /** Relleno bajo la línea, hasta el cero o hasta la base. */
  areas: string[];
}

/**
 * Geometría de un gráfico de línea para n valores trimestrales. Cada punto queda en
 * el centro de su columna (x = (i + 0,5) / n), igual que las etiquetas de debajo.
 */
export function geometriaLinea(valores: (number | null)[], margen = 10): GeometriaLinea {
  const n = valores.length;
  const nums = valores.filter((v): v is number => v !== null);
  if (!n || !nums.length) return { puntos: valores.map(() => null), cero: null, tramos: [], areas: [] };
  const negativos = nums.some((v) => v < 0);
  let lo = Math.min(...nums, negativos ? 0 : Infinity);
  let hi = Math.max(...nums, negativos ? 0 : -Infinity);
  if (!negativos) lo = Math.min(lo, hi * 0.6); // sin negativos, no exagerar variaciones pequeñas
  if (hi === lo) { hi += 1; lo -= 1; }
  const y = (v: number) => margen + (1 - (v - lo) / (hi - lo)) * (100 - 2 * margen);
  const puntos = valores.map((v, i) => (v === null ? null : { x: ((i + 0.5) / n) * 100, y: y(v) }));
  const base = negativos ? y(0) : 100;

  const tramos: string[] = [];
  const areas: string[] = [];
  let actual: { x: number; y: number }[] = [];
  const cerrar = () => {
    if (actual.length > 1) {
      const d = actual.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
      tramos.push(d);
      areas.push(`${d} L ${actual.at(-1)!.x.toFixed(2)} ${base.toFixed(2)} L ${actual[0].x.toFixed(2)} ${base.toFixed(2)} Z`);
    }
    actual = [];
  };
  for (const p of puntos) {
    if (p) actual.push(p); else cerrar();
  }
  cerrar();
  return { puntos, cero: negativos ? y(0) : null, tramos, areas };
}
