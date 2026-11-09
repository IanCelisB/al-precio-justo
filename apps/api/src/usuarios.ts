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

const ahora = () => new Date().toISOString();

export class Usuarios {
  private bd: BD;
  constructor(bd: BD) { this.bd = bd; }

  /** Crea el usuario la primera vez y actualiza nombre y foto en cada inicio de sesión. */
  async guardar(u: Usuario): Promise<Usuario> {
    await this.bd.q(
      `INSERT INTO usuarios (id, email, nombre, foto, creado, ultimo) VALUES ($1, $2, $3, $4, $5, $5)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, nombre = EXCLUDED.nombre, foto = EXCLUDED.foto, ultimo = EXCLUDED.ultimo`,
      [u.id, u.email, u.nombre, u.foto, ahora()],
    );
    return u;
  }

  async obtener(id: string): Promise<Usuario | null> {
    return (await this.bd.q<Usuario>("SELECT id, email, nombre, foto FROM usuarios WHERE id = $1", [id]))[0] ?? null;
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

  async seguir(id: string, ticker: string) {
    await this.bd.q("INSERT INTO seguidas (usuario_id, ticker, creado) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [id, ticker, ahora()]);
  }

  async dejarDeSeguir(id: string, ticker: string) {
    await this.bd.q("DELETE FROM seguidas WHERE usuario_id = $1 AND ticker = $2", [id, ticker]);
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
