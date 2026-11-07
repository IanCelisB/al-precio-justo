import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { dineroUsd, dineroConSigno, nombreCorto, porcentajeConSigno } from "@ancla/valoracion/formato";
import { SALDO_INICIAL } from "@ancla/valoracion/simulador";
import { api, type Cartera } from "./api";
import { Logo, Seccion, type Abrir } from "./componentes";
import type { Estilos } from "./estilos";
import { useSesion } from "./sesion";
import { colorTono, Comparado, MaquinaTiempo } from "./simulacion";
import type { Tema } from "./tema";

/** Cartera simulada: 30.000 USD ficticios con precios reales. */
export function Simulador({ s, tema, abrir, irA }: { s: Estilos; tema: Tema; abrir: Abrir; irA: (p: "Perfil" | "Buscar") => void }) {
  const { token, yo } = useSesion();
  const [c, setC] = useState<Cartera | null>(null);
  const [recargando, setRecargando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  const cargar = useCallback(async () => { if (token) setC(await api.simulador(token).catch(() => null)); }, [token]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!yo || !token) {
    return (
      <SafeAreaView style={s.pantalla} edges={["top"]}>
        <ScrollView contentContainerStyle={s.contenido}>
          <Text style={[s.hd, { fontSize: 30 }]}>Simulador</Text>
          <View style={s.caja}>
            <View style={[s.pildora, { backgroundColor: tema.band, alignSelf: "flex-start" }]}>
              <Text style={[s.uiB, s.cFg, { fontSize: 11 }]}>Dinero ficticio · precios reales</Text>
            </View>
            <Text style={[s.hd, { fontSize: 22 }]}>Practica con {dineroUsd(SALDO_INICIAL, 0)} sin arriesgar nada</Text>
            <Text style={[s.ui, s.muted, { fontSize: 14.5 }]}>
              Compra y vende acciones reales con dinero de mentira. Si Nvidia sube un 100 %, lo verás en tu cartera.
              Compara tus resultados con el S&P 500 antes de invertir de verdad.
            </Text>
            <Pressable style={s.boton} onPress={() => irA("Perfil")} accessibilityRole="button">
              <Text style={[s.uiB, { color: tema.onAcc }]}>Iniciar sesión para empezar</Text>
            </Pressable>
          </View>
          <MaquinaTiempo s={s} tema={tema} ticker="NVDA" nombre="Nvidia" />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const vsIndice = c && c.referencia !== null ? c.valorTotal - c.referencia : null;
  return (
    <SafeAreaView style={s.pantalla} edges={["top"]}>
      <ScrollView contentContainerStyle={s.contenido}
        refreshControl={<RefreshControl refreshing={recargando} tintColor={tema.link}
          onRefresh={async () => { setRecargando(true); await cargar(); setRecargando(false); }} />}>
        <View style={[s.fila, { alignItems: "center" }]}>
          <Text style={[s.hd, { fontSize: 30 }]}>Simulador</Text>
          <View style={[s.pildora, { backgroundColor: tema.band }]}><Text style={[s.uiB, s.cFg, { fontSize: 11 }]}>Dinero ficticio</Text></View>
        </View>
        {!c ? <ActivityIndicator color={tema.link} /> : (
          <>
            <View style={[s.metrica, { gap: 6 }]}>
              <Text style={[s.ui, s.muted, { fontSize: 13 }]}>Valor de tu cartera</Text>
              <Text style={[s.hd, { fontSize: 36 }]}>{dineroUsd(c.valorTotal)}</Text>
              <Text style={[s.uiB, { fontSize: 14, color: colorTono(tema, c.ganancia) }]}>
                {dineroConSigno(c.ganancia)} ({porcentajeConSigno(c.gananciaPct)}) desde que empezaste
              </Text>
              <View style={{ flexDirection: "row", backgroundColor: tema.bg, borderRadius: 14, padding: 10, marginTop: 4 }}>
                {[["Disponible", dineroUsd(c.efectivo), tema.fg], ["Invertido", dineroUsd(c.valorPosiciones), tema.fg],
                  ["Ganado al vender", dineroConSigno(c.realizada), colorTono(tema, c.realizada)]].map(([k, v, col]) => (
                  <View key={k} style={{ flex: 1 }}>
                    <Text style={[s.ui, s.muted, { fontSize: 11 }]}>{k}</Text>
                    <Text style={[s.mono, { fontSize: 12.5, color: col }]}>{v}</Text>
                  </View>
                ))}
              </View>
              {c.curva.length > 1 && (
                <Comparado s={s} tema={tema} valores={c.curva.map((p) => p.valor)} referencia={c.curva.map((p) => p.referencia)}
                  etiquetas={["Tu cartera", "S&P 500"]} />
              )}
              {vsIndice !== null && c.posiciones.length > 0 && (
                <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>
                  Con lo mismo en el S&P 500 tendrías {dineroUsd(c.referencia!)}:{" "}
                  {vsIndice >= 0 ? `le vas ganando por ${dineroUsd(vsIndice)}.` : `te va ganando por ${dineroUsd(-vsIndice)}.`}
                </Text>
              )}
            </View>

            <Seccion s={s} titulo="Tus posiciones" extra={c.posiciones.length ? String(c.posiciones.length) : "ninguna todavía"} />
            {c.posiciones.length === 0 ? (
              <View style={s.caja}>
                <Text style={[s.ui, s.muted, { fontSize: 14 }]}>
                  Abre una empresa y pulsa «Comprar» para tu primera inversión simulada. Puedes empezar por las ideas con buen precio.
                </Text>
                <Pressable style={s.boton} onPress={() => irA("Buscar")} accessibilityRole="button">
                  <Text style={[s.uiB, { color: tema.onAcc }]}>Ver ideas con buen precio</Text>
                </Pressable>
              </View>
            ) : c.posiciones.map((p) => (
              <Pressable key={p.ticker} onPress={() => abrir(p.ticker)} accessibilityRole="button"
                style={[s.metrica, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
                <Logo ticker={p.ticker} sector={p.sector} size={40} s={s} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.hd, { fontSize: 16 }]} numberOfLines={1}>{nombreCorto(p.nombre)}</Text>
                  <Text style={[s.mono, s.muted, { fontSize: 11 }]} numberOfLines={1}>
                    {p.acciones.toLocaleString("es", { maximumFractionDigits: 4 })} acc. · coste {dineroUsd(p.costeMedio)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[s.mono, { fontSize: 14 }]}>{p.valor !== null ? dineroUsd(p.valor) : "—"}</Text>
                  {p.ganancia !== null && p.gananciaPct !== null && (
                    <Text style={[s.uiB, { fontSize: 12, color: colorTono(tema, p.ganancia) }]}>
                      {dineroConSigno(p.ganancia)} ({porcentajeConSigno(p.gananciaPct)})
                    </Text>
                  )}
                </View>
              </Pressable>
            ))}

            {c.operaciones.length > 0 && <Seccion s={s} titulo="Movimientos" extra={`últimos ${c.operaciones.length}`} />}
            {c.operaciones.map((o, i) => (
              <View key={i} style={[s.fila, { alignItems: "center", gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: tema.line }]}>
                <View style={[s.pildora, { backgroundColor: o.tipo === "compra" ? tema.pastel[1] : tema.pastel[3] }]}>
                  <Text style={[s.uiB, s.cFg, { fontSize: 11 }]}>{o.tipo === "compra" ? "Compra" : "Venta"}</Text>
                </View>
                <Text style={[s.ui, { fontSize: 13, flex: 1 }]} numberOfLines={1}>
                  {nombreCorto(o.nombre)} · {o.acciones.toLocaleString("es", { maximumFractionDigits: 4 })} acc. a {dineroUsd(o.precio)}
                </Text>
                <Text style={[s.mono, { fontSize: 13 }]}>{dineroUsd(o.importe)}</Text>
              </View>
            ))}

            {!confirmar ? (
              <Pressable onPress={() => setConfirmar(true)} accessibilityRole="button" style={{ paddingVertical: 8 }}>
                <Text style={[s.uiB, { color: tema.down, fontSize: 14 }]}>Reiniciar cartera</Text>
              </Pressable>
            ) : (
              <View style={[s.caja, { borderColor: tema.down }]}>
                <Text style={[s.ui, { fontSize: 14 }]}>Se borrarán tus operaciones simuladas y volverás a tener {dineroUsd(SALDO_INICIAL, 0)} ficticios.</Text>
                <View style={{ flexDirection: "row", gap: 16 }}>
                  <Pressable onPress={async () => { setC(await api.reiniciar(token)); setConfirmar(false); }} accessibilityRole="button">
                    <Text style={[s.uiB, { color: tema.down }]}>Sí, reiniciar</Text>
                  </Pressable>
                  <Pressable onPress={() => setConfirmar(false)} accessibilityRole="button"><Text style={[s.uiB, s.enlace]}>Cancelar</Text></Pressable>
                </View>
              </View>
            )}
            <Text style={[s.ui, s.muted, { fontSize: 11 }]}>{c.aviso}</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
