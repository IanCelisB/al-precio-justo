import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, BackHandler, Pressable, RefreshControl, ScrollView, Text, View, useColorScheme,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque";
import { DMSans_400Regular, DMSans_700Bold } from "@expo-google-fonts/dm-sans";
import { DMMono_400Regular } from "@expo-google-fonts/dm-mono";
import Svg, { Circle, Path } from "react-native-svg";
import { pagasPorCadaDolar } from "@ancla/valoracion";
import { fechaLarga, nombreCorto, saludo } from "@ancla/valoracion/formato";
import { sectorDe } from "@ancla/valoracion/sectores";
import { api, API, type Inicio, type Resumen } from "./api";
import { Logo, Rejilla, Seccion, type Abrir } from "./componentes";
import { Buscar } from "./Buscar";
import { Detalle } from "./Detalle";
import { estilos, type Estilos } from "./estilos";
import { Perfil, Seguidas } from "./Perfil";
import { Simulador } from "./Simulador";
import { ProveedorSesion, useSesion } from "./sesion";
import { claro, oscuro, type Tema } from "./tema";

type Pestana = "Inicio" | "Buscar" | "Simulador" | "Seguidas" | "Perfil";

export default function App() {
  const [cargadas] = useFonts({ BricolageGrotesque_800ExtraBold, DMSans_400Regular, DMSans_700Bold, DMMono_400Regular });
  const tema = useColorScheme() === "dark" ? oscuro : claro;
  return (
    <SafeAreaProvider>
      <StatusBar style={tema === oscuro ? "light" : "dark"} />
      <ProveedorSesion>
        {cargadas ? <Navegacion tema={tema} /> : <View style={{ flex: 1, backgroundColor: tema.bg }} />}
      </ProveedorSesion>
    </SafeAreaProvider>
  );
}

function Navegacion({ tema }: { tema: Tema }) {
  const s = useMemo(() => estilos(tema), [tema]);
  const [pestana, setPestana] = useState<Pestana>("Inicio");
  const [empresa, setEmpresa] = useState<string | null>(null);

  // Botón "atrás" de Android: de la ficha vuelve a la pestaña.
  useEffect(() => {
    if (!empresa) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { setEmpresa(null); return true; });
    return () => sub.remove();
  }, [empresa]);

  if (empresa) return <Detalle ticker={empresa} s={s} tema={tema} volver={() => setEmpresa(null)} />;
  return (
    <View style={{ flex: 1, backgroundColor: tema.bg }}>
      <View style={{ flex: 1 }}>
        {pestana === "Inicio" && <PantallaInicio tema={tema} s={s} abrir={setEmpresa} irA={setPestana} />}
        {pestana === "Buscar" && <Buscar tema={tema} s={s} abrir={setEmpresa} />}
        {pestana === "Simulador" && <Simulador tema={tema} s={s} abrir={setEmpresa} irA={setPestana} />}
        {pestana === "Seguidas" && <Seguidas tema={tema} s={s} abrir={setEmpresa} irAPerfil={() => setPestana("Perfil")} />}
        {pestana === "Perfil" && <Perfil tema={tema} s={s} />}
      </View>
      <Pestanas s={s} tema={tema} activa={pestana} elegir={setPestana} />
    </View>
  );
}

function PantallaInicio({ tema, s, abrir, irA }: { tema: Tema; s: Estilos; abrir: Abrir; irA: (p: Pestana) => void }) {
  const { token, yo } = useSesion();
  const [inicio, setInicio] = useState<Inicio | null>(null);
  const [baratas, setBaratas] = useState<Resumen[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recargando, setRecargando] = useState(false);
  const seguidasClave = yo?.seguidas.join(",") ?? "";

  const cargar = useCallback(async () => {
    try {
      const i = await api.inicio(token);
      setInicio(i);
      setBaratas(i.baratas.slice(0, 6));
      setError(null);
    } catch {
      setError(`No pudimos conectar con ${API}. ¿Está la API encendida?`);
    }
  }, [token, seguidasClave]);

  useEffect(() => { cargar(); }, [cargar]);

  const op = inicio?.oportunidad;
  const ahora = new Date();

  return (
    <SafeAreaView style={s.pantalla} edges={["top"]}>
      <ScrollView
        contentContainerStyle={s.contenido}
        refreshControl={<RefreshControl refreshing={recargando} tintColor={tema.link}
          onRefresh={async () => { setRecargando(true); await cargar(); setRecargando(false); }} />}
      >
        <View>
          <Text style={[s.ui, s.muted, { fontSize: 13 }]}>{fechaLarga(ahora)}</Text>
          <Text style={[s.hd, { fontSize: 30 }]}>{yo ? `${saludo(ahora)}, ${yo.usuario.nombre.split(" ")[0]}` : saludo(ahora)}</Text>
        </View>

        {error && <Text style={[s.ui, { color: tema.down }]}>{error}</Text>}
        {!inicio && !error && <ActivityIndicator color={tema.link} style={{ marginTop: 40 }} />}

        {op && op.precio && op.valor && (
          <Pressable style={({ pressed }) => [s.hero, pressed && { opacity: 0.9 }]} accessibilityRole="button"
            onPress={() => abrir(op.ticker)}>
            <Text style={[s.ui, s.enAcc, { opacity: 0.85, fontSize: 12 }]}>Oportunidad del día · {sectorDe(op.sector).nombre}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Logo ticker={op.ticker} sector={op.sector} size={44} s={s} />
              <Text style={[s.hd, s.enAcc, { fontSize: 26, flex: 1 }]} numberOfLines={1}>{nombreCorto(op.nombre)}</Text>
            </View>
            <View style={s.fila}>
              <View>
                <Text style={[s.hd, { fontSize: 44, color: tema.mint }]}>−{Math.round((1 - op.precio / op.valor) * 100)}%</Text>
                <Text style={[s.ui, s.enAcc, { opacity: 0.85, fontSize: 12 }]}>bajo su valor estimado</Text>
              </View>
              <View style={s.cta}><Text style={[s.uiB, { color: tema.onMint, fontSize: 13 }]}>Ver por qué</Text></View>
            </View>
            <Text style={[s.ui, s.enAcc, { opacity: 0.9, fontSize: 13, marginTop: 4 }]}>
              Hoy pagas ${pagasPorCadaDolar(op.precio, op.valor)} por cada $1 de valor que muestran sus resultados.
            </Text>
          </Pressable>
        )}

        {inicio && (
          <>
            <Seccion s={s} titulo={inicio.seguidasPropias ? "Tus empresas" : "Populares"}
              extra={inicio.seguidasPropias ? "Ver todas" : "Sigue las tuyas"}
              onExtra={() => irA(inicio.seguidasPropias ? "Seguidas" : "Perfil")} />
            <Rejilla s={s} tema={tema} empresas={inicio.seguidas} abrir={abrir} />
            <Seccion s={s} titulo="Más baratas hoy" extra="Ideas prudentes" onExtra={() => irA("Buscar")} />
            <Rejilla s={s} tema={tema} empresas={baratas} abrir={abrir} />
            <Text style={[s.ui, s.muted, { fontSize: 11 }]}>
              Valor estimado con flujo de caja libre descontado a 5 años, según los reportes presentados a la SEC.
              No es una recomendación de inversión. {inicio.precioFuente}.
            </Text>
          </>
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
