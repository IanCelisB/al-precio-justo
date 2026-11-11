/**
 * Comunidad: publicaciones que ven todos los usuarios, me gusta, comentarios, perfiles
 * públicos y el buzón de comentarios, sugerencias y reclamos (Postgres, ver bd.ts).
 *
 * Los demás solo ven el id público, el nombre, la foto y la presentación de cada usuario:
 * nunca su email ni su id de Google.
 */
import type { BD } from "./bd.ts";

export const LIMITES = { publicacion: 1000, comentario: 500, bio: 280, nombre: 40, foto: 400_000, porDia: 30 };
export const TIPOS_BUZON = ["comentario", "sugerencia", "reclamo", "reporte"] as const;
export type TipoBuzon = (typeof TIPOS_BUZON)[number];

/** Resultado del simulador que alguien comparte: rentabilidad y en qué está invertido. */
export interface CarteraCompartida {
  gananciaPct: number;
  valorTotal: number;
  posiciones: { ticker: string; peso: number; gananciaPct: number | null }[];
}

export interface Autor { publico: string; nombre: string; foto: string | null }

export interface Publicacion {
  id: string;
  autor: Autor;
  texto: string;
  ticker: string | null;
  cartera: CarteraCompartida | null;
  creado: string;
  meGusta: number;
  comentarios: number;
  loHeGustado: boolean;
  mia: boolean;
}

export interface Comentario { id: string; autor: Autor; texto: string; creado: string; mio: boolean }

const ahora = () => new Date().toISOString();
const AUTOR = "u.publico, COALESCE(u.nombre_propio, u.nombre) AS nombre, COALESCE(u.foto_propia, u.foto) AS foto";

/** Texto limpio: sin caracteres de control y con un largo máximo. */
export function limpiar(texto: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return String(texto ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

/** Foto de perfil: solo una imagen pequeña en data URL (la app la reduce a 256 px antes de subirla). */
export function fotoValida(f: unknown): string | null | false {
  if (f === null || f === "") return null;
  if (typeof f !== "string" || f.length > LIMITES.foto || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(f)) return false;
  return f;
}

export class Comunidad {
  private bd: BD;
  constructor(bd: BD) { this.bd = bd; }

  private fila(r: any, yo: string | null): Publicacion {
    let cartera: CarteraCompartida | null = null;
    try { cartera = r.cartera ? JSON.parse(r.cartera) : null; } catch { cartera = null; }
    return {
      id: String(r.id), autor: { publico: r.publico, nombre: r.nombre, foto: r.foto }, texto: r.texto, ticker: r.ticker,
      cartera, creado: r.creado, meGusta: Number(r.me_gusta), comentarios: Number(r.comentarios),
      loHeGustado: !!r.lo_he_gustado, mia: !!yo && r.usuario_id === yo,
    };
  }

  private consulta(donde: string) {
    return `SELECT p.id, p.usuario_id, p.texto, p.ticker, p.cartera, p.creado, ${AUTOR},
        (SELECT COUNT(*)::int FROM me_gusta m WHERE m.publicacion_id = p.id) AS me_gusta,
        (SELECT COUNT(*)::int FROM comentarios c WHERE c.publicacion_id = p.id) AS comentarios,
        EXISTS (SELECT 1 FROM me_gusta m WHERE m.publicacion_id = p.id AND m.usuario_id = $1) AS lo_he_gustado
      FROM publicaciones p JOIN usuarios u ON u.id = p.usuario_id ${donde}`;
  }

  /** Lo último publicado (de todos o de un ticker), de 20 en 20 (`antes`: id de la última vista). */
  async muro(yo: string | null, o: { antes?: string; ticker?: string; limite?: number } = {}): Promise<Publicacion[]> {
    const params: unknown[] = [yo ?? ""];
    const cond: string[] = [];
    if (o.antes && /^\d{1,15}$/.test(o.antes)) { params.push(o.antes); cond.push(`p.id < $${params.length}`); }
    if (o.ticker) { params.push(o.ticker); cond.push(`p.ticker = $${params.length}`); }
    params.push(Math.min(Math.max(o.limite ?? 20, 1), 50));
    const filas = await this.bd.q(`${this.consulta(cond.length ? `WHERE ${cond.join(" AND ")}` : "")} ORDER BY p.id DESC LIMIT $${params.length}`, params);
    return filas.map((r) => this.fila(r, yo));
  }

  async publicacion(yo: string | null, id: string): Promise<Publicacion | null> {
    if (!/^\d{1,15}$/.test(id)) return null;
    const [r] = await this.bd.q(`${this.consulta("WHERE p.id = $2")}`, [yo ?? "", id]);
    return r ? this.fila(r, yo) : null;
  }

  async publicar(yo: string, p: { texto: unknown; ticker?: string | null; cartera?: CarteraCompartida | null }): Promise<Publicacion | string> {
    const texto = limpiar(p.texto, LIMITES.publicacion);
    if (!texto && !p.cartera) return "Escribe algo antes de publicar.";
    const desde = new Date(Date.now() - 86_400_000).toISOString();
    const [{ n }] = await this.bd.q<{ n: number }>("SELECT COUNT(*)::int AS n FROM publicaciones WHERE usuario_id = $1 AND creado > $2", [yo, desde]);
    if (Number(n) >= LIMITES.porDia) return `Puedes publicar hasta ${LIMITES.porDia} veces al día.`;
    const [r] = await this.bd.q<{ id: string }>(
      "INSERT INTO publicaciones (usuario_id, texto, ticker, cartera, creado) VALUES ($1, $2, $3, $4, $5) RETURNING id::text AS id",
      [yo, texto, p.ticker ?? null, p.cartera ? JSON.stringify(p.cartera) : null, ahora()]);
    return (await this.publicacion(yo, r.id))!;
  }

  /** Solo el autor puede borrar su publicación. */
  async borrar(yo: string, id: string): Promise<boolean> {
    if (!/^\d{1,15}$/.test(id)) return false;
    return (await this.bd.q("DELETE FROM publicaciones WHERE id = $1 AND usuario_id = $2 RETURNING id", [id, yo])).length > 0;
  }

  async meGusta(yo: string, id: string, si: boolean): Promise<{ meGusta: number; loHeGustado: boolean } | null> {
    if (!(await this.publicacion(yo, id))) return null;
    if (si) await this.bd.q("INSERT INTO me_gusta (publicacion_id, usuario_id, creado) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [id, yo, ahora()]);
    else await this.bd.q("DELETE FROM me_gusta WHERE publicacion_id = $1 AND usuario_id = $2", [id, yo]);
    const [{ n }] = await this.bd.q<{ n: number }>("SELECT COUNT(*)::int AS n FROM me_gusta WHERE publicacion_id = $1", [id]);
    return { meGusta: Number(n), loHeGustado: si };
  }

  async comentarios(yo: string | null, id: string): Promise<Comentario[]> {
    if (!/^\d{1,15}$/.test(id)) return [];
    const filas = await this.bd.q(
      `SELECT c.id::text AS id, c.usuario_id, c.texto, c.creado, ${AUTOR} FROM comentarios c JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.publicacion_id = $1 ORDER BY c.id LIMIT 200`, [id]);
    return filas.map((r: any) => ({ id: r.id, autor: { publico: r.publico, nombre: r.nombre, foto: r.foto }, texto: r.texto, creado: r.creado, mio: r.usuario_id === yo }));
  }

  async comentar(yo: string, id: string, texto: unknown): Promise<Comentario | string> {
    const t = limpiar(texto, LIMITES.comentario);
    if (!t) return "Escribe un comentario.";
    if (!(await this.publicacion(yo, id))) return "Esa publicación ya no existe.";
    await this.bd.q("INSERT INTO comentarios (publicacion_id, usuario_id, texto, creado) VALUES ($1, $2, $3, $4)", [id, yo, t, ahora()]);
    return (await this.comentarios(yo, id)).at(-1)!;
  }

  async borrarComentario(yo: string, id: string): Promise<boolean> {
    if (!/^\d{1,15}$/.test(id)) return false;
    return (await this.bd.q("DELETE FROM comentarios WHERE id = $1 AND usuario_id = $2 RETURNING id", [id, yo])).length > 0;
  }

  /** Perfil público: nombre, foto, presentación, cuándo se unió y sus publicaciones. */
  async perfil(yo: string | null, publico: string) {
    const [u] = await this.bd.q<{ id: string; publico: string; nombre: string; foto: string | null; bio: string; creado: string }>(
      `SELECT u.id, ${AUTOR}, u.bio, u.creado FROM usuarios u WHERE u.publico = $1`, [publico]);
    if (!u) return null;
    const publicaciones = (await this.bd.q(`${this.consulta("WHERE p.usuario_id = $2")} ORDER BY p.id DESC LIMIT 30`, [yo ?? "", u.id]))
      .map((r) => this.fila(r, yo));
    const [{ n }] = await this.bd.q<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM me_gusta m JOIN publicaciones p ON p.id = m.publicacion_id WHERE p.usuario_id = $1", [u.id]);
    return { publico: u.publico, nombre: u.nombre, foto: u.foto, bio: u.bio, desde: u.creado, meGustaRecibidos: Number(n), publicaciones, soyYo: u.id === yo };
  }

  async buzon(yo: string | null, tipo: unknown, texto: unknown): Promise<true | string> {
    if (!TIPOS_BUZON.includes(tipo as TipoBuzon)) return "Elige si es un comentario, una sugerencia o un reclamo.";
    const t = limpiar(texto, 2000);
    if (t.length < 3) return "Escribe tu mensaje.";
    await this.bd.q("INSERT INTO buzon (usuario_id, tipo, texto, creado) VALUES ($1, $2, $3, $4)", [yo, tipo, t, ahora()]);
    return true;
  }
}
