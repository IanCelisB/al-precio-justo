/**
 * Comunidad: el muro con lo que publican todos, me gusta y comentarios, resultados del
 * simulador compartidos (para copiar ideas), perfiles públicos y el buzón de sugerencias.
 */
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fechaCorta, porcentajeConSigno } from "@ancla/valoracion/formato";
import { api, type Autor, type Comentario, type PerfilPublico, type Publicacion, type TipoBuzon } from "./api";
import type { Abrir } from "./componentes";
import { DEMO } from "./demo";
import type { Estilos } from "./estilos";
import { useSesion } from "./sesion";
import type { Tema } from "./tema";

/** "hace 5 min", "hace 3 h", "12 mar 2026". */
export function haceCuanto(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `hace ${Math.floor(s / 86400)} d`;
  return fechaCorta(iso.slice(0, 10));
}

export function Avatar({ s, tema, nombre, foto, size = 40 }: { s: Estilos; tema: Tema; nombre: string; foto: string | null; size?: number }) {
  return foto ? (
    <Image source={{ uri: foto }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tema.line }}
      accessibilityIgnoresInvertColors />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tema.acc, alignItems: "center", justifyContent: "center" }}>
      <Text style={[s.hd, { color: tema.onAcc, fontSize: size * 0.42 }]}>{(nombre.trim()[0] ?? "?").toUpperCase()}</Text>
    </View>
  );
}

function Comentarios({ s, tema, id, alComentar }: { s: Estilos; tema: Tema; id: string; alComentar: (n: number) => void }) {
  const { token, yo } = useSesion();
  const [lista, setLista] = useState<Comentario[] | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.comentarios(token, id).then(setLista).catch(() => setLista([])); }, [id]);
  const enviar = async () => {
    if (!token || !texto.trim()) return;
    try {
      const c = await api.comentar(token, id, texto.trim());
      const n = [...(lista ?? []), c];
      setLista(n); setTexto(""); setError(null); alComentar(n.length);
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <View style={{ gap: 8, borderTopWidth: 1, borderColor: tema.line, paddingTop: 10 }}>
      {!lista ? <ActivityIndicator color={tema.link} /> : lista.map((c) => (
        <View key={c.id} style={{ flexDirection: "row", gap: 8 }}>
          <Avatar s={s} tema={tema} nombre={c.autor.nombre} foto={c.autor.foto} size={26} />
          <View style={{ flex: 1, backgroundColor: tema.bg, borderRadius: 12, padding: 8 }}>
            <Text style={[s.uiB, { fontSize: 12.5 }]}>{c.autor.nombre} <Text style={[s.ui, s.muted, { fontSize: 11.5 }]}>· {haceCuanto(c.creado)}</Text></Text>
            <Text style={[s.ui, { fontSize: 13.5, lineHeight: 19 }]}>{c.texto}</Text>
            {c.mio && token && (
              <Pressable onPress={() => api.borrarComentario(token, c.id).then(() => {
                const n = lista.filter((x) => x.id !== c.id); setLista(n); alComentar(n.length);
              }).catch(() => {})} accessibilityRole="button">
                <Text style={[s.uiB, s.muted, { fontSize: 11.5, marginTop: 2 }]}>Borrar</Text>
              </Pressable>
            )}
          </View>
        </View>
      ))}
      {yo ? (
        <View style={[s.buscador, { paddingVertical: 4 }]}>
          <TextInput value={texto} onChangeText={setTexto} placeholder="Escribe un comentario…" placeholderTextColor={tema.muted}
            style={[s.entrada, { fontSize: 14 }]} maxLength={500} onSubmitEditing={enviar} accessibilityLabel="Comentario" />
          <Pressable onPress={enviar} disabled={!texto.trim()} accessibilityRole="button" style={!texto.trim() && { opacity: 0.4 }}>
            <Text style={[s.uiB, s.enlace, { fontSize: 13.5 }]}>Enviar</Text>
          </Pressable>
        </View>
      ) : <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>Inicia sesión para comentar.</Text>}
      {error && <Text style={[s.ui, { color: tema.down, fontSize: 12.5 }]}>{error}</Text>}
    </View>
  );
}

/** Una publicación del muro. */
export function TarjetaPublicacion({ s, tema, p, abrir, verPerfil, alBorrar }: {
  s: Estilos; tema: Tema; p: Publicacion; abrir: Abrir; verPerfil?: (a: Autor) => void; alBorrar?: () => void;
}) {
  const { token, yo } = useSesion();
  const [x, setX] = useState(p);
  const [abiertos, setAbiertos] = useState(false);
  const [reportada, setReportada] = useState(false);
  const like = async () => {
    if (!token) return;
    const si = !x.loHeGustado;
    setX({ ...x, loHeGustado: si, meGusta: x.meGusta + (si ? 1 : -1) });
    try { const r = await api.meGusta(token, x.id, si); setX((y) => ({ ...y, ...r })); } catch { setX(x); }
  };
  return (
    <View style={[s.metrica, { gap: 10 }]}>
      <Pressable onPress={() => verPerfil?.(x.autor)} disabled={!verPerfil} accessibilityRole="button"
        style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Avatar s={s} tema={tema} nombre={x.autor.nombre} foto={x.autor.foto} />
        <View style={{ flex: 1 }}>
          <Text style={[s.uiB, { fontSize: 14.5 }]} numberOfLines={1}>{x.autor.nombre}</Text>
          <Text style={[s.ui, s.muted, { fontSize: 12 }]}>{haceCuanto(x.creado)}</Text>
        </View>
        {x.ticker && (
          <Pressable onPress={() => abrir(x.ticker!)} style={[s.chip, { paddingVertical: 4 }]} accessibilityRole="button">
            <Text style={[s.uiB, s.enlace, { fontSize: 12.5 }]}>{x.ticker}</Text>
          </Pressable>
        )}
      </Pressable>
      {!!x.texto && <Text style={[s.ui, { fontSize: 15, lineHeight: 22 }]}>{x.texto}</Text>}
      {x.cartera && (
        <View style={{ backgroundColor: tema.bg, borderRadius: 14, padding: 12, gap: 8 }}>
          <View style={[s.fila, { alignItems: "center" }]}>
            <Text style={[s.uiB, { fontSize: 13.5 }]}>Su cartera del simulador</Text>
            <Text style={[s.hd, { fontSize: 18, color: x.cartera.gananciaPct >= 0 ? tema.good : tema.down }]}>
              {porcentajeConSigno(x.cartera.gananciaPct, 1)}
            </Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {x.cartera.posiciones.map((q) => (
              <Pressable key={q.ticker} onPress={() => abrir(q.ticker)} style={[s.chip, { paddingVertical: 4, paddingHorizontal: 10 }]}
                accessibilityRole="button" accessibilityLabel={`Ver ${q.ticker}`}>
                <Text style={[s.ui, { fontSize: 12.5 }]}>
                  <Text style={s.uiB}>{q.ticker}</Text> {Math.round(q.peso * 100)} %
                  {q.gananciaPct !== null ? <Text style={{ color: q.gananciaPct >= 0 ? tema.good : tema.down }}> {porcentajeConSigno(q.gananciaPct, 0)}</Text> : null}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[s.ui, s.muted, { fontSize: 11.5 }]}>Peso de cada empresa en su cartera. Dinero ficticio; no es una recomendación.</Text>
        </View>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
        <Pressable onPress={like} disabled={!yo} accessibilityRole="button" accessibilityState={{ selected: x.loHeGustado }}
          accessibilityLabel={`Me gusta, ${x.meGusta}`} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Text style={{ fontSize: 17, color: x.loHeGustado ? tema.down : tema.muted }}>{x.loHeGustado ? "♥" : "♡"}</Text>
          <Text style={[s.uiB, s.muted, { fontSize: 13 }]}>{x.meGusta}</Text>
        </Pressable>
        <Pressable onPress={() => setAbiertos(!abiertos)} accessibilityRole="button" accessibilityState={{ expanded: abiertos }}
          style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Text style={{ fontSize: 15, color: tema.muted }}>💬</Text>
          <Text style={[s.uiB, s.muted, { fontSize: 13 }]}>{x.comentarios} {x.comentarios === 1 ? "comentario" : "comentarios"}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        {x.mia && token ? (
          <Pressable onPress={() => api.borrarPublicacion(token, x.id).then(() => alBorrar?.()).catch(() => {})} accessibilityRole="button">
            <Text style={[s.uiB, s.muted, { fontSize: 12.5 }]}>Borrar</Text>
          </Pressable>
        ) : yo && !reportada ? (
          <Pressable onPress={() => api.buzon(token, "reporte", `Publicación ${x.id} de ${x.autor.nombre}: ${x.texto.slice(0, 200)}`)
            .then(() => setReportada(true)).catch(() => {})} accessibilityRole="button">
            <Text style={[s.uiB, s.muted, { fontSize: 12.5 }]}>Reportar</Text>
          </Pressable>
        ) : reportada ? <Text style={[s.ui, s.muted, { fontSize: 12 }]}>Reportada, gracias</Text> : null}
      </View>
      {abiertos && <Comentarios s={s} tema={tema} id={x.id} alComentar={(n) => setX((y) => ({ ...y, comentarios: n }))} />}
    </View>
  );
}

/** Caja para publicar: texto, empresa opcional y, si quiere, su cartera del simulador. */
function Publicar({ s, tema, alPublicar }: { s: Estilos; tema: Tema; alPublicar: (p: Publicacion) => void }) {
  const { token } = useSesion();
  const [texto, setTexto] = useState("");
  const [ticker, setTicker] = useState("");
  const [cartera, setCartera] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const enviar = async () => {
    if (!token) return;
    setOcupado(true);
    try {
      const p = await api.publicar(token, { texto: texto.trim(), ticker: ticker.trim() || null, compartirCartera: cartera });
      alPublicar(p); setTexto(""); setTicker(""); setCartera(false); setError(null);
    } catch (e) { setError((e as Error).message); } finally { setOcupado(false); }
  };
  return (
    <View style={[s.metrica, { gap: 10 }]}>
      <TextInput value={texto} onChangeText={setTexto} placeholder="¿Qué estás mirando? Comparte una idea, una duda o tu estrategia…"
        placeholderTextColor={tema.muted} multiline maxLength={1000} accessibilityLabel="Texto de la publicación"
        style={[s.entrada, { minHeight: 64, textAlignVertical: "top", fontSize: 15 }]} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <View style={[s.buscador, { paddingVertical: 4, paddingHorizontal: 10, width: 130 }]}>
          <Text style={[s.uiB, s.muted]}>$</Text>
          <TextInput value={ticker} onChangeText={(v) => setTicker(v.toUpperCase())} placeholder="Ticker" placeholderTextColor={tema.muted}
            style={[s.entrada, { fontSize: 14 }]} autoCapitalize="characters" autoCorrect={false} maxLength={8} accessibilityLabel="Empresa (opcional)" />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Switch value={cartera} onValueChange={setCartera} accessibilityLabel="Compartir mi cartera del simulador" />
          <Text style={[s.ui, { fontSize: 13 }]}>Compartir mi cartera</Text>
        </View>
      </View>
      {error && <Text style={[s.ui, { color: tema.down, fontSize: 13 }]}>{error}</Text>}
      <Pressable onPress={enviar} disabled={ocupado || (!texto.trim() && !cartera)} accessibilityRole="button"
        style={[s.boton, { alignSelf: "flex-end", paddingVertical: 9 }, (ocupado || (!texto.trim() && !cartera)) && { opacity: 0.45 }]}>
        <Text style={[s.uiB, { color: tema.onAcc }]}>Publicar</Text>
      </Pressable>
    </View>
  );
}

/** Perfil público de otro usuario: su presentación y lo que ha publicado. */
function VerPerfil({ s, tema, publico, cerrar, abrir }: { s: Estilos; tema: Tema; publico: string | null; cerrar: () => void; abrir: Abrir }) {
  const { token } = useSesion();
  const [p, setP] = useState<PerfilPublico | null>(null);
  useEffect(() => { setP(null); if (publico) api.perfilPublico(token, publico).then(setP).catch(() => {}); }, [publico]);
  return (
    <Modal visible={!!publico} animationType="slide" presentationStyle="pageSheet" onRequestClose={cerrar}>
      <SafeAreaView style={s.pantalla} edges={["top", "bottom"]}>
        <View style={[s.fila, { padding: 16, alignItems: "center" }]}>
          <Text style={[s.hd, { fontSize: 21 }]}>Perfil</Text>
          <Pressable onPress={cerrar} accessibilityRole="button"><Text style={[s.uiB, { color: tema.link, fontSize: 16 }]}>Cerrar</Text></Pressable>
        </View>
        {!p ? <ActivityIndicator color={tema.link} /> : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 12 }}>
            <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
              <Avatar s={s} tema={tema} nombre={p.nombre} foto={p.foto} size={72} />
              <View style={{ flex: 1 }}>
                <Text style={[s.hd, { fontSize: 22 }]}>{p.nombre}</Text>
                <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>
                  En la comunidad desde {fechaCorta(p.desde.slice(0, 10))} · {p.meGustaRecibidos} me gusta
                </Text>
              </View>
            </View>
            {!!p.bio && <Text style={[s.ui, { fontSize: 15, lineHeight: 21 }]}>{p.bio}</Text>}
            {p.publicaciones.length === 0 && <Text style={[s.ui, s.muted]}>Todavía no ha publicado nada.</Text>}
            {p.publicaciones.map((x) => <TarjetaPublicacion key={x.id} s={s} tema={tema} p={x} abrir={(t) => { cerrar(); abrir(t); }} />)}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

/** El muro: lo último que publicaron todos, de 20 en 20. */
export function Muro({ s, tema, abrir, propias }: { s: Estilos; tema: Tema; abrir: Abrir; propias?: string }) {
  const { token, yo } = useSesion();
  const [lista, setLista] = useState<Publicacion[] | null>(null);
  const [fin, setFin] = useState(false);
  const [perfil, setPerfil] = useState<string | null>(null);
  const cargar = useCallback(async (antes?: string) => {
    const r = propias ? (await api.perfilPublico(token, propias)).publicaciones : await api.muro(token, { antes });
    setFin(propias ? true : r.length < 20);
    setLista((l) => (antes && l ? [...l, ...r] : r));
  }, [token, propias]);
  useEffect(() => { cargar().catch(() => setLista([])); }, [cargar]);
  return (
    <View style={{ gap: 12 }}>
      {yo && !propias && <Publicar s={s} tema={tema} alPublicar={(p) => setLista((l) => [p, ...(l ?? [])])} />}
      {DEMO && (
        <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>
          En la demo solo ves tus propias publicaciones (se guardan en este navegador). Con las cuentas activas, verás las de todos.
        </Text>
      )}
      {!lista ? <ActivityIndicator color={tema.link} /> : lista.length === 0 ? (
        <Text style={[s.ui, s.muted, { fontSize: 14 }]}>
          {propias ? "Todavía no has publicado nada." : "Aún no hay publicaciones. ¡Sé el primero en compartir una idea!"}
        </Text>
      ) : lista.map((p) => (
        <TarjetaPublicacion key={p.id} s={s} tema={tema} p={p} abrir={abrir}
          verPerfil={(a) => { if (a.publico !== yo?.usuario.publico) setPerfil(a.publico); }}
          alBorrar={() => setLista((l) => (l ?? []).filter((x) => x.id !== p.id))} />
      ))}
      {lista && lista.length > 0 && !fin && (
        <Pressable onPress={() => cargar(lista.at(-1)!.id).catch(() => {})} style={[s.agregar, { alignSelf: "center" }]} accessibilityRole="button">
          <Text style={[s.uiB, { color: tema.link, fontSize: 14 }]}>Ver más</Text>
        </Pressable>
      )}
      <VerPerfil s={s} tema={tema} publico={perfil} cerrar={() => setPerfil(null)} abrir={abrir} />
    </View>
  );
}

const TIPOS_BUZON: { id: TipoBuzon; nombre: string; ayuda: string }[] = [
  { id: "sugerencia", nombre: "Sugerencia", ayuda: "¿Qué te gustaría que agreguemos o cambiemos?" },
  { id: "comentario", nombre: "Comentario", ayuda: "Cuéntanos qué te parece la app." },
  { id: "reclamo", nombre: "Reclamo", ayuda: "¿Algo no funciona o un dato está mal? Dinos dónde." },
];

/** Buzón de comentarios, sugerencias y reclamos (lo lee el equipo; no es público). */
export function Buzon({ s, tema }: { s: Estilos; tema: Tema }) {
  const { token } = useSesion();
  const [tipo, setTipo] = useState<TipoBuzon>("sugerencia");
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  const enviar = async () => {
    try {
      await api.buzon(token, tipo, texto.trim());
      setTexto("");
      setEstado({ ok: true, texto: DEMO ? "¡Gracias! En la demo tu mensaje no sale de este navegador." : "¡Gracias! Leemos todos los mensajes." });
    } catch (e) { setEstado({ ok: false, texto: (e as Error).message }); }
  };
  const t = TIPOS_BUZON.find((x) => x.id === tipo)!;
  return (
    <View style={[s.metrica, { gap: 10 }]}>
      <Text style={[s.hd, { fontSize: 18 }]}>Buzón</Text>
      <Text style={[s.ui, s.muted, { fontSize: 13 }]}>Lo lee el equipo de Al Precio Justo; no se publica.</Text>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        {TIPOS_BUZON.map((x) => {
          const on = x.id === tipo;
          return (
            <Pressable key={x.id} onPress={() => setTipo(x.id)} style={[s.chip, on && s.chipOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <Text style={[s.uiB, { fontSize: 13, color: on ? tema.onAcc : tema.fg }]}>{x.nombre}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput value={texto} onChangeText={setTexto} placeholder={t.ayuda} placeholderTextColor={tema.muted} multiline maxLength={2000}
        style={[s.entrada, { minHeight: 90, textAlignVertical: "top", borderWidth: 1, borderColor: tema.line, borderRadius: 12, padding: 10 }]}
        accessibilityLabel={`Texto: ${t.nombre}`} />
      <Pressable onPress={enviar} disabled={texto.trim().length < 3} accessibilityRole="button"
        style={[s.boton, { alignSelf: "flex-start", paddingVertical: 9 }, texto.trim().length < 3 && { opacity: 0.45 }]}>
        <Text style={[s.uiB, { color: tema.onAcc }]}>Enviar</Text>
      </Pressable>
      {estado && <Text style={[s.ui, { fontSize: 13, color: estado.ok ? tema.good : tema.down }]}>{estado.texto}</Text>}
    </View>
  );
}
