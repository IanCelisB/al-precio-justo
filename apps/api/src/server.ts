/**
 * API de Al Precio Justo.
 *
 *   GET /inicio?seguidas=AAPL,MSFT      oportunidad del día, tus empresas y las más baratas
 *   GET /empresas?tickers=A,B           todas (o solo esas), con precio, valor, estado y análisis
 *   GET /empresas/:ticker               ficha: trimestres, valoración, análisis, precios, perfil y datos clave
 *   GET /buscar?q=&tipo=&buenPrecio=1   búsqueda ordenada por el criterio prudente
 *   GET /recomendaciones                sugeridas y para vigilar, con sus razones
 *   GET /logos/:ticker                  logo de la empresa (PNG)
 *   GET /novedades?limite=20            últimos reportes publicados
 *   GET /portada?filtro=todo            destacadas y filas de carruseles (Para ti, Popularidad, Por sector…)
 *   GET /divisas                        tipos de cambio del día (unidades por 1 USD)
 *   POST /eventos {tipo, ticker, sesion}  registro de uso anónimo (vistas)
 *   GET /tendencias?dias=7              las más vistas, seguidas y compradas
 *   GET /empresas/:ticker/tambien       quienes la vieron también vieron…
 *   GET /estado-datos                   estado de la actualización automática
 *
 *   GET  /auth/config                   qué formas de iniciar sesión están activas
 *   POST /auth/google {idToken}         inicia sesión con Google → { token, usuario }
 *   GET  /yo                            usuario, seguidas y métricas elegidas
 *   PUT/DELETE /yo/seguidas/:ticker     seguir / dejar de seguir
 *   PUT  /yo/metricas {ids}             métricas adicionales elegidas
 *   DELETE /yo                          borra la cuenta
 *
 *   GET  /yo/avisos                     avisos (últimos 50) y cuántos sin leer
 *   PUT  /yo/avisos/leidos {ids?}       marca como leídos (todos si no hay ids)
 *   GET/PUT /yo/avisos/ajustes          qué avisos quiere el usuario (por defecto, solo precio objetivo)
 *   GET  /yo/objetivos                  precios objetivo
 *   PUT/DELETE /yo/objetivos/:ticker {precio}   fijar o quitar el precio objetivo
 *
 *   GET  /simulador                     cartera simulada (30.000 USD ficticios)
 *   POST /simulador/comprar {ticker, importe} · /vender {ticker, acciones|null} · /reiniciar
 *   GET  /simulador/tiempo?ticker=&importe=&desde=&contra=   máquina del tiempo (sin sesión), contra otra empresa
 *
 *   GET  /yo/listas · POST {nombre} · PUT/DELETE /yo/listas/:id · PUT/DELETE /yo/listas/:id/empresas/:ticker
 *   PUT  /yo/perfil {nombre?, foto?, bio?}   lo que ven los demás en la comunidad
 *
 *   GET  /comunidad?antes=&ticker=       muro: lo último que publicaron todos
 *   POST /comunidad {texto, ticker?, compartirCartera?}   · DELETE /comunidad/:id (solo el autor)
 *   PUT/DELETE /comunidad/:id/me-gusta   · GET/POST /comunidad/:id/comentarios · DELETE /comentarios/:id
 *   GET  /usuarios/:publico              perfil público y sus publicaciones
 *   POST /buzon {tipo, texto}            comentarios, sugerencias y reclamos
 */
import Fastify from "fastify";
import cors from "@fastify/cors";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { estado, valorar, type Estado, type Trimestre, type Valoracion } from "@ancla/valoracion";
import { analizar, type Analisis, type Tipo } from "@ancla/valoracion/recomendaciones";
import { porId } from "@ancla/valoracion/metricas";
import { datosClave } from "@ancla/valoracion/perfil";
import { destacadas, filas, FILTROS, type FiltroPortada } from "@ancla/valoracion/portada";
import { sectorDe } from "@ancla/valoracion/sectores";
import { MONTO_MAXIMO } from "@ancla/valoracion/formato";
import { curva, maquinaDelTiempo, prepararCompra, prepararVenta, REFERENCIA, resumen } from "@ancla/valoracion/simulador";
import { Datos, type Cotizacion, type Empresa } from "./datos.ts";
import { Analitica, TIPOS_EVENTO, type TipoEvento } from "./analitica.ts";
import { CLIENT_IDS, crearSesion, ErrorAuth, LOGIN_PRUEBA, usuarioDeSesion, verificarGoogle } from "./auth.ts";
import { Usuarios } from "./usuarios.ts";
import { abrirBD } from "./bd.ts";
import { Avisos } from "./avisos.ts";
import { Comunidad, fotoValida, LIMITES, limpiar, type CarteraCompartida } from "./comunidad.ts";
import { esPequena } from "@ancla/valoracion/portada";
import { objetivoValido } from "@ancla/valoracion/avisos";
import { Logos } from "./logos.ts";
import { bajarSiCambio, CADA, reemplazar, URL_DATOS } from "./descarga.ts";

const RAIZ = resolve(fileURLToPath(import.meta.url), "../../../..");
const DB = process.env.ANCLA_DB ?? resolve(RAIZ, "data/ancla.db");
// Usuarios, analítica y avisos: Postgres (DATABASE_URL) o, sin ella, PGlite en esta carpeta.
const DIR_PG = process.env.ANCLA_PG_DIR ?? resolve(RAIZ, "data/pg");
const PUERTO = Number(process.env.PORT ?? 4000);
const SEGUIDAS_POR_DEFECTO = ["AAPL", "MSFT", "GOOGL", "NVDA"];

/** Resumen del análisis prudente que viaja con cada empresa (sin las razones). */
export interface AnalisisCorto {
  orden: number;
  tipo: Tipo;
  calidad: number;
  precioCompra: number | null;
  buenPrecio: boolean;
  sugerida: boolean;
  vigilar: boolean;
  motivo: string;
}

export interface Resumen extends Empresa {
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
  cambio1a: number | null;          // variación del precio en 12 meses
  capitalizacion: number | null;
  seguidores: number;
}

interface Cache {
  creado: number;
  marcas: Map<string, string>;
  resumenes: Map<string, Resumen>;
  trimestres: Map<string, Trimestre[]>;
  valoraciones: Map<string, Valoracion>;
  analisis: Map<string, Analisis>;
}

// En Render, la base de mercado se descarga de la última publicación (ver descarga.ts).
if (URL_DATOS) {
  const nueva = await bajarSiCambio(DB);
  if (nueva) await reemplazar(nueva, DB);
}
let datos = new Datos(DB);
const bd = await abrirBD({ dir: DIR_PG });
const usuarios = new Usuarios(bd);
const analitica = new Analitica(bd);
const avisos = new Avisos(bd);
const comunidad = new Comunidad(bd);
await analitica.limpiar();
const logos = new Logos(process.env.ANCLA_LOGOS ?? resolve(RAIZ, "data/logos"));
let cache: Cache | null = null;

/** Valora y analiza todas las empresas (~30 ms; la primera vez ~2 s por la carga de trimestres). */
function calcular(previo: Cache | null, seguidores: Map<string, number>): Cache {
  // Solo se recargan los trimestres de las empresas que la ingesta tocó desde la última vez.
  const marcas = datos.marcas();
  let trimestres: Map<string, Trimestre[]>;
  if (previo) {
    const cambiadas = [...marcas].filter(([t, m]) => previo.marcas.get(t) !== m).map(([t]) => t);
    trimestres = new Map(previo.trimestres);
    for (let i = 0; i < cambiadas.length; i += 500) {
      const lote = cambiadas.slice(i, i + 500);
      const nuevos = datos.trimestres(lote);
      for (const t of lote) trimestres.set(t, nuevos.get(t) ?? []);
    }
  } else {
    trimestres = datos.trimestres();
  }
  const cotiz = datos.cotizaciones();
  const haceUnAnio = datos.cierreHace(365);
  const resumenes = new Map<string, Resumen>();
  const valoraciones = new Map<string, Valoracion>();
  const analisis = new Map<string, Analisis>();
  for (const e of datos.empresas()) {
    const t = trimestres.get(e.ticker) ?? [];
    const q: Cotizacion | undefined = cotiz.get(e.ticker);
    const v = valorar(t, { precio: q?.precio, sector: e.sector ?? undefined });
    if (v.ok) valoraciones.set(e.ticker, v);
    const a = analizar({ sector: e.sector, precio: q?.precio ?? null, valor: v.ok ? v.valor : null, trimestres: t });
    analisis.set(e.ticker, a);
    resumenes.set(e.ticker, {
      ...e,
      precio: q?.precio ?? null,
      cambioPct: q?.cambioPct ?? null,
      precioFecha: q?.fecha ?? null,
      valor: v.ok ? v.valor : null,
      bandaMin: v.ok ? v.banda.min : null,
      bandaMax: v.ok ? v.banda.max : null,
      estado: v.ok && q ? estado(q.precio, v.valor) : null,
      sinModelo: v.ok ? null : v.motivo,
      ultimoTrimestre: t.at(-1)?.periodo ?? null,
      cambio1a: q?.precio && haceUnAnio.get(e.ticker) ? q.precio / haceUnAnio.get(e.ticker)! - 1 : null,
      capitalizacion: q?.precio && accionesDe(t) ? q.precio * accionesDe(t)! : null,
      seguidores: seguidores.get(e.ticker) ?? 0,
      analisis: {
        tipo: a.tipo, calidad: a.calidad.puntos, precioCompra: a.precioCompra, buenPrecio: a.buenPrecio,
        sugerida: a.sugerida, vigilar: a.vigilar, motivo: a.motivo, orden: a.orden,
      },
    });
  }
  return { creado: Date.now(), marcas, resumenes, trimestres, valoraciones, analisis };
}

let version = "";
let revisado = 0;
let recalculando: Promise<Cache> | null = null;

/** Recalcula y, con los datos nuevos, revisa los avisos (en segundo plano). */
async function recalcular(): Promise<Cache> {
  recalculando ??= (async () => {
    try {
      cache = calcular(cache, await usuarios.seguidores());
      const c = cache;
      avisos.revisar([...c.resumenes.values()]).catch((e) => app.log.error(e));
      return c;
    } finally { recalculando = null; }
  })();
  return recalculando;
}

/** Recalcula cada 5 minutos o en cuanto la ingesta publica algo nuevo (se mira cada 30 s). */
async function actual(): Promise<Cache> {
  const ahora = Date.now();
  if (cache && ahora - revisado > 30_000) {
    revisado = ahora;
    const v = datos.version();
    if (v !== version) { version = v; return recalcular(); }
  }
  if (!cache || ahora - cache.creado > 5 * 60_000) return recalcular();
  return cache;
}

/**
 * Oportunidad del día: entre las 10 empresas más baratas respecto a su valor,
 * una distinta cada día. Se descartan descuentos de más del 60 %, que suelen
 * indicar datos raros (p. ej. un trimestre extraordinario) más que una ganga.
 */
function oportunidad(resumenes: Resumen[], hoy = new Date()): Resumen | null {
  const candidatas = resumenes
    .filter((r) => r.estado === "barata" && r.precio && r.valor && r.precio / r.valor >= 0.4)
    .sort((a, b) => a.precio! / a.valor! - b.precio! / b.valor!)
    .slice(0, 10);
  if (!candidatas.length) return null;
  const dia = Math.floor(hoy.getTime() / 86_400_000);
  return candidatas[dia % candidatas.length];
}

/** Acciones más recientes informadas (últimos 4 trimestres). */
function accionesDe(t: Trimestre[]): number | null {
  for (let i = t.length - 1; i >= Math.max(0, t.length - 4); i--) if (t[i].acciones) return t[i].acciones!;
  return null;
}

/** Las más baratas frente a su valor (sin las de menos del 40 %, que suelen ser datos raros). */
function masBaratas(resumenes: Resumen[], excluir: string | undefined, n: number): Resumen[] {
  return resumenes
    .filter((e) => e.estado === "barata" && e.precio && e.valor && e.precio / e.valor >= 0.4 && e.ticker !== excluir)
    .sort((a, b) => a.precio! / a.valor! - b.precio! / b.valor!)
    .slice(0, n);
}

/** Coincidencia de texto: 3 = ticker exacto, 2 = empieza igual, 1 = contiene, 0 = no. */
function coincide(r: Resumen, q: string): number {
  const t = r.ticker.toLowerCase();
  const n = r.nombre.toLowerCase();
  if (t === q) return 3;
  if (t.startsWith(q) || n.startsWith(q)) return 2;
  if (n.includes(q)) return 1;
  return 0;
}

const app = Fastify({ logger: { level: "warn" } });
await app.register(cors, { origin: true, methods: ["GET", "POST", "PUT", "DELETE"] });

declare module "fastify" {
  interface FastifyRequest { usuarioId: string | null }
}
app.decorateRequest("usuarioId", null);
app.addHook("preHandler", async (req) => {
  req.usuarioId = await usuarioDeSesion(req.headers.authorization);
});

async function exigirUsuario(req: { usuarioId: string | null }): Promise<string> {
  if (!req.usuarioId || !(await usuarios.obtener(req.usuarioId))) throw new ErrorAuth(401, "Inicia sesión para continuar.");
  return req.usuarioId;
}

app.setErrorHandler((err, _req, rep) => {
  if (err instanceof ErrorAuth) return rep.code(err.codigo).send({ error: err.message });
  app.log.error(err);
  const codigo = (err as { statusCode?: number }).statusCode ?? 500;
  return rep.code(codigo).send({ error: codigo === 500 ? "Error interno" : (err as Error).message });
});

app.get("/salud", async () => ({ ok: true }));

app.get<{ Querystring: { limite?: string } }>("/novedades", async (req) => {
  const c = await actual();
  const limite = Math.min(Number(req.query.limite ?? 20) || 20, 100);
  return datos.novedades(limite).map((n) => {
    const r = c.resumenes.get(n.ticker);
    return { ...n, nombre: r?.nombre ?? n.ticker, sector: r?.sector ?? null, estado: r?.estado ?? null };
  });
});

app.get<{ Querystring: { filtro?: string } }>("/portada", async (req) => {
  const c = await actual();
  const filtro = (FILTROS.some((f) => f.id === req.query.filtro) ? req.query.filtro : "todo") as FiltroPortada;
  const todas = [...c.resumenes.values()];
  const ctx = {
    vistas: (await analitica.ranking("vista", 7, 20)).map((x) => x.ticker),
    compras: (await analitica.ranking("compra", 30, 20)).map((x) => x.ticker),
    mias: req.usuarioId ? await usuarios.seguidas(req.usuarioId) : [],
    listas: req.usuarioId ? await usuarios.listas(req.usuarioId) : [],
    nombreSector: (s: string | null) => sectorDe(s).nombre,
  };
  return { filtro, filtros: FILTROS, destacadas: destacadas(todas, ctx), filas: filas(filtro, todas, ctx) };
});

app.get("/divisas", async () => {
  const filas = datos.divisas();
  return {
    base: "USD",
    tasas: Object.fromEntries([["USD", 1], ...filas.map((f) => [f.codigo, f.porUsd])]),
    detalle: filas,
  };
});

// --- uso anónimo --------------------------------------------------------------------------------
const SESION = /^[A-Za-z0-9-]{8,64}$/;

app.post<{ Body: { tipo?: string; ticker?: string; sesion?: string } }>("/eventos", async (req, rep) => {
  const t = String(req.body?.ticker ?? "").toUpperCase();
  const sesion = String(req.body?.sesion ?? "");
  // Desde la app solo llegan vistas; seguir y comprar se cuentan aquí mismo, en el servidor.
  if (req.body?.tipo !== "vista" || !(await actual()).resumenes.has(t) || !SESION.test(sesion)) {
    return rep.code(400).send({ error: "Evento no válido" });
  }
  await analitica.registrar("vista", t, sesion);
  return rep.code(204).send();
});

const conResumen = async <T extends { ticker: string }>(filas: T[]) => {
  const c = await actual();
  return filas.map((f) => ({ ...f, empresa: c.resumenes.get(f.ticker) ?? null })).filter((f) => f.empresa);
};

app.get<{ Querystring: { dias?: string } }>("/tendencias", async (req) => {
  const dias = Math.min(Math.max(Number(req.query.dias ?? 7) || 7, 1), 90);
  const r = async (tipo: TipoEvento) => conResumen(await analitica.ranking(tipo, dias, 10));
  return { dias, vistas: await r("vista"), seguidas: await r("seguir"), compras: await r("compra") };
});

app.get<{ Params: { ticker: string } }>("/empresas/:ticker/tambien", async (req) => {
  return conResumen(await analitica.tambienVieron(req.params.ticker.toUpperCase()));
});

app.get("/estado-datos", async () => ({ ...datos.estadoIngesta(), empresas: (await actual()).resumenes.size, base: bd.tipo }));

/** Logo de la empresa (PNG, en caché 7 días). 404 si no hay: las apps muestran la ilustración del sector. */
app.get<{ Params: { ticker: string } }>("/logos/:ticker", async (req, rep) => {
  const t = req.params.ticker.toUpperCase();
  if (!(await actual()).resumenes.has(t)) return rep.code(404).send({ error: `No conocemos ${t}` });
  const png = await logos.obtener(t);
  if (!png) return rep.code(404).send({ error: "Sin logo" });
  return rep.header("Content-Type", "image/png").header("Cache-Control", "public, max-age=604800").send(png);
});

app.get<{ Querystring: { seguidas?: string } }>("/inicio", async (req) => {
  const c = await actual();
  const deUsuario = req.usuarioId ? await usuarios.seguidas(req.usuarioId) : [];
  const pedidas = req.query.seguidas
    ? req.query.seguidas.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : deUsuario.length ? deUsuario : SEGUIDAS_POR_DEFECTO;
  const op = oportunidad([...c.resumenes.values()]);
  return {
    fecha: new Date().toISOString(),
    oportunidad: op,
    baratas: masBaratas([...c.resumenes.values()], op?.ticker, 8),
    seguidas: pedidas.map((t) => c.resumenes.get(t)).filter(Boolean),
    seguidasPropias: deUsuario.length > 0,
    precioFuente: "Precio con retraso (prototipo, sin licencia de redistribución)",
  };
});

app.get<{ Querystring: { q?: string; tickers?: string } }>("/empresas", async (req) => {
  const c = await actual();
  if (req.query.tickers) {
    return req.query.tickers.split(",").map((t) => c.resumenes.get(t.trim().toUpperCase())).filter(Boolean);
  }
  const q = (req.query.q ?? "").trim().toLowerCase();
  const lista = [...c.resumenes.values()];
  return q ? lista.filter((r) => coincide(r, q) > 0) : lista;
});

app.get<{ Params: { ticker: string } }>("/empresas/:ticker", async (req, rep) => {
  const c = await actual();
  const ticker = req.params.ticker.toUpperCase();
  const resumen = c.resumenes.get(ticker);
  if (!resumen) return rep.code(404).send({ error: `No conocemos ${ticker}` });
  const a = c.analisis.get(ticker)!;
  const desde = new Date(Date.now() - 10 * 365.25 * 86_400_000).toISOString().slice(0, 10);
  const precios = datos.historicoPrecios(ticker, desde);
  return {
    ...resumen,
    razones: a.calidad.razones,
    alertas: a.calidad.alertas,
    valoracion: c.valoraciones.get(ticker) ?? null,
    trimestres: c.trimestres.get(ticker) ?? [],
    precios,
    perfil: datos.perfil(ticker),
    clave: datosClave(c.trimestres.get(ticker) ?? [], precios, datos.historicoPrecios(REFERENCIA, desde), resumen.precio),
  };
});

app.get<{ Querystring: { q?: string; tipo?: Tipo; tamano?: string; buenPrecio?: string; limite?: string; desde?: string } }>("/buscar", async (req) => {
  const c = await actual();
  const q = (req.query.q ?? "").trim().toLowerCase();
  const limite = Math.min(Number(req.query.limite ?? 30) || 30, 100);
  const desde = Math.max(0, Number(req.query.desde ?? 0) || 0);
  let lista = [...c.resumenes.values()].map((r) => ({ r, m: q ? coincide(r, q) : 1 })).filter((x) => x.m > 0);
  if (req.query.tipo) lista = lista.filter((x) => x.r.analisis.tipo === req.query.tipo);
  if (req.query.tamano === "grande") lista = lista.filter((x) => !esPequena(x.r));
  if (req.query.tamano === "pequena") lista = lista.filter((x) => esPequena(x.r));
  if (req.query.buenPrecio === "1") lista = lista.filter((x) => x.r.analisis.buenPrecio);
  lista.sort((a, b) => b.m - a.m || c.analisis.get(b.r.ticker)!.orden - c.analisis.get(a.r.ticker)!.orden);
  return { total: lista.length, universo: c.resumenes.size, resultados: lista.slice(desde, desde + limite).map((x) => x.r) };
});

app.get("/recomendaciones", async () => {
  const c = await actual();
  const conRazones = (r: Resumen) => {
    const a = c.analisis.get(r.ticker)!;
    return { ...r, razones: a.calidad.razones, alertas: a.calidad.alertas };
  };
  const orden = [...c.resumenes.values()]
    .sort((a, b) => c.analisis.get(b.ticker)!.orden - c.analisis.get(a.ticker)!.orden);
  return {
    criterio: "Calidad mínima de 60/100, sin deuda excesiva, caja irregular ni dilución fuerte, y precio por debajo "
      + "de su precio de compra: el valor estimado menos un margen de seguridad del 15 % al 35 %, mayor cuanto más han variado sus ventas y su caja en el pasado.",
    aviso: "Ideas que cumplen un criterio fijo, iguales para todos. No es asesoría financiera ni una recomendación personalizada.",
    sugeridas: orden.filter((r) => r.analisis.sugerida).slice(0, 12).map(conRazones),
    vigilar: orden.filter((r) => r.analisis.vigilar).slice(0, 8).map(conRazones),
  };
});

// --- cuenta -------------------------------------------------------------------------
app.get("/auth/config", async () => ({ google: CLIENT_IDS.length > 0, prueba: LOGIN_PRUEBA }));

app.post<{ Body: { idToken?: string } }>("/auth/google", async (req, rep) => {
  if (!req.body?.idToken) return rep.code(400).send({ error: "Falta idToken" });
  const u = await usuarios.guardar(await verificarGoogle(req.body.idToken));
  return { token: await crearSesion(u), usuario: u };
});

if (LOGIN_PRUEBA) {
  // Solo en desarrollo local: un usuario ficticio para probar la app sin Google.
  app.post("/auth/prueba", async () => {
    const u = await usuarios.guardar({ id: "prueba:local", email: "prueba@ancla.local", nombre: "Usuario de prueba", foto: null });
    return { token: await crearSesion(u), usuario: u };
  });
}

app.get("/yo", async (req) => {
  const id = await exigirUsuario(req);
  const [usuario, seguidas, metricasExtra, listas] = await Promise.all([
    usuarios.obtener(id), usuarios.seguidas(id), usuarios.metricasExtra(id), usuarios.listas(id)]);
  return { usuario, seguidas, metricasExtra, listas };
});

app.put<{ Body: { nombre?: string; foto?: string | null; bio?: string } }>("/yo/perfil", async (req, rep) => {
  const id = await exigirUsuario(req);
  const b = req.body ?? {};
  const cambios: { nombre?: string; foto?: string | null; bio?: string } = {};
  if (b.nombre !== undefined) {
    cambios.nombre = limpiar(b.nombre, LIMITES.nombre);
    if (cambios.nombre.length < 2) return rep.code(400).send({ error: "El nombre debe tener al menos 2 letras." });
  }
  if (b.bio !== undefined) cambios.bio = limpiar(b.bio, LIMITES.bio);
  if (b.foto !== undefined) {
    const f = fotoValida(b.foto);
    if (f === false) return rep.code(400).send({ error: "La foto debe ser una imagen JPG, PNG o WebP de menos de 300 KB." });
    cambios.foto = f;
  }
  return { usuario: await usuarios.editarPerfil(id, cambios) };
});

// --- listas -------------------------------------------------------------------------
app.get("/yo/listas", async (req) => usuarios.listas(await exigirUsuario(req)));

app.post<{ Body: { nombre?: string } }>("/yo/listas", async (req, rep) => {
  const id = await exigirUsuario(req);
  const l = await usuarios.crearLista(id, String(req.body?.nombre ?? ""));
  if (typeof l === "string") return rep.code(400).send({ error: l });
  return { lista: l, listas: await usuarios.listas(id) };
});

app.put<{ Params: { lista: string }; Body: { nombre?: string } }>("/yo/listas/:lista", async (req, rep) => {
  const id = await exigirUsuario(req);
  if (!(await usuarios.renombrarLista(id, req.params.lista, String(req.body?.nombre ?? "")))) return rep.code(400).send({ error: "No se pudo renombrar." });
  return { listas: await usuarios.listas(id) };
});

app.delete<{ Params: { lista: string } }>("/yo/listas/:lista", async (req, rep) => {
  const id = await exigirUsuario(req);
  if (!(await usuarios.borrarLista(id, req.params.lista))) return rep.code(404).send({ error: "No existe esa lista." });
  return { listas: await usuarios.listas(id), seguidas: await usuarios.seguidas(id) };
});

for (const metodo of ["PUT", "DELETE"] as const) {
  app.route<{ Params: { lista: string; ticker: string } }>({
    method: metodo, url: "/yo/listas/:lista/empresas/:ticker",
    handler: async (req, rep) => {
      const id = await exigirUsuario(req);
      const t = req.params.ticker.toUpperCase();
      if (metodo === "PUT" && !(await actual()).resumenes.has(t)) return rep.code(404).send({ error: `No conocemos ${t}` });
      if (!(await usuarios.enLista(id, req.params.lista, t, metodo === "PUT"))) return rep.code(404).send({ error: "No existe esa lista." });
      if (metodo === "PUT") await analitica.registrar("seguir", t);
      return { listas: await usuarios.listas(id), seguidas: await usuarios.seguidas(id) };
    },
  });
}

app.put<{ Params: { ticker: string } }>("/yo/seguidas/:ticker", async (req, rep) => {
  const id = await exigirUsuario(req);
  const t = req.params.ticker.toUpperCase();
  if (!(await actual()).resumenes.has(t)) return rep.code(404).send({ error: `No conocemos ${t}` });
  await usuarios.seguir(id, t);
  await analitica.registrar("seguir", t);
  return { seguidas: await usuarios.seguidas(id) };
});

app.delete<{ Params: { ticker: string } }>("/yo/seguidas/:ticker", async (req) => {
  const id = await exigirUsuario(req);
  await usuarios.dejarDeSeguir(id, req.params.ticker.toUpperCase());
  return { seguidas: await usuarios.seguidas(id) };
});

app.put<{ Body: { ids?: string[] } }>("/yo/metricas", async (req) => {
  const id = await exigirUsuario(req);
  const ids = (req.body?.ids ?? []).filter((x) => typeof x === "string" && porId(x));
  await usuarios.guardarMetricasExtra(id, ids);
  return { metricasExtra: ids };
});

app.delete("/yo", async (req) => {
  await usuarios.borrar(await exigirUsuario(req));
  return { ok: true };
});

// --- avisos -------------------------------------------------------------------------
app.get("/yo/avisos", async (req) => {
  const id = await exigirUsuario(req);
  const { avisos: lista, sinLeer } = await avisos.lista(id);
  const c = await actual();
  return {
    sinLeer,
    avisos: lista.map((a) => {
      const e = c.resumenes.get(a.ticker);
      return { ...a, nombre: e?.nombre ?? a.ticker, sector: e?.sector ?? null };
    }),
  };
});

app.put<{ Body: { ids?: number[] } }>("/yo/avisos/leidos", async (req) => {
  const id = await exigirUsuario(req);
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : undefined;
  await avisos.marcarLeidos(id, ids);
  return { sinLeer: await avisos.sinLeer(id) };
});

app.get("/yo/avisos/ajustes", async (req) => avisos.ajustes(await exigirUsuario(req)));
app.put("/yo/avisos/ajustes", async (req) => avisos.guardarAjustes(await exigirUsuario(req), req.body));

app.get("/yo/objetivos", async (req) => {
  const id = await exigirUsuario(req);
  const c = await actual();
  return (await avisos.objetivos(id)).map((o) => {
    const e = c.resumenes.get(o.ticker);
    return { ...o, nombre: e?.nombre ?? o.ticker, sector: e?.sector ?? null, precioActual: e?.precio ?? null };
  });
});

app.put<{ Params: { ticker: string }; Body: { precio?: number } }>("/yo/objetivos/:ticker", async (req, rep) => {
  const id = await exigirUsuario(req);
  const t = req.params.ticker.toUpperCase();
  const e = (await actual()).resumenes.get(t);
  if (!e) return rep.code(404).send({ error: `No conocemos ${t}` });
  const precio = Number(req.body?.precio);
  const error = objetivoValido(precio, e.precio);
  if (error) return rep.code(400).send({ error });
  return avisos.fijarObjetivo(id, t, Math.round(precio * 100) / 100, e.precio);
});

app.delete<{ Params: { ticker: string } }>("/yo/objetivos/:ticker", async (req) => {
  await avisos.quitarObjetivo(await exigirUsuario(req), req.params.ticker.toUpperCase());
  return { ok: true };
});

// --- simulador: dinero ficticio, precios reales --------------------------------------
const AVISO_SIMULADOR = "Dinero ficticio con precios reales (con retraso), sin comisiones ni impuestos. "
  + "Los resultados pasados no garantizan resultados futuros.";

/** Estado completo de la cartera simulada de un usuario. */
async function estadoSimulador(id: string) {
  const c = await actual();
  const ops = await usuarios.operaciones(id);
  const precios: Record<string, number | null> = {};
  for (const o of ops) precios[o.ticker] = c.resumenes.get(o.ticker)?.precio ?? null;
  const r = resumen(ops, precios);
  const primera = ops[0]?.fecha.slice(0, 10);
  const cierres = primera ? datos.cierres([...new Set(ops.map((o) => o.ticker)), REFERENCIA], primera) : {};
  const ref = (cierres[REFERENCIA] ?? []).map((x) => x.fecha);
  const serie = primera ? curva(ops, cierres, ref) : [];
  const conNombre = <T extends { ticker: string }>(x: T) => {
    const e = c.resumenes.get(x.ticker);
    return { ...x, nombre: e?.nombre ?? x.ticker, sector: e?.sector ?? null };
  };
  return {
    ...r,
    posiciones: r.posiciones.map(conNombre),
    operaciones: ops.slice(-30).reverse().map(conNombre),
    curva: serie,
    referencia: serie.at(-1)?.referencia ?? null,
    aviso: AVISO_SIMULADOR,
  };
}

app.get("/simulador", async (req) => estadoSimulador(await exigirUsuario(req)));

app.post<{ Body: { ticker?: string; importe?: number } }>("/simulador/comprar", async (req, rep) => {
  const id = await exigirUsuario(req);
  const t = String(req.body?.ticker ?? "").toUpperCase();
  const e = (await actual()).resumenes.get(t);
  if (!e) return rep.code(404).send({ error: `No conocemos ${t}` });
  const o = prepararCompra(await usuarios.operaciones(id), t, Number(req.body?.importe), e.precio, new Date().toISOString());
  if (typeof o === "string") return rep.code(400).send({ error: o });
  await usuarios.registrar(id, o);
  await analitica.registrar("compra", t);
  return { operacion: o, cartera: await estadoSimulador(id) };
});

app.post<{ Body: { ticker?: string; acciones?: number | null } }>("/simulador/vender", async (req, rep) => {
  const id = await exigirUsuario(req);
  const t = String(req.body?.ticker ?? "").toUpperCase();
  const e = (await actual()).resumenes.get(t);
  const n = req.body?.acciones;
  const o = prepararVenta(await usuarios.operaciones(id), t, n === null || n === undefined ? null : Number(n),
    e?.precio ?? null, new Date().toISOString());
  if (typeof o === "string") return rep.code(400).send({ error: o });
  await usuarios.registrar(id, o);
  return { operacion: o, cartera: await estadoSimulador(id) };
});

/** Resumen compartible de la cartera simulada: rentabilidad y peso de cada posición (sin montos de operaciones). */
async function carteraCompartida(id: string): Promise<CarteraCompartida | null> {
  const c = await estadoSimulador(id);
  if (!c.posiciones.length) return null;
  return {
    gananciaPct: c.gananciaPct,
    valorTotal: c.valorTotal,
    posiciones: c.posiciones.map((p) => ({ ticker: p.ticker, peso: (p.valor ?? 0) / (c.valorPosiciones || 1), gananciaPct: p.gananciaPct }))
      .sort((a, b) => b.peso - a.peso).slice(0, 12),
  };
}

app.post("/simulador/reiniciar", async (req) => {
  const id = await exigirUsuario(req);
  await usuarios.reiniciarSimulador(id);
  return estadoSimulador(id);
});

/** Máquina del tiempo: "si hubieras invertido `importe` en `ticker` el `desde`". No necesita sesión. */
app.get<{ Querystring: { ticker?: string; importe?: string; desde?: string; contra?: string } }>("/simulador/tiempo", async (req, rep) => {
  const t = String(req.query.ticker ?? "").toUpperCase();
  const resumenes = (await actual()).resumenes;
  if (!resumenes.has(t)) return rep.code(404).send({ error: `No conocemos ${t}` });
  const contra = req.query.contra ? String(req.query.contra).toUpperCase() : null;
  if (contra && !resumenes.has(contra)) return rep.code(404).send({ error: `No conocemos ${contra}` });
  const importe = Number(req.query.importe ?? 1000);
  if (!Number.isFinite(importe) || importe <= 0 || importe > MONTO_MAXIMO) {
    return rep.code(400).send({ error: `El monto debe estar entre $1 y $${MONTO_MAXIMO.toLocaleString("es")}.` });
  }
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde ?? "") ? req.query.desde! : new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const c = datos.cierres(contra ? [t, contra] : [t], desde);
  const r = maquinaDelTiempo(importe, c[t], desde, contra ? c[contra] ?? [] : []);
  if (!r) return rep.code(404).send({ error: "No hay precios para esa fecha." });
  return { ticker: t, importe, contra, ...r, aviso: AVISO_SIMULADOR };
});

// --- comunidad ------------------------------------------------------------------------
app.get<{ Querystring: { antes?: string; ticker?: string } }>("/comunidad", async (req) =>
  comunidad.muro(req.usuarioId, { antes: req.query.antes, ticker: req.query.ticker?.toUpperCase() }));

app.post<{ Body: { texto?: string; ticker?: string | null; compartirCartera?: boolean } }>("/comunidad", async (req, rep) => {
  const id = await exigirUsuario(req);
  const ticker = req.body?.ticker ? String(req.body.ticker).toUpperCase() : null;
  if (ticker && !(await actual()).resumenes.has(ticker)) return rep.code(404).send({ error: `No conocemos ${ticker}` });
  const cartera = req.body?.compartirCartera ? await carteraCompartida(id) : null;
  if (req.body?.compartirCartera && !cartera) return rep.code(400).send({ error: "Tu cartera del simulador está vacía." });
  const p = await comunidad.publicar(id, { texto: req.body?.texto, ticker, cartera });
  if (typeof p === "string") return rep.code(400).send({ error: p });
  return p;
});

app.delete<{ Params: { id: string } }>("/comunidad/:id", async (req, rep) => {
  if (!(await comunidad.borrar(await exigirUsuario(req), req.params.id))) return rep.code(404).send({ error: "No encontramos esa publicación." });
  return { ok: true };
});

for (const metodo of ["PUT", "DELETE"] as const) {
  app.route<{ Params: { id: string } }>({
    method: metodo, url: "/comunidad/:id/me-gusta",
    handler: async (req, rep) => {
      const r = await comunidad.meGusta(await exigirUsuario(req), req.params.id, metodo === "PUT");
      return r ?? rep.code(404).send({ error: "Esa publicación ya no existe." });
    },
  });
}

app.get<{ Params: { id: string } }>("/comunidad/:id/comentarios", async (req) => comunidad.comentarios(req.usuarioId, req.params.id));

app.post<{ Params: { id: string }; Body: { texto?: string } }>("/comunidad/:id/comentarios", async (req, rep) => {
  const c = await comunidad.comentar(await exigirUsuario(req), req.params.id, req.body?.texto);
  if (typeof c === "string") return rep.code(400).send({ error: c });
  return c;
});

app.delete<{ Params: { id: string } }>("/comentarios/:id", async (req, rep) => {
  if (!(await comunidad.borrarComentario(await exigirUsuario(req), req.params.id))) return rep.code(404).send({ error: "No encontramos ese comentario." });
  return { ok: true };
});

app.get<{ Params: { publico: string } }>("/usuarios/:publico", async (req, rep) => {
  const p = await comunidad.perfil(req.usuarioId, req.params.publico);
  return p ?? rep.code(404).send({ error: "No encontramos a ese usuario." });
});

app.post<{ Body: { tipo?: string; texto?: string } }>("/buzon", async (req, rep) => {
  const r = await comunidad.buzon(req.usuarioId, req.body?.tipo, req.body?.texto);
  if (r !== true) return rep.code(400).send({ error: r });
  return { ok: true };
});

version = datos.version();
await recalcular(); // precalcula antes de la primera visita (~2 s) y revisa los avisos

if (URL_DATOS) {
  // Cada 6 horas mira si GitHub Actions publicó datos nuevos y, si los hay, cambia de base sin reiniciar.
  setInterval(async () => {
    try {
      const nueva = await bajarSiCambio(DB);
      if (!nueva) return;
      datos.cerrar();
      await reemplazar(nueva, DB);
      datos = new Datos(DB);
      cache = null;
      version = datos.version();
      await recalcular();
      app.log.warn("Datos de mercado actualizados");
    } catch (e) {
      app.log.error(e);
      try { datos.version(); } catch { datos = new Datos(DB); }
    }
  }, CADA).unref();
}
// "::" escucha en IPv6 e IPv4: en Windows "localhost" prueba primero ::1 y, si nadie
// responde ahí, cada petición pierde ~200 ms antes de pasar a 127.0.0.1.
await app.listen({ port: PUERTO, host: "::" });
console.log(`API de Al Precio Justo en http://localhost:${PUERTO} (mercado: ${DB}; usuarios: ${bd.tipo === "postgres" ? "Postgres" : `PGlite en ${DIR_PG}`})`);
