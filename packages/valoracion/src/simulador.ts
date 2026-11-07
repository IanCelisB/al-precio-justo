/**
 * Simulador de inversión con dinero ficticio y precios reales.
 *
 * - Cartera: 30.000 USD ficticios. Compras por importe (acciones fraccionadas),
 *   ventas por número de acciones, al precio del momento. Sin comisiones.
 * - Máquina del tiempo: "si hubieras invertido X en tal fecha", con cierres reales.
 *
 * Todo es cálculo puro: la API guarda las operaciones y pone los precios.
 */

export const SALDO_INICIAL = 30_000;
export const MINIMO_OPERACION = 1;
export const REFERENCIA = "SPY"; // S&P 500

export type TipoOperacion = "compra" | "venta";

export interface Operacion {
  ticker: string;
  tipo: TipoOperacion;
  acciones: number;
  precio: number;
  importe: number;     // acciones × precio
  fecha: string;       // ISO
}

export interface Posicion {
  ticker: string;
  acciones: number;
  costeMedio: number;
  invertido: number;   // coste de las acciones que siguen en cartera
  precio: number | null;
  valor: number | null;
  ganancia: number | null;
  gananciaPct: number | null;
}

export interface Resumen {
  inicial: number;
  efectivo: number;
  valorPosiciones: number;
  valorTotal: number;
  ganancia: number;          // valor total − saldo inicial
  gananciaPct: number;
  realizada: number;         // de lo ya vendido
  latente: number;           // de lo que sigue en cartera
  posiciones: Posicion[];
}

const redondear = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
export const ACCIONES_DECIMALES = 6;

/** Estado de cada posición por coste medio, y la ganancia realizada con las ventas. */
export function libro(ops: Operacion[]): { abiertas: Map<string, { acciones: number; coste: number }>; realizada: number } {
  const abiertas = new Map<string, { acciones: number; coste: number }>();
  let realizada = 0;
  for (const o of [...ops].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const p = abiertas.get(o.ticker) ?? { acciones: 0, coste: 0 };
    if (o.tipo === "compra") {
      p.acciones += o.acciones;
      p.coste += o.importe;
    } else {
      const medio = p.acciones > 0 ? p.coste / p.acciones : 0;
      realizada += o.importe - medio * o.acciones;
      p.coste -= medio * o.acciones;
      p.acciones -= o.acciones;
    }
    if (p.acciones <= 1e-9) abiertas.delete(o.ticker);
    else abiertas.set(o.ticker, p);
  }
  return { abiertas, realizada };
}

export function efectivo(ops: Operacion[], inicial = SALDO_INICIAL): number {
  return ops.reduce((c, o) => c + (o.tipo === "compra" ? -o.importe : o.importe), inicial);
}

export function resumen(ops: Operacion[], precios: Record<string, number | null | undefined>, inicial = SALDO_INICIAL): Resumen {
  const { abiertas, realizada } = libro(ops);
  const posiciones: Posicion[] = [...abiertas.entries()].map(([ticker, p]) => {
    const precio = precios[ticker] ?? null;
    const valor = precio !== null ? p.acciones * precio : null;
    return {
      ticker, acciones: p.acciones, costeMedio: p.coste / p.acciones, invertido: p.coste, precio, valor,
      ganancia: valor !== null ? valor - p.coste : null,
      gananciaPct: valor !== null && p.coste > 0 ? valor / p.coste - 1 : null,
    };
  }).sort((a, b) => (b.valor ?? b.invertido) - (a.valor ?? a.invertido));
  const caja = efectivo(ops, inicial);
  // Sin precio, una posición se valora a su coste (no inventa ganancias ni pérdidas).
  const valorPosiciones = posiciones.reduce((s, p) => s + (p.valor ?? p.invertido), 0);
  const valorTotal = caja + valorPosiciones;
  return {
    inicial, efectivo: caja, valorPosiciones, valorTotal,
    ganancia: valorTotal - inicial, gananciaPct: valorTotal / inicial - 1,
    realizada, latente: posiciones.reduce((s, p) => s + (p.ganancia ?? 0), 0), posiciones,
  };
}

/** Prepara una compra por importe. Devuelve la operación o el motivo por el que no se puede. */
export function prepararCompra(ops: Operacion[], ticker: string, importe: number, precio: number | null, fecha: string,
  inicial = SALDO_INICIAL): Operacion | string {
  if (!precio || precio <= 0) return "No tenemos precio para esta empresa ahora mismo.";
  if (!Number.isFinite(importe) || importe < MINIMO_OPERACION) return `El mínimo es $${MINIMO_OPERACION}.`;
  const caja = efectivo(ops, inicial);
  if (importe > caja + 1e-6) return `No te alcanza: tienes $${caja.toFixed(2)} disponibles.`;
  const acciones = redondear(importe / precio, ACCIONES_DECIMALES);
  return { ticker, tipo: "compra", acciones, precio, importe: redondear(acciones * precio, 2), fecha };
}

/** Prepara una venta de acciones (o de todo, si acciones es null). */
export function prepararVenta(ops: Operacion[], ticker: string, acciones: number | null, precio: number | null,
  fecha: string): Operacion | string {
  if (!precio || precio <= 0) return "No tenemos precio para esta empresa ahora mismo.";
  const p = libro(ops).abiertas.get(ticker);
  if (!p) return "No tienes acciones de esta empresa.";
  const n = acciones === null ? p.acciones : redondear(acciones, ACCIONES_DECIMALES);
  if (!(n > 0)) return "Indica cuántas acciones vender.";
  if (n > p.acciones + 1e-9) return `Solo tienes ${p.acciones.toFixed(4)} acciones.`;
  return { ticker, tipo: "venta", acciones: n, precio, importe: redondear(n * precio, 2), fecha };
}

export interface Cierre { fecha: string; cierre: number }

/** Último cierre en o antes de una fecha (búsqueda binaria sobre cierres ordenados). */
export function cierreEn(cierres: Cierre[], fecha: string): number | null {
  let lo = 0, hi = cierres.length - 1, r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (cierres[m].fecha <= fecha) { r = m; lo = m + 1; } else hi = m - 1;
  }
  return r >= 0 ? cierres[r].cierre : null;
}

/**
 * Valor de la cartera al cierre de cada día desde la primera operación, y lo que
 * habría valido la misma cantidad invertida en el S&P 500 (SPY) el mismo día.
 */
export function curva(ops: Operacion[], cierres: Record<string, Cierre[]>, calendario: string[], inicial = SALDO_INICIAL)
  : { fecha: string; valor: number; referencia: number | null }[] {
  if (!ops.length) return [];
  const orden = [...ops].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const inicio = orden[0].fecha.slice(0, 10);
  const spy = cierres[REFERENCIA] ?? [];
  const spyInicio = cierreEn(spy, inicio);
  const dias = calendario.filter((d) => d >= inicio);
  // El día de la primera operación y hoy siempre están, aunque el mercado aún no haya cerrado.
  if (!dias.length || dias[0] > inicio) dias.unshift(inicio);
  const hoy = new Date().toISOString().slice(0, 10);
  if (dias.at(-1)! < hoy) dias.push(hoy);
  return dias.map((dia) => {
    const hasta = orden.filter((o) => o.fecha.slice(0, 10) <= dia);
    const { abiertas } = libro(hasta);
    let valor = efectivo(hasta, inicial);
    for (const [t, p] of abiertas) valor += p.acciones * (cierreEn(cierres[t] ?? [], dia) ?? p.coste / p.acciones);
    const s = cierreEn(spy, dia);
    return { fecha: dia, valor, referencia: spyInicio && s ? inicial * (s / spyInicio) : null };
  });
}

export interface ResultadoTiempo {
  fechaCompra: string;
  precioCompra: number;
  acciones: number;
  valorHoy: number;
  ganancia: number;
  gananciaPct: number;
  referenciaHoy: number | null;   // misma inversión en el S&P 500
  serie: { fecha: string; valor: number; referencia: number | null }[];
}

/** "Si hubieras invertido `importe` el `desde`": compra al primer cierre disponible desde esa fecha. */
export function maquinaDelTiempo(importe: number, cierres: Cierre[], desde: string, spy: Cierre[] = [], puntos = 60)
  : ResultadoTiempo | null {
  const i = cierres.findIndex((c) => c.fecha >= desde);
  if (i < 0 || importe <= 0) return null;
  const compra = cierres[i];
  const acciones = importe / compra.cierre;
  const spy0 = cierreEn(spy, compra.fecha);
  const tramo = cierres.slice(i);
  const paso = Math.max(1, Math.floor(tramo.length / puntos));
  const elegidos = tramo.filter((_, k) => k % paso === 0 || k === tramo.length - 1);
  const serie = elegidos.map((c) => {
    const s = cierreEn(spy, c.fecha);
    return { fecha: c.fecha, valor: acciones * c.cierre, referencia: spy0 && s ? importe * (s / spy0) : null };
  });
  const fin = tramo.at(-1)!;
  const valorHoy = acciones * fin.cierre;
  return {
    fechaCompra: compra.fecha, precioCompra: compra.cierre, acciones, valorHoy,
    ganancia: valorHoy - importe, gananciaPct: valorHoy / importe - 1,
    referenciaHoy: serie.at(-1)?.referencia ?? null, serie,
  };
}

/**
 * Trazos de varias series sobre la misma escala (unidades 0-100, y = 0 arriba),
 * para comparar la cartera con el S&P 500. Devuelve un path por serie y su último punto.
 */
export function trazosComparados(series: (number | null)[][], margen = 8)
  : { d: string; fin: { x: number; y: number } | null }[] {
  const todos = series.flat().filter((v): v is number => v !== null && Number.isFinite(v));
  if (!todos.length) return series.map(() => ({ d: "", fin: null }));
  let lo = Math.min(...todos), hi = Math.max(...todos);
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  return series.map((s) => {
    const n = s.length;
    let d = "";
    let fin: { x: number; y: number } | null = null;
    let abierto = false;
    s.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) { abierto = false; return; }
      const x = n === 1 ? 50 : (i / (n - 1)) * 100;
      const y = margen + (1 - (v - lo) / (hi - lo)) * (100 - 2 * margen);
      d += `${abierto ? "L" : "M"} ${x.toFixed(2)} ${y.toFixed(2)} `;
      abierto = true;
      fin = { x, y };
    });
    return { d: d.trim(), fin };
  });
}
