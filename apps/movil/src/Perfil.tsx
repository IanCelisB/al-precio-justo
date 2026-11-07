import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { porId } from "@ancla/valoracion/metricas";
import { api, type Resumen } from "./api";
import { DEMO } from "./demo";
import { Rejilla, type Abrir } from "./componentes";
import type { Estilos } from "./estilos";
import { useSesion } from "./sesion";
import type { Tema } from "./tema";

WebBrowser.maybeCompleteAuthSession();

/** IDs de cliente OAuth de Google para cada plataforma (Google Cloud Console). */
const IDS = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
};
const GOOGLE_CONFIGURADO = Object.values(IDS).some(Boolean);

/** Botón de Google: abre la pantalla oficial de Google y recibe un ID token firmado. */
function BotonGoogle({ s, tema, onError }: { s: Estilos; tema: Tema; onError: (m: string) => void }) {
  const { entrar } = useSesion();
  const [request, respuesta, abrirGoogle] = Google.useIdTokenAuthRequest(IDS);
  useEffect(() => {
    if (respuesta?.type !== "success") return;
    const idToken = respuesta.params.id_token;
    api.entrarGoogle(idToken).then(entrar).catch((e) => onError(e.message));
  }, [respuesta]);
  return (
    <Pressable style={[s.boton, { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: tema.line }]} disabled={!request}
      onPress={() => abrirGoogle()} accessibilityRole="button">
      <Text style={[s.uiB, { color: "#1F1F1F", fontSize: 15 }]}>Continuar con Google</Text>
    </Pressable>
  );
}

export function Perfil({ s, tema }: { s: Estilos; tema: Tema }) {
  const { cargando, yo, entrar, salir, borrarCuenta } = useSesion();
  const [prueba, setPrueba] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => { api.config().then((c) => setPrueba(c.prueba)).catch(() => {}); }, []);

  return (
    <SafeAreaView style={s.pantalla} edges={["top"]}>
      <ScrollView contentContainerStyle={s.contenido}>
        <Text style={[s.hd, { fontSize: 30 }]}>Perfil</Text>
        {cargando ? <ActivityIndicator color={tema.link} /> : !yo ? (
          <View style={s.caja}>
            <Text style={[s.hd, { fontSize: 22 }]}>Guarda tus empresas</Text>
            <Text style={[s.ui, s.muted, { fontSize: 14.5 }]}>
              Inicia sesión con tu cuenta de Google para seguir empresas y guardar tus métricas en todos tus dispositivos.
              Solo usamos tu nombre, tu email y tu foto.
            </Text>
            {GOOGLE_CONFIGURADO ? <BotonGoogle s={s} tema={tema} onError={setError} /> : (
              <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>
                El inicio de sesión con Google está listo, pero falta configurar los IDs de cliente
                (EXPO_PUBLIC_GOOGLE_*_CLIENT_ID).
              </Text>
            )}
            {prueba && (
              <Pressable style={s.agregar} onPress={() => api.entrarPrueba().then(entrar).catch((e) => setError(e.message))}
                accessibilityRole="button">
                <Text style={[s.uiB, { color: tema.link, fontSize: 14 }]}>{DEMO ? "Entrar como invitado (demo)" : "Entrar con un usuario de prueba (solo desarrollo)"}</Text>
              </Pressable>
            )}
            {error && <Text style={[s.ui, { color: tema.down }]}>{error}</Text>}
          </View>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
              {yo.usuario.foto
                ? <Image source={{ uri: yo.usuario.foto }} style={{ width: 64, height: 64, borderRadius: 32 }} />
                : (
                  <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: tema.acc, alignItems: "center", justifyContent: "center" }}>
                    <Text style={[s.hd, { color: tema.mint, fontSize: 26 }]}>{yo.usuario.nombre.charAt(0)}</Text>
                  </View>
                )}
              <View style={{ flex: 1 }}>
                <Text style={[s.hd, { fontSize: 22 }]}>{yo.usuario.nombre}</Text>
                <Text style={[s.ui, s.muted, { fontSize: 13 }]}>{yo.usuario.email}</Text>
              </View>
            </View>
            <View style={s.metrica}>
              <Text style={[s.ui, s.muted, { fontSize: 13 }]}>Empresas seguidas</Text>
              <Text style={[s.hd, { fontSize: 24 }]}>{yo.seguidas.length}</Text>
            </View>
            <View style={s.metrica}>
              <Text style={[s.ui, s.muted, { fontSize: 13 }]}>Tus métricas</Text>
              <Text style={[s.hd, { fontSize: 24 }]}>{yo.metricasExtra.length}</Text>
              {yo.metricasExtra.length > 0 && (
                <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>{yo.metricasExtra.map((id) => porId(id)?.nombre).filter(Boolean).join(" · ")}</Text>
              )}
            </View>
            <Pressable style={s.agregar} onPress={salir} accessibilityRole="button">
              <Text style={[s.uiB, { color: tema.link, fontSize: 15 }]}>Cerrar sesión</Text>
            </Pressable>
            {!confirmar ? (
              <Pressable onPress={() => setConfirmar(true)} accessibilityRole="button" style={{ paddingVertical: 8 }}>
                <Text style={[s.uiB, { color: tema.down, fontSize: 14 }]}>Borrar mi cuenta</Text>
              </Pressable>
            ) : (
              <View style={[s.caja, { borderColor: tema.down }]}>
                <Text style={[s.ui, { fontSize: 14 }]}>Se borrarán tu cuenta, tus empresas seguidas y tus métricas. No se puede deshacer.</Text>
                <View style={{ flexDirection: "row", gap: 16 }}>
                  <Pressable onPress={borrarCuenta} accessibilityRole="button"><Text style={[s.uiB, { color: tema.down }]}>Sí, borrar</Text></Pressable>
                  <Pressable onPress={() => setConfirmar(false)} accessibilityRole="button"><Text style={[s.uiB, s.enlace]}>Cancelar</Text></Pressable>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Empresas que sigue el usuario. */
export function Seguidas({ s, tema, abrir, irAPerfil }: { s: Estilos; tema: Tema; abrir: Abrir; irAPerfil: () => void }) {
  const { yo } = useSesion();
  const [todas, setTodas] = useState<Resumen[] | null>(null);
  const clave = yo?.seguidas.join(",") ?? "";
  useEffect(() => { if (yo) api.algunas(yo.seguidas).then(setTodas).catch(() => {}); }, [clave]);
  const lista = todas ?? [];
  return (
    <SafeAreaView style={s.pantalla} edges={["top"]}>
      <ScrollView contentContainerStyle={s.contenido}>
        <Text style={[s.hd, { fontSize: 30 }]}>Seguidas</Text>
        {!yo ? (
          <View style={s.caja}>
            <Text style={[s.ui, s.muted, { fontSize: 14.5 }]}>Inicia sesión para seguir empresas y verlas aquí, en la web y en el móvil.</Text>
            <Pressable style={s.boton} onPress={irAPerfil} accessibilityRole="button">
              <Text style={[s.uiB, { color: tema.onAcc }]}>Iniciar sesión</Text>
            </Pressable>
          </View>
        ) : !todas ? <ActivityIndicator color={tema.link} /> : lista.length === 0 ? (
          <View style={s.caja}>
            <Text style={[s.ui, s.muted, { fontSize: 14.5 }]}>Todavía no sigues ninguna empresa. Abre una y pulsa «♡ Seguir».</Text>
          </View>
        ) : <Rejilla s={s} tema={tema} empresas={lista} abrir={abrir} />}
      </ScrollView>
    </SafeAreaView>
  );
}
