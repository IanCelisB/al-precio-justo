/**
 * Avisos dentro de la app (Postgres, ver bd.ts).
 *
 * `revisar()` se llama cada vez que la API recalcula las empresas (nuevos precios o
 * reportes). Compara con la última foto guardada de cada empresa y crea los avisos de
 * los usuarios que los tienen activados. Cada aviso tiene una clave única por usuario,
 * así que revisar dos veces no lo duplica.
 */
import {
  AJUSTES_AVISOS_POR_DEFECTO, avisoEstado, avisoMovimiento, avisoObjetivo, avisoReporte, cumpleObjetivo,
  direccionObjetivo, leerAjustesAvisos, type AjustesAvisos, type AvisoNuevo, type Direccion, type EmpresaAviso,
} from "@ancla/valoracion/avisos";
import type { Estado } from "@ancla/valoracion";
import type { BD } from "./bd.ts";

export interface Aviso {
  id: number;
  ticker: string;
  tipo: AvisoNuevo["tipo"];
  titulo: string;
  texto: string;
  creado: string;
  leido: boolean;
}

export interface Objetivo { ticker: string; precio: number; direccion: Direccion; creado: string; cumplido: string | null }

const MAX_AVISOS = 200;   // se guardan los últimos 200 por usuario

export class Avisos {
  private bd: BD;
  constructor(bd: BD) { this.bd = bd; }

  // --- ajustes ------------------------------------------------------------------------
  async ajustes(id: string): Promise<AjustesAvisos> {
    const r = (await this.bd.q("SELECT objetivo, estado, reporte, movimiento, umbral FROM ajustes_avisos WHERE usuario_id = $1", [id]))[0];
    return r ? { ...r, umbral: Number(r.umbral) } : { ...AJUSTES_AVISOS_POR_DEFECTO };
  }

  async guardarAjustes(id: string, cambios: unknown): Promise<AjustesAvisos> {
    const a = leerAjustesAvisos(cambios, await this.ajustes(id));
    await this.bd.q(
      `INSERT INTO ajustes_avisos (usuario_id, objetivo, estado, reporte, movimiento, umbral) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (usuario_id) DO UPDATE SET objetivo = $2, estado = $3, reporte = $4, movimiento = $5, umbral = $6`,
      [id, a.objetivo, a.estado, a.reporte, a.movimiento, a.umbral],
    );
    return a;
  }

  // --- precios objetivo (uno por empresa y usuario) -------------------------------------
  async objetivos(id: string): Promise<Objetivo[]> {
    const filas = await this.bd.q<Objetivo>(
      "SELECT ticker, precio, direccion, creado, cumplido FROM objetivos WHERE usuario_id = $1 ORDER BY creado DESC", [id]);
    return filas.map((o) => ({ ...o, precio: Number(o.precio) }));
  }

  async fijarObjetivo(id: string, ticker: string, precio: number, precioActual: number | null): Promise<Objetivo> {
    const o: Objetivo = { ticker, precio, direccion: direccionObjetivo(precio, precioActual), creado: new Date().toISOString(), cumplido: null };
    await this.bd.q(
      `INSERT INTO objetivos (usuario_id, ticker, precio, direccion, creado, cumplido) VALUES ($1, $2, $3, $4, $5, NULL)
       ON CONFLICT (usuario_id, ticker) DO UPDATE SET precio = $3, direccion = $4, creado = $5, cumplido = NULL`,
      [id, ticker, o.precio, o.direccion, o.creado],
    );
    return o;
  }

  async quitarObjetivo(id: string, ticker: string) {
    await this.bd.q("DELETE FROM objetivos WHERE usuario_id = $1 AND ticker = $2", [id, ticker]);
  }

  // --- avisos -------------------------------------------------------------------------
  async lista(id: string, limite = 50): Promise<{ avisos: Aviso[]; sinLeer: number }> {
    const [avisos, n] = await Promise.all([
      this.bd.q<Aviso>(
        "SELECT id, ticker, tipo, titulo, texto, creado, leido FROM avisos WHERE usuario_id = $1 ORDER BY creado DESC, id DESC LIMIT $2",
        [id, limite]),
      this.sinLeer(id),
    ]);
    return { avisos: avisos.map((a) => ({ ...a, id: Number(a.id) })), sinLeer: n };
  }

  async sinLeer(id: string): Promise<number> {
    return Number((await this.bd.q("SELECT COUNT(*)::int AS n FROM avisos WHERE usuario_id = $1 AND NOT leido", [id]))[0].n);
  }

  /** Marca como leídos esos avisos (o todos si no se indican). */
  async marcarLeidos(id: string, ids?: number[]) {
    if (ids?.length) await this.bd.q("UPDATE avisos SET leido = TRUE WHERE usuario_id = $1 AND id = ANY($2::bigint[])", [id, ids]);
    else await this.bd.q("UPDATE avisos SET leido = TRUE WHERE usuario_id = $1 AND NOT leido", [id]);
  }

  private async crear(filas: { usuario: string; a: AvisoNuevo }[], ahora: string): Promise<number> {
    if (!filas.length) return 0;
    const r = await this.bd.q(
      `INSERT INTO avisos (usuario_id, ticker, tipo, titulo, texto, clave, creado)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[]) AS x, (SELECT $7::text) AS c
       ON CONFLICT (usuario_id, clave) DO NOTHING RETURNING usuario_id`,
      [filas.map((f) => f.usuario), filas.map((f) => f.a.ticker), filas.map((f) => f.a.tipo), filas.map((f) => f.a.titulo),
        filas.map((f) => f.a.texto), filas.map((f) => f.a.clave), ahora],
    );
    // Se guardan solo los últimos avisos de cada usuario.
    const usuarios = [...new Set(r.map((x: any) => x.usuario_id as string))];
    if (usuarios.length) {
      await this.bd.q(
        `DELETE FROM avisos a USING (
           SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY usuario_id ORDER BY creado DESC, id DESC) AS n
                           FROM avisos WHERE usuario_id = ANY($1::text[])) x WHERE n > $2) v
         WHERE a.id = v.id`,
        [usuarios, MAX_AVISOS]);
    }
    return r.length;
  }

  /**
   * Revisa todas las empresas y crea los avisos que correspondan. Devuelve cuántos creó.
   * La primera vez solo guarda la foto de cada empresa (no hay con qué comparar).
   */
  async revisar(empresas: EmpresaAviso[], ahora = new Date()): Promise<number> {
    const iso = ahora.toISOString();
    const por = new Map(empresas.map((e) => [e.ticker, e]));
    const nuevos: { usuario: string; a: AvisoNuevo }[] = [];

    // 1. Precios objetivo pendientes (si el usuario no los apagó).
    const pendientes = await this.bd.q<{ usuario_id: string; ticker: string; precio: number; direccion: Direccion; creado: string }>(
      `SELECT o.usuario_id, o.ticker, o.precio, o.direccion, o.creado FROM objetivos o
       LEFT JOIN ajustes_avisos a ON a.usuario_id = o.usuario_id
       WHERE o.cumplido IS NULL AND COALESCE(a.objetivo, TRUE)`);
    const cumplidos: { usuario: string; ticker: string }[] = [];
    for (const o of pendientes) {
      const e = por.get(o.ticker);
      if (!e || !cumpleObjetivo({ precio: Number(o.precio), direccion: o.direccion }, e.precio)) continue;
      nuevos.push({ usuario: o.usuario_id, a: avisoObjetivo(e, { ...o, precio: Number(o.precio) }) });
      cumplidos.push({ usuario: o.usuario_id, ticker: o.ticker });
    }
    if (cumplidos.length) {
      await this.bd.q(
        `UPDATE objetivos o SET cumplido = $3 FROM unnest($1::text[], $2::text[]) AS x(u, t)
         WHERE o.usuario_id = x.u AND o.ticker = x.t`,
        [cumplidos.map((c) => c.usuario), cumplidos.map((c) => c.ticker), iso]);
    }

    // 2. Cambios frente a la última foto (estado y reportes).
    const foto = new Map((await this.bd.q<{ ticker: string; estado: Estado | null; ultimo_trimestre: string | null }>(
      "SELECT ticker, estado, ultimo_trimestre FROM foto_empresas")).map((f) => [f.ticker, f]));
    const primeraVez = foto.size === 0;
    const cambios: { e: EmpresaAviso; estado?: AvisoNuevo; reporte?: AvisoNuevo }[] = [];
    const actualizar: EmpresaAviso[] = [];
    for (const e of empresas) {
      const f = foto.get(e.ticker);
      if (!f || f.estado !== e.estado || f.ultimo_trimestre !== e.ultimoTrimestre) actualizar.push(e);
      if (!f || primeraVez) continue;
      const estado = avisoEstado(e, f.estado) ?? undefined;
      const reporte = avisoReporte(e, f.ultimo_trimestre) ?? undefined;
      if (estado || reporte) cambios.push({ e, estado, reporte });
    }
    if (actualizar.length) {
      await this.bd.q(
        `INSERT INTO foto_empresas (ticker, estado, ultimo_trimestre, actualizado)
         SELECT t, e, u, $4 FROM unnest($1::text[], $2::text[], $3::text[]) AS x(t, e, u)
         ON CONFLICT (ticker) DO UPDATE SET estado = EXCLUDED.estado, ultimo_trimestre = EXCLUDED.ultimo_trimestre,
           actualizado = EXCLUDED.actualizado`,
        [actualizar.map((e) => e.ticker), actualizar.map((e) => e.estado), actualizar.map((e) => e.ultimoTrimestre), iso]);
    }

    // 3. Estado, reportes y movimientos fuertes: solo de empresas seguidas, según los ajustes de cada uno.
    const movidas = empresas.filter((e) => e.cambioPct !== null && Math.abs(e.cambioPct) >= 3);
    const tickers = [...new Set([...cambios.map((c) => c.e.ticker), ...movidas.map((e) => e.ticker)])];
    if (tickers.length) {
      const seguidores = await this.bd.q<{ usuario_id: string; ticker: string } & AjustesAvisos>(
        `SELECT s.usuario_id, s.ticker, a.estado, a.reporte, a.movimiento, a.umbral FROM seguidas s
         JOIN ajustes_avisos a ON a.usuario_id = s.usuario_id
         WHERE s.ticker = ANY($1::text[]) AND (a.estado OR a.reporte OR a.movimiento)`, [tickers]);
      const porTicker = new Map(cambios.map((c) => [c.e.ticker, c]));
      for (const s of seguidores) {
        const c = porTicker.get(s.ticker);
        if (c?.estado && s.estado) nuevos.push({ usuario: s.usuario_id, a: c.estado });
        if (c?.reporte && s.reporte) nuevos.push({ usuario: s.usuario_id, a: c.reporte });
        const e = por.get(s.ticker)!;
        const m = s.movimiento ? avisoMovimiento(e, Number(s.umbral)) : null;
        if (m) nuevos.push({ usuario: s.usuario_id, a: m });
      }
    }
    return this.crear(nuevos, iso);
  }
}
