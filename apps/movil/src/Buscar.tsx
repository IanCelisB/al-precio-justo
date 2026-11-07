import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { TIPOS, type Tipo } from "@ancla/valoracion/recomendaciones";
import { api, type Recomendaciones, type Resumen } from "./api";
import { Idea, Rejilla, Seccion, type Abrir } from "./componentes";
import type { Estilos } from "./estilos";
import type { Tema } from "./tema";

/** Búsqueda con filtros y, sin búsqueda, las ideas que cumplen el criterio prudente. */
export function Buscar({ s, tema, abrir }: { s: Estilos; tema: Tema; abrir: Abrir }) {
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<Tipo | "">("");
  const [buenPrecio, setBuenPrecio] = useState(false);
  const [res, setRes] = useState<{ total: number; resultados: Resumen[] } | null>(null);
  const [rec, setRec] = useState<Recomendaciones | null>(null);
  const activo = q.trim() !== "" || tipo !== "" || buenPrecio;

  useEffect(() => { api.recomendaciones().then(setRec).catch(() => {}); }, []);

  useEffect(() => {
    if (!activo) { setRes(null); return; }
    let vigente = true;
    const t = setTimeout(() => {
      api.buscar({ q: q.trim(), tipo, buenPrecio }).then((r) => { if (vigente) setRes(r); }).catch(() => {});
    }, 180);
    return () => { vigente = false; clearTimeout(t); };
  }, [q, tipo, buenPrecio, activo]);

  const chip = (on: boolean, texto: string, onPress: () => void) => (
    <Pressable key={texto} onPress={onPress} style={[s.chip, on && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[s.uiB, { fontSize: 13, color: on ? tema.onAcc : tema.fg }]}>{texto}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={s.pantalla} edges={["top"]}>
      <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
        <Text style={[s.hd, { fontSize: 30 }]}>Buscar</Text>
        <View style={s.buscador}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={tema.muted} strokeWidth={2} strokeLinecap="round">
            <Circle cx={11} cy={11} r={7} /><Path d="m20 20-4-4" />
          </Svg>
          <TextInput value={q} onChangeText={setQ} placeholder="Busca una empresa o ticker" placeholderTextColor={tema.muted}
            style={s.entrada} autoCorrect={false} autoCapitalize="none" returnKeyType="search" accessibilityLabel="Buscar empresa" />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {chip(tipo === "", "Todas", () => setTipo(""))}
          {(Object.keys(TIPOS) as Tipo[]).map((t) => chip(tipo === t, `${TIPOS[t].nombre}s`, () => setTipo(tipo === t ? "" : t)))}
          {chip(buenPrecio, "Solo buen precio", () => setBuenPrecio(!buenPrecio))}
        </View>

        {activo ? (
          <>
            <Seccion s={s} titulo={res ? `${res.total} ${res.total === 1 ? "empresa" : "empresas"}` : "Buscando…"}
              extra="por criterio prudente" />
            {res && <Rejilla s={s} tema={tema} empresas={res.resultados} abrir={abrir} />}
          </>
        ) : !rec ? (
          <ActivityIndicator color={tema.link} style={{ marginTop: 30 }} />
        ) : (
          <>
            <Seccion s={s} titulo="Buen precio de compra hoy" extra={`${rec.sugeridas.length} empresas`} />
            <Text style={[s.ui, s.muted, { fontSize: 13.5 }]}>
              Empresas sólidas por debajo de su precio de compra: su valor estimado menos un margen de seguridad que crece
              cuanto más incierto es el negocio (defensivas −15 %, estables −20 %, cíclicas −35 %).
            </Text>
            {rec.sugeridas.map((e) => <Idea key={e.ticker} s={s} tema={tema} e={e} abrir={abrir} />)}
            <Seccion s={s} titulo="Para vigilar" extra="casi en precio" />
            {rec.vigilar.map((e) => <Idea key={e.ticker} s={s} tema={tema} e={e} abrir={abrir} />)}
            <Text style={[s.ui, s.muted, { fontSize: 11 }]}>{rec.aviso}</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
