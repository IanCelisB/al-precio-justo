/**
 * Usuarios, empresas seguidas, preferencias y simulador (Postgres, ver bd.ts).
 * Separado de los datos de mercado, que la API solo lee.
 */
import type { Operacion } from "@ancla/valoracion/simulador";
import type { BD } from "./bd.ts";

export interface Usuario {
  id: string;          // "google:<sub>"
  email: string;
  nombre: string;
  foto: string | null;
}

/** Usuario con su perfil público (lo que ven los demás en la comunidad). */
export interface UsuarioCompleto extends Usuario {
  publico: string;     // id público (nunca el email ni el id de Google)
  bio: string;
}

export interface Lista { id: string; nombre: string; tickers: string[] }

/** Nombre y foto propios (si el usuario los cambió) en vez de los de Google. */
const COLUMNAS = "id, email, COALESCE(nombre_propio, nombre) AS nombre, COALESCE(foto_propia, foto) AS foto, publico, bio";
export const MAX_LISTAS = 20;

const ahora = () => new Date().toISOString();

export class Usuarios {
  private bd: BD;
  constructor(bd: BD) { this.bd = bd; }

  /** Crea el usuario la primera vez y actualiza nombre y foto en cada inicio de sesión. */
  async guardar(u: Usuario): Promise<Usuario> {
    await this.bd.q(
      `INSERT INTO usuarios (id, email, nombre, foto, creado, ultimo, publico)
       VALUES ($1, $2, $3, $4, $5, $5, md5(random()::text || $1 || clock_timestamp()::text))
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, nombre = EXCLUDED.nombre, foto = EXCLUDED.foto, ultimo = EXCLUDED.ultimo`,
      [u.id, u.email, u.nombre, u.foto, ahora()],
    );
    return (await this.obtener(u.id))!;
  }

  async obtener(id: string): Promise<UsuarioCompleto | null> {
    return (await this.bd.q<UsuarioCompleto>(`SELECT ${COLUMNAS} FROM usuarios WHERE id = $1`, [id]))[0] ?? null;
  }

  /** Cambia el nombre, la foto (data URL pequeña) o la presentación que ven los demás. */
  async editarPerfil(id: string, c: { nombre?: string; foto?: string | null; bio?: string }) {
    if (c.nombre !== undefined) await this.bd.q("UPDATE usuarios SET nombre_propio = $2 WHERE id = $1", [id, c.nombre || null]);
    if (c.foto !== undefined) await this.bd.q("UPDATE usuarios SET foto_propia = $2 WHERE id = $1", [id, c.foto]);
    if (c.bio !== undefined) await this.bd.q("UPDATE usuarios SET bio = $2 WHERE id = $1", [id, c.bio]);
    return this.obtener(id);
  }

  // --- listas ------------------------------------------------------------------
  async listas(id: string): Promise<Lista[]> {
    const ls = await this.bd.q<{ id: string; nombre: string }>(
      "SELECT id::text AS id, nombre FROM listas WHERE usuario_id = $1 ORDER BY orden, id", [id]);
    if (!ls.length) return [];
    const es = await this.bd.q<{ lista_id: string; ticker: string }>(
      "SELECT lista_id::text AS lista_id, ticker FROM lista_empresas WHERE lista_id = ANY($1::bigint[]) ORDER BY creado", [ls.map((l) => l.id)]);
    return ls.map((l) => ({ ...l, tickers: es.filter((e) => e.lista_id === l.id).map((e) => e.ticker) }));
  }

  private async deUsuario(id: string, listaId: string): Promise<boolean> {
    if (!/^\d{1,15}$/.test(listaId)) return false;
    return (await this.bd.q("SELECT 1 FROM listas WHERE id = $1 AND usuario_id = $2", [listaId, id])).length > 0;
  }

  async crearLista(id: string, nombre: string): Promise<Lista | string> {
    const n = nombre.trim().slice(0, 40);
    if (!n) return "Ponle un nombre a la lista.";
    const [{ k }] = await this.bd.q<{ k: number }>("SELECT COUNT(*)::int AS k FROM listas WHERE usuario_id = $1", [id]);
    if (Number(k) >= MAX_LISTAS) return `Puedes tener hasta ${MAX_LISTAS} listas.`;
    const [l] = await this.bd.q<{ id: string }>(
      "INSERT INTO listas (usuario_id, nombre, orden, creado) VALUES ($1, $2, $3, $4) RETURNING id::text AS id", [id, n, Number(k), ahora()]);
    return { id: l.id, nombre: n, tickers: [] };
  }

  async renombrarLista(id: string, listaId: string, nombre: string): Promise<boolean> {
    const n = nombre.trim().slice(0, 40);
    if (!n || !(await this.deUsuario(id, listaId))) return false;
    await this.bd.q("UPDATE listas SET nombre = $2 WHERE id = $1", [listaId, n]);
    return true;
  }

  async borrarLista(id: string, listaId: string): Promise<boolean> {
    if (!(await this.deUsuario(id, listaId))) return false;
    await this.bd.q("DELETE FROM listas WHERE id = $1", [listaId]);
    await this.sincronizarSeguidas(id);
    return true;
  }

  async enLista(id: string, listaId: string, ticker: string, si: boolean): Promise<boolean> {
    if (!(await this.deUsuario(id, listaId))) return false;
    if (si) await this.bd.q("INSERT INTO lista_empresas (lista_id, ticker, creado) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [listaId, ticker, ahora()]);
    else await this.bd.q("DELETE FROM lista_empresas WHERE lista_id = $1 AND ticker = $2", [listaId, ticker]);
    await this.sincronizarSeguidas(id);
    return true;
  }

  /** `seguidas` = unión de las listas (la usan los avisos y el recuento de seguidores). */
  private async sincronizarSeguidas(id: string) {
    await this.bd.q(`DELETE FROM seguidas WHERE usuario_id = $1 AND ticker NOT IN (
      SELECT e.ticker FROM lista_empresas e JOIN listas l ON l.id = e.lista_id WHERE l.usuario_id = $1)`, [id]);
    await this.bd.q(`INSERT INTO seguidas (usuario_id, ticker, creado)
      SELECT $1, e.ticker, MIN(e.creado) FROM lista_empresas e JOIN listas l ON l.id = e.lista_id WHERE l.usuario_id = $1
      GROUP BY e.ticker ON CONFLICT DO NOTHING`, [id]);
  }

  /** Cuántos usuarios siguen cada empresa. */
  async seguidores(): Promise<Map<string, number>> {
    const filas = await this.bd.q<{ ticker: string; n: number }>("SELECT ticker, COUNT(*)::int AS n FROM seguidas GROUP BY ticker");
    return new Map(filas.map((f) => [f.ticker, Number(f.n)]));
  }

  async seguidas(id: string): Promise<string[]> {
    return (await this.bd.q<{ ticker: string }>("SELECT ticker FROM seguidas WHERE usuario_id = $1 ORDER BY creado", [id]))
      .map((r) => r.ticker);
  }

  /** Quiénes siguen cada una de estas empresas (para los avisos). */
  async seguidoresDe(tickers: string[]): Promise<{ usuario_id: string; ticker: string }[]> {
    if (!tickers.length) return [];
    return this.bd.q("SELECT usuario_id, ticker FROM seguidas WHERE ticker = ANY($1::text[])", [tickers]);
  }

  /** Seguir sin elegir lista (web): va a la primera lista, que se crea si no hay ninguna. */
  async seguir(id: string, ticker: string) {
    let [l] = await this.listas(id);
    if (!l) l = (await this.crearLista(id, "Mi lista")) as Lista;
    await this.enLista(id, l.id, ticker, true);
  }

  /** Deja de seguir: la quita de todas sus listas. */
  async dejarDeSeguir(id: string, ticker: string) {
    await this.bd.q("DELETE FROM lista_empresas WHERE ticker = $2 AND lista_id IN (SELECT id FROM listas WHERE usuario_id = $1)", [id, ticker]);
    await this.sincronizarSeguidas(id);
  }

  async metricasExtra(id: string): Promise<string[]> {
    const r = (await this.bd.q<{ metricas_extra: string }>("SELECT metricas_extra FROM preferencias WHERE usuario_id = $1", [id]))[0];
    try { return r ? JSON.parse(r.metricas_extra) : []; } catch { return []; }
  }

  async guardarMetricasExtra(id: string, ids: string[]) {
    await this.bd.q(
      `INSERT INTO preferencias (usuario_id, metricas_extra) VALUES ($1, $2)
       ON CONFLICT (usuario_id) DO UPDATE SET metricas_extra = EXCLUDED.metricas_extra`,
      [id, JSON.stringify(ids)],
    );
  }

  // --- simulador ---------------------------------------------------------------
  async operaciones(id: string): Promise<Operacion[]> {
    return this.bd.q<Operacion>(
      "SELECT ticker, tipo, acciones, precio, importe, fecha FROM operaciones WHERE usuario_id = $1 ORDER BY fecha, id",
      [id],
    );
  }

  async registrar(id: string, o: Operacion) {
    await this.bd.q(
      "INSERT INTO operaciones (usuario_id, ticker, tipo, acciones, precio, importe, fecha) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [id, o.ticker, o.tipo, o.acciones, o.precio, o.importe, o.fecha],
    );
  }

  /** Vuelve a empezar con el saldo inicial. */
  async reiniciarSimulador(id: string) {
    await this.bd.q("DELETE FROM operaciones WHERE usuario_id = $1", [id]);
  }

  /** Borra la cuenta y todo lo asociado (seguidas, simulador, avisos…). */
  async borrar(id: string) {
    await this.bd.q("DELETE FROM usuarios WHERE id = $1", [id]);
  }
}
