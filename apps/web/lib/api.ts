/** Cliente de la API de Al Precio Justo (se usa en el servidor de Next.js). */
import { cookies } from "next/headers";
import { preferencias } from "./preferencias";
import type { DatosClave, Perfil } from "@ancla/valoracion/perfil";
import type { Estado, Trimestre, Valoracion } from "@ancla/valoracion";
import type { Tipo } from "@ancla/valoracion/recomendaciones";
import type { AjustesAvisos, TipoAviso } from "@ancla/valoracion/avisos";

export const API = process.env.ANCLA_API ?? "http://localhost:4000";
export const COOKIE_SESION = "ancla_sesion";

export interface AnalisisCorto {
  tipo: Tipo;
  calidad: number;
  precioCompra: number | null;
  buenPrecio: boolean;
  sugerida: boolean;
  vigilar: boolean;
  motivo: string;
}

export interface Resumen {
  ticker: string;
  nombre: string;
  sector: string | null;
  indice?: string | null;      // S&P 500 | S&P 400 | Popular
  cambio1a?: number | null;    // cambio del precio en 12 meses
  capitalizacion?: number | null;
  seguidores?: number;
  precio: number | null;
  cambioPct: number | null;
  precioFecha: string | null;
  valor: number | null;
  bandaMin: number | null;
  bandaMax: number | null;
  estado: Estado | null;
  sinModelo: string | null;
  ultimoTrimestre: string | null;
  analisis: AnalisisCorto;
}

export interface ConRazones extends Resumen {
  razones: string[];
  alertas: string[];
}

export interface Inicio {
  fecha: string;
  oportunidad: Resumen | null;
  baratas: Resumen[];
  seguidas: Resumen[];
  seguidasPropias: boolean;
  precioFuente: string;
}

export interface Ficha extends ConRazones {
  valoracion: Valoracion | null;
  trimestres: Trimestre[];
  precios: { fecha: string; cierre: number }[];
  perfil: Perfil | null;
  clave: DatosClave | null;
}

export interface Recomendaciones {
  criterio: string;
  aviso: string;
  sugeridas: ConRazones[];
  vigilar: ConRazones[];
}

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  foto: string | null;
}

export interface Yo {
  usuario: Usuario;
  seguidas: string[];
  metricasExtra: string[];
}

async function sesion(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE_SESION)?.value;
}

async function get<T>(ruta: string, conSesion = false): Promise<T> {
  await preferencias(); // divisa de esta petición (una sola vez por petición)
  const token = conSesion ? await sesion() : undefined;
  const r = await fetch(`${API}${ruta}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!r.ok) throw new Error(`La API respondió ${r.status} en ${ruta}`);
  return r.json() as Promise<T>;
}

export interface PosicionSim {
  ticker: string; nombre: string; sector: string | null; acciones: number; costeMedio: number; invertido: number;
  precio: number | null; valor: number | null; ganancia: number | null; gananciaPct: number | null;
}

export interface Cartera {
  inicial: number; efectivo: number; valorPosiciones: number; valorTotal: number; ganancia: number; gananciaPct: number;
  realizada: number; latente: number; posiciones: PosicionSim[];
  operaciones: { ticker: string; nombre: string; tipo: "compra" | "venta"; acciones: number; precio: number; importe: number; fecha: string }[];
  curva: { fecha: string; valor: number; referencia: number | null }[];
  referencia: number | null;
  aviso: string;
}

export const api = {
  inicio: () => get<Inicio>("/inicio", true),
  empresas: () => get<Resumen[]>("/empresas"),
  /** Solo estas empresas (evita bajar las ~1.000). */
  algunas: (tickers: string[]) => tickers.length
    ? get<Resumen[]>(`/empresas?tickers=${tickers.map(encodeURIComponent).join(",")}`)
    : Promise.resolve([] as Resumen[]),
  ficha: (ticker: string) => get<Ficha>(`/empresas/${encodeURIComponent(ticker)}`),
  /** Portada: destacadas y filas. Con sesión incluye "Mi lista". */
  portada: async (filtro: string) => get<{
    filtro: string;
    destacadas: { etiqueta: string; empresa: Resumen }[];
    filas: { id: string; titulo: string; sub: string; ranking?: boolean; empresas: Resumen[] }[];
  }>(`/portada?filtro=${encodeURIComponent(filtro)}`, !!(await sesion())),
  tendencias: (dias = 7) => get<{ dias: number; vistas: { ticker: string; n: number; empresa: Resumen }[] }>(`/tendencias?dias=${dias}`)
    .catch(() => ({ dias, vistas: [] })),
  tambien: (ticker: string) => get<{ ticker: string; n: number; empresa: Resumen }[]>(`/empresas/${encodeURIComponent(ticker)}/tambien`)
    .catch(() => []),
  recomendaciones: () => get<Recomendaciones>("/recomendaciones"),
  config: () => get<{ google: boolean; prueba: boolean }>("/auth/config"),
  /** Cartera simulada del usuario con sesión, o null. */
  simulador: async (): Promise<Cartera | null> => {
    if (!(await sesion())) return null;
    try { return await get<Cartera>("/simulador", true); } catch { return null; }
  },
  /** Usuario con sesión iniciada, o null. */
  yo: async (): Promise<Yo | null> => {
    if (!(await sesion())) return null;
    try { return await get<Yo>("/yo", true); } catch { return null; }
  },
  /** Avisos, ajustes y precios objetivo del usuario con sesión (null sin sesión). */
  avisos: async (): Promise<{ avisos: Aviso[]; sinLeer: number } | null> => {
    if (!(await sesion())) return null;
    try { return await get("/yo/avisos", true); } catch { return null; }
  },
  ajustesAvisos: async (): Promise<AjustesAvisos | null> => {
    if (!(await sesion())) return null;
    try { return await get<AjustesAvisos>("/yo/avisos/ajustes", true); } catch { return null; }
  },
  objetivos: async (): Promise<Objetivo[]> => {
    if (!(await sesion())) return [];
    try { return await get<Objetivo[]>("/yo/objetivos", true); } catch { return []; }
  },
};

export interface Aviso {
  id: number; ticker: string; nombre: string; sector: string | null;
  tipo: TipoAviso; titulo: string; texto: string; creado: string; leido: boolean;
}

export interface Objetivo {
  ticker: string; nombre: string; sector: string | null; precio: number; direccion: "baja" | "sube";
  creado: string; cumplido: string | null; precioActual: number | null;
}
