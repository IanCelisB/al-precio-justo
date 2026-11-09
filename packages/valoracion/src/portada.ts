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

export type FiltroPortada = "todo" | "popular" | "tipo" | "ciclo" | "descubre";

export const FILTROS: { id: FiltroPortada; nombre: string }[] = [
  { id: "todo", nombre: "Para ti" },
  { id: "popular", nombre: "Popularidad" },
  { id: "tipo", nombre: "Por sector" },
  { id: "ciclo", nombre: "Ciclo económico" },
  { id: "descubre", nombre: "Descubrimientos" },
];

export interface Fila<E = EmpresaPortada> { id: string; titulo: string; sub: string; ranking?: boolean; empresas: E[] }
export interface Destacada<E = EmpresaPortada> { etiqueta: string; empresa: E }

export interface Contexto {
  /** Tickers ordenados por vistas de la semana (tendencias). */
  vistas?: string[];
  /** Tickers ordenados por compras en el simulador. */
  compras?: string[];
  /** Empresas que sigue el usuario. */
  mias?: string[];
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

const TIPOS = [
  { id: "ciclica", titulo: "Cíclicas", sub: "Van mejor cuando la economía crece" },
  { id: "defensiva", titulo: "Defensivas", sub: "Aguantan en épocas malas" },
  { id: "estable", titulo: "Estables", sub: "Negocios sin grandes vaivenes" },
] as const;

export function filas<E extends EmpresaPortada>(filtro: FiltroPortada, todas: E[], c: Contexto = {}): Fila<E>[] {
  const valoradas = todas.filter((e) => e.precio && e.valor && e.estado);
  const baratas = valoradas.filter((e) => e.estado === "barata" && descuento(e) >= 0.4).sort((a, b) => descuento(a) - descuento(b));
  const sugeridas = todas.filter((e) => e.analisis.sugerida).sort((a, b) => orden(b) - orden(a));
  const enAlza = todas.filter((e) => typeof e.cambio1a === "number").sort((a, b) => b.cambio1a! - a.cambio1a!);
  const porTipo = (t: string) => todas.filter((e) => e.analisis.tipo === t).sort((a, b) => orden(b) - orden(a));
  const fuera500 = todas.filter((e) => e.indice && e.indice !== "S&P 500");
  const mias = porTickers(todas, c.mias);
  const out: Fila<E>[] = [];
  const add = (f: Fila<E>) => { if (f.empresas.length) out.push(f); };

  if (filtro === "todo") {
    add({ id: "mias", titulo: "Mi lista", sub: `${mias.length} ${mias.length === 1 ? "guardada" : "guardadas"}`, empresas: mias });
    add(top10(todas, c));
    add({ id: "oportunidades", titulo: "Oportunidades", sub: "Las más baratas frente a su valor", empresas: tomar(baratas) });
    add({ id: "prudentes", titulo: "Ideas prudentes", sub: "Calidad alta y buen precio de compra", empresas: tomar(sugeridas) });
    add({ id: "alza", titulo: "En alza", sub: "Las que más suben en 12 meses", empresas: tomar(enAlza) });
    add({ id: "descubre", titulo: "Descubrimientos", sub: "Fuera del S&P 500 y a buen precio",
      empresas: tomar(fuera500.filter((e) => e.estado === "barata").sort((a, b) => orden(b) - orden(a))) });
    add({ id: "defensivas", titulo: "Defensivas", sub: "Aguantan en épocas malas", empresas: tomar(porTipo("defensiva")) });
    add({ id: "ciclicas", titulo: "Cíclicas", sub: "Van mejor cuando la economía crece", empresas: tomar(porTipo("ciclica")) });
  } else if (filtro === "popular") {
    add(top10(todas, c));
    add({ id: "seguidas", titulo: "Más seguidas", sub: "Las que más gente guarda",
      empresas: tomar(todas.filter((e) => (e.seguidores ?? 0) > 0).sort((a, b) => b.seguidores! - a.seguidores!)) });
    add({ id: "compras", titulo: "Más compradas en el simulador", sub: "Con dinero ficticio", empresas: tomar(porTickers(todas, c.compras)) });
    add({ id: "grandes", titulo: "Las más grandes", sub: "Por capitalización", empresas: tomar(masGrandes(todas)) });
  } else if (filtro === "tipo") {
    const sectores = new Map<string, E[]>();
    for (const e of todas) if (e.sector) sectores.set(e.sector, [...(sectores.get(e.sector) ?? []), e]);
    [...sectores.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([s, l]) => {
      add({ id: `sector-${s}`, titulo: c.nombreSector?.(s) ?? s, sub: `${l.length} empresas`, empresas: tomar(masGrandes(l)) });
    });
  } else if (filtro === "ciclo") {
    for (const t of TIPOS) add({ id: t.id, titulo: t.titulo, sub: t.sub, empresas: tomar(porTipo(t.id)) });
  } else {
    add({ id: "joyas", titulo: "Joyas fuera del S&P 500", sub: "Medianas y populares con buen precio",
      empresas: tomar(fuera500.filter((e) => e.analisis.buenPrecio || e.analisis.sugerida).sort((a, b) => orden(b) - orden(a))) });
    add({ id: "populares", titulo: "Populares entre inversores", sub: "Fuera de los índices",
      empresas: tomar(todas.filter((e) => e.indice === "Popular").sort((a, b) => (b.cambio1a ?? -9) - (a.cambio1a ?? -9))) });
    add({ id: "medianas", titulo: "Medianas que suben", sub: "S&P 400, mejores 12 meses",
      empresas: tomar(enAlza.filter((e) => e.indice === "S&P 400")) });
  }
  return out;
}

/** Las cuatro destacadas de la portada (rotan). La primera cambia cada día. */
export function destacadas<E extends EmpresaPortada>(todas: E[], c: Contexto = {}): Destacada<E>[] {
  const valoradas = todas.filter((e) => e.precio && e.valor && e.estado);
  const baratas = valoradas.filter((e) => e.estado === "barata" && descuento(e) >= 0.4).sort((a, b) => descuento(a) - descuento(b));
  const dia = Math.floor((c.hoy ?? new Date()).getTime() / 86_400_000);
  const out: Destacada<E>[] = [];
  const usadas = new Set<string>();
  const poner = (etiqueta: string, e: E | undefined) => { if (e && !usadas.has(e.ticker)) { usadas.add(e.ticker); out.push({ etiqueta, empresa: e }); } };
  poner("Oportunidad del día", baratas.slice(0, 10)[dia % Math.max(1, Math.min(10, baratas.length))]);
  poner("Idea prudente", todas.filter((e) => e.analisis.sugerida).sort((a, b) => orden(b) - orden(a))[0]);
  poner("La que más sube en el año", valoradas.filter((e) => typeof e.cambio1a === "number").sort((a, b) => b.cambio1a! - a.cambio1a!)[0]);
  poner("Refugio en tiempos difíciles", todas.filter((e) => e.analisis.tipo === "defensiva" && e.estado !== "cara")
    .sort((a, b) => orden(b) - orden(a))[0]);
  return out;
}
