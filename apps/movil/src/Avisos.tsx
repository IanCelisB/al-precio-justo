/** Avisos dentro de la app: lista, precios objetivo y qué avisos recibir. */
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { TIPOS_AVISO, UMBRALES, type AjustesAvisos } from "@ancla/valoracion/avisos";
import { dineroUsd, fechaCorta, leerMonto, nombreCorto } from "@ancla/valoracion/formato";
import { api, type Aviso, type Objetivo } from "./api";
import { Logo, type Abrir } from "./componentes";
import type { Estilos } from "./estilos";
import { useSesion } from "./sesion";
import type { Tema } from "./tema";

const ICONO: Record<string, string> = { objetivo: "🎯", estado: "⚖️", reporte: "📄", movimiento: "⚡" };

/** Avisos sin leer (cada minuto). 0 sin sesión. */
export function useSinLeer(): number {
  const { token } = useSesion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!token) { setN(0); return; }
    let vivo = true;
    const mirar = () => api.avisos(token).then((d) => { if (vivo) setN(d.sinLeer); }).catch(() => {});
    mirar();
    const t = setInterval(mirar, 60_000);
    return () => { vivo = false; clearInterval(t); };
  }, [token]);
  return n;
}

/** Botón de campana con el número de avisos sin leer. */
export function Campana({ tema, onPress }: { tema: Tema; onPress: () => void }) {
  const n = useSinLeer();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={n ? `Avisos, ${n} sin leer` : "Avisos"}
      style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center",
        backgroundColor: tema.card, borderWidth: 1, borderColor: tema.line }}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={tema.fg} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" /><Path d="M10 20a2 2 0 0 0 4 0" />
      </Svg>
      {n > 0 && (
        <View style={{ position: "absolute", top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
          backgroundColor: tema.down, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: tema.bg }}>
          <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "700" }}>{n > 9 ? "9+" : n}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function PantallaAvisos({ s, tema, volver, abrir, irAPerfil }: {
  s: Estilos; tema: Tema; volver: () => void; abrir: Abrir; irAPerfil: () => void;
}) {
  const { token } = useSesion();
  const [lista, setLista] = useState<Aviso[] | null>(null);
  const [objetivos, setObjetivos] = useState<Objetivo[]>([]);
  const [ajustes, setAjustes] = useState<AjustesAvisos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recargando, setRecargando] = useState(false);

  const cargar = useCallback(async () => {
    if (!token) return;
    try {
      const [a, o, j] = await Promise.all([api.avisos(token), api.objetivos(token), api.ajustesAvisos(token)]);
      setLista(a.avisos); setObjetivos(o); setAjustes(j); setError(null);
      if (a.sinLeer) setTimeout(() => api.marcarLeidos(token).catch(() => {}), 2500);
    } catch {
      setError("No pudimos cargar tus avisos.");
    }
  }, [token]);
  useEffect(() => { cargar(); }, [cargar]);

  const cambiar = async (x: Partial<AjustesAvisos>) => {
    if (!token || !ajustes) return;
    const previo = ajustes;
    setAjustes({ ...ajustes, ...x });
    try { setAjustes(await api.guardarAjustesAvisos(token, x)); } catch { setAjustes(previo); setError("No pudimos guardar el cambio."); }
  };

  return (
    <SafeAreaView style={s.pantalla} edges={["top"]}>
      <ScrollView contentContainerStyle={s.contenido}
        refreshControl={<RefreshControl refreshing={recargando} tintColor={tema.link}
          onRefresh={async () => { setRecargando(true); await cargar(); setRecargando(false); }} />}>
        <Pressable onPress={volver} accessibilityRole="button" style={{ alignSelf: "flex-start" }}>
          <Text style={[s.uiB, s.enlace, { fontSize: 15 }]}>‹ Volver</Text>
        </Pressable>
        <Text style={[s.hd, { fontSize: 30 }]}>Avisos</Text>

        {!token ? (
          <View style={s.caja}>
            <Text style={[s.ui, { fontSize: 15 }]}>
              Inicia sesión para recibir avisos: cuando una acción llegue a tu precio objetivo, cuando una empresa que sigues
              pase a barata o publique su reporte.
            </Text>
            <Pressable onPress={irAPerfil} style={s.boton} accessibilityRole="button">
              <Text style={[s.uiB, s.enAcc]}>Iniciar sesión</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {error && <Text style={[s.ui, { color: tema.down }]}>{error}</Text>}
            {!lista && !error && <ActivityIndicator color={tema.link} style={{ marginTop: 30 }} />}
            {lista && lista.length === 0 && (
              <Text style={[s.ui, s.muted, { fontSize: 14 }]}>
                Todavía no tienes avisos. Abre una empresa y toca «🔔 Avisarme» para fijar un precio objetivo.
              </Text>
            )}
            {lista?.map((a) => (
              <Pressable key={a.id} onPress={() => abrir(a.ticker)} accessibilityRole="button"
                style={({ pressed }) => [{ flexDirection: "row", gap: 12, padding: 14, borderRadius: 18, borderWidth: 1,
                  backgroundColor: a.leido ? tema.card : tema.bg2, borderColor: a.leido ? tema.line : tema.accent }, pressed && { opacity: 0.8 }]}>
                <Logo ticker={a.ticker} sector={a.sector} size={40} s={s} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[s.uiB, { fontSize: 15 }]}>{ICONO[a.tipo]} {a.titulo}</Text>
                  <Text style={[s.ui, { fontSize: 13.5 }]}>{a.texto}</Text>
                  <Text style={[s.ui, s.muted, { fontSize: 12 }]}>{fechaCorta(a.creado.slice(0, 10))}</Text>
                </View>
              </Pressable>
            ))}

            <View style={s.metrica}>
              <Text style={[s.hd, { fontSize: 18, marginBottom: 6 }]}>Tus precios objetivo</Text>
              {objetivos.filter((o) => !o.cumplido).length === 0
                ? <Text style={[s.ui, s.muted, { fontSize: 13 }]}>No tienes precios objetivo activos.</Text>
                : objetivos.filter((o) => !o.cumplido).map((o) => (
                  <View key={o.ticker} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10,
                    borderTopWidth: 1, borderTopColor: tema.line }}>
                    <Logo ticker={o.ticker} sector={o.sector ?? null} size={34} s={s} />
                    <Pressable style={{ flex: 1 }} onPress={() => abrir(o.ticker)}>
                      <Text style={[s.uiB, { fontSize: 14.5 }]}>{nombreCorto(o.nombre ?? o.ticker)}</Text>
                      <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>
                        Cuando {o.direccion === "baja" ? "baje" : "suba"} a {dineroUsd(o.precio)}
                        {o.precioActual ? ` · hoy ${dineroUsd(o.precioActual)}` : ""}
                      </Text>
                    </Pressable>
                    <Pressable style={s.chip} accessibilityRole="button" onPress={async () => {
                      await api.quitarObjetivo(token, o.ticker).catch(() => {});
                      setObjetivos(objetivos.filter((x) => x.ticker !== o.ticker));
                    }}><Text style={[s.uiB, { fontSize: 13 }]}>Quitar</Text></Pressable>
                  </View>
                ))}
            </View>

            {ajustes && (
              <View style={s.metrica}>
                <Text style={[s.hd, { fontSize: 18, marginBottom: 6 }]}>Qué avisos quieres</Text>
                {TIPOS_AVISO.map((t) => (
                  <View key={t.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10,
                    borderTopWidth: 1, borderTopColor: tema.line }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.uiB, { fontSize: 15 }]}>{t.nombre}</Text>
                      <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>{t.descripcion}</Text>
                    </View>
                    <Switch value={ajustes[t.id]} onValueChange={(v) => cambiar({ [t.id]: v })}
                      trackColor={{ true: tema.mint, false: tema.line }} accessibilityLabel={t.nombre} />
                  </View>
                ))}
                {ajustes.movimiento && (
                  <>
                    <Text style={[s.ui, s.muted, { fontSize: 13, marginTop: 8 }]}>Movimiento fuerte: avisar desde</Text>
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                      {UMBRALES.map((u) => {
                        const on = ajustes.umbral === u;
                        return (
                          <Pressable key={u} onPress={() => cambiar({ umbral: u })} accessibilityRole="radio" accessibilityState={{ checked: on }}
                            style={[s.chip, on && s.chipOn]}>
                            <Text style={[s.uiB, { fontSize: 13 }, on && s.enAcc]}>±{u} % en el día</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                )}
              </View>
            )}
            <Text style={[s.ui, s.muted, { fontSize: 11 }]}>
              Los precios llegan con retraso y se revisan varias veces al día. Los avisos son informativos, no una recomendación
              de compra o venta.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** En la ficha: fijar, cambiar o quitar el precio objetivo. */
export function BotonObjetivo({ s, tema, ticker, precioActual }: {
  s: Estilos; tema: Tema; ticker: string; precioActual: number | null;
}) {
  const { token } = useSesion();
  const [obj, setObj] = useState<Objetivo | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.objetivos(token).then((l) => {
      const o = l.find((x) => x.ticker === ticker) ?? null;
      setObj(o);
      setTexto(o ? String(o.precio) : precioActual ? (precioActual * 0.9).toFixed(2) : "");
    }).catch(() => {});
  }, [token, ticker, precioActual]);

  if (!token) return null;
  const activo = obj && !obj.cumplido;
  const boton = (
    <Pressable onPress={() => setAbierto(!abierto)} accessibilityRole="button"
      style={({ pressed }) => [{ marginTop: 10, height: 46, borderRadius: 999, alignItems: "center", justifyContent: "center",
        borderWidth: 1, borderColor: activo ? tema.link : tema.line, backgroundColor: tema.card }, pressed && { transform: [{ scale: 0.97 }] }]}>
      <Text style={[s.uiB, { fontSize: 15, color: activo ? tema.link : tema.fg }]}>
        🔔 {activo ? `Aviso a ${dineroUsd(obj!.precio)}` : obj?.cumplido ? "Objetivo cumplido" : "Avisarme"}
      </Text>
    </Pressable>
  );
  if (!abierto) return boton;

  const guardar = async () => {
    const precio = leerMonto(texto);
    if (precio === null) { setError("Escribe un precio válido."); return; }
    try {
      setObj(await api.fijarObjetivo(token, ticker, precio)); setAbierto(false); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos guardar el precio objetivo."); }
  };
  return (
    <View>
      {boton}
      <View style={[s.metrica, { marginTop: 10, gap: 8 }]}>
        <Text style={[s.ui, s.muted, { fontSize: 13 }]}>Avísame cuando la acción llegue a (USD)</Text>
        <View style={s.buscador}>
          <Text style={[s.uiB, s.muted, { fontSize: 18 }]}>$</Text>
          <TextInput value={texto} onChangeText={setTexto} keyboardType="decimal-pad" style={[s.entrada, { fontSize: 20 }]}
            accessibilityLabel="Precio objetivo en dólares" autoFocus onSubmitEditing={guardar} />
        </View>
        <Text style={[s.ui, s.muted, { fontSize: 12 }]}>
          {precioActual ? `Hoy cotiza a ${dineroUsd(precioActual)}. ` : ""}Te avisamos dentro de la app.
        </Text>
        {error && <Text style={[s.ui, { color: tema.down, fontSize: 13 }]}>{error}</Text>}
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Pressable onPress={guardar} style={[s.boton, { paddingVertical: 10 }]} accessibilityRole="button">
            <Text style={[s.uiB, s.enAcc]}>Guardar</Text>
          </Pressable>
          {obj && (
            <Pressable style={[s.chip, { justifyContent: "center" }]} accessibilityRole="button" onPress={async () => {
              await api.quitarObjetivo(token, ticker).catch(() => {}); setObj(null); setAbierto(false);
            }}><Text style={[s.uiB, { fontSize: 13 }]}>Quitar aviso</Text></Pressable>
          )}
          <Pressable style={[s.chip, { justifyContent: "center" }]} onPress={() => setAbierto(false)} accessibilityRole="button">
            <Text style={[s.uiB, { fontSize: 13 }]}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
