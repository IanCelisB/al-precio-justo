/**
 * Base de datos de usuarios, analítica y avisos: Postgres.
 *
 * - Producción: DATABASE_URL (p. ej. Neon) → conexión con `pg`.
 * - Desarrollo y pruebas: sin DATABASE_URL se usa PGlite, el mismo Postgres embebido
 *   en el proceso (carpeta data/pg, o en memoria para las pruebas). Así el SQL es
 *   uno solo y no hace falta instalar nada para programar.
 *
 * Los datos de mercado (reportes de la SEC, precios) siguen en el SQLite que arma la
 * ingesta: la API solo los lee (ver datos.ts).
 */
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";

export interface BD {
  tipo: "postgres" | "pglite";
  /** Consulta con parámetros $1, $2… Devuelve las filas. */
  q<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Varias sentencias sin parámetros (migraciones). */
  ejecutar(sql: string): Promise<void>;
  cerrar(): Promise<void>;
}

/**
 * Migraciones en orden. Nunca se edita una ya publicada: se agrega una nueva al final.
 * Las fechas se guardan como texto ISO 8601 (se ordenan y comparan bien como texto).
 */
const MIGRACIONES: string[] = [
  // 1. usuarios, seguidas, simulador y preferencias
  `CREATE TABLE usuarios (
     id      TEXT PRIMARY KEY,
     email   TEXT NOT NULL,
     nombre  TEXT NOT NULL,
     foto    TEXT,
     creado  TEXT NOT NULL,
     ultimo  TEXT NOT NULL
   );
   CREATE TABLE seguidas (
     usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     ticker     TEXT NOT NULL,
     creado     TEXT NOT NULL,
     PRIMARY KEY (usuario_id, ticker)
   );
   CREATE INDEX ix_seguidas_ticker ON seguidas (ticker);
   CREATE TABLE operaciones (
     id         BIGSERIAL PRIMARY KEY,
     usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     ticker     TEXT NOT NULL,
     tipo       TEXT NOT NULL CHECK (tipo IN ('compra', 'venta')),
     acciones   DOUBLE PRECISION NOT NULL,
     precio     DOUBLE PRECISION NOT NULL,
     importe    DOUBLE PRECISION NOT NULL,
     fecha      TEXT NOT NULL
   );
   CREATE INDEX ix_operaciones_usuario ON operaciones (usuario_id, fecha);
   CREATE TABLE preferencias (
     usuario_id     TEXT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
     metricas_extra TEXT NOT NULL DEFAULT '[]'
   );`,
  // 2. uso anónimo
  `CREATE TABLE eventos (
     id      BIGSERIAL PRIMARY KEY,
     ts      TEXT NOT NULL,
     dia     TEXT NOT NULL,
     tipo    TEXT NOT NULL CHECK (tipo IN ('vista', 'seguir', 'compra')),
     ticker  TEXT NOT NULL,
     sesion  TEXT
   );
   CREATE INDEX ix_eventos_tipo ON eventos (tipo, ts, ticker);
   CREATE INDEX ix_eventos_sesion ON eventos (sesion, ticker);`,
  // 3. avisos: ajustes por usuario, precios objetivo, avisos y la última foto de cada empresa
  `CREATE TABLE ajustes_avisos (
     usuario_id TEXT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
     objetivo   BOOLEAN NOT NULL DEFAULT TRUE,
     estado     BOOLEAN NOT NULL DEFAULT FALSE,
     reporte    BOOLEAN NOT NULL DEFAULT FALSE,
     movimiento BOOLEAN NOT NULL DEFAULT FALSE,
     umbral     DOUBLE PRECISION NOT NULL DEFAULT 5
   );
   CREATE TABLE objetivos (
     usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     ticker     TEXT NOT NULL,
     precio     DOUBLE PRECISION NOT NULL,
     direccion  TEXT NOT NULL CHECK (direccion IN ('baja', 'sube')),
     creado     TEXT NOT NULL,
     cumplido   TEXT,
     PRIMARY KEY (usuario_id, ticker)
   );
   CREATE INDEX ix_objetivos_pendientes ON objetivos (ticker) WHERE cumplido IS NULL;
   CREATE TABLE avisos (
     id         BIGSERIAL PRIMARY KEY,
     usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     ticker     TEXT NOT NULL,
     tipo       TEXT NOT NULL CHECK (tipo IN ('objetivo', 'estado', 'reporte', 'movimiento')),
     titulo     TEXT NOT NULL,
     texto      TEXT NOT NULL,
     clave      TEXT NOT NULL,
     creado     TEXT NOT NULL,
     leido      BOOLEAN NOT NULL DEFAULT FALSE,
     UNIQUE (usuario_id, clave)
   );
   CREATE INDEX ix_avisos_usuario ON avisos (usuario_id, creado DESC);
   CREATE TABLE foto_empresas (
     ticker            TEXT PRIMARY KEY,
     estado            TEXT,
     ultimo_trimestre  TEXT,
     actualizado       TEXT NOT NULL
   );`,
  // 4. varias listas por usuario ("Quiero comprar", "Tengo"…). `seguidas` queda como la unión de
  //    todas las listas (la usan los avisos y el recuento de seguidores). Las seguidas de antes
  //    pasan a una lista "Mi lista".
  `CREATE TABLE listas (
     id         BIGSERIAL PRIMARY KEY,
     usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     nombre     TEXT NOT NULL,
     orden      INTEGER NOT NULL DEFAULT 0,
     creado     TEXT NOT NULL
   );
   CREATE INDEX ix_listas_usuario ON listas (usuario_id, orden, id);
   CREATE TABLE lista_empresas (
     lista_id BIGINT NOT NULL REFERENCES listas(id) ON DELETE CASCADE,
     ticker   TEXT NOT NULL,
     creado   TEXT NOT NULL,
     PRIMARY KEY (lista_id, ticker)
   );
   INSERT INTO listas (usuario_id, nombre, orden, creado)
     SELECT DISTINCT usuario_id, 'Mi lista', 0, MIN(creado) OVER (PARTITION BY usuario_id) FROM seguidas;
   INSERT INTO lista_empresas (lista_id, ticker, creado)
     SELECT l.id, s.ticker, s.creado FROM seguidas s JOIN listas l ON l.usuario_id = s.usuario_id;`,
  // 5. comunidad: perfil propio (nombre, foto y presentación que no pisa Google), publicaciones,
  //    me gusta, comentarios y buzón de sugerencias. `publico` es el id que ven los demás
  //    (nunca el email ni el id de Google).
  `ALTER TABLE usuarios ADD COLUMN publico TEXT;
   UPDATE usuarios SET publico = md5(random()::text || id || clock_timestamp()::text);
   ALTER TABLE usuarios ALTER COLUMN publico SET NOT NULL;
   CREATE UNIQUE INDEX ix_usuarios_publico ON usuarios (publico);
   ALTER TABLE usuarios ADD COLUMN nombre_propio TEXT;
   ALTER TABLE usuarios ADD COLUMN foto_propia TEXT;
   ALTER TABLE usuarios ADD COLUMN bio TEXT NOT NULL DEFAULT '';
   CREATE TABLE publicaciones (
     id         BIGSERIAL PRIMARY KEY,
     usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     texto      TEXT NOT NULL,
     ticker     TEXT,
     cartera    TEXT,             -- JSON: resultado del simulador compartido
     creado     TEXT NOT NULL
   );
   CREATE INDEX ix_publicaciones_creado ON publicaciones (creado DESC);
   CREATE INDEX ix_publicaciones_usuario ON publicaciones (usuario_id, creado DESC);
   CREATE TABLE me_gusta (
     publicacion_id BIGINT NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
     usuario_id     TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     creado         TEXT NOT NULL,
     PRIMARY KEY (publicacion_id, usuario_id)
   );
   CREATE TABLE comentarios (
     id             BIGSERIAL PRIMARY KEY,
     publicacion_id BIGINT NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
     usuario_id     TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     texto          TEXT NOT NULL,
     creado         TEXT NOT NULL
   );
   CREATE INDEX ix_comentarios_publicacion ON comentarios (publicacion_id, creado);
   CREATE TABLE buzon (
     id         BIGSERIAL PRIMARY KEY,
     usuario_id TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
     tipo       TEXT NOT NULL CHECK (tipo IN ('comentario', 'sugerencia', 'reclamo', 'reporte')),
     texto      TEXT NOT NULL,
     creado     TEXT NOT NULL
   );`,
];

async function migrar(bd: BD) {
  await bd.ejecutar("CREATE TABLE IF NOT EXISTS migraciones (n INTEGER PRIMARY KEY, aplicada TEXT NOT NULL)");
  const hechas = new Set((await bd.q<{ n: number }>("SELECT n FROM migraciones")).map((r) => Number(r.n)));
  for (let i = 0; i < MIGRACIONES.length; i++) {
    const n = i + 1;
    if (hechas.has(n)) continue;
    await bd.ejecutar(`BEGIN; ${MIGRACIONES[i]}; INSERT INTO migraciones (n, aplicada) VALUES (${n}, '${new Date().toISOString()}'); COMMIT;`);
  }
}

/**
 * Abre la base: `url` (o DATABASE_URL) para Postgres; si no, PGlite en `dir`
 * (o en memoria con dir = "memoria").
 */
export async function abrirBD(opc: { url?: string; dir?: string } = {}): Promise<BD> {
  const url = opc.url ?? process.env.DATABASE_URL;
  let bd: BD;
  if (url) {
    // Neon y la mayoría de los servicios exigen SSL; en local (localhost) no.
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    const pool = new pg.Pool({ connectionString: url, max: 5, ssl: local ? undefined : { rejectUnauthorized: true } });
    bd = {
      tipo: "postgres",
      q: async (sql, params) => (await pool.query(sql, params as any[])).rows,
      ejecutar: async (sql) => { await pool.query(sql); },
      cerrar: () => pool.end(),
    };
  } else {
    const db = opc.dir === "memoria" ? new PGlite() : new PGlite(opc.dir);
    bd = {
      tipo: "pglite",
      q: async (sql, params) => (await db.query<any>(sql, params as any[])).rows,
      ejecutar: async (sql) => { await db.exec(sql); },
      cerrar: () => db.close(),
    };
  }
  await migrar(bd);
  return bd;
}
