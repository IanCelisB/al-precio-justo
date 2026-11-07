/**
 * Gráfico "precio frente a la banda de valor" y "Tu modelo".
 *
 * historialValor: el valor estimado en cada momento del pasado, usando solo los
 * reportes que ya se conocían entonces (cada trimestre se publica ~45 días después
 * de su cierre). geometriaValor: el dibujo en un lienzo 0-100, igual en web y móvil.
 */
import { ANCHO_BANDA, estado, valorar, type Estado, type Supuestos, type Trimestre } from "./index.ts";
import { divisaActual } from "./formato.ts";

/** Días entre el cierre de un trimestre y su presentación a la SEC (aprox.). */
export const RETRASO_REPORTE = 45;

export interface Cierre { fecha: string; cierre: number }
export interface PuntoValor { fecha: string; valor: number | null; min: number | null; max: number | null }

const DIA = 86_400_000;
const t = (fecha: string) => Date.parse(fecha.slice(0, 10) + "T00:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Último cierre en o antes de la fecha (búsqueda binaria; `cierres` ordenados). */
export function cierreHasta(cierres: Cierre[], fecha: string): number | null {
  let lo = 0, hi = cierres.length - 1, r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (cierres[m].fecha <= fecha) { r = m; lo = m + 1; } else hi = m - 1;
  }
  return r < 0 ? null : cierres[r].cierre;
}

/**
 * Valor estimado tras cada reporte. Cada punto vale desde su fecha hasta el siguiente.
 * Con `supuestos` (Tu modelo) se aplican a todo el historial; lo que no se fije sale
 * de la historia de la empresa en ese momento, como en la valoración de hoy.
 */
export function historialValor(
  trimestres: Trimestre[],
  cierres: Cierre[],
  opciones: { sector?: string; supuestos?: Partial<Supuestos> } = {},
): PuntoValor[] {
  const puntos: PuntoValor[] = [];
  for (let i = 4; i <= trimestres.length; i++) {
    const fecha = iso(t(trimestres[i - 1].periodo) + RETRASO_REPORTE * DIA);
    const precio = cierreHasta(cierres, fecha) ?? undefined;
    const v = valorar(trimestres.slice(0, i), { precio, sector: opciones.sector, supuestos: opciones.supuestos });
    const p: PuntoValor = v.ok
      ? { fecha, valor: v.valor, min: v.banda.min, max: v.banda.max }
      : { fecha, valor: null, min: null, max: null };
    // Dos trimestres que se publican el mismo día (no debería pasar): gana el último.
    if (puntos.at(-1)?.fecha === fecha) puntos[puntos.length - 1] = p; else puntos.push(p);
  }
  return puntos;
}

/** Valor vigente en una fecha (el del último reporte publicado). */
export function valorEn(historial: PuntoValor[], fecha: string): PuntoValor | null {
  let r: PuntoValor | null = null;
  for (const p of historial) { if (p.fecha <= fecha) r = p; else break; }
  return r;
}

export interface Marca { pos: number; texto: string }

export interface GeometriaValor {
  bandas: string[];          // polígonos de la banda (uno por tramo con valor)
  centro: string[];          // línea del valor estimado (punteada)
  precio: string;            // línea del precio
  fin: { x: number; y: number } | null;  // último precio
  marcasY: Marca[];          // pos en 0-100 desde arriba
  marcasX: Marca[];          // años, pos en 0-100 desde la izquierda
  /** Proporción de semanas con valor en que el precio estuvo barato / en rango / caro. */
  tiempo: Record<Estado, number> | null;
  /** Proporción de las semanas del periodo que tienen valor estimado. */
  cobertura: number;
}

/** Número "redondo" para las marcas del eje: 1, 2, 2,5 o 5 × 10^n. */
function paso(rango: number, marcas: number): number {
  const bruto = rango / marcas;
  const p = 10 ** Math.floor(Math.log10(bruto));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= bruto) return m * p;
  return 10 * p;
}

/**
 * Dibujo del gráfico desde `desde` hasta el último cierre.
 * Si el valor se dispara (p. ej. un año de caja extraordinaria), el eje se corta en
 * 2,5 veces el precio máximo para que la línea del precio siga legible.
 */
export function geometriaValor(cierres: Cierre[], historial: PuntoValor[], desde: string): GeometriaValor | null {
  const cs = cierres.filter((c) => c.fecha >= desde && c.cierre > 0);
  if (cs.length < 2) return null;
  const x0 = t(cs[0].fecha), x1 = t(cs.at(-1)!.fecha);
  const fin = cs.at(-1)!.fecha;

  // Tramos de valor dentro de la ventana; el vigente al inicio arranca en `desde`.
  const vigente = valorEn(historial, cs[0].fecha);
  const tramos = [
    ...(vigente ? [{ ...vigente, fecha: cs[0].fecha }] : []),
    ...historial.filter((p) => p.fecha > cs[0].fecha && p.fecha <= fin),
  ];

  const maxPrecio = Math.max(...cs.map((c) => c.cierre));
  const minPrecio = Math.min(...cs.map((c) => c.cierre));
  const conValor = tramos.filter((p) => p.valor !== null);
  const techo = maxPrecio * 2.5;
  let hi = Math.max(maxPrecio, ...conValor.map((p) => Math.min(p.max!, techo)));
  let lo = Math.min(minPrecio, ...conValor.map((p) => p.min!));
  const margen = (hi - lo) * 0.06;
  hi += margen;
  lo = Math.max(0, lo - margen);

  const X = (fecha: string) => ((t(fecha) - x0) / (x1 - x0 || 1)) * 100;
  const Y = (v: number) => 100 - ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * 100;
  const f = (n: number) => Math.round(n * 100) / 100;

  // Banda y centro como escalones: cada valor dura hasta el siguiente reporte.
  const bandas: string[] = [];
  const centro: string[] = [];
  let tramo: { x: number; min: number; max: number; valor: number }[] = [];
  const cerrar = (xFin: number) => {
    if (!tramo.length) return;
    const escalon = (k: "max" | "valor") =>
      tramo.map((p, i) => (i ? `H${f(p.x)} V${f(Y(p[k]))}` : `M${f(p.x)} ${f(Y(p[k]))}`)).join(" ") + ` H${f(xFin)}`;
    const abajo = [...tramo].reverse().map((p) => `V${f(Y(p.min))} H${f(p.x)}`).join(" ");
    bandas.push(`${escalon("max")} ${abajo} Z`);
    centro.push(escalon("valor"));
    tramo = [];
  };
  for (const p of tramos) {
    const x = X(p.fecha);
    if (p.valor === null) cerrar(x);
    else tramo.push({ x, min: p.min!, max: p.max!, valor: p.valor });
  }
  cerrar(100);

  const precio = cs.map((c, i) => `${i ? "L" : "M"}${f(X(c.fecha))} ${f(Y(c.cierre))}`).join(" ");

  const dp = paso(hi - lo, 3);
  const marcasY: Marca[] = [];
  const dv = divisaActual();
  for (let v = Math.ceil(lo / dp) * dp; v <= hi; v += dp) {
    marcasY.push({ pos: f(Y(v)), texto: `${dv.simbolo}${Math.round(v * dv.porUsd).toLocaleString("es", { useGrouping: "always" })}` });
  }

  const marcasX: Marca[] = [];
  const a0 = new Date(x0).getUTCFullYear() + 1, a1 = new Date(x1).getUTCFullYear();
  const cada = Math.max(1, Math.ceil((a1 - a0 + 1) / 5));
  for (let a = a0; a <= a1; a += cada) {
    const pos = X(`${a}-01-01`);
    if (pos > 4 && pos < 96) marcasX.push({ pos: f(pos), texto: String(a) });
  }

  const cuenta: Record<Estado, number> = { barata: 0, rango: 0, cara: 0 };
  let n = 0;
  for (const c of cs) {
    const v = valorEn(historial, c.fecha);
    if (v?.valor) { cuenta[estado(c.cierre, v.valor)]++; n++; }
  }
  const tiempo = n ? { barata: cuenta.barata / n, rango: cuenta.rango / n, cara: cuenta.cara / n } : null;

  return { bandas, centro, precio, fin: { x: 100, y: f(Y(cs.at(-1)!.cierre)) }, marcasY, marcasX, tiempo, cobertura: n / cs.length };
}

/** Controles de "Tu modelo": límites, paso y texto de cada supuesto. */
export const CONTROLES: { id: keyof Supuestos; nombre: string; ayuda: string; min: number; max: number; paso: number }[] = [
  { id: "crecimiento", nombre: "Crecimiento", ayuda: "del flujo de caja, cada año durante 5 años", min: -0.05, max: 0.25, paso: 0.005 },
  { id: "descuento", nombre: "Rentabilidad exigida", ayuda: "lo que quieres ganar al año", min: 0.05, max: 0.15, paso: 0.005 },
  { id: "crecimientoTerminal", nombre: "Crecimiento a perpetuidad", ayuda: "después de los 5 años", min: 0, max: 0.04, paso: 0.0025 },
  { id: "recompraNeta", nombre: "Recompra neta", ayuda: "% de acciones que recompra cada año", min: -0.03, max: 0.06, paso: 0.0025 },
];

/** Ajusta un supuesto a sus límites y a su paso (evita 0,30000000004). */
export function ajustar(id: keyof Supuestos, x: number): number {
  const c = CONTROLES.find((k) => k.id === id)!;
  const v = Math.min(c.max, Math.max(c.min, Math.round(x / c.paso) * c.paso));
  return Math.round(v * 10_000) / 10_000;
}

export const CLAVE_MODELO = (ticker: string) => `ancla.modelo.${ticker}`;
export { ANCHO_BANDA };
