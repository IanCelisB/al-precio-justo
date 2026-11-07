/** Lectura de la base que llena la ingesta (Python). Solo lectura. */
import { DatabaseSync } from "node:sqlite";
import type { Trimestre } from "@ancla/valoracion";

export interface Empresa {
  ticker: string;
  nombre: string;
  sector: string | null;
  indice: string | null;      // S&P 500 | S&P 400 | Popular
}

export interface Cotizacion {
  precio: number;
  cambioPct: number | null;
  fecha: string;
  fuente: string;
}

const CAMPOS: Record<string, keyof Trimestre> = {
  revenue: "ventas",
  net_income: "beneficios",
  free_cash_flow: "fcf",
  stock_issuance: "emision",
  buybacks: "recompras",
  net_buybacks: "recomprasNetas",
  net_debt: "deudaNeta",
  dividends: "dividendos",
  operating_cash_flow: "flujoOperativo",
  capex: "capex",
  stock_comp: "compAcciones",
  debt: "deuda",
  cash: "caja",
};

export class Datos {
  private db: DatabaseSync;

  constructor(ruta: string) {
    this.db = new DatabaseSync(ruta, { readOnly: true });
  }

  empresas(): Empresa[] {
    return this.db.prepare("SELECT ticker, name AS nombre, sector, indice FROM companies ORDER BY ticker").all() as any;
  }

  cotizaciones(): Map<string, Cotizacion> {
    const filas = this.db.prepare(
      "SELECT ticker, price AS precio, change_pct AS cambioPct, as_of AS fecha, source AS fuente FROM quotes",
    ).all() as any[];
    return new Map(filas.map((f) => [f.ticker, { precio: f.precio, cambioPct: f.cambioPct, fecha: f.fecha, fuente: f.fuente }]));
  }

  /** Todos los trimestres de todas las empresas, en una sola consulta. */
  /** Momento de la última escritura de cada empresa (para recargar solo las que cambian). */
  marcas(): Map<string, string> {
    const filas = this.db.prepare("SELECT ticker, updated_at AS marca FROM companies").all() as any[];
    return new Map(filas.map((f) => [f.ticker, f.marca ?? ""]));
  }

  /** Trimestres de todas las empresas, o solo de `tickers`. Cargar todas tarda ~2 s (800.000 cifras). */
  trimestres(tickers?: string[]): Map<string, Trimestre[]> {
    const filas = (tickers
      ? this.db.prepare(
        `SELECT ticker, period_end, metric, value FROM fundamentals_q WHERE ticker IN (${tickers.map(() => "?").join(",")})
         ORDER BY ticker, period_end`).all(...tickers)
      : this.db.prepare("SELECT ticker, period_end, metric, value FROM fundamentals_q ORDER BY ticker, period_end").all()) as any[];
    const out = new Map<string, Map<string, Trimestre & { _dil?: number; _out?: number }>>();
    for (const f of filas) {
      let porFecha = out.get(f.ticker);
      if (!porFecha) out.set(f.ticker, (porFecha = new Map()));
      let t = porFecha.get(f.period_end);
      if (!t) porFecha.set(f.period_end, (t = { periodo: f.period_end }));
      const campo = CAMPOS[f.metric];
      if (campo) (t as any)[campo] = f.value;
      else if (f.metric === "diluted_shares") t._dil = f.value;
      else if (f.metric === "shares_outstanding") t._out = f.value;
    }
    const res = new Map<string, Trimestre[]>();
    for (const [ticker, porFecha] of out) {
      res.set(ticker, [...porFecha.values()].map(({ _dil, _out, ...t }) => ({ ...t, acciones: _dil ?? _out })));
    }
    return res;
  }

  /** Cierres semanales (último cierre de cada semana) desde una fecha. */
  historicoPrecios(ticker: string, desde: string): { fecha: string; cierre: number }[] {
    return this.db.prepare(
      `SELECT MAX(day) AS fecha, close AS cierre FROM prices_daily
       WHERE ticker = ? AND day >= ? GROUP BY strftime('%Y-%W', day) ORDER BY fecha`,
    ).all(ticker, desde) as any;
  }

  /** Cierres diarios de varios tickers desde una fecha, ordenados. */
  cierres(tickers: string[], desde: string): Record<string, { fecha: string; cierre: number }[]> {
    const out: Record<string, { fecha: string; cierre: number }[]> = {};
    const q = this.db.prepare("SELECT day AS fecha, close AS cierre FROM prices_daily WHERE ticker = ? AND day >= ? ORDER BY day");
    for (const t of new Set(tickers)) out[t] = q.all(t, desde) as any;
    return out;
  }

  /** Tablas que crea `ingesta.actualizar`; pueden no existir si nunca se ejecutó. */
  private hay(tabla: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tabla);
  }

  /** Cambia cuando la ingesta guarda empresas, publica un reporte o llegan precios: sirve para recalcular al momento. */
  version(): string {
    const precios = (this.db.prepare("SELECT MAX(as_of) AS f FROM quotes").get() as any)?.f ?? "";
    const empresas = (this.db.prepare("SELECT MAX(updated_at) AS f, COUNT(*) AS n FROM companies").get() as any) ?? {};
    const base = `${precios}|${empresas.f}|${empresas.n}`;
    if (!this.hay("actualizaciones")) return base;
    const r = this.db.prepare(
      "SELECT MAX(id) AS id FROM actualizaciones WHERE estado IN ('publicado','aprobado')").get() as any;
    return `${base}|${r?.id ?? 0}`;
  }

  /** Últimos reportes publicados (los que cambiaron datos que ve el usuario). */
  novedades(limite: number): { ticker: string; form: string; presentado: string; trimestre: string | null; publicado: string }[] {
    if (!this.hay("actualizaciones")) return [];
    return this.db.prepare(
      `SELECT ticker, form, filed AS presentado, trimestre, creado AS publicado FROM actualizaciones
       WHERE estado IN ('publicado','aprobado') AND form NOT IN ('historia','revision')
       ORDER BY creado DESC LIMIT ?`,
    ).all(limite) as any;
  }

  /** Estado de la actualización automática. */
  estadoIngesta() {
    const estado: Record<string, string> = {};
    if (this.hay("estado_ingesta")) {
      for (const r of this.db.prepare("SELECT clave, valor FROM estado_ingesta").all() as any[]) estado[r.clave] = r.valor;
    }
    const cuenta = (tabla: string, sql: string) => (this.hay(tabla) ? Number((this.db.prepare(sql).get() as any).n) : 0);
    return {
      ultimaRevision: estado.ultima_revision ?? null,
      indiceRevisadoHasta: estado.indice_ultimo_dia ?? null,
      preciosHasta: (this.db.prepare("SELECT MAX(as_of) AS f FROM quotes").get() as any)?.f ?? null,
      enCuarentena: cuenta("actualizaciones", "SELECT COUNT(DISTINCT ticker) AS n FROM actualizaciones WHERE estado='cuarentena'"),
      publicadosUltimos7Dias: cuenta("actualizaciones",
        "SELECT COUNT(*) AS n FROM actualizaciones WHERE estado IN ('publicado','aprobado') AND creado >= datetime('now','-7 days')"),
      empresasConDocumentos: cuenta("filings", "SELECT COUNT(DISTINCT cik) AS n FROM filings WHERE status='leido'"),
    };
  }

  /** Perfil descriptivo guardado por `ingesta.perfil` (null si aún no se generó). */
  perfil(ticker: string): unknown {
    if (!this.hay("perfiles")) return null;
    const r = this.db.prepare("SELECT datos FROM perfiles WHERE ticker = ?").get(ticker) as any;
    return r ? JSON.parse(r.datos) : null;
  }

  /** Última tasa de cada divisa (unidades por 1 USD), con su fecha y fuente. */
  divisas(): { codigo: string; porUsd: number; fecha: string; fuente: string }[] {
    if (!this.hay("divisas")) return [];
    return this.db.prepare(
      `SELECT d.codigo, d.por_usd AS porUsd, d.fecha, d.fuente FROM divisas d
       JOIN (SELECT codigo, MAX(fecha) AS fecha FROM divisas GROUP BY codigo) u ON u.codigo = d.codigo AND u.fecha = d.fecha
       ORDER BY d.codigo`,
    ).all() as any;
  }
}
