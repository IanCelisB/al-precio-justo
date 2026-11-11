import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { api } from "./api";
import { DEMO } from "./demo";
import type { Abrir } from "./componentes";
import { Avatar, Buzon, Muro } from "./Comunidad";
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

/** Foto de perfil: el usuario elige una imagen; se recorta cuadrada y se reduce a 256 px (JPEG). */
async function elegirFoto(): Promise<string | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  const lado = Math.min(a.width || 256, a.height || 256);
  const acciones = a.width && a.height && a.width !== a.height
    ? [{ crop: { originX: (a.width - lado) / 2, originY: (a.height - lado) / 2, width: lado, height: lado } }, { resize: { width: 256, height: 256 } }]
    : [{ resize: { width: 256, height: 256 } }];
  const x = await manipulateAsync(a.uri, acciones, { compress: 0.75, format: SaveFormat.JPEG, base64: true });
  return x.base64 ? `data:image/jpeg;base64,${x.base64}` : null;
}

type Seccion = "comunidad" | "mias" | "buzon";

/** Perfil: tu presentación (foto, nombre, descripción), la comunidad y el buzón de sugerencias. */
export function Perfil({ s, tema, abrirConfig, abrir }: { s: Estilos; tema: Tema; abrirConfig: () => void; abrir: Abrir }) {
  const { cargando, yo, entrar, salir, borrarCuenta, editarPerfil } = useSesion();
  const [prueba, setPrueba] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [bio, setBio] = useState("");
  const [seccion, setSeccion] = useState<Seccion>("comunidad");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { api.config().then((c) => setPrueba(c.prueba)).catch(() => {}); }, []);
  const empezarEdicion = () => { if (!yo) return; setNombre(yo.usuario.nombre); setBio(yo.usuario.bio ?? ""); setEditando(true); setError(null); };
  const guardar = async () => {
    setGuardando(true);
    try { await editarPerfil({ nombre: nombre.trim(), bio: bio.trim() }); setEditando(false); setError(null); }
    catch (e) { setError((e as Error).message); } finally { setGuardando(false); }
  };
  const cambiarFoto = async () => {
    try { const f = await elegirFoto(); if (f) await editarPerfil({ foto: f }); }
    catch (e) { setError((e as Error).message); }
  };
  const campo = [s.entrada, { borderWidth: 1, borderColor: tema.line, borderRadius: 12, padding: 10 }];

  return (
    <SafeAreaView style={s.pantalla} edges={["top"]}>
      <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
        <View style={[s.fila, { alignItems: "center" }]}>
          <Text style={[s.hd, { fontSize: 30 }]}>Perfil</Text>
          <Pressable onPress={abrirConfig} accessibilityRole="button" accessibilityLabel="Configuración"
            style={[s.chip, { flexDirection: "row", alignItems: "center", gap: 6 }]}>
            <Text style={[s.uiB, { fontSize: 13 }]}>⚙ Configuración</Text>
          </Pressable>
        </View>
        {cargando ? <ActivityIndicator color={tema.link} /> : !yo ? (
          <>
            <View style={s.caja}>
              <Text style={[s.hd, { fontSize: 22 }]}>Únete a la comunidad</Text>
              <Text style={[s.ui, s.muted, { fontSize: 14.5 }]}>
                Inicia sesión para armar tus listas, publicar tus ideas, comentar y compartir tus resultados del simulador.
                Solo usamos tu nombre, tu email y tu foto; los demás nunca ven tu email.
              </Text>
              {GOOGLE_CONFIGURADO && <BotonGoogle s={s} tema={tema} onError={setError} />}
              {prueba && (
                <Pressable style={s.agregar} onPress={() => api.entrarPrueba().then(entrar).catch((e) => setError(e.message))}
                  accessibilityRole="button">
                  <Text style={[s.uiB, { color: tema.link, fontSize: 14 }]}>{DEMO ? "Entrar como invitado (demo)" : "Entrar con un usuario de prueba (solo desarrollo)"}</Text>
                </Pressable>
              )}
              {error && <Text style={[s.ui, { color: tema.down }]}>{error}</Text>}
            </View>
            {!DEMO && (
              <>
                <Text style={[s.uiB, { fontSize: 16 }]}>Lo que se comenta</Text>
                <Muro s={s} tema={tema} abrir={abrir} />
              </>
            )}
          </>
        ) : (
          <>
            <View style={[s.caja, { gap: 14 }]}>
              <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                <Pressable onPress={cambiarFoto} accessibilityRole="button" accessibilityLabel="Cambiar foto de perfil">
                  <Avatar s={s} tema={tema} nombre={yo.usuario.nombre} foto={yo.usuario.foto} size={76} />
                  <View style={{ position: "absolute", right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: tema.card,
                    borderWidth: 1, borderColor: tema.line, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 13 }}>📷</Text>
                  </View>
                </Pressable>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.hd, { fontSize: 22 }]} numberOfLines={1}>{yo.usuario.nombre}</Text>
                  {!!yo.usuario.email && <Text style={[s.ui, s.muted, { fontSize: 12.5 }]} numberOfLines={1}>{yo.usuario.email} · solo tú lo ves</Text>}
                </View>
              </View>
              {editando ? (
                <View style={{ gap: 8 }}>
                  <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>Nombre</Text>
                  <TextInput value={nombre} onChangeText={setNombre} maxLength={40} style={campo} accessibilityLabel="Nombre" />
                  <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>Sobre ti ({bio.length}/280)</Text>
                  <TextInput value={bio} onChangeText={setBio} maxLength={280} multiline placeholder="Cómo inviertes, qué te interesa…"
                    placeholderTextColor={tema.muted} accessibilityLabel="Sobre ti" style={[...campo, { minHeight: 70, textAlignVertical: "top" }]} />
                  <View style={{ flexDirection: "row", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                    <Pressable onPress={guardar} disabled={guardando} style={[s.boton, { paddingVertical: 9 }]} accessibilityRole="button">
                      <Text style={[s.uiB, { color: tema.onAcc }]}>Guardar</Text>
                    </Pressable>
                    <Pressable onPress={() => setEditando(false)} accessibilityRole="button"><Text style={[s.uiB, s.enlace]}>Cancelar</Text></Pressable>
                    {yo.usuario.foto && (
                      <Pressable onPress={() => editarPerfil({ foto: null }).catch(() => {})} accessibilityRole="button">
                        <Text style={[s.uiB, s.muted]}>Quitar foto</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ) : (
                <>
                  <Text style={[s.ui, { fontSize: 14.5, lineHeight: 20 }, !yo.usuario.bio && s.muted]}>
                    {yo.usuario.bio || "Cuéntale a la comunidad cómo inviertes: agrega una descripción."}
                  </Text>
                  <Pressable onPress={empezarEdicion} style={[s.chip, { alignSelf: "flex-start" }]} accessibilityRole="button">
                    <Text style={[s.uiB, { fontSize: 13 }]}>Editar perfil</Text>
                  </Pressable>
                </>
              )}
              {error && <Text style={[s.ui, { color: tema.down, fontSize: 13 }]}>{error}</Text>}
              <View style={{ flexDirection: "row" }}>
                {([["Listas", yo.listas.length], ["Empresas", yo.seguidas.length], ["Métricas", yo.metricasExtra.length]] as [string, number][]).map(([k, v]) => (
                  <View key={k} style={{ flex: 1 }}>
                    <Text style={[s.hd, { fontSize: 20 }]}>{v}</Text>
                    <Text style={[s.ui, s.muted, { fontSize: 12 }]}>{k}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {([["comunidad", "Comunidad"], ["mias", "Mis publicaciones"], ["buzon", "Buzón"]] as [Seccion, string][]).map(([id, n]) => {
                const on = id === seccion;
                return (
                  <Pressable key={id} onPress={() => setSeccion(id)} style={[s.chip, on && s.chipOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                    <Text style={[s.uiB, { fontSize: 13.5, color: on ? tema.onAcc : tema.fg }]}>{n}</Text>
                  </Pressable>
                );
              })}
            </View>
            {seccion === "comunidad" && <Muro s={s} tema={tema} abrir={abrir} />}
            {seccion === "mias" && yo.usuario.publico && <Muro key={yo.usuario.publico} s={s} tema={tema} abrir={abrir} propias={yo.usuario.publico} />}
            {seccion === "buzon" && <Buzon s={s} tema={tema} />}

            <View style={{ borderTopWidth: 1, borderColor: tema.line, paddingTop: 14, gap: 8, marginTop: 8 }}>
              <Pressable style={s.agregar} onPress={salir} accessibilityRole="button">
                <Text style={[s.uiB, { color: tema.link, fontSize: 15 }]}>Cerrar sesión</Text>
              </Pressable>
              {!confirmar ? (
                <Pressable onPress={() => setConfirmar(true)} accessibilityRole="button" style={{ paddingVertical: 8 }}>
                  <Text style={[s.uiB, { color: tema.down, fontSize: 14 }]}>Borrar mi cuenta</Text>
                </Pressable>
              ) : (
                <View style={[s.caja, { borderColor: tema.down }]}>
                  <Text style={[s.ui, { fontSize: 14 }]}>Se borrarán tu cuenta, tus listas, tus métricas, tus publicaciones y comentarios. No se puede deshacer.</Text>
                  <View style={{ flexDirection: "row", gap: 16 }}>
                    <Pressable onPress={borrarCuenta} accessibilityRole="button"><Text style={[s.uiB, { color: tema.down }]}>Sí, borrar</Text></Pressable>
                    <Pressable onPress={() => setConfirmar(false)} accessibilityRole="button"><Text style={[s.uiB, s.enlace]}>Cancelar</Text></Pressable>
                  </View>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
