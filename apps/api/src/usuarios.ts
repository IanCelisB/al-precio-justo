/**
 * Usuarios, empresas seguidas y preferencias. Base propia (lectura y escritura),
 * separada de la de datos de mercado, que la API solo lee.
 */
import { DatabaseSync } from "node:sqlite";
import type { Operacion } from "@ancla/valoracion/simulador";

export interface Usuario {
  id: string;          // "google:<sub>"
  email: string;
  nombre: string;
  foto: string | null;
}

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  nombre     TEXT NOT NULL,
  foto       TEXT,
  creado     TEXT NOT NULL,
  ultimo     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS seguidas (
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ticker     TEXT NOT NULL,
  creado     TEXT NOT NULL,
  PRIMARY KEY (usuario_id, ticker)
);
CREATE TABLE IF NOT EXISTS operaciones (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ticker     TEXT NOT NULL,
  tipo       TEXT NOT NULL CHECK (tipo IN ('compra', 'venta')),
  acciones   REAL NOT NULL,
  precio     REAL NOT NULL,
  importe    REAL NOT NULL,
  fecha      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_operaciones_usuario ON operaciones (usuario_id, fecha);
CREATE TABLE IF NOT EXISTS preferencias (
  usuario_id     TEXT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  metricas_extra TEXT NOT NULL DEFAULT '[]'
);
`;

const ahora = () => new Date().toISOString();

export class Usuarios {
  private db: DatabaseSync;

  constructor(ruta: string) {
    this.db = new DatabaseSync(ruta);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(ESQUEMA);
  }

  /** Crea el usuario la primera vez y actualiza nombre y foto en cada inicio de sesión. */
  guardar(u: Usuario): Usuario {
    this.db.prepare(
      `INSERT INTO usuarios (id, email, nombre, foto, creado, ultimo) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET email=excluded.email, nombre=excluded.nombre, foto=excluded.foto, ultimo=excluded.ultimo`,
    ).run(u.id, u.email, u.nombre, u.foto, ahora(), ahora());
    return u;
  }

  obtener(id: string): Usuario | null {
    return (this.db.prepare("SELECT id, email, nombre, foto FROM usuarios WHERE id = ?").get(id) as any) ?? null;
  }

  seguidas(id: string): string[] {
    return (this.db.prepare("SELECT ticker FROM seguidas WHERE usuario_id = ? ORDER BY creado").all(id) as any[])
      .map((r) => r.ticker);
  }

  seguir(id: string, ticker: string) {
    this.db.prepare("INSERT OR IGNORE INTO seguidas (usuario_id, ticker, creado) VALUES (?, ?, ?)").run(id, ticker, ahora());
  }

  dejarDeSeguir(id: string, ticker: string) {
    this.db.prepare("DELETE FROM seguidas WHERE usuario_id = ? AND ticker = ?").run(id, ticker);
  }

  metricasExtra(id: string): string[] {
    const r = this.db.prepare("SELECT metricas_extra FROM preferencias WHERE usuario_id = ?").get(id) as any;
    try { return r ? JSON.parse(r.metricas_extra) : []; } catch { return []; }
  }

  guardarMetricasExtra(id: string, ids: string[]) {
    this.db.prepare(
      `INSERT INTO preferencias (usuario_id, metricas_extra) VALUES (?, ?)
       ON CONFLICT(usuario_id) DO UPDATE SET metricas_extra = excluded.metricas_extra`,
    ).run(id, JSON.stringify(ids));
  }

  // --- simulador ---------------------------------------------------------------
  operaciones(id: string): Operacion[] {
    return this.db.prepare(
      "SELECT ticker, tipo, acciones, precio, importe, fecha FROM operaciones WHERE usuario_id = ? ORDER BY fecha, id",
    ).all(id) as any;
  }

  registrar(id: string, o: Operacion) {
    this.db.prepare(
      "INSERT INTO operaciones (usuario_id, ticker, tipo, acciones, precio, importe, fecha) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, o.ticker, o.tipo, o.acciones, o.precio, o.importe, o.fecha);
  }

  /** Vuelve a empezar con el saldo inicial. */
  reiniciarSimulador(id: string) {
    this.db.prepare("DELETE FROM operaciones WHERE usuario_id = ?").run(id);
  }

  /** Borra la cuenta y todo lo asociado. */
  borrar(id: string) {
    this.db.prepare("DELETE FROM usuarios WHERE id = ?").run(id);
  }
}
