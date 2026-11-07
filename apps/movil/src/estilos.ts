import { StyleSheet } from "react-native";
import { fuentes, type Tema } from "./tema";

export type Estilos = ReturnType<typeof estilos>;

export function estilos(t: Tema) {
  return StyleSheet.create({
    pantalla: { flex: 1, backgroundColor: t.bg },
    contenido: { padding: 16, gap: 14, paddingBottom: 32 },
    hd: { fontFamily: fuentes.head, color: t.fg, letterSpacing: -0.4 },
    ui: { fontFamily: fuentes.ui, color: t.fg },
    uiB: { fontFamily: fuentes.uiBold, color: t.fg },
    mono: { fontFamily: fuentes.mono, color: t.fg, fontSize: 13 },
    muted: { color: t.muted },
    cFg: { color: t.cFg },
    enAcc: { color: t.onAcc },
    fila: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    hero: { backgroundColor: t.acc, borderRadius: 24, padding: 18, gap: 4, overflow: "hidden" },
    heroIlus: { position: "absolute", right: -14, top: -10, opacity: 0.16 },
    cta: { backgroundColor: t.mint, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
    rejilla: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    tarjeta: { width: "48%", flexGrow: 1, borderRadius: 20, padding: 14, gap: 3, borderWidth: 1, borderColor: t.borde },
    tarjetaTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
    ilus: {
      width: 38, height: 38, borderRadius: 12, backgroundColor: t.card,
      alignItems: "center", justifyContent: "center",
    },
    pestanas: {
      flexDirection: "row", justifyContent: "space-around", paddingTop: 10, paddingBottom: 6,
      borderTopWidth: 1, borderTopColor: t.line, backgroundColor: t.bg,
    },
    // ficha
    volver: { paddingVertical: 6, alignSelf: "flex-start" },
    duo: { flexDirection: "row", gap: 10 },
    duoCaja: { flex: 1, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 14 },
    metrica: { backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 18, padding: 14, gap: 2 },
    linea: { height: 64, position: "relative" },
    etiquetas: { flexDirection: "row", marginTop: 6 },
    etiqueta: { flex: 1, fontSize: 9, lineHeight: 12, textAlign: "center" },
    agregar: {
      alignSelf: "flex-start", borderWidth: 1.5, borderStyle: "dashed", borderColor: t.link,
      borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18,
    },
    quitar: {
      width: 28, height: 28, borderRadius: 999, backgroundColor: t.bg, alignItems: "center", justifyContent: "center",
    },
    opcion: {
      flexDirection: "row", gap: 12, alignItems: "flex-start", backgroundColor: t.card,
      borderWidth: 1, borderColor: t.line, borderRadius: 16, padding: 12,
    },
    logo: {
      backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", overflow: "hidden",
      borderWidth: 1, borderColor: "rgba(18,27,38,0.06)",
    },
    pildora: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
    enlace: { color: t.link },
    buscador: {
      flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: t.card, borderWidth: 1.5,
      borderColor: t.line, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
    },
    entrada: { flex: 1, fontFamily: fuentes.ui, fontSize: 16, color: t.fg, padding: 0 },
    chip: { borderWidth: 1, borderColor: t.line, backgroundColor: t.card, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 13 },
    chipOn: { backgroundColor: t.acc, borderColor: t.acc },
    boton: { backgroundColor: t.acc, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20, alignItems: "center" },
    caja: { backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 22, padding: 20, gap: 12 },
    casilla: {
      width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: t.muted,
      alignItems: "center", justifyContent: "center", marginTop: 1,
    },
  });
}
