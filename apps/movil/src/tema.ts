/**
 * Paleta "cine" de Al Precio Justo: oscuro por defecto (fondo casi negro, tarjetas grafito,
 * degradado violeta → turquesa) y un tema claro adaptado. Los mismos valores que
 * packages/valoracion/src/apariencia.ts y apps/web/app/globals.css.
 */
import { ACENTOS, PALETA } from "@ancla/valoracion/apariencia";

const a = ACENTOS.violeta;

export const oscuro = {
  ...PALETA.oscuro,
  ...a.oscuro,
  barra: "#3A3F5C",
  pastel: ["#171D33", "#10261F", "#1E1B33", "#2A2318", "#181C28"], cFg: "#F4F5FA", borde: "rgba(255,255,255,0.08)",
};

export const claro: typeof oscuro = {
  ...PALETA.claro,
  ...a.claro,
  barra: "#0B0D14",
  pastel: ["#E9EEFB", "#E1F6EE", "#F0ECFB", "#F7F1E7", "#EDF1F5"], cFg: "#0B0D14", borde: "rgba(11,13,20,0.06)",
};

export type Tema = typeof oscuro;

export const fuentes = {
  head: "BricolageGrotesque_800ExtraBold",
  headMedio: "BricolageGrotesque_700Bold",
  ui: "Figtree_400Regular",
  uiBold: "Figtree_600SemiBold",
  mono: "DMMono_400Regular",
};
