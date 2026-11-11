import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { TAMANOS, type Tamano } from "@ancla/valoracion/portada";
import { api, type Recomendaciones, type Resumen } from "./api";
import { Idea, Rejilla, Seccion, type Abrir } from "./componentes";
import type { Estilos } from "./estilos";
import type { Tema } from "./tema";

const POR_PAGINA = 24;

/** Búsqueda en todas las empresas, por tamaño y "solo buen precio"; sin filtros, las ideas del criterio prudente. */
export function Buscar({ s, tema, abrir }: { s: Estilos; tema: Tema; abrir: Abrir }) {
  const [q, setQ] = useState("");
  const [tamano, setTamano] = useState<Tamano | "">("");
  const [buenPrecio, setBuenPrecio] = useState(false);
  const [todas, setTodas] = useState(false);
  const [res, setRes] = useState<{ total: number; resultados: Resumen[] } | null>(null);
  const [universo, setUniverso] = useState<number | null>(null);
  const [rec, setRec] = useState<Recomendaciones | null>(null);
  const [cargando, setCargando] = useState(false);
  const activo = q.trim() !== "" || tamano !== "" || buenPrecio || todas;

  useEffect(() => {
    api.recomendaciones().then(setRec).catch(() => {});
    api.buscar({ limite: 1 }).then((r) => setUniverso(r.universo ?? r.total)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activo) { setRes(null); return; }
    let vigente = true;
    const t = setTimeout(() => {
      api.buscar({ q: q.trim(), tamano, buenPrecio, limite: POR_PAGINA }).then((r) => { if (vigente) setRes(r); }).catch(() => {});
    }, 180);
    return () => { vigente = false; clearTimeout(t); };
  }, [q, tamano, buenPrecio, activo]);

  const mas = async () => {
    if (!res) return;
    setCargando(true);
    try {
      const r = await api.buscar({ q: q.trim(), tamano, buenPrecio, limite: POR_PAGINA, desde: res.resultados.length });
      setRes({ total: r.total, resultados: [...res.resultados, ...r.resultados] });
    } finally { setCargando(false); }
  };

  const chip = (on: boolean, texto: string, onPress: () => void) => (
    <Pressable key={texto} onPress={onPress} style={[s.chip, on && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[s.uiB, { fontSize: 13, color: on ? tema.onAcc : tema.fg }]}>{texto}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={s.pantalla} edges={["top"]}>
      <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
        <View style={[s.fila, { alignItems: "baseline" }]}>
          <Text style={[s.hd, { fontSize: 30 }]}>Buscar</Text>
          {universo !== null && <Text style={[s.ui, s.muted, { fontSize: 13 }]}>{universo.toLocaleString("es")} empresas</Text>}
        </View>
        <View style={s.buscador}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={tema.muted} strokeWidth={2} strokeLinecap="round">
            <Circle cx={11} cy={11} r={7} /><Path d="m20 20-4-4" />
          </Svg>
          <TextInput value={q} onChangeText={setQ} placeholder="Busca una empresa o ticker" placeholderTextColor={tema.muted}
            style={s.entrada} autoCorrect={false} autoCapitalize="none" returnKeyType="search" accessibilityLabel="Buscar empresa" />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {chip(todas && tamano === "" && !buenPrecio && !q, "Todas", () => { setTodas(true); setTamano(""); setBuenPrecio(false); setQ(""); })}
          {TAMANOS.map((x) => chip(tamano === x.id, x.nombre, () => setTamano(tamano === x.id ? "" : x.id)))}
          {chip(buenPrecio, "Solo buen precio", () => setBuenPrecio(!buenPrecio))}
        </View>
        {tamano !== "" && (
          <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>{TAMANOS.find((x) => x.id === tamano)!.nombre}: {TAMANOS.find((x) => x.id === tamano)!.detalle}.</Text>
        )}

        {activo ? (
          <>
            <Seccion s={s} titulo={res ? `${res.total.toLocaleString("es")} ${res.total === 1 ? "empresa" : "empresas"}` : "Buscando…"}
              extra={universo && res ? `de ${universo.toLocaleString("es")}` : undefined} />
            {res && <Rejilla s={s} tema={tema} empresas={res.resultados} abrir={abrir} />}
            {res && res.resultados.length < res.total && (
              <Pressable onPress={mas} disabled={cargando} style={[s.agregar, { alignSelf: "center" }]} accessibilityRole="button">
                {cargando ? <ActivityIndicator color={tema.link} /> : (
                  <Text style={[s.uiB, { color: tema.link, fontSize: 14 }]}>Ver más ({(res.total - res.resultados.length).toLocaleString("es")} restantes)</Text>
                )}
              </Pressable>
            )}
          </>
        ) : !rec ? (
          <ActivityIndicator color={tema.link} style={{ marginTop: 30 }} />
        ) : (
          <>
            <Seccion s={s} titulo="Buen precio de compra hoy" extra={`${rec.sugeridas.length} empresas`} />
            <Text style={[s.ui, s.muted, { fontSize: 13.5 }]}>
              Empresas sólidas por debajo de su precio de compra: su valor estimado menos un margen de seguridad (del 15 % al 35 %)
              que es mayor cuanto más han variado sus ventas y su caja en el pasado.
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
