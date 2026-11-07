/** Formato de números, fechas y nombres. Compartido por la web y el móvil. */

// --- Divisa en la que se muestran los montos -------------------------------------------------
// Todos los datos están en USD. Las apps eligen la divisa (Configuración) con `establecerDivisa`;
// los montos se convierten al mostrarlos. El simulador usa siempre USD (`dineroUsd`).

export interface Divisa { codigo: string; simbolo: string; decimales: number; porUsd: number }

export const DIVISAS: Record<string, { nombre: string; simbolo: string; decimales: number }> = {
  USD: { nombre: "Dólar estadounidense", simbolo: "$", decimales: 2 },
  CLP: { nombre: "Peso chileno", simbolo: "CLP$", decimales: 0 },
  EUR: { nombre: "Euro", simbolo: "€", decimales: 2 },
  MXN: { nombre: "Peso mexicano", simbolo: "MX$", decimales: 2 },
  BRL: { nombre: "Real brasileño", simbolo: "R$", decimales: 2 },
  GBP: { nombre: "Libra esterlina", simbolo: "£", decimales: 2 },
  CAD: { nombre: "Dólar canadiense", simbolo: "CA$", decimales: 2 },
  CHF: { nombre: "Franco suizo", simbolo: "CHF ", decimales: 2 },
  JPY: { nombre: "Yen japonés", simbolo: "¥", decimales: 0 },
};

export const USD: Divisa = { codigo: "USD", simbolo: "$", decimales: 2, porUsd: 1 };

/** La divisa con su tasa del día (unidades por 1 USD). Sin tasa conocida, USD. */
export function divisa(codigo: string | null | undefined, tasas: Record<string, number> | null | undefined): Divisa {
  const info = codigo ? DIVISAS[codigo] : undefined;
  const tasa = codigo ? tasas?.[codigo] : undefined;
  if (!info || !codigo || codigo === "USD" || !tasa || !(tasa > 0)) return USD;
  return { codigo, simbolo: info.simbolo, decimales: info.decimales, porUsd: tasa };
}

let actual: Divisa = USD;
let proveedor: () => Divisa = () => actual;
export function establecerDivisa(d: Divisa) { actual = d; }
/** En el servidor de la web, la divisa de cada petición (no una global compartida). */
export function registrarProveedorDivisa(f: () => Divisa) { proveedor = f; }
export const divisaActual = () => proveedor();

const cifras = (x: number, dec: number) =>
  x.toLocaleString("es", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: "always" });

/** $1.626,72 en USD, sin convertir (simulador, máquina del tiempo). */
export const dineroUsd = (x: number, dec = 2) => "$" + cifras(x, dec);

/** $1.626,72 — en la divisa elegida (CLP$1.578.000, €1.456,02…). */
export const dinero = (x: number, dec = 2) => {
  const d = divisaActual();
  return d.simbolo + cifras(x * d.porUsd, d.decimales === 0 ? 0 : dec);
};

/** Por debajo de medio centavo es cero: evita "−$0,00". */
const casiCero = (x: number, umbral: number) => Math.abs(x) < umbral;

/** "+$12,30", "−$4,00" o "$0,00" (en USD, sin convertir: lo usa el simulador). */
export const dineroConSigno = (x: number, dec = 2) =>
  casiCero(x, 0.5 / 10 ** dec) ? dineroUsd(0, dec) : `${x > 0 ? "+" : "−"}${dineroUsd(Math.abs(x), dec)}`;

/** "+12,3 %", "−4,0 %" o "0,0 %" (x en tanto por uno). */
export const porcentajeConSigno = (x: number, dec = 1) => {
  const n = (v: number) => v.toLocaleString("es", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return casiCero(x * 100, 0.5 / 10 ** dec) ? `${n(0)} %` : `${x > 0 ? "+" : "−"}${n(Math.abs(x * 100))} %`;
};

/** Clase de color para una ganancia: "sube", "baja" o "" si es cero. */
export const tono = (x: number | null | undefined) => (x === null || x === undefined || casiCero(x, 0.005) ? "" : x > 0 ? "sube" : "baja");

/** Montos grandes en la divisa elegida: 114.500.000.000 USD -> "$114,5 mil M". */
export function grande(x: number): string {
  const d = divisaActual();
  const a = Math.abs(x * d.porUsd);
  const s = x < 0 ? "−" : "";
  const n = (v: number, dec: number) => v.toLocaleString("es", { maximumFractionDigits: dec });
  if (a >= 1e12) return `${s}${d.simbolo}${n(a / 1e12, 1)} B`;
  if (a >= 1e9) return `${s}${d.simbolo}${n(a / 1e9, 1)} mil M`;
  if (a >= 1e6) return `${s}${d.simbolo}${n(a / 1e6, 0)} M`;
  return `${s}${d.simbolo}${n(a, 0)}`;
}

export function fechaLarga(d = new Date()): string {
  const s = d.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" }).replace(",", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function saludo(d = new Date()): string {
  const h = d.getHours();
  return h < 12 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches";
}

/** Índice de color pastel (1-5) estable para cada empresa. */
export function colorDe(ticker: string): 1 | 2 | 3 | 4 | 5 {
  let h = 0;
  for (const c of ticker) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ((h % 5) + 1) as 1 | 2 | 3 | 4 | 5;
}

const SUFIJOS = /,?\s+(Inc\.?|Incorporated|Corporation|Corp\.?|Company|Co\.?|plc|N\.V\.|Ltd\.?|Limited|Holdings?|Group|S\.A\.|& Co\.?)$/i;

/** Nombre corto: "Apple Inc." -> "Apple", "Alphabet Inc. (Class A)" -> "Alphabet". */
export function nombreCorto(n: string): string {
  let s = n.replace(/\s*\(.*?\)\s*/g, " ").trim();
  for (let i = 0; i < 3 && SUFIJOS.test(s); i++) s = s.replace(SUFIJOS, "").trim();
  return s;
}

/** 0.055 -> "5,5 %" */
export const porcentaje = (x: number, dec = 1) =>
  `${(x * 100).toLocaleString("es", { minimumFractionDigits: dec, maximumFractionDigits: dec })} %`;

/** "2026-09-26" -> "26 sept 2026" */
export function fechaCorta(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })
    .replace(/\./g, "").replace(/ de /g, " ");
}

/** Sectores GICS en español. */
const SECTORES: Record<string, string> = {
  "Communication Services": "Comunicaciones",
  "Consumer Discretionary": "Consumo discrecional",
  "Consumer Staples": "Consumo básico",
  "Energy": "Energía",
  "Financials": "Finanzas",
  "Health Care": "Salud",
  "Industrials": "Industria",
  "Information Technology": "Tecnología",
  "Materials": "Materiales",
  "Real Estate": "Inmobiliario",
  "Utilities": "Servicios públicos",
};
export const sector = (s: string | null | undefined) => (s ? SECTORES[s] ?? s : "");

/** Límites de los montos que escribe el usuario en la máquina del tiempo. */
export const MONTO_MAXIMO = 10_000_000;

/**
 * Monto escrito por una persona: "1500", "1.500", "1,500.50", "1.500,50", "$ 2.000".
 * Un solo separador seguido de 3 cifras (1.500 / 1,500) es de miles; si no, es decimal.
 * Devuelve null si no es un número positivo.
 */
export function leerMonto(texto: string): number | null {
  let t = texto.replace(/[\s$]/g, "");
  if (!/^[\d.,]+$/.test(t)) return null;
  const punto = t.lastIndexOf("."), coma = t.lastIndexOf(",");
  if (punto >= 0 && coma >= 0) {
    const decimal = punto > coma ? "." : ",";
    t = t.split(decimal === "." ? "," : ".").join("").replace(decimal, ".");
  } else if (punto >= 0 || coma >= 0) {
    const sep = punto >= 0 ? "." : ",";
    const partes = t.split(sep);
    const miles = partes.length > 1 && partes.slice(1).every((x) => x.length === 3) && partes[0].length <= 3 && partes[0] !== "";
    t = miles ? partes.join("") : partes.length === 2 ? partes.join(".") : "";
  }
  const n = Number(t);
  return t && Number.isFinite(n) && n > 0 ? n : null;
}
