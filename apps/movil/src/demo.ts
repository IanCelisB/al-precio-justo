/**
 * Modo demo (solo para la versión estática de GitHub Pages).
 *
 * Se activa SOLO al compilar con EXPO_PUBLIC_ANCLA_DEMO=1. Responde las mismas rutas
 * que la API, pero leyendo una foto de los datos (archivos JSON publicados junto a la
 * app) y guardando en el navegador lo que en la app real va a la base de datos: la
 * sesión de invitado, las empresas seguidas, las métricas elegidas y el simulador.
 *
 * No cambia el modelo, la API ni el login: la app normal (sin la variable) sigue
 * hablando con la API, la base de datos y Google.
 */
import {
  curva, maquinaDelTiempo, prepararCompra, prepararVenta, REFERENCIA, resumen, type Cierre, type Operacion,
} from "@ancla/valoracion/simulador";
import { MONTO_MAXIMO } from "@ancla/valoracion/formato";
import { destacadas, esPequena, filas, FILTROS, type FiltroPortada } from "@ancla/valoracion/portada";
import { sectorDe } from "@ancla/valoracion/sectores";
import {
  AJUSTES_AVISOS_POR_DEFECTO, avisoObjetivo, cumpleObjetivo, direccionObjetivo, leerAjustesAvisos, objetivoValido,
  type AjustesAvisos, type Direccion,
} from "@ancla/valoracion/avisos";

export const DEMO = process.env.EXPO_PUBLIC_ANCLA_DEMO === "1";
/** Ruta base del sitio (p. ej. "/ancla" en GitHub Pages). */
export const BASE = process.env.EXPO_PUBLIC_BASE ?? "";

const AVISO = "Demo con datos fijos (foto del día de publicación) y dinero ficticio. No es asesoría financiera.";
const SEGUIDAS_POR_DEFECTO = ["AAPL", "MSFT", "GOOGL", "NVDA"];
const PUBLICO = "invitado-demo";
const CLAVE = "ancla.demo";

interface ListaDemo { id: string; nombre: string; tickers: string[] }
interface PerfilDemo { nombre: string; bio: string; foto: string | null }
interface PublicacionDemo { id: string; texto: string; ticker: string | null; cartera: any; creado: string; meGusta: boolean; comentarios: { id: string; texto: string; creado: string }[] }
interface Estado {
  sesion: boolean; seguidas: string[]; metricasExtra: string[]; operaciones: Operacion[];
  listas: ListaDemo[]; perfil: PerfilDemo; publicaciones: PublicacionDemo[];
}
const VACIO: Estado = {
  sesion: false, seguidas: [], metricasExtra: [], operaciones: [], listas: [],
  perfil: { nombre: "Invitado", bio: "", foto: null }, publicaciones: [],
};
const usuario = (e: Estado) => ({ id: "demo", email: "", nombre: e.perfil.nombre, foto: e.perfil.foto, publico: PUBLICO, bio: e.perfil.bio });
const autor = (e: Estado) => ({ publico: PUBLICO, nombre: e.perfil.nombre, foto: e.perfil.foto });
const union = (ls: ListaDemo[]) => [...new Set(ls.flatMap((l) => l.tickers))];

// --- almacenamiento del navegador ---------------------------------------------------------------
function leer(): Estado {
  try {
    const g = JSON.parse(globalThis.localStorage?.getItem(CLAVE) ?? "null");
    if (g && typeof g === "object") {
      const seguidas: string[] = g.seguidas ?? [];
      // Antes había una sola lista: las seguidas pasan a "Mi lista".
      const listas: ListaDemo[] = g.listas ?? (seguidas.length ? [{ id: "1", nombre: "Mi lista", tickers: seguidas }] : []);
      return {
        ...VACIO, sesion: !!g.sesion, metricasExtra: g.metricasExtra ?? [], operaciones: g.operaciones ?? [],
        listas, seguidas: union(listas), perfil: { ...VACIO.perfil, ...(g.perfil ?? {}) }, publicaciones: g.publicaciones ?? [],
      };
    }
  } catch { /* sin almacenamiento */ }
  return { ...VACIO };
}
function guardar(e: Estado) {
  try { globalThis.localStorage?.setItem(CLAVE, JSON.stringify({ ...e, seguidas: union(e.listas) })); } catch { /* sin almacenamiento */ }
}

/** Una publicación de la demo con la forma de la API (solo existen las del propio navegador). */
const publicacion = (e: Estado, x: PublicacionDemo) => ({
  id: x.id, autor: autor(e), texto: x.texto, ticker: x.ticker, cartera: x.cartera, creado: x.creado,
  meGusta: x.meGusta ? 1 : 0, comentarios: x.comentarios.length, loHeGustado: x.meGusta, mia: true,
});

async function rutasComunidad(p: string, metodo: string, cuerpo: any, e: Estado): Promise<unknown> {
  if (p === "/comunidad" && metodo === "GET") return e.publicaciones.map((x) => publicacion(e, x));
  if (p === "/buzon") {
    const texto = String(cuerpo.texto ?? "").trim();
    if (texto.length < 3) throw new ErrorDemo(400, "Escribe tu mensaje.");
    return { ok: true };
  }
  if (p.startsWith("/usuarios/")) {
    return {
      publico: PUBLICO, nombre: e.perfil.nombre, foto: e.perfil.foto, bio: e.perfil.bio, desde: new Date().toISOString(),
      meGustaRecibidos: e.publicaciones.filter((x) => x.meGusta).length, publicaciones: e.publicaciones.map((x) => publicacion(e, x)), soyYo: true,
    };
  }
  const m = p.match(/^\/comunidad\/(\d+)\/(comentarios|me-gusta)$/);
  if (p.startsWith("/comentarios/")) {
    const id = p.slice(13);
    for (const x of e.publicaciones) x.comentarios = x.comentarios.filter((c) => c.id !== id);
    guardar(e);
    return { ok: true };
  }
  if (m && m[2] === "comentarios") {
    const x = e.publicaciones.find((y) => y.id === m[1]);
    if (!x) throw new ErrorDemo(404, "Esa publicación ya no existe.");
    if (metodo === "POST") {
      const texto = String(cuerpo.texto ?? "").trim().slice(0, 500);
      if (!texto) throw new ErrorDemo(400, "Escribe un comentario.");
      const c = { id: String(Date.now()), texto, creado: new Date().toISOString() };
      x.comentarios.push(c);
      guardar(e);
      return { ...c, autor: autor(e), mio: true };
    }
    return x.comentarios.map((c) => ({ ...c, autor: autor(e), mio: true }));
  }
  if (m && m[2] === "me-gusta") {
    const x = e.publicaciones.find((y) => y.id === m[1]);
    if (!x) throw new ErrorDemo(404, "Esa publicación ya no existe.");
    x.meGusta = metodo === "PUT";
    guardar(e);
    return { meGusta: x.meGusta ? 1 : 0, loHeGustado: x.meGusta };
  }
  if (p === "/comunidad" && metodo === "POST") {
    const texto = String(cuerpo.texto ?? "").trim().slice(0, 1000);
    let cartera = null;
    if (cuerpo.compartirCartera) {
      const c = await cartera_(e);
      if (!c.posiciones.length) throw new ErrorDemo(400, "Tu cartera del simulador está vacía.");
      cartera = {
        gananciaPct: c.gananciaPct, valorTotal: c.valorTotal,
        posiciones: c.posiciones.map((x: any) => ({ ticker: x.ticker, peso: (x.valor ?? 0) / (c.valorPosiciones || 1), gananciaPct: x.gananciaPct }))
          .sort((a: any, b: any) => b.peso - a.peso).slice(0, 12),
      };
    }
    if (!texto && !cartera) throw new ErrorDemo(400, "Escribe algo antes de publicar.");
    const x: PublicacionDemo = { id: String(Date.now()), texto, ticker: cuerpo.ticker ? String(cuerpo.ticker).toUpperCase() : null, cartera, creado: new Date().toISOString(), meGusta: false, comentarios: [] };
    e.publicaciones.unshift(x);
    guardar(e);
    return publicacion(e, x);
  }
  if (p.startsWith("/comunidad/") && metodo === "DELETE") {
    e.publicaciones = e.publicaciones.filter((x) => x.id !== p.slice(11));
    guardar(e);
    return { ok: true };
  }
  throw new ErrorDemo(404, `La demo no tiene ${p}`);
}

// --- foto de los datos ----------------------------------------------------------------------------
const cache = new Map<string, Promise<any>>();
function archivo<T>(ruta: string): Promise<T> {
  if (!cache.has(ruta)) {
    cache.set(ruta, fetch(`${BASE}/datos/${ruta}`).then((r) => {
      if (!r.ok) throw new ErrorDemo(404, "No tenemos esa empresa en la demo.");
      return r.json();
    }).catch((e) => { cache.delete(ruta); throw e; }));
  }
  return cache.get(ruta)!;
}
const resumenes = () => archivo<any[]>("resumenes.json");
const ficha = (t: string) => archivo<any>(`empresas/${encodeURIComponent(t)}.json`);
const spy = () => archivo<Cierre[]>("spy.json");

export class ErrorDemo extends Error {
  codigo: number;
  constructor(codigo: number, mensaje: string) {
    super(mensaje);
    this.codigo = codigo;
  }
}

function coincide(r: { ticker: string; nombre: string }, q: string): number {
  const t = r.ticker.toLowerCase(), n = r.nombre.toLowerCase();
  if (t === q) return 3;
  if (t.startsWith(q) || n.startsWith(q)) return 2;
  return n.includes(q) ? 1 : 0;
}

// --- simulador en el navegador (mismas funciones que la API) --------------------------------------
const cartera_ = (e: Estado) => cartera(e);
async function cartera(e: Estado) {
  const todas = await resumenes();
  const por = new Map(todas.map((r) => [r.ticker, r]));
  const ops = e.operaciones;
  const precios: Record<string, number | null> = {};
  for (const o of ops) precios[o.ticker] = por.get(o.ticker)?.precio ?? null;
  const r = resumen(ops, precios);
  let serie: { fecha: string; valor: number; referencia: number | null }[] = [];
  if (ops.length) {
    const tickers = [...new Set(ops.map((o) => o.ticker))];
    const cierres: Record<string, Cierre[]> = { [REFERENCIA]: await spy() };
    for (const t of tickers) cierres[t] = (await ficha(t)).precios;
    const primera = ops[0].fecha.slice(0, 10);
    serie = curva(ops, cierres, cierres[REFERENCIA].map((c) => c.fecha).filter((f) => f >= primera));
  }
  const conNombre = <T extends { ticker: string }>(x: T) => ({ ...x, nombre: por.get(x.ticker)?.nombre ?? x.ticker, sector: por.get(x.ticker)?.sector ?? null });
  return {
    ...r, posiciones: r.posiciones.map(conNombre), operaciones: ops.slice(-30).reverse().map(conNombre),
    curva: serie, referencia: serie.at(-1)?.referencia ?? null, aviso: AVISO,
  };
}

// --- avisos en el navegador (los datos son una foto fija: solo el precio objetivo puede cumplirse) ------
interface EstadoAvisos {
  ajustes: AjustesAvisos;
  objetivos: { ticker: string; precio: number; direccion: Direccion; creado: string; cumplido: string | null }[];
  avisos: { id: number; ticker: string; tipo: "objetivo"; titulo: string; texto: string; creado: string; leido: boolean }[];
}
const CLAVE_AVISOS = "ancla.demo.avisos";
function leerAvisos(): EstadoAvisos {
  try {
    const g = JSON.parse(globalThis.localStorage?.getItem(CLAVE_AVISOS) ?? "null");
    if (g && typeof g === "object") {
      return { ajustes: leerAjustesAvisos(g.ajustes), objetivos: g.objetivos ?? [], avisos: g.avisos ?? [] };
    }
  } catch { /* sin almacenamiento */ }
  return { ajustes: { ...AJUSTES_AVISOS_POR_DEFECTO }, objetivos: [], avisos: [] };
}
function guardarAvisos(a: EstadoAvisos) {
  try { globalThis.localStorage?.setItem(CLAVE_AVISOS, JSON.stringify(a)); } catch { /* sin almacenamiento */ }
}

async function rutasAvisos(p: string, metodo: string, cuerpo: any): Promise<unknown> {
  const a = leerAvisos();
  const todas = await resumenes();
  const por = new Map(todas.map((r) => [r.ticker, r]));
  if (p === "/yo/avisos") {
    // Revisa los precios objetivo pendientes contra la foto de precios.
    const ahora = new Date().toISOString();
    for (const o of a.objetivos) {
      const r = por.get(o.ticker);
      if (o.cumplido || !a.ajustes.objetivo || !r || !cumpleObjetivo(o, r.precio)) continue;
      const n = avisoObjetivo({ ...r, precioFecha: null, ultimoTrimestre: null }, o);
      a.avisos.unshift({ id: Date.now() + a.avisos.length, ticker: n.ticker, tipo: "objetivo", titulo: n.titulo, texto: n.texto, creado: ahora, leido: false });
      o.cumplido = ahora;
    }
    guardarAvisos(a);
    return {
      sinLeer: a.avisos.filter((x) => !x.leido).length,
      avisos: a.avisos.slice(0, 50).map((x) => ({ ...x, nombre: por.get(x.ticker)?.nombre ?? x.ticker, sector: por.get(x.ticker)?.sector ?? null })),
    };
  }
  if (p === "/yo/avisos/leidos") {
    a.avisos = a.avisos.map((x) => ({ ...x, leido: true }));
    guardarAvisos(a);
    return { sinLeer: 0 };
  }
  if (p === "/yo/avisos/ajustes") {
    if (metodo === "PUT") { a.ajustes = leerAjustesAvisos(cuerpo, a.ajustes); guardarAvisos(a); }
    return a.ajustes;
  }
  if (p === "/yo/objetivos") {
    return a.objetivos.map((o) => ({ ...o, nombre: por.get(o.ticker)?.nombre ?? o.ticker, sector: por.get(o.ticker)?.sector ?? null,
      precioActual: por.get(o.ticker)?.precio ?? null }));
  }
  const t = decodeURIComponent(p.slice("/yo/objetivos/".length)).toUpperCase();
  a.objetivos = a.objetivos.filter((o) => o.ticker !== t);
  if (metodo === "DELETE") { guardarAvisos(a); return { ok: true }; }
  const r = por.get(t);
  if (!r) throw new ErrorDemo(404, `No conocemos ${t}`);
  const precio = Number(cuerpo.precio);
  const error = objetivoValido(precio, r.precio);
  if (error) throw new ErrorDemo(400, error);
  const o = { ticker: t, precio: Math.round(precio * 100) / 100, direccion: direccionObjetivo(precio, r.precio), creado: new Date().toISOString(), cumplido: null };
  a.objetivos.unshift(o);
  guardarAvisos(a);
  return o;
}

// --- rutas ------------------------------------------------------------------------------------------
export async function responder(ruta: string, init: RequestInit = {}): Promise<unknown> {
  const url = new URL(ruta, "http://demo");
  const p = url.pathname, q = url.searchParams;
  const metodo = (init.method ?? "GET").toUpperCase();
  const cuerpo = init.body ? JSON.parse(String(init.body)) : {};
  const e = leer();

  if (p === "/auth/config") return { google: false, prueba: true };
  if (p === "/auth/google") throw new ErrorDemo(400, "En la demo se entra como invitado.");
  if (p === "/auth/prueba") { guardar({ ...e, sesion: true }); return { token: "demo", usuario: usuario(e) }; }

  if (p === "/inicio") {
    const [todas, base] = await Promise.all([resumenes(), archivo<any>("inicio.json")]);
    const propias = e.sesion && e.seguidas.length > 0;
    const pedidas = propias ? e.seguidas : SEGUIDAS_POR_DEFECTO;
    return { ...base, seguidas: pedidas.map((t) => todas.find((r) => r.ticker === t)).filter(Boolean), seguidasPropias: propias };
  }
  if (p === "/empresas") {
    const todas = await resumenes();
    const t = q.get("tickers");
    return t ? t.split(",").map((x) => todas.find((r) => r.ticker === x.toUpperCase())).filter(Boolean) : todas;
  }
  if (p.startsWith("/empresas/") && !p.endsWith("/tambien")) return ficha(decodeURIComponent(p.slice(10)).toUpperCase());
  if (p === "/recomendaciones") return archivo("recomendaciones.json");
  if (p === "/portada") {
    const todas = await resumenes();
    const vistas: Record<string, number> = (() => { try { return JSON.parse(globalThis.localStorage?.getItem("apj.demo.vistas") ?? "{}"); } catch { return {}; } })();
    const f = (FILTROS.some((x) => x.id === q.get("filtro")) ? q.get("filtro") : "todo") as FiltroPortada;
    const ctx = {
      vistas: Object.entries(vistas).sort((a, b) => b[1] - a[1]).map(([t]) => t),
      compras: [...new Set(e.operaciones.filter((o) => o.tipo === "compra").map((o) => o.ticker))],
      mias: e.sesion ? e.seguidas : [],
      listas: e.sesion ? e.listas : [],
      nombreSector: (x: string | null) => sectorDe(x).nombre,
    };
    return { filtro: f, destacadas: destacadas(todas, ctx), filas: filas(f, todas, ctx) };
  }
  if (p === "/divisas") return archivo("divisas.json");
  // Uso: en la demo no hay servidor; se cuenta solo en este navegador.
  if (p === "/eventos") {
    const vistas: Record<string, number> = (() => { try { return JSON.parse(globalThis.localStorage?.getItem("apj.demo.vistas") ?? "{}"); } catch { return {}; } })();
    vistas[cuerpo.ticker] = (vistas[cuerpo.ticker] ?? 0) + 1;
    try { globalThis.localStorage?.setItem("apj.demo.vistas", JSON.stringify(vistas)); } catch { /* sin almacenamiento */ }
    return null;
  }
  if (p === "/tendencias") {
    const vistas: Record<string, number> = (() => { try { return JSON.parse(globalThis.localStorage?.getItem("apj.demo.vistas") ?? "{}"); } catch { return {}; } })();
    const todas = await resumenes();
    const lista = Object.entries(vistas).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([ticker, n]) => ({ ticker, n, previo: 0, empresa: todas.find((r) => r.ticker === ticker) })).filter((x) => x.empresa);
    return { dias: 7, vistas: lista, seguidas: [], compras: [] };
  }
  if (p.endsWith("/tambien")) return [];
  if (p === "/buscar") {
    const texto = (q.get("q") ?? "").trim().toLowerCase();
    let lista = (await resumenes()).map((r) => ({ r, m: texto ? coincide(r, texto) : 1 })).filter((x) => x.m > 0);
    const universo = lista.length;
    if (q.get("tipo")) lista = lista.filter((x) => x.r.analisis.tipo === q.get("tipo"));
    if (q.get("tamano") === "grande") lista = lista.filter((x) => !esPequena(x.r));
    if (q.get("tamano") === "pequena") lista = lista.filter((x) => esPequena(x.r));
    if (q.get("buenPrecio") === "1") lista = lista.filter((x) => x.r.analisis.buenPrecio);
    lista.sort((a, b) => b.m - a.m || (b.r.analisis.orden ?? 0) - (a.r.analisis.orden ?? 0));
    const desde = Number(q.get("desde") ?? 0) || 0;
    return { total: lista.length, universo: texto ? undefined : universo, resultados: lista.slice(desde, desde + Number(q.get("limite") ?? 30)).map((x) => x.r) };
  }
  if (p === "/simulador/tiempo") {
    const importe = Number(q.get("importe") ?? 1000);
    if (!Number.isFinite(importe) || importe <= 0 || importe > MONTO_MAXIMO) throw new ErrorDemo(400, "Monto fuera de rango.");
    const desde = q.get("desde") ?? "";
    const contra = q.get("contra") ? String(q.get("contra")).toUpperCase() : null;
    const [f, c] = await Promise.all([ficha(String(q.get("ticker")).toUpperCase()), contra ? ficha(contra) : Promise.resolve(null)]);
    const r = maquinaDelTiempo(importe, f.precios, desde, c?.precios ?? []);
    if (!r) throw new ErrorDemo(404, "No hay precios para esa fecha.");
    return { ticker: f.ticker, importe, contra, ...r, aviso: AVISO };
  }

  if (p === "/comunidad" && metodo === "GET") return e.sesion ? rutasComunidad(p, metodo, cuerpo, e) : [];
  if (p.startsWith("/usuarios/") || p === "/buzon" || (p.startsWith("/comunidad/") && p.endsWith("/comentarios") && metodo === "GET")) {
    return rutasComunidad(p, metodo, cuerpo, e);
  }

  // Desde aquí, todo necesita la sesión de invitado.
  if (!e.sesion) throw new ErrorDemo(401, "Inicia sesión como invitado.");
  if (p.startsWith("/comunidad") || p.startsWith("/comentarios/")) return rutasComunidad(p, metodo, cuerpo, e);
  if (p === "/yo/perfil") {
    if (cuerpo.nombre !== undefined) {
      const n = String(cuerpo.nombre).trim().slice(0, 40);
      if (n.length < 2) throw new ErrorDemo(400, "El nombre debe tener al menos 2 letras.");
      e.perfil.nombre = n;
    }
    if (cuerpo.bio !== undefined) e.perfil.bio = String(cuerpo.bio).trim().slice(0, 280);
    if (cuerpo.foto !== undefined) e.perfil.foto = cuerpo.foto || null;
    guardar(e);
    return { usuario: usuario(e) };
  }
  if (p.startsWith("/yo/listas")) {
    const [, , , id, , ticker] = p.split("/");
    if (!id && metodo === "POST") {
      const nombre = String(cuerpo.nombre ?? "").trim().slice(0, 40);
      if (!nombre) throw new ErrorDemo(400, "Ponle un nombre a la lista.");
      if (e.listas.length >= 20) throw new ErrorDemo(400, "Puedes tener hasta 20 listas.");
      const l = { id: String(Date.now()), nombre, tickers: [] };
      e.listas.push(l);
      guardar(e);
      return { lista: l, listas: e.listas };
    }
    const l = e.listas.find((x) => x.id === id);
    if (id && !l) throw new ErrorDemo(404, "No existe esa lista.");
    if (l && ticker) {
      const t = decodeURIComponent(ticker).toUpperCase();
      l.tickers = metodo === "DELETE" ? l.tickers.filter((x) => x !== t) : [...new Set([...l.tickers, t])];
    } else if (l && metodo === "PUT") {
      const nombre = String(cuerpo.nombre ?? "").trim().slice(0, 40);
      if (nombre) l.nombre = nombre;
    } else if (l && metodo === "DELETE") {
      e.listas = e.listas.filter((x) => x !== l);
    }
    guardar(e);
    return { listas: e.listas, seguidas: union(e.listas) };
  }
  if (p === "/yo") {
    if (metodo === "DELETE") {
      guardar({ ...VACIO });
      try { globalThis.localStorage?.removeItem(CLAVE_AVISOS); } catch { /* sin almacenamiento */ }
      return { ok: true };
    }
    return { usuario: usuario(e), seguidas: union(e.listas), metricasExtra: e.metricasExtra, listas: e.listas };
  }
  if (p.startsWith("/yo/seguidas/")) {
    const t = decodeURIComponent(p.slice(13)).toUpperCase();
    if (metodo === "DELETE") e.listas.forEach((l) => { l.tickers = l.tickers.filter((x) => x !== t); });
    else {
      if (!e.listas.length) e.listas.push({ id: "1", nombre: "Mi lista", tickers: [] });
      e.listas[0].tickers = [...new Set([...e.listas[0].tickers, t])];
    }
    guardar(e);
    return { seguidas: union(e.listas) };
  }
  if (p === "/yo/metricas") { guardar({ ...e, metricasExtra: cuerpo.ids ?? [] }); return { metricasExtra: cuerpo.ids ?? [] }; }
  if (p.startsWith("/yo/avisos") || p.startsWith("/yo/objetivos")) return rutasAvisos(p, metodo, cuerpo);
  if (p === "/simulador") return cartera(e);
  if (p === "/simulador/reiniciar") { const n = { ...e, operaciones: [] }; guardar(n); return cartera(n); }
  if (p === "/simulador/comprar" || p === "/simulador/vender") {
    const t = String(cuerpo.ticker ?? "").toUpperCase();
    const precio = (await resumenes()).find((r) => r.ticker === t)?.precio ?? null;
    const ahora = new Date().toISOString();
    const o = p.endsWith("comprar")
      ? prepararCompra(e.operaciones, t, Number(cuerpo.importe), precio, ahora)
      : prepararVenta(e.operaciones, t, cuerpo.acciones ?? null, precio, ahora);
    if (typeof o === "string") throw new ErrorDemo(400, o);
    const n = { ...e, operaciones: [...e.operaciones, o] };
    guardar(n);
    return { operacion: o, cartera: await cartera(n) };
  }
  throw new ErrorDemo(404, `La demo no tiene ${p}`);
}
