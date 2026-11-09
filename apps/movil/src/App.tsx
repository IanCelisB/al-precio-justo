import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, BackHandler, Pressable, RefreshControl, ScrollView, Text, View, useColorScheme,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque";
import { Figtree_400Regular, Figtree_600SemiBold } from "@expo-google-fonts/figtree";
import { FILTROS, type FiltroPortada } from "@ancla/valoracion/portada";
import { PALETA } from "@ancla/valoracion/apariencia";
import { Carril, Portada as PortadaCine, Poster } from "./Portada";
import { DMMono_400Regular } from "@expo-google-fonts/dm-mono";
import Svg, { Circle, Path } from "react-native-svg";
import { pagasPorCadaDolar } from "@ancla/valoracion";
import { fechaLarga, nombreCorto, saludo } from "@ancla/valoracion/formato";
import { sectorDe } from "@ancla/valoracion/sectores";
import { api, API, type Portada } from "./api";
import { Logo, Rejilla, Seccion, type Abrir } from "./componentes";
import { Buscar } from "./Buscar";
import { Detalle } from "./Detalle";
import { estilos, type Estilos } from "./estilos";
import { Perfil, Seguidas } from "./Perfil";
import { Simulador } from "./Simulador";
import { ProveedorSesion, useSesion } from "./sesion";
import type { Tema } from "./tema";
import { ProveedorConfig, useConfig } from "./config";
import { Configuracion } from "./Configuracion";
import { Campana, PantallaAvisos } from "./Avisos";

type Pestana = "Inicio" | "Buscar" | "Simulador" | "Seguidas" | "Perfil";

export default function App() {
  const [cargadas] = useFonts({ BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold, Figtree_400Regular, Figtree_600SemiBold, DMMono_400Regular });
  return (
    <SafeAreaProvider>
      <ProveedorConfig>
        <ProveedorSesion>
          <Raiz cargadas={cargadas} />
        </ProveedorSesion>
      </ProveedorConfig>
    </SafeAreaProvider>
  );
}

/** Estado de navegación fuera de Navegacion: sobrevive al repintado por cambio de divisa. */
interface EstadoNav {
  pestana: Pestana; setPestana: (p: Pestana) => void;
  empresa: string | null; setEmpresa: (t: string | null) => void;
  config: boolean; setConfig: (v: boolean) => void;
  avisos: boolean; setAvisos: (v: boolean) => void;
}

function Raiz({ cargadas }: { cargadas: boolean }) {
  const { tema, version } = useConfig();
  const [pestana, setPestana] = useState<Pestana>("Inicio");
  const [empresa, setEmpresa] = useState<string | null>(null);
  const [config, setConfig] = useState(false);
  const [avisos, setAvisos] = useState(false);
  const nav: EstadoNav = { pestana, setPestana, empresa, setEmpresa, config, setConfig, avisos, setAvisos };
  const oscuroActivo = tema.bg === PALETA.oscuro.bg;
  return (
    <>
      <StatusBar style={oscuroActivo ? "light" : "dark"} />
      {/* key: al cambiar la divisa se vuelven a pintar todos los montos */}
      {cargadas ? <Navegacion key={version} tema={tema} nav={nav} /> : <View style={{ flex: 1, backgroundColor: tema.bg }} />}
    </>
  );
}

function Navegacion({ tema, nav }: { tema: Tema; nav: EstadoNav }) {
  const s = useMemo(() => estilos(tema), [tema]);
  const { pestana, setPestana, empresa, setEmpresa, config, setConfig, avisos, setAvisos } = nav;

  // Botón "atrás" de Android: de la ficha (o avisos, o configuración) vuelve atrás.
  useEffect(() => {
    if (!empresa && !config && !avisos) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (empresa) setEmpresa(null); else { setConfig(false); setAvisos(false); }
      return true;
    });
    return () => sub.remove();
  }, [empresa, config, avisos]);

  if (empresa) return <Detalle ticker={empresa} s={s} tema={tema} volver={() => setEmpresa(null)} abrir={setEmpresa} />;
  if (config) return <Configuracion s={s} tema={tema} volver={() => setConfig(false)} />;
  if (avisos) {
    return <PantallaAvisos s={s} tema={tema} volver={() => setAvisos(false)} abrir={setEmpresa}
      irAPerfil={() => { setAvisos(false); setPestana("Perfil"); }} />;
  }
  return (
    <View style={{ flex: 1, backgroundColor: tema.bg }}>
      <View style={{ flex: 1 }}>
        {pestana === "Inicio" && <PantallaInicio tema={tema} s={s} abrir={setEmpresa} irA={setPestana} abrirAvisos={() => setAvisos(true)} />}
        {pestana === "Buscar" && <Buscar tema={tema} s={s} abrir={setEmpresa} />}
        {pestana === "Simulador" && <Simulador tema={tema} s={s} abrir={setEmpresa} irA={setPestana} />}
        {pestana === "Seguidas" && <Seguidas tema={tema} s={s} abrir={setEmpresa} irAPerfil={() => setPestana("Perfil")} />}
        {pestana === "Perfil" && <Perfil tema={tema} s={s} abrirConfig={() => setConfig(true)} />}
      </View>
      <Pestanas s={s} tema={tema} activa={pestana} elegir={setPestana} />
    </View>
  );
}

function PantallaInicio({ tema, s, abrir, irA, abrirAvisos }: {
  tema: Tema; s: Estilos; abrir: Abrir; irA: (p: Pestana) => void; abrirAvisos: () => void;
}) {
  const { token, yo } = useSesion();
  const [filtro, setFiltro] = useState<FiltroPortada>("todo");
  const [p, setP] = useState<Portada | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recargando, setRecargando] = useState(false);
  const seguidasClave = yo?.seguidas.join(",") ?? "";

  const cargar = useCallback(async () => {
    try {
      setP(await api.portada(filtro, token));
      setError(null);
    } catch {
      setError(`No pudimos conectar con ${API}. ¿Está la API encendida?`);
    }
  }, [token, seguidasClave, filtro]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <SafeAreaView style={s.pantalla} edges={["top"]}>
      <ScrollView
        contentContainerStyle={[s.contenido, { gap: 10 }]}
        stickyHeaderIndices={[1]}
        refreshControl={<RefreshControl refreshing={recargando} tintColor={tema.link}
          onRefresh={async () => { setRecargando(true); await cargar(); setRecargando(false); }} />}
      >
        <View>
          {p && p.destacadas.length > 0 && <PortadaCine s={s} tema={tema} destacadas={p.destacadas} abrir={abrir} />}
          <View style={{ position: "absolute", top: -2, left: 0, right: 0, flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontFamily: s.hd.fontFamily, fontSize: 22, color: tema.fg, letterSpacing: -0.6 }}>
              Al Precio <Text style={{ color: tema.bg === PALETA.oscuro.bg ? tema.mint : tema.accent }}>Justo</Text>
            </Text>
            <View style={{ marginLeft: "auto", marginRight: 8 }}><Campana tema={tema} onPress={abrirAvisos} /></View>
            <Pressable onPress={() => irA("Buscar")} accessibilityRole="button" accessibilityLabel="Buscar una empresa"
              style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center",
                backgroundColor: tema.card, borderWidth: 1, borderColor: tema.line }}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={tema.fg} strokeWidth={1.9} strokeLinecap="round">
                <Circle cx="11" cy="11" r="7" /><Path d="m20 20-3.5-3.5" />
              </Svg>
            </Pressable>
          </View>
        </View>

        <View style={{ backgroundColor: tema.bg, marginHorizontal: -16 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
            {FILTROS.map((f) => {
              const on = f.id === filtro;
              return (
                <Pressable key={f.id} onPress={() => setFiltro(f.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={{ height: 36, paddingHorizontal: 15, borderRadius: 999, justifyContent: "center", borderWidth: 1,
                    borderColor: on ? "transparent" : tema.line, backgroundColor: on ? tema.mint : tema.card }}>
                  <Text style={[s.uiB, { fontSize: 14, color: on ? tema.onMint : tema.muted }]}>{f.nombre}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {error && <Text style={[s.ui, { color: tema.down }]}>{error}</Text>}
        {!p && !error && <ActivityIndicator color={tema.link} style={{ marginTop: 40 }} />}

        {filtro === "ciclo" && (
          <View style={{ gap: 8 }}>
            {[["Cíclicas", "Les va mejor cuando la economía crece: energía, materiales, viajes."],
              ["Defensivas", "Aguantan en épocas malas: comida, salud, servicios básicos."],
              ["Estables", "Negocios sin grandes vaivenes en sus ventas."]].map(([t, d]) => (
              <View key={t} style={{ borderRadius: 16, padding: 14, backgroundColor: tema.bg2, borderWidth: 1, borderColor: tema.line }}>
                <Text style={[s.hd, { fontSize: 17 }]}>{t}</Text>
                <Text style={[s.ui, s.muted, { fontSize: 13.5 }]}>{d}</Text>
              </View>
            ))}
          </View>
        )}

        {p?.filas.map((fila) => (
          <Carril key={fila.id} s={s} titulo={fila.titulo} sub={fila.sub}>
            {fila.empresas.map((e, k) => (
              <Poster key={e.ticker} s={s} tema={tema} e={e} abrir={abrir} puesto={fila.ranking ? k + 1 : undefined} />
            ))}
          </Carril>
        ))}

        {p && (
          <Text style={[s.ui, s.muted, { fontSize: 11, marginTop: 12 }]}>
            Valor estimado con flujo de caja libre descontado a 5 años, según los reportes presentados a la SEC. El porcentaje de cada
            póster es el cambio del precio en 12 meses. No es una recomendación de inversión.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const ICONOS: Record<Pestana, React.ReactNode> = {
  Inicio: <Path d="M3 11l9-7 9 7v9H3z" />,
  Buscar: <><Circle cx="11" cy="11" r="7" /><Path d="m20 20-4-4" /></>,
  Simulador: <><Path d="M3 17l5-5 4 4 8-8" /><Path d="M14 8h6v6" /></>,
  Seguidas: <Path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z" />,
  Perfil: <><Circle cx="12" cy="8" r="4" /><Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
};

function Pestanas({ s, tema, activa, elegir }: { s: Estilos; tema: Tema; activa: Pestana; elegir: (p: Pestana) => void }) {
  return (
    <SafeAreaView edges={["bottom"]} style={s.pestanas}>
      {(Object.keys(ICONOS) as Pestana[]).map((k) => {
        const color = k === activa ? tema.link : tema.muted;
        return (
          <Pressable key={k} onPress={() => elegir(k)} style={{ alignItems: "center", gap: 3, paddingHorizontal: 4 }}
            accessibilityRole="tab" accessibilityState={{ selected: k === activa }} accessibilityLabel={k}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9}
              strokeLinecap="round" strokeLinejoin="round">{ICONOS[k]}</Svg>
            <Text style={[s.uiB, { fontSize: 10, color }]}>{k}</Text>
          </Pressable>
        );
      })}
    </SafeAreaView>
  );
}
