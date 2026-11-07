import type { Estado, Trimestre, Valoracion } from "@ancla/valoracion";
import type { Tipo } from "@ancla/valoracion/recomendaciones";
import { BASE, DEMO, ErrorDemo, responder } from "./demo";
import type { DatosClave, Perfil } from "@ancla/valoracion/perfil";

/**
 * En un teléfono, "localhost" es el propio teléfono: define EXPO_PUBLIC_ANCLA_API
 * con la IP de tu ordenador en la red local (p. ej. http://192.168.1.20:4000).
 */
export const API = process.env.EXPO_PUBLIC_ANCLA_API ?? "http://localhost:4000";

export const urlLogo = (ticker: string) =>
  DEMO ? `${BASE}/logos/${encodeURIComponent(ticker)}.png` : `${API}/logos/${encodeURIComponent(ticker)}`;

export interface AnalisisCorto {
  tipo: Tipo;
  calidad: number;
  precioCompra: number | null;
  buenPrecio: boolean;
  sugerida: boolean;
  vigilar: boolean;
  motivo: string;
  orden?: number;
}

export interface Resumen {
  ticker: string;
  nombre: string;
  sector: string | null;
  indice?: string | null;      // S&P 500 | S&P 400 | Popular
  precio: number | null;
  cambioPct: number | null;
  valor: number | null;
  bandaMin: number | null;
  bandaMax: number | null;
  estado: Estado | null;
  sinModelo: string | null;
  analisis: AnalisisCorto;
}

export interface ConRazones extends Resumen {
  razones: string[];
  alertas: string[];
}

export interface Ficha extends ConRazones {
  valoracion: Valoracion | null;
  trimestres: Trimestre[];
  precios: { fecha: string; cierre: number }[];
  perfil: Perfil | null;
  clave: DatosClave | null;
}

export interface Inicio {
  fecha: string;
  oportunidad: Resumen | null;
  baratas: Resumen[];
  seguidas: Resumen[];
  seguidasPropias: boolean;
  precioFuente: string;
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

export interface Tiempo {
  fechaCompra: string; valorHoy: number; ganancia: number; gananciaPct: number; referenciaHoy: number | null;
  serie: { fecha: string; valor: number; referencia: number | null }[];
}

export interface Divisas {
  base: "USD";
  tasas: Record<string, number>;
  detalle: { codigo: string; porUsd: number; fecha: string; fuente: string }[];
}

export interface Tendencia { ticker: string; n: number; previo: number; empresa: Resumen }
export interface Tendencias { dias: number; vistas: Tendencia[]; seguidas: Tendencia[]; compras: Tendencia[] }

export class ErrorApi extends Error {
  codigo: number;
  constructor(codigo: number, mensaje: string) {
    super(mensaje);
    this.codigo = codigo;
  }
}

async function pedir<T>(ruta: string, token?: string | null, init: RequestInit = {}): Promise<T> {
  if (DEMO) { // versión estática de GitHub Pages: datos fijos y todo guardado en el navegador
    try { return (await responder(ruta, init)) as T; } catch (e) {
      throw e instanceof ErrorDemo ? new ErrorApi(e.codigo, e.message) : e;
    }
  }
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body) headers["Content-Type"] = "application/json";
  const r = await fetch(`${API}${ruta}`, { ...init, headers });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorApi(r.status, datos.error ?? `La API respondió ${r.status}`);
  return datos as T;
}

export const api = {
  inicio: (token?: string | null) => pedir<Inicio>("/inicio", token),
  empresas: () => pedir<Resumen[]>("/empresas"),
  /** Solo estas empresas (evita bajar las ~1.000). */
  algunas: (tickers: string[]) => tickers.length
    ? pedir<Resumen[]>(`/empresas?tickers=${tickers.map(encodeURIComponent).join(",")}`)
    : Promise.resolve([] as Resumen[]),
  ficha: (ticker: string) => pedir<Ficha>(`/empresas/${encodeURIComponent(ticker)}`),
  buscar: (p: { q?: string; tipo?: Tipo | ""; buenPrecio?: boolean }) => {
    const s = new URLSearchParams({ q: p.q ?? "", limite: "24" });
    if (p.tipo) s.set("tipo", p.tipo);
    if (p.buenPrecio) s.set("buenPrecio", "1");
    return pedir<{ total: number; resultados: Resumen[] }>(`/buscar?${s}`);
  },
  recomendaciones: () => pedir<Recomendaciones>("/recomendaciones"),
  config: () => pedir<{ google: boolean; prueba: boolean }>("/auth/config"),
  entrarGoogle: (idToken: string) =>
    pedir<{ token: string; usuario: Usuario }>("/auth/google", null, { method: "POST", body: JSON.stringify({ idToken }) }),
  entrarPrueba: () => pedir<{ token: string; usuario: Usuario }>("/auth/prueba", null, { method: "POST" }),
  yo: (token: string) => pedir<Yo>("/yo", token),
  seguir: (token: string, t: string, si: boolean) =>
    pedir<{ seguidas: string[] }>(`/yo/seguidas/${encodeURIComponent(t)}`, token, { method: si ? "PUT" : "DELETE" }),
  guardarMetricas: (token: string, ids: string[]) =>
    pedir<{ metricasExtra: string[] }>("/yo/metricas", token, { method: "PUT", body: JSON.stringify({ ids }) }),
  borrarCuenta: (token: string) => pedir<{ ok: boolean }>("/yo", token, { method: "DELETE" }),
  simulador: (token: string) => pedir<Cartera>("/simulador", token),
  comprar: (token: string, ticker: string, importe: number) =>
    pedir<{ operacion: { acciones: number; importe: number }; cartera: Cartera }>("/simulador/comprar", token,
      { method: "POST", body: JSON.stringify({ ticker, importe }) }),
  vender: (token: string, ticker: string, acciones: number | null = null) =>
    pedir<{ operacion: { acciones: number; importe: number }; cartera: Cartera }>("/simulador/vender", token,
      { method: "POST", body: JSON.stringify({ ticker, acciones }) }),
  reiniciar: (token: string) => pedir<Cartera>("/simulador/reiniciar", token, { method: "POST" }),
  divisas: () => pedir<Divisas>("/divisas"),
  evento: (tipo: "vista", ticker: string, sesion: string) =>
    pedir<unknown>("/eventos", null, { method: "POST", body: JSON.stringify({ tipo, ticker, sesion }) }),
  tendencias: (dias = 7) => pedir<Tendencias>(`/tendencias?dias=${dias}`),
  tambien: (ticker: string) => pedir<{ ticker: string; n: number; empresa: Resumen }[]>(`/empresas/${encodeURIComponent(ticker)}/tambien`),
  tiempo: (ticker: string, importe: number, desde: string) =>
    pedir<Tiempo>(`/simulador/tiempo?ticker=${encodeURIComponent(ticker)}&importe=${importe}&desde=${desde}`),
};
