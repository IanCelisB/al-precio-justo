/**
 * Ejes de los gráficos interactivos: escala vertical con números "redondos" y
 * marcas de tiempo (meses o años según el periodo). Igual en la web y el móvil.
 */

/** Paso "redondo" (1, 2, 2,5 o 5 × 10^n) para unas `marcas` divisiones del rango. */
export function pasoRedondo(rango: number, marcas: number): number {
  if (!(rango > 0)) return 1;
  const bruto = rango / Math.max(1, marcas);
  const p = 10 ** Math.floor(Math.log10(bruto));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= bruto - 1e-12) return m * p;
  return 10 * p;
}

export interface Escala {
  lo: number;
  hi: number;
  paso: number;
  marcas: number[];
}

/**
 * Escala vertical que contiene los valores, con unas `marcas` líneas (6 por defecto).
 * Sin negativos, parte de cero solo si `desdeCero`; con negativos, el cero siempre se ve.
 */
export function escala(valores: number[], opciones: { marcas?: number; desdeCero?: boolean; margen?: number } = {}): Escala {
  const nums = valores.filter((v) => Number.isFinite(v));
  const n = opciones.marcas ?? 6;
  if (!nums.length) return { lo: 0, hi: 1, paso: 0.25, marcas: [0, 0.25, 0.5, 0.75, 1] };
  let lo = Math.min(...nums), hi = Math.max(...nums);
  if (opciones.desdeCero || lo < 0) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (hi === lo) { const d = Math.abs(hi) * 0.1 || 1; hi += d; lo -= d; }
  const margen = (hi - lo) * (opciones.margen ?? 0.04);
  if (!(lo === 0 && opciones.desdeCero)) lo -= margen;
  hi += margen;
  if (lo < 0 && Math.min(...nums) >= 0) lo = 0; // sin negativos, el eje no baja de cero
  const paso = pasoRedondo(hi - lo, n);
  lo = Math.floor(lo / paso + 1e-9) * paso;
  hi = Math.ceil(hi / paso - 1e-9) * paso;
  const marcas: number[] = [];
  for (let v = lo; v <= hi + paso / 2; v += paso) marcas.push(Math.round(v / paso) * paso);
  return { lo, hi, paso, marcas };
}

export const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "12 mar 2026" a partir de una fecha ISO. */
export function fechaEje(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${a}`;
}

export interface MarcaTiempo { t: number; texto: string }

/**
 * Marcas del eje de tiempo entre t0 y t1 (milisegundos): meses ("mar 26") en periodos
 * cortos y años en los largos, como mucho `max` marcas.
 */
export function marcasTiempo(t0: number, t1: number, max = 6): MarcaTiempo[] {
  if (!(t1 > t0)) return [];
  const dias = (t1 - t0) / 86_400_000;
  const out: MarcaTiempo[] = [];
  const d0 = new Date(t0);
  if (dias <= 800) {
    const meses = dias / 30.44;
    const cada = [1, 2, 3, 4, 6, 12].find((k) => meses / k <= max) ?? 12;
    let y = d0.getUTCFullYear(), m = d0.getUTCMonth() + 1;
    if (m > 11) { m = 0; y++; }
    for (;;) {
      const t = Date.UTC(y, m, 1);
      if (t > t1) break;
      if (m % cada === 0) out.push({ t, texto: `${MESES[m]} ${String(y).slice(2)}` });
      m++; if (m > 11) { m = 0; y++; }
    }
  } else {
    const anios = dias / 365.25;
    const cada = [1, 2, 5, 10].find((k) => anios / k <= max) ?? 10;
    for (let y = d0.getUTCFullYear() + 1; ; y++) {
      const t = Date.UTC(y, 0, 1);
      if (t > t1) break;
      if (y % cada === 0) out.push({ t, texto: String(y) });
    }
  }
  return out;
}

/** Índice del punto más cercano a `x` en una lista ordenada (búsqueda binaria). */
export function masCercano(xs: number[], x: number): number {
  if (!xs.length) return -1;
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (xs[m] <= x) lo = m; else hi = m;
  }
  return Math.abs(xs[hi] - x) < Math.abs(xs[lo] - x) ? hi : lo;
}

/** Texto corto para una marca del eje vertical: 1.200, 2,5, 50 mil M… */
export function textoEje(v: number, paso: number, prefijo = "", sufijo = ""): string {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  const n = (x: number, d: number) => x.toLocaleString("es", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: "always" });
  const dec = (p: number) => (p >= 1 ? 0 : p >= 0.1 ? 1 : 2);
  if (a >= 1e12 || paso >= 1e12) return `${s}${prefijo}${n(a / 1e12, dec(paso / 1e12))} B${sufijo}`;
  if (a >= 1e9 || paso >= 1e9) return `${s}${prefijo}${n(a / 1e9, dec(paso / 1e9))} mil M${sufijo}`;
  if (a >= 1e6 || paso >= 1e6) return `${s}${prefijo}${n(a / 1e6, dec(paso / 1e6))} M${sufijo}`;
  return `${s}${prefijo}${n(a, dec(paso))}${sufijo}`;
}
