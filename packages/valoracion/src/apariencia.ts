/**
 * Apariencia "cine": oscuro por defecto (fondo casi negro, tarjetas grafito, degradado violeta →
 * turquesa) y un tema claro adaptado. Preferencias de Configuración, iguales en web y móvil.
 */

export type ModoTema = "sistema" | "claro" | "oscuro";
export type Acento = "violeta" | "azul" | "menta" | "ambar";

export interface Preferencias {
  tema: ModoTema;
  acento: Acento;
  divisa: string;       // código ISO: USD, CLP, EUR…
  analitica: boolean;   // enviar vistas anónimas para tendencias
}

export const PREFERENCIAS_POR_DEFECTO: Preferencias = { tema: "oscuro", acento: "violeta", divisa: "USD", analitica: true };
export const CLAVE_PREFERENCIAS = "apj.preferencias";

export const MODOS: { id: ModoTema; nombre: string }[] = [
  { id: "oscuro", nombre: "Oscuro" }, { id: "claro", nombre: "Claro" }, { id: "sistema", nombre: "Como el sistema" },
];

/** Colores base de cada tema (los mismos valores en globals.css y en tema.ts del móvil). */
export const PALETA = {
  oscuro: {
    bg: "#07080C", bg2: "#0E1018", card: "#151824", fg: "#F4F5FA", muted: "#9BA1B5", line: "#262A3A",
    acc: "#F4F5FA", onAcc: "#0B0B12", good: "#46D99A", down: "#FF6E6E",
  },
  claro: {
    bg: "#F5F6FA", bg2: "#ECEEF5", card: "#FFFFFF", fg: "#0B0D14", muted: "#586078", line: "#E2E5EE",
    acc: "#0B0D14", onAcc: "#FFFFFF", good: "#0B8A5A", down: "#D2402F",
  },
};

/**
 * Pareja de acento: `accent` (inicio del degradado) y `mint` (final: resaltes, botones, la
 * banda de valor). El verde y el rojo de "barata" y "cara" no cambian: tienen significado.
 * Contrastes revisados sobre los fondos de cada tema.
 */
interface ColoresAcento { accent: string; mint: string; onMint: string; band: string; link: string }
export const ACENTOS: Record<Acento, { nombre: string; oscuro: ColoresAcento; claro: ColoresAcento }> = {
  violeta: { nombre: "Aurora",
    oscuro: { accent: "#8C7DFF", mint: "#3EE6C4", onMint: "#06221B", band: "#143A37", link: "#3EE6C4" },
    claro: { accent: "#6E5CF6", mint: "#3EE6C4", onMint: "#06221B", band: "#D7F6EF", link: "#5B4BE0" } },
  azul: { nombre: "Océano",
    oscuro: { accent: "#4DA3FF", mint: "#3EE6C4", onMint: "#06221B", band: "#123447", link: "#7DC1FF" },
    claro: { accent: "#2F7FE0", mint: "#3EE6C4", onMint: "#06221B", band: "#DCEBFB", link: "#1D63BD" } },
  menta: { nombre: "Menta",
    oscuro: { accent: "#3EE6C4", mint: "#46D99A", onMint: "#04221A", band: "#123A2C", link: "#46D99A" },
    claro: { accent: "#12A88A", mint: "#46D99A", onMint: "#04221A", band: "#D5F3E6", link: "#087A53" } },
  ambar: { nombre: "Atardecer",
    oscuro: { accent: "#FF7A59", mint: "#FFB547", onMint: "#3A2400", band: "#3A2A10", link: "#FFC56E" },
    claro: { accent: "#E8603D", mint: "#FFB547", onMint: "#3A2400", band: "#FCEBCF", link: "#A4570A" } },
};

/** Lee preferencias guardadas (JSON) aceptando solo valores conocidos. */
export function leerPreferencias(texto: string | null | undefined): Preferencias {
  let g: any = null;
  try { g = texto ? JSON.parse(texto) : null; } catch { g = null; }
  const p = { ...PREFERENCIAS_POR_DEFECTO };
  if (g && typeof g === "object") {
    if (MODOS.some((m) => m.id === g.tema)) p.tema = g.tema;
    if (g.acento in ACENTOS) p.acento = g.acento;
    if (typeof g.divisa === "string" && /^[A-Z]{3}$/.test(g.divisa)) p.divisa = g.divisa;
    if (typeof g.analitica === "boolean") p.analitica = g.analitica;
  }
  return p;
}
