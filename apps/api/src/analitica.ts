/**
 * Registro de uso anónimo: qué empresas se ven, se siguen y se compran en el simulador.
 *
 * - Sin datos personales: cada dispositivo manda un identificador aleatorio de sesión
 *   (no el usuario ni el email). Seguir y comprar se cuentan sin sesión.
 * - El usuario puede desactivarlo en Configuración (la app deja de enviar vistas).
 * - Los eventos se guardan 180 días; los totales sirven para tendencias,
 *   "quienes vieron X también vieron Y" y análisis propios (ver README).
 */
import type { BD } from "./bd.ts";

export type TipoEvento = "vista" | "seguir" | "compra";
export const TIPOS_EVENTO: TipoEvento[] = ["vista", "seguir", "compra"];
const RETENCION_DIAS = 180;
const VISTA_REPETIDA_MIN = 30;   // la misma sesión viendo la misma empresa cuenta una vez cada 30 min

export interface Conteo { ticker: string; n: number; previo: number }

export class Analitica {
  private bd: BD;
  constructor(bd: BD) { this.bd = bd; }

  async limpiar(dias = RETENCION_DIAS) {
    const limite = new Date(Date.now() - dias * 86_400_000).toISOString();
    await this.bd.q("DELETE FROM eventos WHERE ts < $1", [limite]);
  }

  /** Devuelve false si se ignoró (vista repetida de la misma sesión). */
  async registrar(tipo: TipoEvento, ticker: string, sesion: string | null = null, ahora = new Date()): Promise<boolean> {
    if (tipo === "vista" && sesion) {
      const desde = new Date(ahora.getTime() - VISTA_REPETIDA_MIN * 60_000).toISOString();
      const ya = await this.bd.q(
        "SELECT 1 FROM eventos WHERE tipo = 'vista' AND sesion = $1 AND ticker = $2 AND ts >= $3 LIMIT 1",
        [sesion, ticker, desde],
      );
      if (ya.length) return false;
    }
    const ts = ahora.toISOString();
    await this.bd.q("INSERT INTO eventos (ts, dia, tipo, ticker, sesion) VALUES ($1, $2, $3, $4, $5)",
      [ts, ts.slice(0, 10), tipo, ticker, sesion]);
    return true;
  }

  /** Las más vistas / seguidas / compradas en los últimos `dias`, con el periodo anterior para comparar. */
  async ranking(tipo: TipoEvento, dias = 7, limite = 10, ahora = new Date()): Promise<Conteo[]> {
    const d = (n: number) => new Date(ahora.getTime() - n * 86_400_000).toISOString();
    // Vistas: sesiones distintas (una persona curiosa no infla el ranking).
    const [n, previo] = tipo === "vista"
      ? ["COUNT(DISTINCT CASE WHEN ts >= $1 THEN COALESCE(sesion, id::text) END)", "COUNT(DISTINCT CASE WHEN ts < $1 THEN COALESCE(sesion, id::text) END)"]
      : ["COUNT(*) FILTER (WHERE ts >= $1)", "COUNT(*) FILTER (WHERE ts < $1)"];
    const filas = await this.bd.q<Conteo>(
      `SELECT ticker, n::int AS n, previo::int AS previo FROM (
         SELECT ticker, ${n} AS n, ${previo} AS previo
         FROM eventos WHERE tipo = $2 AND ts >= $3
         GROUP BY ticker) x
       WHERE n > 0 ORDER BY n DESC, ticker LIMIT $4`,
      [d(dias), tipo, d(2 * dias), limite],
    );
    return filas.map((f) => ({ ticker: f.ticker, n: Number(f.n), previo: Number(f.previo) }));
  }

  /** Quienes vieron `ticker` también vieron… (sesiones distintas, mínimo `soporte`). */
  async tambienVieron(ticker: string, dias = 30, limite = 6, soporte = 2, ahora = new Date()): Promise<{ ticker: string; n: number }[]> {
    const desde = new Date(ahora.getTime() - dias * 86_400_000).toISOString();
    const filas = await this.bd.q<{ ticker: string; n: number }>(
      `SELECT e.ticker, COUNT(DISTINCT e.sesion)::int AS n
       FROM eventos e
       WHERE e.tipo = 'vista' AND e.ts >= $1 AND e.ticker <> $2 AND e.sesion IN (
         SELECT sesion FROM eventos WHERE tipo = 'vista' AND ticker = $2 AND ts >= $1 AND sesion IS NOT NULL)
       GROUP BY e.ticker HAVING COUNT(DISTINCT e.sesion) >= $3 ORDER BY n DESC, e.ticker LIMIT $4`,
      [desde, ticker, soporte, limite],
    );
    return filas.map((f) => ({ ticker: f.ticker, n: Number(f.n) }));
  }

  /** Totales por día y tipo (para análisis y gráficos de uso). */
  async resumenDiario(dias = 30): Promise<{ dia: string; tipo: TipoEvento; n: number }[]> {
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
    return this.bd.q("SELECT dia, tipo, COUNT(*)::int AS n FROM eventos WHERE dia >= $1 GROUP BY dia, tipo ORDER BY dia", [desde]);
  }
}
