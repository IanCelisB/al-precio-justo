/** Portada "cine" del móvil: destacadas que rotan, filas de carruseles y pósters de empresa. */
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { diferencia, ETIQUETA } from "@ancla/valoracion";
import { dinero, nombreCorto, porcentajeConSigno } from "@ancla/valoracion/formato";
import { tono } from "@ancla/valoracion/portada";
import { sectorDe } from "@ancla/valoracion/sectores";
import { TIPOS } from "@ancla/valoracion/recomendaciones";
import type { Resumen } from "./api";
import { Logo, type Abrir } from "./componentes";
import type { Estilos } from "./estilos";
import { Ilustracion } from "./Ilustracion";
import { fuentes, type Tema } from "./tema";

const DURACION = 7000;

/** hsl → #rrggbb (react-native-svg y RN entienden hex en todas las plataformas). */
export function hsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return "#" + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Fondo de póster: dos luces de color sobre un degradado oscuro del tono de la empresa. */
export function FondoTono({ h, id, fundido }: { h: number; id: string; fundido?: string }) {
  return (
    <Svg width="100%" height="100%" style={{ position: "absolute" }} preserveAspectRatio="none" viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id={`b${id}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={hsl(h, 55, 22)} /><Stop offset="1" stopColor={hsl((h + 30) % 360, 60, 10)} />
        </LinearGradient>
        <RadialGradient id={`l${id}`} cx="15" cy="0" r="60" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={hsl(h, 95, 66)} stopOpacity={0.6} /><Stop offset="1" stopColor={hsl(h, 95, 66)} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`m${id}`} cx="100" cy="100" r="60" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={hsl((h + 50) % 360, 90, 55)} stopOpacity={0.4} /><Stop offset="1" stopColor={hsl((h + 50) % 360, 90, 55)} stopOpacity={0} />
        </RadialGradient>
        {fundido && (
          <LinearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.45" stopColor={fundido} stopOpacity={0} /><Stop offset="1" stopColor={fundido} stopOpacity={1} />
          </LinearGradient>
        )}
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill={`url(#b${id})`} />
      <Rect x="0" y="0" width="100" height="100" fill={`url(#l${id})`} />
      <Rect x="0" y="0" width="100" height="100" fill={`url(#m${id})`} />
      {fundido && <Rect x="0" y="0" width="100" height="100" fill={`url(#f${id})`} />}
    </Svg>
  );
}

/** Destacadas que rotan cada 7 s (se pueden elegir con las barras). */
export function Portada({ s, tema, destacadas, abrir }: {
  s: Estilos; tema: Tema; destacadas: { etiqueta: string; empresa: Resumen }[]; abrir: Abrir;
}) {
  const [i, setI] = useState(0);
  const progreso = useRef(new Animated.Value(0)).current;
  const entrada = useRef(new Animated.Value(1)).current;
  const { width } = useWindowDimensions();
  const n = destacadas.length;

  useEffect(() => {
    if (n < 2) return;
    progreso.setValue(0);
    entrada.setValue(0);
    Animated.timing(entrada, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    const anim = Animated.timing(progreso, { toValue: 1, duration: DURACION, easing: Easing.linear, useNativeDriver: false });
    anim.start(({ finished }) => { if (finished) setI((x) => (x + 1) % n); });
    return () => anim.stop();
  }, [i, n]);

  const d = destacadas[i % Math.max(1, n)];
  if (!d) return null;
  const e = d.empresa;
  const h = tono(e.ticker, e.sector);
  const sector = sectorDe(e.sector);
  const c = e.cambio1a;
  return (
    <View style={{ marginHorizontal: -16, marginTop: -16, paddingTop: 70, paddingHorizontal: 16, paddingBottom: 18, overflow: "hidden" }}>
      <FondoTono h={h} id="portada" fundido={tema.bg} />
      <View style={{ position: "absolute", right: -width * 0.12, top: 10, opacity: 0.4 }} pointerEvents="none">
        <Ilustracion formas={sector.icono} size={width * 0.72} color="#FFFFFF" />
      </View>
      <Animated.View style={{ opacity: entrada, transform: [{ translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
        <Text style={[s.uiB, { color: tema.mint, fontSize: 12, letterSpacing: 1.6 }]}>● {d.etiqueta.toUpperCase()}</Text>
        <Text style={{ fontFamily: fuentes.head, color: "#FFFFFF", fontSize: Math.min(56, width * 0.13), lineHeight: Math.min(56, width * 0.13) * 0.98,
          letterSpacing: -2, marginTop: 10, marginBottom: 6 }} numberOfLines={2}>{nombreCorto(e.nombre)}</Text>
        <Text style={[s.ui, { color: "rgba(255,255,255,0.8)", fontSize: 15 }]}>{sector.nombre} · {e.ticker}{e.indice ? ` · ${e.indice}` : ""}</Text>
        <View style={{ flexDirection: "row", gap: 22, marginTop: 16, flexWrap: "wrap" }}>
          {[
            [e.precio ? dinero(e.precio) : "—", "Precio de la acción", "#FFFFFF"],
            ...(typeof c === "number" ? [[porcentajeConSigno(c, 0), "En el último año", c >= 0 ? tema.good : tema.down]] : []),
            ...(e.estado && e.precio && e.valor
              ? [[diferencia(e.precio, e.valor), `${ETIQUETA[e.estado]} frente a su valor`, e.estado === "barata" ? tema.good : e.estado === "cara" ? tema.down : "#FFFFFF"]]
              : []),
          ].map(([v, k, col]) => (
            <View key={k}>
              <Text style={{ fontFamily: fuentes.headMedio, fontSize: 22, color: col, letterSpacing: -0.5 }}>{v}</Text>
              <Text style={[s.ui, { color: "rgba(255,255,255,0.7)", fontSize: 12 }]}>{k}</Text>
            </View>
          ))}
        </View>
      </Animated.View>
      <Pressable onPress={() => abrir(e.ticker)} accessibilityRole="button"
        style={({ pressed }) => [{ marginTop: 20, alignSelf: "flex-start", height: 48, paddingHorizontal: 22, borderRadius: 999,
          backgroundColor: "#F4F5FA", justifyContent: "center" }, pressed && { transform: [{ scale: 0.96 }] }]}>
        <Text style={[s.uiB, { color: "#0B0B12", fontSize: 15 }]}>Ver empresa  →</Text>
      </Pressable>
      <View style={{ flexDirection: "row", gap: 6, marginTop: 22 }} accessibilityRole="tablist">
        {destacadas.map((x, k) => (
          <Pressable key={x.empresa.ticker} onPress={() => setI(k)} accessibilityRole="tab" accessibilityState={{ selected: k === i }}
            accessibilityLabel={`${x.etiqueta}: ${nombreCorto(x.empresa.nombre)}`} hitSlop={10}
            style={{ width: 34, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.22)", overflow: "hidden" }}>
            {k === i
              ? <Animated.View style={{ height: 4, backgroundColor: "#FFFFFF", width: progreso.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }} />
              : k < i ? <View style={{ height: 4, backgroundColor: "#FFFFFF" }} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Póster de empresa (también con el número grande del Top 10). */
export function Poster({ s, tema, e, abrir, puesto, ancho }: {
  s: Estilos; tema: Tema; e: Resumen; abrir: Abrir; puesto?: number; ancho?: number;
}) {
  const sector = sectorDe(e.sector);
  const h = tono(e.ticker, e.sector);
  const c = e.cambio1a;
  const w = ancho ?? (puesto ? 150 : 250);
  // Con ratón: la tarjeta crece un poco y muestra lo básico de la empresa.
  const encima = useRef(new Animated.Value(0)).current;
  const [hover, setHover] = useState(false);
  const animar = (v: number) => {
    setHover(v === 1);
    Animated.timing(encima, { toValue: v, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" }).start();
  };
  const a = e.analisis;
  const tarjeta = (
    <Pressable onPress={() => abrir(e.ticker)} accessibilityRole="button" onHoverIn={() => animar(1)} onHoverOut={() => animar(0)}
      accessibilityLabel={`${nombreCorto(e.nombre)}, ${sector.nombre}${e.estado ? `, ${ETIQUETA[e.estado]}` : ""}`}
      style={({ pressed }) => [{ width: w, zIndex: hover ? 2 : 0 }, pressed && { transform: [{ scale: 0.97 }] }]}>
      <Animated.View style={{
        width: w, aspectRatio: puesto ? 3 / 4 : 16 / 10, borderRadius: 18, overflow: "hidden", borderWidth: 1,
        borderColor: hover ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)",
        transform: [{ scale: encima.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) },
          { translateY: encima.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
        ...(Platform.OS === "web" ? { boxShadow: hover ? "0 14px 30px rgba(0,0,0,0.35)" : "none", transitionProperty: "box-shadow", transitionDuration: "180ms" } as any : {}),
      }}>
        <FondoTono h={h} id={`p${e.ticker}${puesto ?? ""}`} />
        <View style={{ position: "absolute", right: -w * 0.14, bottom: -w * 0.16, opacity: 0.22 }}>
          <Ilustracion formas={sector.icono} size={w * (puesto ? 1.05 : 0.72)} color="#FFFFFF" />
        </View>
        <View style={{ position: "absolute", left: 12, top: 12 }}><Logo ticker={e.ticker} sector={e.sector} size={32} s={s} /></View>
        {typeof c === "number" && (
          <View style={{ position: "absolute", right: 10, top: 12, backgroundColor: "rgba(7,8,12,0.6)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={[s.mono, { fontSize: 11.5, color: c >= 0 ? "#46D99A" : "#FF8A8A" }]}>{porcentajeConSigno(c, Math.abs(c) >= 0.1 ? 0 : 1)}</Text>
          </View>
        )}
        <View style={{ position: "absolute", left: 14, right: 14, bottom: 12 }}>
          <Text style={{ fontFamily: fuentes.headMedio, fontSize: puesto ? 16 : 19, color: "#FFFFFF", letterSpacing: -0.4 }} numberOfLines={1}>
            {nombreCorto(e.nombre)}
          </Text>
          <Text style={[s.ui, { fontSize: 12, color: "rgba(255,255,255,0.78)" }]} numberOfLines={1}>{sector.nombre}</Text>
        </View>
        {/* Información básica al pasar el ratón */}
        <Animated.View pointerEvents="none" style={{
          position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(7,8,12,0.84)",
          paddingHorizontal: 14, paddingVertical: 12, justifyContent: "flex-end", gap: 3, opacity: encima,
        }}>
          <Text style={{ fontFamily: fuentes.headMedio, fontSize: puesto ? 15 : 17, color: "#FFFFFF", letterSpacing: -0.3 }} numberOfLines={1}>
            {nombreCorto(e.nombre)} <Text style={[s.mono, { fontSize: 11, color: "rgba(255,255,255,0.6)" }]}>{e.ticker}</Text>
          </Text>
          {[
            ["Valor estimado", e.valor ? dinero(e.valor) : "—"],
            ...(puesto ? [] : [["Precio de compra", a.precioCompra ? dinero(a.precioCompra) : "—"]]),
            ["Calidad", `${a.calidad}/100 · ${TIPOS[a.tipo].nombre}`],
          ].map(([k, v]) => (
            <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={[s.ui, { fontSize: 11.5, color: "rgba(255,255,255,0.65)" }]}>{k}</Text>
              <Text style={[s.uiB, { fontSize: 11.5, color: "#FFFFFF" }]} numberOfLines={1}>{v}</Text>
            </View>
          ))}
          {!puesto && !!a.motivo && (
            <Text style={[s.ui, { fontSize: 11.5, color: "rgba(255,255,255,0.8)", marginTop: 2 }]} numberOfLines={2}>{a.motivo}</Text>
          )}
          <Text style={[s.uiB, { fontSize: 12, color: tema.mint, marginTop: 3 }]}>Ver ficha →</Text>
        </Animated.View>
      </Animated.View>
      <View style={{ flexDirection: puesto ? "column" : "row", justifyContent: "space-between", paddingTop: 7, paddingHorizontal: 3 }}>
        <Text style={[s.mono, { fontSize: 12.5 }]}>{e.precio ? dinero(e.precio) : "—"}</Text>
        <Text style={[s.uiB, { fontSize: 12.5, color: e.estado === "barata" ? tema.good : e.estado === "cara" ? tema.down : tema.muted }]} numberOfLines={1}>
          {e.estado && e.precio && e.valor ? `${ETIQUETA[e.estado]} · ${diferencia(e.precio, e.valor)}` : "Sin valor estimado"}
        </Text>
      </View>
    </Pressable>
  );
  if (!puesto) return tarjeta;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
      <Text style={{ fontFamily: fuentes.head, fontSize: 118, lineHeight: 110, color: tema.line, letterSpacing: -8, marginRight: -16 }}
        accessibilityElementsHidden importantForAccessibility="no">{puesto}</Text>
      {tarjeta}
    </View>
  );
}

/** Web: barra de desplazamiento fina y discreta para los carriles (una sola vez). */
function estiloBarra() {
  if (typeof document === "undefined" || document.getElementById("estilo-carril")) return;
  const st = document.createElement("style");
  st.id = "estilo-carril";
  st.textContent = `[data-carril]{scrollbar-width:thin;scrollbar-color:rgba(128,128,140,.45) transparent;cursor:grab}
[data-carril]::-webkit-scrollbar{height:8px}
[data-carril]::-webkit-scrollbar-thumb{background:rgba(128,128,140,.45);border-radius:8px}
[data-carril]::-webkit-scrollbar-thumb:hover{background:rgba(128,128,140,.7)}
[data-carril]::-webkit-scrollbar-track{background:transparent}`;
  document.head.appendChild(st);
}

/** Fila de carrusel deslizable. */
export function Carril({ s, titulo, sub, children }: { s: Estilos; titulo: string; sub: string; children: React.ReactNode }) {
  const carril = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [x, setX] = useState(0);
  const [visible, setVisible] = useState(0);
  const [total, setTotal] = useState(0);
  const max = Math.max(0, total - visible);
  // Con ratón (web) no hay cómo deslizar: flechas para avanzar casi una pantalla. En el teléfono se desliza con el dedo.
  const flechas = Platform.OS === "web" && max > 4;
  const mover = (dir: number) => carril.current?.scrollTo({ x: Math.min(max, Math.max(0, x + dir * visible * 0.85)), animated: true });

  // Web: arrastrar con el ratón (sin abrir la ficha al soltar después de arrastrar).
  useEffect(() => {
    if (Platform.OS !== "web") return;
    estiloBarra();
    const nodo: HTMLElement | null = (carril.current as any)?.getScrollableNode?.() ?? null;
    if (!nodo) return;
    let inicio: { x: number; scroll: number } | null = null;
    let arrastro = false;
    const bajar = (ev: PointerEvent) => {
      if (ev.pointerType !== "mouse" || ev.button !== 0) return;
      inicio = { x: ev.clientX, scroll: nodo.scrollLeft }; arrastro = false;
    };
    const mover = (ev: PointerEvent) => {
      if (!inicio) return;
      const dx = ev.clientX - inicio.x;
      if (!arrastro && Math.abs(dx) > 6) { arrastro = true; nodo.style.cursor = "grabbing"; nodo.style.scrollSnapType = "none"; }
      if (arrastro) { nodo.scrollLeft = inicio.scroll - dx; ev.preventDefault(); }
    };
    const soltar = () => {
      if (!inicio) return;
      inicio = null; nodo.style.cursor = "";
      if (arrastro) {
        const evitar = (c: Event) => { c.stopPropagation(); c.preventDefault(); };
        nodo.addEventListener("click", evitar, { capture: true, once: true });
        setTimeout(() => nodo.removeEventListener("click", evitar, { capture: true }), 50);
      }
    };
    const sinArrastreNativo = (ev: Event) => ev.preventDefault();   // imágenes y enlaces no se "arrastran" solos
    nodo.addEventListener("pointerdown", bajar);
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    nodo.addEventListener("dragstart", sinArrastreNativo);
    return () => {
      nodo.removeEventListener("pointerdown", bajar);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      nodo.removeEventListener("dragstart", sinArrastreNativo);
    };
  }, []);
  const flecha = (dir: number, activa: boolean) => (
    <Pressable onPress={() => mover(dir)} disabled={!activa} accessibilityRole="button"
      accessibilityLabel={dir < 0 ? `Anteriores de ${titulo}` : `Siguientes de ${titulo}`}
      style={({ pressed, hovered }: any) => [s.chip, { width: 36, height: 36, paddingVertical: 0, paddingHorizontal: 0, alignItems: "center",
        justifyContent: "center", opacity: activa ? 1 : 0.35 }, hovered && activa && { borderColor: s.enlace.color }, pressed && { transform: [{ scale: 0.94 }] }]}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={s.ui.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d={dir < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
      </Svg>
    </Pressable>
  );
  return (
    <View style={{ marginTop: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontFamily: fuentes.headMedio, fontSize: 20, color: s.ui.color, letterSpacing: -0.4 }}>{titulo}</Text>
        <Text style={[s.ui, s.muted, { fontSize: 12.5, flex: 1 }]} numberOfLines={1}>{sub}</Text>
        {flechas && <View style={{ flexDirection: "row", gap: 6 }}>{flecha(-1, x > 4)}{flecha(1, x < max - 4)}</View>}
      </View>
      <ScrollView ref={carril} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={{ marginHorizontal: -16 }}
        {...({ dataSet: { carril: "1" } } as any)}
        scrollEventThrottle={32} onScroll={(e) => setX(e.nativeEvent.contentOffset.x)}
        onLayout={(e) => setVisible(e.nativeEvent.layout.width)} onContentSizeChange={(w) => setTotal(w)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 12, alignItems: "flex-end" }}>
        {children}
      </ScrollView>
    </View>
  );
}
