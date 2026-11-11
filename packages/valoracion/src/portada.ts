/**
 * Portada "cine": destacadas que rotan y filas de carruseles, con las ~1.000 empresas reales.
 * La misma lógica en la API (/portada) y en la demo estática (sin servidor).
 */

/** Lo que la portada necesita de cada empresa (subconjunto del resumen de la API). */
export interface EmpresaPortada {
  ticker: string;
  nombre: string;
  sector: string | null;
  indice?: string | null;
  precio: number | null;
  valor: number | null;
  estado: "barata" | "rango" | "cara" | null;
  cambio1a?: number | null;        // variación del precio en 12 meses (tanto por uno)
  capitalizacion?: number | null;
  seguidores?: number;
  analisis: { tipo: "defensiva" | "estable" | "ciclica"; sugerida: boolean; buenPrecio: boolean; orden?: number; calidad: number };
}

export type FiltroPortada = "todo" | "popular" | "tipo" | "tamano" | "descubre";

export const FILTROS: { id: FiltroPortada; nombre: string }[] = [
  { id: "todo", nombre: "Para ti" },
  { id: "popular", nombre: "Popularidad" },
  { id: "tipo", nombre: "Por sector" },
  { id: "tamano", nombre: "Por tamaño" },
  { id: "descubre", nombre: "Descubrimientos" },
];

/**
 * Límite entre empresas grandes (consolidadas) y pequeñas (en crecimiento): 1.000 millones
 * de USD de capitalización. La app se centra en las grandes; las pequeñas van a Descubrimientos.
 */
export const LIMITE_GRANDE = 1e9;
export type Tamano = "grande" | "pequena";
/** Sin capitalización conocida (sin precio o sin acciones) se trata como grande: no se oculta. */
export const esPequena = (e: { capitalizacion?: number | null }) => typeof e.capitalizacion === "number" && e.capitalizacion < LIMITE_GRANDE;
export const TAMANOS: { id: Tamano; nombre: string; detalle: string }[] = [
  { id: "grande", nombre: "Grandes", detalle: "más de US$1.000 M en bolsa" },
  { id: "pequena", nombre: "Pequeñas", detalle: "menos de US$1.000 M en bolsa" },
];

export interface Fila<E = EmpresaPortada> { id: string; titulo: string; sub: string; ranking?: boolean; empresas: E[] }
export interface Destacada<E = EmpresaPortada> { etiqueta: string; empresa: E }

export interface Contexto {
  /** Tickers ordenados por vistas de la semana (tendencias). */
  vistas?: string[];
  /** Tickers ordenados por compras en el simulador. */
  compras?: string[];
  /** Empresas que sigue el usuario (todas sus listas). */
  mias?: string[];
  /** Listas del usuario, en su orden: una fila por lista. */
  listas?: { id: string; nombre: string; tickers: string[] }[];
  /** Nombre de cada sector en español. */
  nombreSector?: (s: string | null) => string;
  hoy?: Date;
}

const POR_FILA = 12;
const descuento = (e: EmpresaPortada) => (e.precio && e.valor ? e.precio / e.valor : Infinity);
const orden = (e: EmpresaPortada) => e.analisis.orden ?? e.analisis.calidad;
const tomar = <E>(l: E[], n = POR_FILA) => l.slice(0, n);

/** Tono (0-360) del póster de cada empresa: por sector, con un matiz propio por ticker. */
const TONO_SECTOR: Record<string, number> = {
  "Information Technology": 255, "Communication Services": 285, "Consumer Discretionary": 330,
  "Consumer Staples": 38, "Health Care": 350, "Financials": 212, "Industrials": 22, "Energy": 45,
  "Materials": 160, "Utilities": 190, "Real Estate": 120,
};
export function tono(ticker: string, sector: string | null | undefined): number {
  let h = 0;
  for (const c of ticker) h = (h * 31 + c.charCodeAt(0)) % 997;
  return ((TONO_SECTOR[sector ?? ""] ?? 230) + (h % 41) - 20 + 360) % 360;
}

function porTickers<E extends EmpresaPortada>(todas: E[], tickers: string[] | undefined): E[] {
  if (!tickers?.length) return [];
  const m = new Map(todas.map((e) => [e.ticker, e]));
  return tickers.map((t) => m.get(t)).filter((e): e is E => !!e);
}

/** Las más grandes: el Top 10 cuando todavía no hay vistas que contar. */
const masGrandes = <E extends EmpresaPortada>(l: E[]) => sinClasesRepetidas(
  [...l].filter((e) => e.capitalizacion).sort((a, b) => b.capitalizacion! - a.capitalizacion!));

/** Una sola clase de acción por empresa (GOOGL y GOOG, FOXA y FOX…): la primera de la lista. */
function sinClasesRepetidas<E extends EmpresaPortada>(l: E[]): E[] {
  const vistos = new Set<string>();
  return l.filter((e) => { const k = e.nombre.toLowerCase().replace(/\s*\(class [a-z]\)|\s*class [a-z]$/g, "").trim(); if (vistos.has(k)) return false; vistos.add(k); return true; });
}

function top10<E extends EmpresaPortada>(todas: E[], c: Contexto): Fila<E> {
  const vistas = porTickers(todas, c.vistas);
  return vistas.length >= 5
    ? { id: "top", titulo: "Top 10 de la semana", sub: "Las más vistas", ranking: true, empresas: tomar(vistas, 10) }
    : { id: "top", titulo: "Top 10 más grandes", sub: "Por capitalización", ranking: true, empresas: tomar(masGrandes(todas), 10) };
}


export function filas<E extends EmpresaPortada>(filtro: FiltroPortada, todas: E[], c: Contexto = {}): Fila<E>[] {
  const grandes = todas.filter((e) => !esPequena(e));
  const pequenas = todas.filter(esPequena);
  const baratasDe = (l: E[]) => l.filter((e) => e.precio && e.valor && e.estado === "barata" && descuento(e) >= 0.4)
    .sort((a, b) => descuento(a) - descuento(b));
  const porCalidad = (l: E[]) => [...l].sort((a, b) => orden(b) - orden(a));
  const enAlza = (l: E[]) => l.filter((e) => typeof e.cambio1a === "number").sort((a, b) => b.cambio1a! - a.cambio1a!);
  const sugeridas = porCalidad(grandes.filter((e) => e.analisis.sugerida));
  const out: Fila<E>[] = [];
  const add = (f: Fila<E>) => { if (f.empresas.length) out.push(f); };
  const n = (l: unknown[], uno: string, varios: string) => `${l.length} ${l.length === 1 ? uno : varios}`;

  if (filtro === "todo") {
    if (c.listas?.length) {
      for (const l of c.listas) {
        const es = porTickers(todas, l.tickers);
        add({ id: `lista-${l.id}`, titulo: l.nombre, sub: n(es, "empresa", "empresas"), empresas: es });
      }
    } else {
      const mias = porTickers(todas, c.mias);
      add({ id: "mias", titulo: "Mi lista", sub: n(mias, "guardada", "guardadas"), empresas: mias });
    }
    add(top10(grandes, c));
    add({ id: "oportunidades", titulo: "Oportunidades", sub: "Las más baratas frente a su valor", empresas: tomar(baratasDe(grandes)) });
    add({ id: "prudentes", titulo: "Ideas prudentes", sub: "Calidad alta y buen precio de compra", empresas: tomar(sugeridas) });
    add({ id: "calidad", titulo: "Calidad a precio justo", sub: "Las mejores empresas que no están caras",
      empresas: tomar(porCalidad(grandes.filter((e) => e.estado && e.estado !== "cara"))) });
    add({ id: "alza", titulo: "En alza", sub: "Las que más suben en 12 meses", empresas: tomar(enAlza(grandes)) });
    add({ id: "descubre", titulo: "Descubrimientos", sub: "Pequeñas a buen precio (menos de US$1.000 M)",
      empresas: tomar(porCalidad(pequenas.filter((e) => e.estado === "barata"))) });
  } else if (filtro === "popular") {
    add(top10(todas, c));
    add({ id: "seguidas", titulo: "Más seguidas", sub: "Las que más gente guarda",
      empresas: tomar(todas.filter((e) => (e.seguidores ?? 0) > 0).sort((a, b) => b.seguidores! - a.seguidores!)) });
    add({ id: "compras", titulo: "Más compradas en el simulador", sub: "Con dinero ficticio", empresas: tomar(porTickers(todas, c.compras)) });
    add({ id: "grandes", titulo: "Las más grandes", sub: "Por capitalización", empresas: tomar(masGrandes(todas)) });
  } else if (filtro === "tipo") {
    const sectores = new Map<string, E[]>();
    for (const e of grandes) if (e.sector) sectores.set(e.sector, [...(sectores.get(e.sector) ?? []), e]);
    [...sectores.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([s, l]) => {
      add({ id: `sector-${s}`, titulo: c.nombreSector?.(s) ?? s, sub: `${l.length} empresas`, empresas: tomar(masGrandes(l)) });
    });
  } else if (filtro === "tamano") {
    add({ id: "grandes-calidad", titulo: "Grandes de calidad", sub: `${grandes.length} empresas de más de US$1.000 M`, empresas: tomar(porCalidad(grandes)) });
    add({ id: "grandes-baratas", titulo: "Grandes y baratas", sub: "Más de US$1.000 M, bajo su valor", empresas: tomar(baratasDe(grandes)) });
    add({ id: "gigantes", titulo: "Gigantes", sub: "Más de US$200.000 M", empresas: tomar(masGrandes(grandes.filter((e) => (e.capitalizacion ?? 0) >= 2e11))) });
    add({ id: "pequenas-calidad", titulo: "Pequeñas de calidad", sub: `${pequenas.length} empresas de menos de US$1.000 M`, empresas: tomar(porCalidad(pequenas)) });
    add({ id: "pequenas-baratas", titulo: "Pequeñas y baratas", sub: "Menos de US$1.000 M, bajo su valor", empresas: tomar(baratasDe(pequenas)) });
  } else {
    add({ id: "joyas", titulo: "Joyas pequeñas", sub: "Menos de US$1.000 M, con buen precio",
      empresas: tomar(porCalidad(pequenas.filter((e) => e.analisis.buenPrecio || e.analisis.sugerida || e.estado === "barata"))) });
    add({ id: "pequenas-calidad", titulo: "Pequeñas de calidad", sub: "Las de mejor puntuación", empresas: tomar(porCalidad(pequenas)) });
    add({ id: "pequenas-alza", titulo: "Pequeñas que suben", sub: "Mejores 12 meses", empresas: tomar(enAlza(pequenas)) });
  }
  return out;
}

/** Las cuatro destacadas de la portada (rotan). La primera cambia cada día. */
export function destacadas<E extends EmpresaPortada>(todasLas: E[], c: Contexto = {}): Destacada<E>[] {
  const todas = todasLas.filter((e) => !esPequena(e));
  const valoradas = todas.filter((e) => e.precio && e.valor && e.estado);
  const baratas = valoradas.filter((e) => e.estado === "barata" && descuento(e) >= 0.4).sort((a, b) => descuento(a) - descuento(b));
  const dia = Math.floor((c.hoy ?? new Date()).getTime() / 86_400_000);
  const out: Destacada<E>[] = [];
  const usadas = new Set<string>();
  const poner = (etiqueta: string, e: E | undefined) => { if (e && !usadas.has(e.ticker)) { usadas.add(e.ticker); out.push({ etiqueta, empresa: e }); } };
  poner("Oportunidad del día", baratas.slice(0, 10)[dia % Math.max(1, Math.min(10, baratas.length))]);
  poner("Idea prudente", todas.filter((e) => e.analisis.sugerida).sort((a, b) => orden(b) - orden(a))[0]);
  poner("La que más sube en el año", valoradas.filter((e) => typeof e.cambio1a === "number").sort((a, b) => b.cambio1a! - a.cambio1a!)[0]);
  poner("Calidad a precio justo", todas.filter((e) => e.estado && e.estado !== "cara")
    .sort((a, b) => orden(b) - orden(a))[0]);
  return out;
}
