/** Cliente de la API de Al Precio Justo (se usa en el servidor de Next.js). */
import { cookies } from "next/headers";
import type { Estado, Trimestre, Valoracion } from "@ancla/valoracion";
import type { Tipo } from "@ancla/valoracion/recomendaciones";

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
};
