/** Formato de números, fechas y nombres. Compartido por la web y el móvil. */

/** $1.626,72 — con separador de miles también en cifras de 4 dígitos (en dinero se lee mejor). */
export const dinero = (x: number, dec = 2) =>
  "$" + x.toLocaleString("es", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: "always" });

/** Por debajo de medio centavo es cero: evita "−$0,00". */
const casiCero = (x: number, umbral: number) => Math.abs(x) < umbral;

/** "+$12,30", "−$4,00" o "$0,00". */
export const dineroConSigno = (x: number, dec = 2) =>
  casiCero(x, 0.5 / 10 ** dec) ? dinero(0, dec) : `${x > 0 ? "+" : "−"}${dinero(Math.abs(x), dec)}`;

/** "+12,3 %", "−4,0 %" o "0,0 %" (x en tanto por uno). */
export const porcentajeConSigno = (x: number, dec = 1) => {
  const n = (v: number) => v.toLocaleString("es", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return casiCero(x * 100, 0.5 / 10 ** dec) ? `${n(0)} %` : `${x > 0 ? "+" : "−"}${n(Math.abs(x * 100))} %`;
};

/** Clase de color para una ganancia: "sube", "baja" o "" si es cero. */
export const tono = (x: number | null | undefined) => (x === null || x === undefined || casiCero(x, 0.005) ? "" : x > 0 ? "sube" : "baja");

/** 114.500.000.000 -> "$114,5 mil M" */
export function grande(x: number): string {
  const a = Math.abs(x);
  const s = x < 0 ? "−" : "";
  const n = (v: number, d: number) => v.toLocaleString("es", { maximumFractionDigits: d });
  if (a >= 1e12) return `${s}$${n(a / 1e12, 1)} B`;
  if (a >= 1e9) return `${s}$${n(a / 1e9, 1)} mil M`;
  if (a >= 1e6) return `${s}$${n(a / 1e6, 0)} M`;
  return `${s}$${n(a, 0)}`;
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
