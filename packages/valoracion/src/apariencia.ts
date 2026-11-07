/**
 * Preferencias de la pantalla Configuración, iguales en la web y el móvil:
 * tema, color de acento, divisa y registro de uso anónimo.
 */

export type ModoTema = "sistema" | "claro" | "oscuro";
export type Acento = "menta" | "azul" | "violeta" | "ambar";

export interface Preferencias {
  tema: ModoTema;
  acento: Acento;
  divisa: string;       // código ISO: USD, CLP, EUR…
  analitica: boolean;   // enviar vistas anónimas para tendencias
}

export const PREFERENCIAS_POR_DEFECTO: Preferencias = { tema: "sistema", acento: "menta", divisa: "USD", analitica: true };
export const CLAVE_PREFERENCIAS = "apj.preferencias";

export const MODOS: { id: ModoTema; nombre: string }[] = [
  { id: "sistema", nombre: "Como el sistema" }, { id: "claro", nombre: "Claro" }, { id: "oscuro", nombre: "Oscuro" },
];

/**
 * Color de acento (botones, resaltes, la banda de valor). El verde y el rojo de "barata" y
 * "cara" no cambian: tienen significado. Contrastes revisados sobre los fondos de cada tema.
 */
export const ACENTOS: Record<Acento, {
  nombre: string;
  claro: { mint: string; onMint: string; band: string };
  oscuro: { mint: string; onMint: string; band: string; link: string };
}> = {
  menta: { nombre: "Menta", claro: { mint: "#3EDCA6", onMint: "#0E2A4D", band: "#D5F3E6" },
    oscuro: { mint: "#3EDCA6", onMint: "#03140D", band: "#123A2C", link: "#3EDCA6" } },
  azul: { nombre: "Azul", claro: { mint: "#5AB0FF", onMint: "#06203A", band: "#DCEBFB" },
    oscuro: { mint: "#5AB0FF", onMint: "#06203A", band: "#12304D", link: "#7DC1FF" } },
  violeta: { nombre: "Violeta", claro: { mint: "#B79CFF", onMint: "#1E1240", band: "#ECE5FF" },
    oscuro: { mint: "#B79CFF", onMint: "#1E1240", band: "#2A2147", link: "#C7B2FF" } },
  ambar: { nombre: "Ámbar", claro: { mint: "#FFB547", onMint: "#3A2400", band: "#FCEBCF" },
    oscuro: { mint: "#FFB547", onMint: "#3A2400", band: "#3A2A10", link: "#FFC56E" } },
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
