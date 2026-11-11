/**
 * Gráfico interactivo con ejes: eje vertical con valores redondos a la izquierda, eje de
 * tiempo (o de periodos) abajo y, al pasar el ratón o el dedo, una línea vertical con la
 * fecha y el valor de cada serie en ese punto. Lo usan todos los gráficos de la ficha.
 */
import { useMemo, useRef, useState } from "react";
import { Platform, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { escala, marcasTiempo, masCercano } from "@ancla/valoracion/ejes";
import type { Estilos } from "./estilos";
import type { Tema } from "./tema";

export interface SerieGrafico {
  id: string;
  nombre: string;
  color: string;
  valores: (number | null)[];
  punteada?: boolean;
  grosor?: number;
  /** Relleno suave bajo la línea. */
  area?: boolean;
  /** No aparece en la ventana del cursor (p. ej. la mediana, que ya se nombra aparte). */
  sinCursor?: boolean;
}

export interface BandaGrafico { nombre: string; color: string; min: (number | null)[]; max: (number | null)[] }

const CARACTER = 6.2;   // ancho aproximado de un carácter de las etiquetas (DM Mono 10 px)
const ABAJO = 22;       // alto de las etiquetas del eje horizontal
const ARRIBA = 8;
const DERECHA = 10;

export function Grafico({
  s, tema, xs, etiquetas, series, banda, formatoEje, formatoValor, alto = 220, tiempo = true, marcasX, techo,
  desdeCero = false, puntos = false, descripcion,
}: {
  s: Estilos; tema: Tema;
  /** Fechas (ms) si `tiempo`; si no, 0, 1, 2… (un periodo por punto). */
  xs: number[];
  /** Título de la ventana del cursor para cada punto ("12 mar 2026", "T3 26"…). */
  etiquetas: string[];
  series: SerieGrafico[];
  banda?: BandaGrafico;
  formatoEje: (v: number, paso: number) => string;
  formatoValor: (v: number) => string;
  alto?: number;
  tiempo?: boolean;
  /** Etiquetas del eje horizontal cuando no es de tiempo (índice y texto). */
  marcasX?: { i: number; texto: string }[];
  /** Valor máximo del eje (los valores más altos se recortan). */
  techo?: number;
  desdeCero?: boolean;
  puntos?: boolean;
  descripcion: string;
}) {
  const [ancho, setAncho] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const n = xs.length;
  const plotH = alto - ARRIBA - ABAJO;

  // Escala y etiquetas del eje vertical: su ancho define dónde empieza el gráfico.
  const eje = useMemo(() => {
    const todos: number[] = [];
    for (const se of series) for (const v of se.valores) if (v !== null && Number.isFinite(v)) todos.push(techo ? Math.min(v, techo) : v);
    if (banda) for (const k of [banda.min, banda.max]) for (const v of k) if (v !== null && Number.isFinite(v)) todos.push(techo ? Math.min(v, techo) : v);
    const e = escala(todos, { desdeCero });
    const textos = e.marcas.map((v) => formatoEje(v, e.paso));
    const largo = Math.max(...textos.map((x) => x.length), 2);
    return { e, textos, ancho: Math.min(92, Math.max(32, Math.ceil(largo * CARACTER) + 8)) };
  }, [series, banda, techo, desdeCero, formatoEje]);
  const EJE_Y = eje.ancho;
  const plotW = Math.max(10, ancho - EJE_Y - DERECHA);

  const g = useMemo(() => {
    const e = eje.e;
    const x0 = xs[0] ?? 0, x1 = xs[n - 1] ?? 1;
    const X = (i: number) => EJE_Y + (tiempo ? ((xs[i] - x0) / (x1 - x0 || 1)) * plotW : ((i + 0.5) / Math.max(1, n)) * plotW);
    const Y = (v: number) => ARRIBA + (1 - (Math.min(Math.max(v, e.lo), e.hi) - e.lo) / (e.hi - e.lo || 1)) * plotH;
    const f = (x: number) => x.toFixed(1);
    const trazo = (vals: (number | null)[]) => {
      let d = "", abierto = false;
      vals.forEach((v, i) => {
        if (v === null || !Number.isFinite(v)) { abierto = false; return; }
        d += `${abierto ? "L" : "M"}${f(X(i))} ${f(Y(v))} `;
        abierto = true;
      });
      return d.trim();
    };
    const areas = (vals: (number | null)[]) => {
      const out: string[] = [];
      let tramo: number[] = [];
      const base = Y(Math.max(e.lo, Math.min(0, e.hi)));
      const cerrar = () => {
        if (tramo.length > 1) {
          out.push(tramo.map((i, k) => `${k ? "L" : "M"}${f(X(i))} ${f(Y(vals[i]!))}`).join(" ")
            + ` L${f(X(tramo.at(-1)!))} ${f(base)} L${f(X(tramo[0]))} ${f(base)} Z`);
        }
        tramo = [];
      };
      vals.forEach((v, i) => { if (v === null) cerrar(); else tramo.push(i); });
      cerrar();
      return out;
    };
    const bandas: string[] = [];
    if (banda) {
      let tramo: number[] = [];
      const cerrar = () => {
        if (tramo.length > 1) {
          const arriba = tramo.map((i, k) => `${k ? "L" : "M"}${f(X(i))} ${f(Y(banda.max[i]!))}`).join(" ");
          const abajo = [...tramo].reverse().map((i) => `L${f(X(i))} ${f(Y(banda.min[i]!))}`).join(" ");
          bandas.push(`${arriba} ${abajo} Z`);
        }
        tramo = [];
      };
      banda.min.forEach((v, i) => { if (v === null || banda.max[i] === null) cerrar(); else tramo.push(i); });
      cerrar();
    }
    const todas = tiempo
      ? marcasTiempo(x0, x1, plotW < 260 ? 4 : 6).map((m) => ({ x: EJE_Y + ((m.t - x0) / (x1 - x0 || 1)) * plotW, texto: m.texto }))
      : (marcasX ?? []).map((m) => ({ x: X(m.i), texto: m.texto }));
    // Sin etiquetas encimadas: de derecha a izquierda, cada una a distancia de la anterior.
    const mx: typeof todas = [];
    for (let k = todas.length - 1; k >= 0; k--) {
      const m = todas[k], prev = mx[0];
      if (!prev || prev.x - m.x >= (Math.max(prev.texto.length, m.texto.length) * CARACTER) + 8) mx.unshift(m);
    }
    return { e, X, Y, trazos: series.map((se) => trazo(se.valores)), areas: series.map((se) => (se.area ? areas(se.valores) : [])), bandas, mx };
  }, [eje, series, banda, xs, ancho, alto, tiempo, marcasX]);

  const caja = useRef<React.ComponentRef<typeof View>>(null);
  const elegir = (px: number) => {
    if (!n) return;
    const rel = (px - EJE_Y) / plotW;
    if (rel < -0.05 || rel > 1.05) { setSel(null); return; }
    const r = Math.min(1, Math.max(0, rel));
    if (tiempo) setSel(masCercano(xs, xs[0] + r * (xs[n - 1] - xs[0])));
    else setSel(Math.min(n - 1, Math.max(0, Math.floor(r * n))));
  };
  const xDe = (e: GestureResponderEvent | any): number => {
    const ne = e.nativeEvent ?? {};
    if (Platform.OS === "web" && typeof ne.clientX === "number") {
      const nodo = caja.current as unknown as HTMLElement | null;
      const r = nodo?.getBoundingClientRect?.();
      if (r) return ne.clientX - r.left;
    }
    return ne.locationX ?? 0;
  };

  const tooltip = sel !== null && ancho > 0 ? (() => {
    const filas = series.filter((se) => !se.sinCursor && se.valores[sel] !== null && se.valores[sel] !== undefined);
    const x = g.X(sel);
    const w = Math.min(176, ancho - EJE_Y - 8);
    // A la derecha de la línea si cabe; si no, a la izquierda, sin tapar el eje vertical.
    const left = x + 10 + w <= ancho ? x + 10 : Math.max(EJE_Y + 4, x - 10 - w);
    return (
      <View pointerEvents="none" style={{ position: "absolute", top: ARRIBA, left, width: w, backgroundColor: tema.card, borderRadius: 10, borderWidth: 1, borderColor: tema.line, padding: 8, gap: 3,
        shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}>
        <Text style={[s.uiB, { fontSize: 12 }]}>{etiquetas[sel]}</Text>
        {filas.map((se) => (
          <View key={se.id} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: se.color }} />
            <Text style={[s.ui, s.muted, { fontSize: 11.5, flex: 1 }]} numberOfLines={1}>{se.nombre}</Text>
            <Text style={[s.mono, { fontSize: 12 }]}>{formatoValor(se.valores[sel]!)}</Text>
          </View>
        ))}
        {banda && banda.min[sel] !== null && banda.max[sel] !== null && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: banda.color }} />
            <Text style={[s.ui, s.muted, { fontSize: 11.5, flex: 1 }]} numberOfLines={1}>{banda.nombre}</Text>
            <Text style={[s.mono, { fontSize: 11 }]}>{formatoValor(banda.min[sel]!)}–{formatoValor(banda.max[sel]!)}</Text>
          </View>
        )}
      </View>
    );
  })() : null;

  const eventos = Platform.OS === "web"
    ? {
      onPointerMove: (e: any) => elegir(xDe(e)),
      onPointerDown: (e: any) => elegir(xDe(e)),
      onPointerLeave: () => setSel(null),
    }
    : {
      onStartShouldSetResponder: () => true,
      onMoveShouldSetResponder: () => true,
      onResponderTerminationRequest: () => true,
      onResponderGrant: (e: GestureResponderEvent) => elegir(xDe(e)),
      onResponderMove: (e: GestureResponderEvent) => elegir(xDe(e)),
    };

  return (
    <View ref={caja} style={{ height: alto, width: "100%" }} onLayout={(e: LayoutChangeEvent) => setAncho(e.nativeEvent.layout.width)}
      accessible accessibilityLabel={descripcion} {...(eventos as object)}>
      {ancho > 0 && (
        <>
          <Svg width={ancho} height={alto} style={{ position: "absolute", left: 0, top: 0 }} pointerEvents="none">
            {g.e.marcas.map((v) => (
              <Line key={`y${v}`} x1={EJE_Y} x2={EJE_Y + plotW} y1={g.Y(v)} y2={g.Y(v)} stroke={tema.line}
                strokeWidth={1} strokeDasharray={v === 0 && g.e.lo < 0 ? undefined : "3 4"} />
            ))}
            {/* Ejes: izquierdo y de abajo */}
            <Line x1={EJE_Y} x2={EJE_Y} y1={ARRIBA} y2={ARRIBA + plotH} stroke={tema.muted} strokeWidth={1} opacity={0.6} />
            <Line x1={EJE_Y} x2={EJE_Y + plotW} y1={ARRIBA + plotH} y2={ARRIBA + plotH} stroke={tema.muted} strokeWidth={1} opacity={0.6} />
            {g.mx.map((m) => (
              <Line key={`x${m.texto}`} x1={m.x} x2={m.x} y1={ARRIBA + plotH} y2={ARRIBA + plotH + 4} stroke={tema.muted} strokeWidth={1} />
            ))}
            {banda && g.bandas.map((d, i) => <Path key={`b${i}`} d={d} fill={banda.color} opacity={0.9} />)}
            {series.map((se, k) => g.areas[k].map((d, i) => <Path key={`a${k}-${i}`} d={d} fill={se.color} fillOpacity={0.08} />))}
            {series.map((se, k) => g.trazos[k] ? (
              <Path key={se.id} d={g.trazos[k]} fill="none" stroke={se.color} strokeWidth={se.grosor ?? 2}
                strokeDasharray={se.punteada ? "4 3" : undefined} strokeLinejoin="round" strokeLinecap="round" />
            ) : null)}
            {puntos && series.map((se) => se.valores.map((v, i) => v === null ? null : (
              <Circle key={`${se.id}-${i}`} cx={g.X(i)} cy={g.Y(v)} r={i === n - 1 ? 4.5 : 3} fill={i === n - 1 ? se.color : tema.card}
                stroke={se.color} strokeWidth={2} />
            )))}
            {sel !== null && (
              <>
                <Line x1={g.X(sel)} x2={g.X(sel)} y1={ARRIBA} y2={ARRIBA + plotH} stroke={tema.fg} strokeWidth={1} opacity={0.5} />
                {series.map((se) => se.valores[sel] === null || se.valores[sel] === undefined ? null : (
                  <Circle key={`s${se.id}`} cx={g.X(sel)} cy={g.Y(se.valores[sel]!)} r={4.5} fill={se.color} stroke={tema.card} strokeWidth={2} />
                ))}
              </>
            )}
          </Svg>
          {g.e.marcas.map((v, i) => (
            <Text key={`ty${v}`} numberOfLines={1} pointerEvents="none"
              style={[s.mono, s.muted, { position: "absolute", left: 0, width: EJE_Y - 6, top: g.Y(v) - 7, fontSize: 10, lineHeight: 14, textAlign: "right" }]}>
              {eje.textos[i]}
            </Text>
          ))}
          {g.mx.map((m) => (
            <Text key={`tx${m.texto}`} numberOfLines={1} pointerEvents="none"
              style={[s.mono, s.muted, { position: "absolute", top: ARRIBA + plotH + 6, left: m.x - 32, width: 64, fontSize: 10, textAlign: "center" }]}>
              {m.texto}
            </Text>
          ))}
          {tooltip}
        </>
      )}
    </View>
  );
}
