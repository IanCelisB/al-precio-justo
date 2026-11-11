import type { Estado, Trimestre, Valoracion } from "@ancla/valoracion";
import type { Tipo } from "@ancla/valoracion/recomendaciones";
import { BASE, DEMO, ErrorDemo, responder } from "./demo";
import type { DatosClave, Perfil } from "@ancla/valoracion/perfil";
import type { AjustesAvisos, TipoAviso } from "@ancla/valoracion/avisos";

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
  cambio1a?: number | null;    // cambio del precio en 12 meses
  capitalizacion?: number | null;
  seguidores?: number;
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
  publico?: string;
  bio?: string;
}

export interface Lista { id: string; nombre: string; tickers: string[] }

export interface Yo {
  usuario: Usuario;
  seguidas: string[];
  metricasExtra: string[];
  listas: Lista[];
}

export interface Autor { publico: string; nombre: string; foto: string | null }
export interface CarteraCompartida { gananciaPct: number; valorTotal: number; posiciones: { ticker: string; peso: number; gananciaPct: number | null }[] }
export interface Publicacion {
  id: string; autor: Autor; texto: string; ticker: string | null; cartera: CarteraCompartida | null;
  creado: string; meGusta: number; comentarios: number; loHeGustado: boolean; mia: boolean;
}
export interface Comentario { id: string; autor: Autor; texto: string; creado: string; mio: boolean }
export interface PerfilPublico {
  publico: string; nombre: string; foto: string | null; bio: string; desde: string; meGustaRecibidos: number;
  publicaciones: Publicacion[]; soyYo: boolean;
}
export type TipoBuzon = "comentario" | "sugerencia" | "reclamo" | "reporte";

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
  contra?: string | null;
  fechaCompra: string; valorHoy: number; ganancia: number; gananciaPct: number; referenciaHoy: number | null;
  serie: { fecha: string; valor: number; referencia: number | null }[];
}

export interface Divisas {
  base: "USD";
  tasas: Record<string, number>;
  detalle: { codigo: string; porUsd: number; fecha: string; fuente: string }[];
}

export interface Portada {
  filtro: string;
  destacadas: { etiqueta: string; empresa: Resumen }[];
  filas: { id: string; titulo: string; sub: string; ranking?: boolean; empresas: Resumen[] }[];
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
  buscar: (p: { q?: string; tipo?: Tipo | ""; tamano?: "grande" | "pequena" | ""; buenPrecio?: boolean; desde?: number; limite?: number }) => {
    const s = new URLSearchParams({ q: p.q ?? "", limite: String(p.limite ?? 24) });
    if (p.tipo) s.set("tipo", p.tipo);
    if (p.tamano) s.set("tamano", p.tamano);
    if (p.buenPrecio) s.set("buenPrecio", "1");
    if (p.desde) s.set("desde", String(p.desde));
    return pedir<{ total: number; universo?: number; resultados: Resumen[] }>(`/buscar?${s}`);
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
  portada: (filtro: string, token?: string | null) => pedir<Portada>(`/portada?filtro=${encodeURIComponent(filtro)}`, token),
  evento: (tipo: "vista", ticker: string, sesion: string) =>
    pedir<unknown>("/eventos", null, { method: "POST", body: JSON.stringify({ tipo, ticker, sesion }) }),
  tendencias: (dias = 7) => pedir<Tendencias>(`/tendencias?dias=${dias}`),
  tambien: (ticker: string) => pedir<{ ticker: string; n: number; empresa: Resumen }[]>(`/empresas/${encodeURIComponent(ticker)}/tambien`),
  tiempo: (ticker: string, importe: number, desde: string, contra?: string | null) =>
    pedir<Tiempo>(`/simulador/tiempo?ticker=${encodeURIComponent(ticker)}&importe=${importe}&desde=${desde}${contra ? `&contra=${encodeURIComponent(contra)}` : ""}`),
  // --- listas ---
  crearLista: (token: string, nombre: string) =>
    pedir<{ lista: Lista; listas: Lista[] }>("/yo/listas", token, { method: "POST", body: JSON.stringify({ nombre }) }),
  renombrarLista: (token: string, id: string, nombre: string) =>
    pedir<{ listas: Lista[] }>(`/yo/listas/${encodeURIComponent(id)}`, token, { method: "PUT", body: JSON.stringify({ nombre }) }),
  borrarLista: (token: string, id: string) =>
    pedir<{ listas: Lista[]; seguidas: string[] }>(`/yo/listas/${encodeURIComponent(id)}`, token, { method: "DELETE" }),
  enLista: (token: string, id: string, ticker: string, si: boolean) =>
    pedir<{ listas: Lista[]; seguidas: string[] }>(`/yo/listas/${encodeURIComponent(id)}/empresas/${encodeURIComponent(ticker)}`, token,
      { method: si ? "PUT" : "DELETE" }),
  // --- perfil y comunidad ---
  editarPerfil: (token: string, cambios: { nombre?: string; foto?: string | null; bio?: string }) =>
    pedir<{ usuario: Usuario }>("/yo/perfil", token, { method: "PUT", body: JSON.stringify(cambios) }),
  muro: (token: string | null, o: { antes?: string; ticker?: string } = {}) => {
    const s = new URLSearchParams();
    if (o.antes) s.set("antes", o.antes);
    if (o.ticker) s.set("ticker", o.ticker);
    return pedir<Publicacion[]>(`/comunidad?${s}`, token);
  },
  publicar: (token: string, p: { texto: string; ticker?: string | null; compartirCartera?: boolean }) =>
    pedir<Publicacion>("/comunidad", token, { method: "POST", body: JSON.stringify(p) }),
  borrarPublicacion: (token: string, id: string) => pedir<{ ok: boolean }>(`/comunidad/${id}`, token, { method: "DELETE" }),
  meGusta: (token: string, id: string, si: boolean) =>
    pedir<{ meGusta: number; loHeGustado: boolean }>(`/comunidad/${id}/me-gusta`, token, { method: si ? "PUT" : "DELETE" }),
  comentarios: (token: string | null, id: string) => pedir<Comentario[]>(`/comunidad/${id}/comentarios`, token),
  comentar: (token: string, id: string, texto: string) =>
    pedir<Comentario>(`/comunidad/${id}/comentarios`, token, { method: "POST", body: JSON.stringify({ texto }) }),
  borrarComentario: (token: string, id: string) => pedir<{ ok: boolean }>(`/comentarios/${id}`, token, { method: "DELETE" }),
  perfilPublico: (token: string | null, publico: string) => pedir<PerfilPublico>(`/usuarios/${encodeURIComponent(publico)}`, token),
  buzon: (token: string | null, tipo: TipoBuzon, texto: string) =>
    pedir<{ ok: boolean }>("/buzon", token, { method: "POST", body: JSON.stringify({ tipo, texto }) }),
  // --- avisos ---
  avisos: (token: string) => pedir<{ avisos: Aviso[]; sinLeer: number }>("/yo/avisos", token),
  marcarLeidos: (token: string, ids?: number[]) =>
    pedir<{ sinLeer: number }>("/yo/avisos/leidos", token, { method: "PUT", body: JSON.stringify(ids ? { ids } : {}) }),
  ajustesAvisos: (token: string) => pedir<AjustesAvisos>("/yo/avisos/ajustes", token),
  guardarAjustesAvisos: (token: string, cambios: Partial<AjustesAvisos>) =>
    pedir<AjustesAvisos>("/yo/avisos/ajustes", token, { method: "PUT", body: JSON.stringify(cambios) }),
  objetivos: (token: string) => pedir<Objetivo[]>("/yo/objetivos", token),
  fijarObjetivo: (token: string, ticker: string, precio: number) =>
    pedir<Objetivo>(`/yo/objetivos/${encodeURIComponent(ticker)}`, token, { method: "PUT", body: JSON.stringify({ precio }) }),
  quitarObjetivo: (token: string, ticker: string) =>
    pedir<{ ok: boolean }>(`/yo/objetivos/${encodeURIComponent(ticker)}`, token, { method: "DELETE" }),
};

export interface Aviso {
  id: number; ticker: string; nombre: string; sector: string | null;
  tipo: TipoAviso; titulo: string; texto: string; creado: string; leido: boolean;
}

export interface Objetivo {
  ticker: string; nombre?: string; sector?: string | null; precio: number; direccion: "baja" | "sube";
  creado: string; cumplido: string | null; precioActual?: number | null;
}
