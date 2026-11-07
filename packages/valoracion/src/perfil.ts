/**
 * "Datos clave" de una empresa: lo que más se mira al investigar una acción.
 * Se calcula con los mismos trimestres y precios que el resto de la ficha.
 */
import { ttm, type Trimestre } from "./index.ts";
import type { Cierre } from "./grafico.ts";

export interface DatosClave {
  capitalizacion: number | null;    // precio × acciones
  per: number | null;               // precio / beneficio por acción (12 meses); null si hay pérdidas
  rentabilidadDividendo: number | null;
  rango52: { min: number; max: number; posicion: number } | null;  // posición: 0 = mínimo, 1 = máximo
  beta: number | null;              // sensibilidad frente al S&P 500 (2 años, semanal)
  acciones: number | null;
}

/** Perfil descriptivo (Wikipedia, Wikidata y SEC), tal como lo guarda `ingesta.perfil`. */
export interface Perfil {
  descripcion?: { texto: string; idioma: string; fuente: string } | null;
  fundacion?: string | null;
  empleados?: number | null;
  ceo?: string | null;
  sede?: string | null;
  web?: string | null;
  industria?: string | null;
  bolsas?: string[];
  cierreFiscal?: string | null;     // "0926"
  ingresos?: Partial<Record<"segmentos" | "productos" | "regiones", { nombre: string; valor: number }[]>>;
  ingresosAnio?: string;
  ingresosFuente?: string;
}

function ultimo(t: Trimestre[], campo: keyof Trimestre): number | null {
  for (let i = t.length - 1; i >= Math.max(0, t.length - 4); i--) {
    const v = t[i][campo];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/** Rendimientos semanales emparejados por fecha. */
function rendimientos(a: Cierre[], b: Cierre[]): [number[], number[]] {
  const mapa = new Map(b.map((c) => [c.fecha.slice(0, 10), c.cierre]));
  const x: number[] = [], y: number[] = [];
  let prev: [number, number] | null = null;
  for (const c of a) {
    const r = mapa.get(c.fecha.slice(0, 10));
    if (r === undefined) { prev = null; continue; }
    if (prev) { x.push(c.cierre / prev[0] - 1); y.push(r / prev[1] - 1); }
    prev = [c.cierre, r];
  }
  return [x, y];
}

export function beta(precios: Cierre[], spy: Cierre[], semanas = 104): number | null {
  const [x, y] = rendimientos(precios.slice(-(semanas + 1)), spy);
  if (x.length < semanas / 2) return null;
  const mx = x.reduce((s, v) => s + v, 0) / x.length, my = y.reduce((s, v) => s + v, 0) / y.length;
  let cov = 0, vary = 0;
  for (let i = 0; i < x.length; i++) { cov += (x[i] - mx) * (y[i] - my); vary += (y[i] - my) ** 2; }
  return vary > 0 ? cov / vary : null;
}

export function datosClave(t: Trimestre[], precios: Cierre[], spy: Cierre[], precio: number | null, hoy = new Date()): DatosClave {
  const acciones = ultimo(t, "acciones");
  const cap = precio && acciones ? precio * acciones : null;
  const beneficios = ttm(t, "beneficios");
  const dividendos = ttm(t, "dividendos");
  const per = cap && beneficios && beneficios > 0 ? cap / beneficios : null;

  const desde = new Date(hoy.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
  const anio = [...precios.filter((c) => c.fecha >= desde).map((c) => c.cierre), ...(precio ? [precio] : [])];
  let rango52: DatosClave["rango52"] = null;
  if (anio.length >= 10) {
    const min = Math.min(...anio), max = Math.max(...anio);
    rango52 = { min, max, posicion: precio && max > min ? (precio - min) / (max - min) : 0.5 };
  }
  return {
    capitalizacion: cap,
    per,
    rentabilidadDividendo: cap && dividendos !== null && dividendos > 0 ? dividendos / cap : cap ? 0 : null,
    rango52,
    beta: beta(precios, spy),
    acciones,
  };
}

/** "Sept" a partir de "0926" (cierre del año fiscal). */
export function mesCierre(mmdd: string | null | undefined): string | null {
  if (!mmdd || mmdd.length !== 4) return null;
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return meses[Number(mmdd.slice(0, 2)) - 1] ?? null;
}

/** Las mayores partes con su porcentaje; el resto se agrupa en "Otros". */
export function partes(lista: { nombre: string; valor: number }[] | undefined, max = 6): { nombre: string; valor: number; pct: number }[] {
  if (!lista?.length) return [];
  const total = lista.reduce((s, p) => s + p.valor, 0);
  const orden = [...lista].sort((a, b) => b.valor - a.valor);
  const top = orden.length > max ? orden.slice(0, max - 1) : orden;
  const resto = orden.slice(top.length).reduce((s, p) => s + p.valor, 0);
  const out = top.map((p) => ({ ...p, pct: p.valor / total }));
  if (resto > 0) out.push({ nombre: "Otros", valor: resto, pct: resto / total });
  return out;
}

/** Explicación corta de la beta. */
export function textoBeta(b: number): string {
  if (b < 0.5) return "se mueve poco con la bolsa";
  if (b < 0.9) return "algo más tranquila que la bolsa";
  if (b <= 1.1) return "se mueve como la bolsa";
  if (b <= 1.5) return "algo más movida que la bolsa";
  return "mucho más movida que la bolsa";
}

/** "$254 mil M", "$950 M": montos de ventas en palabras cortas. */
export function monto(x: number): string {
  const n = (v: number, d: number) => v.toLocaleString("es", { maximumFractionDigits: d });
  if (x >= 1e12) return `$${n(x / 1e12, 2)} billones`;
  if (x >= 1e9) return `$${n(x / 1e9, x >= 1e11 ? 0 : 1)} mil M`;
  if (x >= 1e6) return `$${n(x / 1e6, 0)} M`;
  return `$${n(x, 0)}`;
}

/**
 * Resumen en una frase: "Apple vendió $479 mil M en su año fiscal 2026: $254 mil M en iPhone,
 * $123 mil M en Servicios, $37,9 mil M en Mac y $63,5 mil M en el resto."
 */
export function fraseIngresos(nombre: string, lista: { nombre: string; valor: number }[] | undefined, anio?: string): string | null {
  const p = partes(lista, 4);
  if (p.length < 2) return null;
  const total = p.reduce((s, x) => s + x.valor, 0);
  const trozos = p.map((x) => (x.nombre === "Otros" ? `${monto(x.valor)} en el resto` : `${monto(x.valor)} en ${x.nombre}`));
  const texto = `${trozos.slice(0, -1).join(", ")} y ${trozos.at(-1)}`;
  return `${nombre} vendió ${monto(total)}${anio ? ` en su año fiscal ${anio}` : " en su último año"}: ${texto}.`;
}
