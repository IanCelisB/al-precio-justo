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
 *   GET  /simulador                     cartera simulada (30.000 USD ficticios)
 *   POST /simulador/comprar {ticker, importe} · /vender {ticker, acciones|null} · /reiniciar
 *   GET  /simulador/tiempo?ticker=&importe=&desde=   máquina del tiempo (sin sesión)
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
import { Logos } from "./logos.ts";

const RAIZ = resolve(fileURLToPath(import.meta.url), "../../../..");
const DB = process.env.ANCLA_DB ?? resolve(RAIZ, "data/ancla.db");
const DB_USUARIOS = process.env.ANCLA_DB_USUARIOS ?? resolve(RAIZ, "data/usuarios.db");
const DB_ANALITICA = process.env.ANCLA_DB_ANALITICA ?? resolve(RAIZ, "data/analitica.db");
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

const datos = new Datos(DB);
const usuarios = new Usuarios(DB_USUARIOS);
const analitica = new Analitica(DB_ANALITICA);
const logos = new Logos(process.env.ANCLA_LOGOS ?? resolve(RAIZ, "data/logos"));
let cache: Cache | null = null;

/** Valora y analiza todas las empresas (~30 ms; la primera vez ~2 s por la carga de trimestres). */
function calcular(previo: Cache | null): Cache {
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
  const seguidores = usuarios.seguidores();
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
/** Recalcula cada 5 minutos o en cuanto la ingesta publica algo nuevo (se mira cada 30 s). */
function actual(): Cache {
  const ahora = Date.now();
  if (cache && ahora - revisado > 30_000) {
    revisado = ahora;
    const v = datos.version();
    if (v !== version) { version = v; cache = calcular(cache); }
  }
  if (!cache || ahora - cache.creado > 5 * 60_000) cache = calcular(cache);
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

function exigirUsuario(req: { usuarioId: string | null }): string {
  if (!req.usuarioId || !usuarios.obtener(req.usuarioId)) throw new ErrorAuth(401, "Inicia sesión para continuar.");
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
  const c = actual();
  const limite = Math.min(Number(req.query.limite ?? 20) || 20, 100);
  return datos.novedades(limite).map((n) => {
    const r = c.resumenes.get(n.ticker);
    return { ...n, nombre: r?.nombre ?? n.ticker, sector: r?.sector ?? null, estado: r?.estado ?? null };
  });
});

app.get<{ Querystring: { filtro?: string } }>("/portada", async (req) => {
  const c = actual();
  const filtro = (FILTROS.some((f) => f.id === req.query.filtro) ? req.query.filtro : "todo") as FiltroPortada;
  const todas = [...c.resumenes.values()];
  const ctx = {
    vistas: analitica.ranking("vista", 7, 20).map((x) => x.ticker),
    compras: analitica.ranking("compra", 30, 20).map((x) => x.ticker),
    mias: req.usuarioId ? usuarios.seguidas(req.usuarioId) : [],
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
  if (req.body?.tipo !== "vista" || !actual().resumenes.has(t) || !SESION.test(sesion)) {
    return rep.code(400).send({ error: "Evento no válido" });
  }
  analitica.registrar("vista", t, sesion);
  return rep.code(204).send();
});

const conResumen = <T extends { ticker: string }>(filas: T[]) =>
  filas.map((f) => ({ ...f, empresa: actual().resumenes.get(f.ticker) ?? null })).filter((f) => f.empresa);

app.get<{ Querystring: { dias?: string } }>("/tendencias", async (req) => {
  const dias = Math.min(Math.max(Number(req.query.dias ?? 7) || 7, 1), 90);
  const r = (tipo: TipoEvento) => conResumen(analitica.ranking(tipo, dias, 10).map((x) => ({ ...x })));
  return { dias, vistas: r("vista"), seguidas: r("seguir"), compras: r("compra") };
});

app.get<{ Params: { ticker: string } }>("/empresas/:ticker/tambien", async (req) => {
  return conResumen(analitica.tambienVieron(req.params.ticker.toUpperCase()).map((x) => ({ ...x })));
});

app.get("/estado-datos", async () => ({ ...datos.estadoIngesta(), empresas: actual().resumenes.size }));

/** Logo de la empresa (PNG, en caché 7 días). 404 si no hay: las apps muestran la ilustración del sector. */
app.get<{ Params: { ticker: string } }>("/logos/:ticker", async (req, rep) => {
  const t = req.params.ticker.toUpperCase();
  if (!actual().resumenes.has(t)) return rep.code(404).send({ error: `No conocemos ${t}` });
  const png = await logos.obtener(t);
  if (!png) return rep.code(404).send({ error: "Sin logo" });
  return rep.header("Content-Type", "image/png").header("Cache-Control", "public, max-age=604800").send(png);
});

app.get<{ Querystring: { seguidas?: string } }>("/inicio", async (req) => {
  const c = actual();
  const deUsuario = req.usuarioId ? usuarios.seguidas(req.usuarioId) : [];
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
  const c = actual();
  if (req.query.tickers) {
    return req.query.tickers.split(",").map((t) => c.resumenes.get(t.trim().toUpperCase())).filter(Boolean);
  }
  const q = (req.query.q ?? "").trim().toLowerCase();
  const lista = [...c.resumenes.values()];
  return q ? lista.filter((r) => coincide(r, q) > 0) : lista;
});

app.get<{ Params: { ticker: string } }>("/empresas/:ticker", async (req, rep) => {
  const c = actual();
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

app.get<{ Querystring: { q?: string; tipo?: Tipo; buenPrecio?: string; limite?: string } }>("/buscar", async (req) => {
  const c = actual();
  const q = (req.query.q ?? "").trim().toLowerCase();
  const limite = Math.min(Number(req.query.limite ?? 30) || 30, 100);
  let lista = [...c.resumenes.values()].map((r) => ({ r, m: q ? coincide(r, q) : 1 })).filter((x) => x.m > 0);
  if (req.query.tipo) lista = lista.filter((x) => x.r.analisis.tipo === req.query.tipo);
  if (req.query.buenPrecio === "1") lista = lista.filter((x) => x.r.analisis.buenPrecio);
  lista.sort((a, b) => b.m - a.m || c.analisis.get(b.r.ticker)!.orden - c.analisis.get(a.r.ticker)!.orden);
  return { total: lista.length, resultados: lista.slice(0, limite).map((x) => x.r) };
});

app.get("/recomendaciones", async () => {
  const c = actual();
  const conRazones = (r: Resumen) => {
    const a = c.analisis.get(r.ticker)!;
    return { ...r, razones: a.calidad.razones, alertas: a.calidad.alertas };
  };
  const orden = [...c.resumenes.values()]
    .sort((a, b) => c.analisis.get(b.ticker)!.orden - c.analisis.get(a.ticker)!.orden);
  return {
    criterio: "Calidad mínima de 60/100, sin deuda excesiva, caja irregular ni dilución fuerte, y precio por debajo "
      + "de su precio de compra: el valor estimado menos un 15 % en defensivas, 20 % en estables y 35 % en cíclicas.",
    aviso: "Ideas que cumplen un criterio fijo, iguales para todos. No es asesoría financiera ni una recomendación personalizada.",
    sugeridas: orden.filter((r) => r.analisis.sugerida).slice(0, 12).map(conRazones),
    vigilar: orden.filter((r) => r.analisis.vigilar).slice(0, 8).map(conRazones),
  };
});

// --- cuenta -------------------------------------------------------------------------
app.get("/auth/config", async () => ({ google: CLIENT_IDS.length > 0, prueba: LOGIN_PRUEBA }));

app.post<{ Body: { idToken?: string } }>("/auth/google", async (req, rep) => {
  if (!req.body?.idToken) return rep.code(400).send({ error: "Falta idToken" });
  const u = usuarios.guardar(await verificarGoogle(req.body.idToken));
  return { token: await crearSesion(u), usuario: u };
});

if (LOGIN_PRUEBA) {
  // Solo en desarrollo local: un usuario ficticio para probar la app sin Google.
  app.post("/auth/prueba", async () => {
    const u = usuarios.guardar({ id: "prueba:local", email: "prueba@ancla.local", nombre: "Usuario de prueba", foto: null });
    return { token: await crearSesion(u), usuario: u };
  });
}

app.get("/yo", async (req) => {
  const id = exigirUsuario(req);
  return { usuario: usuarios.obtener(id), seguidas: usuarios.seguidas(id), metricasExtra: usuarios.metricasExtra(id) };
});

app.put<{ Params: { ticker: string } }>("/yo/seguidas/:ticker", async (req, rep) => {
  const id = exigirUsuario(req);
  const t = req.params.ticker.toUpperCase();
  if (!actual().resumenes.has(t)) return rep.code(404).send({ error: `No conocemos ${t}` });
  usuarios.seguir(id, t);
  analitica.registrar("seguir", t);
  return { seguidas: usuarios.seguidas(id) };
});

app.delete<{ Params: { ticker: string } }>("/yo/seguidas/:ticker", async (req) => {
  const id = exigirUsuario(req);
  usuarios.dejarDeSeguir(id, req.params.ticker.toUpperCase());
  return { seguidas: usuarios.seguidas(id) };
});

app.put<{ Body: { ids?: string[] } }>("/yo/metricas", async (req) => {
  const id = exigirUsuario(req);
  const ids = (req.body?.ids ?? []).filter((x) => typeof x === "string" && porId(x));
  usuarios.guardarMetricasExtra(id, ids);
  return { metricasExtra: ids };
});

app.delete("/yo", async (req) => {
  usuarios.borrar(exigirUsuario(req));
  return { ok: true };
});

// --- simulador: dinero ficticio, precios reales --------------------------------------
const AVISO_SIMULADOR = "Dinero ficticio con precios reales (con retraso), sin comisiones ni impuestos. "
  + "Los resultados pasados no garantizan resultados futuros.";

/** Estado completo de la cartera simulada de un usuario. */
function estadoSimulador(id: string) {
  const c = actual();
  const ops = usuarios.operaciones(id);
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

app.get("/simulador", async (req) => estadoSimulador(exigirUsuario(req)));

app.post<{ Body: { ticker?: string; importe?: number } }>("/simulador/comprar", async (req, rep) => {
  const id = exigirUsuario(req);
  const t = String(req.body?.ticker ?? "").toUpperCase();
  const e = actual().resumenes.get(t);
  if (!e) return rep.code(404).send({ error: `No conocemos ${t}` });
  const o = prepararCompra(usuarios.operaciones(id), t, Number(req.body?.importe), e.precio, new Date().toISOString());
  if (typeof o === "string") return rep.code(400).send({ error: o });
  usuarios.registrar(id, o);
  analitica.registrar("compra", t);
  return { operacion: o, cartera: estadoSimulador(id) };
});

app.post<{ Body: { ticker?: string; acciones?: number | null } }>("/simulador/vender", async (req, rep) => {
  const id = exigirUsuario(req);
  const t = String(req.body?.ticker ?? "").toUpperCase();
  const e = actual().resumenes.get(t);
  const n = req.body?.acciones;
  const o = prepararVenta(usuarios.operaciones(id), t, n === null || n === undefined ? null : Number(n),
    e?.precio ?? null, new Date().toISOString());
  if (typeof o === "string") return rep.code(400).send({ error: o });
  usuarios.registrar(id, o);
  return { operacion: o, cartera: estadoSimulador(id) };
});

app.post("/simulador/reiniciar", async (req) => {
  const id = exigirUsuario(req);
  usuarios.reiniciarSimulador(id);
  return estadoSimulador(id);
});

/** Máquina del tiempo: "si hubieras invertido `importe` en `ticker` el `desde`". No necesita sesión. */
app.get<{ Querystring: { ticker?: string; importe?: string; desde?: string } }>("/simulador/tiempo", async (req, rep) => {
  const t = String(req.query.ticker ?? "").toUpperCase();
  if (!actual().resumenes.has(t)) return rep.code(404).send({ error: `No conocemos ${t}` });
  const importe = Number(req.query.importe ?? 1000);
  if (!Number.isFinite(importe) || importe <= 0 || importe > MONTO_MAXIMO) {
    return rep.code(400).send({ error: `El monto debe estar entre $1 y $${MONTO_MAXIMO.toLocaleString("es")}.` });
  }
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde ?? "") ? req.query.desde! : new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const c = datos.cierres([t, REFERENCIA], desde);
  const r = maquinaDelTiempo(importe, c[t], desde, c[REFERENCIA]);
  if (!r) return rep.code(404).send({ error: "No hay precios para esa fecha." });
  return { ticker: t, importe, ...r, aviso: AVISO_SIMULADOR };
});

cache = calcular(null); // precalcula antes de la primera visita (~2 s)
version = datos.version();
// "::" escucha en IPv6 e IPv4: en Windows "localhost" prueba primero ::1 y, si nadie
// responde ahí, cada petición pierde ~200 ms antes de pasar a 127.0.0.1.
await app.listen({ port: PUERTO, host: "::" });
console.log(`API de Al Precio Justo en http://localhost:${PUERTO} (base: ${DB})`);
