/**
 * Paleta de Al Precio Justo: azul marino profundo + menta, sobre blanco limpio (oscuro: grafito).
 * Los mismos valores que apps/web/app/globals.css. Todos los pares texto/fondo
 * cumplen WCAG AA (≥ 4,5:1).
 */
export const claro = {
  bg: "#F8F9FB", card: "#FFFFFF", fg: "#121B26", muted: "#5B6878", line: "#E4E9EF",
  acc: "#0E2A4D", onAcc: "#FFFFFF", mint: "#3EDCA6", onMint: "#0E2A4D", link: "#0E2A4D", barra: "#0E2A4D",
  band: "#D5F3E6", good: "#087A53", down: "#C2361F",
  pastel: ["#E9F0FB", "#E1F6EE", "#F1ECFA", "#F7F1E7", "#EDF1F5"], cFg: "#121B26", borde: "rgba(18,27,38,0.05)",
};

export const oscuro: typeof claro = {
  bg: "#07090C", card: "#14171C", fg: "#F2F5F8", muted: "#8A9AA8", line: "#23282F",
  acc: "#10233D", onAcc: "#F2F5F8", mint: "#3EDCA6", onMint: "#03140D", link: "#3EDCA6", barra: "#3A5F8F",
  band: "#123A2C", good: "#3EDCA6", down: "#FF7A66",
  pastel: ["#17243B", "#102A21", "#211D35", "#2A2318", "#19222C"], cFg: "#F2F5F8", borde: "rgba(242,245,248,0.05)",
};

export type Tema = typeof claro;

export const fuentes = {
  head: "BricolageGrotesque_800ExtraBold",
  ui: "DMSans_400Regular",
  uiBold: "DMSans_700Bold",
  mono: "DMMono_400Regular",
};
