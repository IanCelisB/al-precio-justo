/**
 * Industria de cada empresa: nombre en español, ilustración y tono de tarjeta.
 *
 * Las ilustraciones son iconos de línea propios (viewBox 24×24, trazo de 1,8),
 * descritos como datos para que la web (<svg>) y el móvil (react-native-svg)
 * los dibujen igual.
 */

export type Forma =
  | { t: "path"; d: string }
  | { t: "circle"; cx: number; cy: number; r: number }
  | { t: "rect"; x: number; y: number; w: number; h: number; rx?: number };

export interface Sector {
  nombre: string;
  icono: Forma[];
  tono: 1 | 2 | 3 | 4 | 5; // --c1 … --c5
}

const p = (d: string): Forma => ({ t: "path", d });

export const SECTORES: Record<string, Sector> = {
  "Information Technology": {
    nombre: "Tecnología", tono: 1,
    icono: [
      { t: "rect", x: 7, y: 7, w: 10, h: 10, rx: 2 },
      { t: "rect", x: 10, y: 10, w: 4, h: 4, rx: 0.5 },
      p("M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"),
    ],
  },
  "Communication Services": {
    nombre: "Comunicaciones", tono: 3,
    icono: [
      { t: "circle", cx: 12, cy: 12, r: 1.6 },
      p("M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7"),
      p("M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"),
    ],
  },
  "Consumer Discretionary": {
    nombre: "Consumo discrecional", tono: 4,
    icono: [
      p("M5 8h14l-1.2 12H6.2z"),
      p("M9 8V6.5a3 3 0 0 1 6 0V8"),
      p("M9 12a3 3 0 0 0 6 0"),
    ],
  },
  "Consumer Staples": {
    nombre: "Consumo básico", tono: 2,
    icono: [
      p("M3 4h2.5l2.2 10.5h10.6L20.5 7H7"),
      { t: "circle", cx: 9.5, cy: 18.5, r: 1.5 },
      { t: "circle", cx: 17, cy: 18.5, r: 1.5 },
    ],
  },
  "Energy": {
    nombre: "Energía", tono: 4,
    icono: [
      p("M12 3c3.5 4 6 7 6 10.5a6 6 0 0 1-12 0C6 10 8.5 7 12 3z"),
      p("M12 13c1.4 1.5 2.2 2.6 2.2 3.8a2.2 2.2 0 0 1-4.4 0c0-1.2.8-2.3 2.2-3.8z"),
    ],
  },
  "Financials": {
    nombre: "Finanzas", tono: 5,
    icono: [
      p("M3 9.5 12 4l9 5.5"),
      p("M5 10v7M9.7 10v7M14.3 10v7M19 10v7"),
      p("M3.5 20h17"),
    ],
  },
  "Health Care": {
    nombre: "Salud", tono: 2,
    icono: [
      p("M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"),
      p("M7 12.5h2.5l1.2-2.2 2 4.2 1.3-2h3"),
    ],
  },
  "Industrials": {
    nombre: "Industria", tono: 5,
    icono: [
      p("M3 20V10l5 3.2V10l5 3.2V6h3v-3h3v17z"),
      p("M2.5 20h19"),
      p("M7 16.5h1.5M11 16.5h1.5M15 16.5h1.5"),
    ],
  },
  "Materials": {
    nombre: "Materiales", tono: 4,
    icono: [
      p("M12 3.5 20 8v8l-8 4.5L4 16V8z"),
      p("M4 8l8 4.5L20 8M12 12.5v8"),
    ],
  },
  "Real Estate": {
    nombre: "Inmobiliario", tono: 3,
    icono: [
      { t: "rect", x: 4, y: 4, w: 9, h: 16, rx: 1 },
      p("M13 10h6a1 1 0 0 1 1 1v9h-7"),
      p("M7.5 8h2M7.5 11.5h2M7.5 15h2M16 14h1.5M16 17h1.5"),
      p("M2.5 20h19"),
    ],
  },
  "Utilities": {
    nombre: "Servicios públicos", tono: 1,
    icono: [p("M13 2.5 5 13.5h6l-1 8 8-11h-6z")],
  },
};

export const SECTOR_DESCONOCIDO: Sector = {
  nombre: "Otros", tono: 5,
  icono: [{ t: "circle", cx: 12, cy: 12, r: 7 }, p("M12 8v4l2.5 2.5")],
};

export const sectorDe = (s: string | null | undefined): Sector => (s && SECTORES[s]) || SECTOR_DESCONOCIDO;
