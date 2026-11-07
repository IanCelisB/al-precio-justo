/**
 * Registro de uso anónimo: qué empresas se ven, se siguen y se compran en el simulador.
 *
 * - Sin datos personales: cada dispositivo manda un identificador aleatorio de sesión
 *   (no el usuario ni el email). Seguir y comprar se cuentan sin sesión.
 * - El usuario puede desactivarlo en Configuración (la app deja de enviar vistas).
 * - Los eventos se guardan 180 días; los totales sirven para tendencias,
 *   "quienes vieron X también vieron Y" y análisis propios (ver README).
 */
import { DatabaseSync } from "node:sqlite";

export type TipoEvento = "vista" | "seguir" | "compra";
export const TIPOS_EVENTO: TipoEvento[] = ["vista", "seguir", "compra"];
const RETENCION_DIAS = 180;
const VISTA_REPETIDA_MIN = 30;   // la misma sesión viendo la misma empresa cuenta una vez cada 30 min

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS eventos (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      TEXT NOT NULL,
  dia     TEXT NOT NULL,
  tipo    TEXT NOT NULL CHECK (tipo IN ('vista', 'seguir', 'compra')),
  ticker  TEXT NOT NULL,
  sesion  TEXT
);
CREATE INDEX IF NOT EXISTS ix_eventos_tipo ON eventos (tipo, dia, ticker);
CREATE INDEX IF NOT EXISTS ix_eventos_sesion ON eventos (sesion, ticker);
`;

export interface Conteo { ticker: string; n: number; previo: number }

export class Analitica {
  private db: DatabaseSync;

  constructor(ruta: string) {
    this.db = new DatabaseSync(ruta);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(ESQUEMA);
    this.limpiar();
  }

  limpiar(dias = RETENCION_DIAS) {
    const limite = new Date(Date.now() - dias * 86_400_000).toISOString();
    this.db.prepare("DELETE FROM eventos WHERE ts < ?").run(limite);
  }

  /** Devuelve false si se ignoró (vista repetida de la misma sesión). */
  registrar(tipo: TipoEvento, ticker: string, sesion: string | null = null, ahora = new Date()): boolean {
    if (tipo === "vista" && sesion) {
      const desde = new Date(ahora.getTime() - VISTA_REPETIDA_MIN * 60_000).toISOString();
      const ya = this.db.prepare("SELECT 1 FROM eventos WHERE tipo='vista' AND sesion=? AND ticker=? AND ts>=? LIMIT 1")
        .get(sesion, ticker, desde);
      if (ya) return false;
    }
    const ts = ahora.toISOString();
    this.db.prepare("INSERT INTO eventos (ts, dia, tipo, ticker, sesion) VALUES (?, ?, ?, ?, ?)")
      .run(ts, ts.slice(0, 10), tipo, ticker, sesion);
    return true;
  }

  /** Las más vistas / seguidas / compradas en los últimos `dias`, con el periodo anterior para comparar. */
  ranking(tipo: TipoEvento, dias = 7, limite = 10, ahora = new Date()): Conteo[] {
    const d = (n: number) => new Date(ahora.getTime() - n * 86_400_000).toISOString();
    // Vistas: sesiones distintas (una persona curiosa no infla el ranking).
    const [n, previo] = tipo === "vista"
      ? ["COUNT(DISTINCT CASE WHEN ts >= ? THEN COALESCE(sesion, id) END)", "COUNT(DISTINCT CASE WHEN ts < ? THEN COALESCE(sesion, id) END)"]
      : ["SUM(ts >= ?)", "SUM(ts < ?)"];
    return this.db.prepare(
      `SELECT ticker, ${n} AS n, ${previo} AS previo
       FROM eventos WHERE tipo = ? AND ts >= ?
       GROUP BY ticker HAVING n > 0 ORDER BY n DESC, ticker LIMIT ?`,
    ).all(d(dias), d(dias), tipo, d(2 * dias), limite) as any;
  }

  /** Quienes vieron `ticker` también vieron… (sesiones distintas, mínimo `soporte`). */
  tambienVieron(ticker: string, dias = 30, limite = 6, soporte = 2, ahora = new Date()): { ticker: string; n: number }[] {
    const desde = new Date(ahora.getTime() - dias * 86_400_000).toISOString();
    return this.db.prepare(
      `SELECT e.ticker, COUNT(DISTINCT e.sesion) AS n
       FROM eventos e
       WHERE e.tipo = 'vista' AND e.ts >= ? AND e.ticker <> ? AND e.sesion IN (
         SELECT sesion FROM eventos WHERE tipo = 'vista' AND ticker = ? AND ts >= ? AND sesion IS NOT NULL)
       GROUP BY e.ticker HAVING n >= ? ORDER BY n DESC, e.ticker LIMIT ?`,
    ).all(desde, ticker, ticker, desde, soporte, limite) as any;
  }

  /** Totales por día y tipo (para análisis y gráficos de uso). */
  resumenDiario(dias = 30): { dia: string; tipo: TipoEvento; n: number }[] {
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
    return this.db.prepare("SELECT dia, tipo, COUNT(*) AS n FROM eventos WHERE dia >= ? GROUP BY dia, tipo ORDER BY dia")
      .all(desde) as any;
  }
}
