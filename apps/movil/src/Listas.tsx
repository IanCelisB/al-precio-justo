/**
 * Listas del usuario ("Quiero comprar", "Tengo", "Quiero vender"…): la pestaña Listas y la
 * ventana para guardar una empresa en una o varias listas desde su ficha.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { api, type Lista, type Resumen } from "./api";
import { Rejilla, type Abrir } from "./componentes";
import type { Estilos } from "./estilos";
import { useSesion } from "./sesion";
import type { Tema } from "./tema";

export const SUGERIDAS = ["Quiero comprar", "Tengo", "Quiero vender", "Me gusta mirar"];

function Casilla({ s, tema, on }: { s: Estilos; tema: Tema; on: boolean }) {
  return (
    <View style={[s.casilla, on && { backgroundColor: tema.acc, borderColor: tema.acc }]}>
      {on && (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={tema.onAcc} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M5 12.5l4.5 4.5L19 7.5" />
        </Svg>
      )}
    </View>
  );
}

/** Campo para crear una lista, con nombres sugeridos que aún no existen. */
function NuevaLista({ s, tema, listas, crear }: { s: Estilos; tema: Tema; listas: Lista[]; crear: (n: string) => Promise<unknown> }) {
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const enviar = async (n: string) => {
    if (!n.trim()) return;
    try { await crear(n.trim()); setNombre(""); setError(null); } catch (e) { setError((e as Error).message); }
  };
  const libres = SUGERIDAS.filter((x) => !listas.some((l) => l.nombre.toLowerCase() === x.toLowerCase()));
  return (
    <View style={{ gap: 8 }}>
      <View style={[s.buscador, { paddingVertical: 6 }]}>
        <TextInput value={nombre} onChangeText={setNombre} placeholder="Nueva lista…" placeholderTextColor={tema.muted}
          style={s.entrada} maxLength={40} onSubmitEditing={() => enviar(nombre)} returnKeyType="done" accessibilityLabel="Nombre de la nueva lista" />
        <Pressable onPress={() => enviar(nombre)} disabled={!nombre.trim()} accessibilityRole="button"
          style={[s.chip, s.chipOn, !nombre.trim() && { opacity: 0.4 }]}>
          <Text style={[s.uiB, { color: tema.onAcc, fontSize: 13 }]}>Crear</Text>
        </Pressable>
      </View>
      {libres.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {libres.map((x) => (
            <Pressable key={x} onPress={() => enviar(x)} style={[s.chip, { paddingVertical: 5 }]} accessibilityRole="button">
              <Text style={[s.uiB, { fontSize: 12.5, color: tema.link }]}>+ {x}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {error && <Text style={[s.ui, { color: tema.down, fontSize: 13 }]}>{error}</Text>}
    </View>
  );
}

/** Ventana de la ficha: en qué listas está esta empresa (se pueden marcar varias). */
export function ModalListas({ s, tema, visible, cerrar, ticker, nombre }: {
  s: Estilos; tema: Tema; visible: boolean; cerrar: () => void; ticker: string; nombre: string;
}) {
  const sesion = useSesion();
  const listas = sesion.yo?.listas ?? [];
  const [ocupado, setOcupado] = useState<string | null>(null);
  const alternar = async (l: Lista) => {
    setOcupado(l.id);
    try { await sesion.enLista(l.id, ticker, !l.tickers.includes(ticker)); } finally { setOcupado(null); }
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={cerrar}>
      <SafeAreaView style={s.pantalla} edges={["top", "bottom"]}>
        <View style={[s.fila, { padding: 16, alignItems: "center" }]}>
          <Text style={[s.hd, { fontSize: 21, flex: 1 }]} numberOfLines={1}>Guardar {nombre}</Text>
          <Pressable onPress={cerrar} accessibilityRole="button"><Text style={[s.uiB, { color: tema.link, fontSize: 16 }]}>Listo</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 10 }} keyboardShouldPersistTaps="handled">
          {listas.length === 0 && (
            <Text style={[s.ui, s.muted, { fontSize: 14 }]}>Crea tu primera lista: por ejemplo, las que quieres comprar o las que ya tienes.</Text>
          )}
          {listas.map((l) => {
            const on = l.tickers.includes(ticker);
            return (
              <Pressable key={l.id} onPress={() => alternar(l)} disabled={ocupado !== null} accessibilityRole="checkbox"
                accessibilityState={{ checked: on }} style={[s.opcion, { alignItems: "center" }, on && { borderColor: tema.mint, borderWidth: 2 }]}>
                <Casilla s={s} tema={tema} on={on} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.uiB, { fontSize: 15 }]}>{l.nombre}</Text>
                  <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>{l.tickers.length} {l.tickers.length === 1 ? "empresa" : "empresas"}</Text>
                </View>
                {ocupado === l.id && <ActivityIndicator color={tema.link} />}
              </Pressable>
            );
          })}
          <NuevaLista s={s} tema={tema} listas={listas} crear={(n) => sesion.crearLista(n, ticker)} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/** Pestaña Listas: cada lista con sus empresas; se pueden crear, renombrar y borrar. */
export function PantallaListas({ s, tema, abrir, irAPerfil }: { s: Estilos; tema: Tema; abrir: Abrir; irAPerfil: () => void }) {
  const sesion = useSesion();
  const { yo } = sesion;
  const listas = yo?.listas ?? [];
  const [activa, setActiva] = useState<string | null>(null);
  const lista = listas.find((l) => l.id === activa) ?? listas[0] ?? null;
  const [empresas, setEmpresas] = useState<Resumen[] | null>(null);
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [borrar, setBorrar] = useState(false);
  const clave = lista ? `${lista.id}:${lista.tickers.join(",")}` : "";
  useEffect(() => {
    setEmpresas(null);
    if (lista) api.algunas(lista.tickers).then(setEmpresas).catch(() => setEmpresas([]));
  }, [clave]);
  useEffect(() => { setEditando(false); setBorrar(false); }, [lista?.id]);

  return (
    <SafeAreaView style={s.pantalla} edges={["top"]}>
      <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
        <Text style={[s.hd, { fontSize: 30 }]}>Mis listas</Text>
        {!yo ? (
          <View style={s.caja}>
            <Text style={[s.ui, s.muted, { fontSize: 14.5 }]}>
              Inicia sesión para armar tus listas: las que quieres comprar, las que tienes, las que quieres vender o las que solo te gusta mirar.
            </Text>
            <Pressable style={s.boton} onPress={irAPerfil} accessibilityRole="button">
              <Text style={[s.uiB, { color: tema.onAcc }]}>Iniciar sesión</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {listas.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -16 }}>
                <View style={{ width: 8 }} />
                {listas.map((l) => {
                  const on = l.id === lista?.id;
                  return (
                    <Pressable key={l.id} onPress={() => setActiva(l.id)} style={[s.chip, on && s.chipOn]} accessibilityRole="tab"
                      accessibilityState={{ selected: on }}>
                      <Text style={[s.uiB, { fontSize: 13.5, color: on ? tema.onAcc : tema.fg }]}>{l.nombre} · {l.tickers.length}</Text>
                    </Pressable>
                  );
                })}
                <View style={{ width: 8 }} />
              </ScrollView>
            )}

            {lista && (
              <View style={[s.metrica, { gap: 10 }]}>
                {editando ? (
                  <View style={[s.buscador, { paddingVertical: 6 }]}>
                    <TextInput value={nombre} onChangeText={setNombre} style={s.entrada} maxLength={40} autoFocus
                      accessibilityLabel="Nuevo nombre de la lista"
                      onSubmitEditing={() => sesion.renombrarLista(lista.id, nombre).then(() => setEditando(false)).catch(() => {})} />
                    <Pressable onPress={() => sesion.renombrarLista(lista.id, nombre).then(() => setEditando(false)).catch(() => {})}
                      style={[s.chip, s.chipOn]} accessibilityRole="button">
                      <Text style={[s.uiB, { color: tema.onAcc, fontSize: 13 }]}>Guardar</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={[s.fila, { alignItems: "center" }]}>
                    <Text style={[s.hd, { fontSize: 20, flex: 1 }]}>{lista.nombre}</Text>
                    <Pressable onPress={() => { setNombre(lista.nombre); setEditando(true); }} accessibilityRole="button" style={{ padding: 6 }}>
                      <Text style={[s.uiB, s.enlace, { fontSize: 13.5 }]}>Renombrar</Text>
                    </Pressable>
                    <Pressable onPress={() => setBorrar(true)} accessibilityRole="button" style={{ padding: 6 }}>
                      <Text style={[s.uiB, { color: tema.down, fontSize: 13.5 }]}>Borrar</Text>
                    </Pressable>
                  </View>
                )}
                {borrar && (
                  <View style={[s.caja, { borderColor: tema.down, padding: 14 }]}>
                    <Text style={[s.ui, { fontSize: 14 }]}>¿Borrar «{lista.nombre}»? Las empresas siguen en tus otras listas.</Text>
                    <View style={{ flexDirection: "row", gap: 16 }}>
                      <Pressable onPress={() => sesion.borrarLista(lista.id).then(() => setActiva(null)).catch(() => {})} accessibilityRole="button">
                        <Text style={[s.uiB, { color: tema.down }]}>Sí, borrar</Text>
                      </Pressable>
                      <Pressable onPress={() => setBorrar(false)} accessibilityRole="button"><Text style={[s.uiB, s.enlace]}>Cancelar</Text></Pressable>
                    </View>
                  </View>
                )}
                {!empresas ? <ActivityIndicator color={tema.link} /> : empresas.length === 0 ? (
                  <Text style={[s.ui, s.muted, { fontSize: 14 }]}>Esta lista está vacía. Abre una empresa y pulsa «Guardar en lista».</Text>
                ) : (
                  <>
                    <Rejilla s={s} tema={tema} empresas={empresas} abrir={abrir} />
                    <View style={{ gap: 6 }}>
                      {empresas.map((e) => (
                        <View key={e.ticker} style={[s.fila, { alignItems: "center" }]}>
                          <Text style={[s.ui, { fontSize: 13.5 }]}>{e.nombre} <Text style={s.muted}>{e.ticker}</Text></Text>
                          <Pressable onPress={() => sesion.enLista(lista.id, e.ticker, false).catch(() => {})} accessibilityRole="button"
                            accessibilityLabel={`Quitar ${e.nombre} de ${lista.nombre}`} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                            <Text style={[s.uiB, s.muted, { fontSize: 13 }]}>Quitar</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>
            )}

            <Text style={[s.uiB, { fontSize: 16, marginTop: 4 }]}>{listas.length ? "Crear otra lista" : "Crea tu primera lista"}</Text>
            <NuevaLista s={s} tema={tema} listas={listas} crear={async (n) => { const l = await sesion.crearLista(n); setActiva(l.id); }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
