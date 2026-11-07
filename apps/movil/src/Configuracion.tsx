/** Configuración: tema, color de acento, divisa y uso anónimo. */
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ACENTOS, MODOS, type Acento } from "@ancla/valoracion/apariencia";
import { DIVISAS, fechaCorta } from "@ancla/valoracion/formato";
import { useConfig } from "./config";
import type { Estilos } from "./estilos";
import type { Tema } from "./tema";

export function Configuracion({ s, tema, volver }: { s: Estilos; tema: Tema; volver: () => void }) {
  const { pref, cambiar, divisas } = useConfig();
  const detalle = new Map((divisas?.detalle ?? []).map((d) => [d.codigo, d]));

  const opcion = (on: boolean, texto: string, onPress: () => void, extra?: React.ReactNode) => (
    <Pressable key={texto} onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }}
      style={[s.fila, { alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: tema.line, gap: 10 }]}>
      <View style={{ flex: 1 }}>
        <Text style={[s.uiB, { fontSize: 15 }]}>{texto}</Text>
        {extra}
      </View>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? tema.link : tema.line,
        alignItems: "center", justifyContent: "center" }}>
        {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tema.link }} />}
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={s.pantalla} edges={["top"]}>
      <ScrollView contentContainerStyle={s.contenido}>
        <Pressable onPress={volver} accessibilityRole="button" style={{ alignSelf: "flex-start" }}>
          <Text style={[s.uiB, s.enlace, { fontSize: 15 }]}>‹ Volver</Text>
        </Pressable>
        <Text style={[s.hd, { fontSize: 30 }]}>Configuración</Text>

        <View style={s.metrica}>
          <Text style={[s.hd, { fontSize: 18 }]}>Apariencia</Text>
          {MODOS.map((m) => opcion(pref.tema === m.id, m.nombre, () => cambiar({ tema: m.id })))}
          <Text style={[s.ui, s.muted, { fontSize: 13, marginTop: 12 }]}>Color de acento</Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            {(Object.keys(ACENTOS) as Acento[]).map((a) => {
              const on = pref.acento === a;
              return (
                <Pressable key={a} onPress={() => cambiar({ acento: a })} accessibilityRole="radio"
                  accessibilityState={{ checked: on }} accessibilityLabel={ACENTOS[a].nombre} style={{ alignItems: "center", gap: 4 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: ACENTOS[a].claro.mint,
                    borderWidth: on ? 3 : 0, borderColor: tema.fg }} />
                  <Text style={[s.ui, { fontSize: 12 }]}>{ACENTOS[a].nombre}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={s.metrica}>
          <Text style={[s.hd, { fontSize: 18 }]}>Divisa</Text>
          <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>
            Precios, valores y métricas se muestran en esta moneda. El simulador sigue en USD.
          </Text>
          {Object.entries(DIVISAS).map(([codigo, info]) => {
            const d = detalle.get(codigo);
            const disponible = codigo === "USD" || !!d;
            return opcion(pref.divisa === codigo, `${info.nombre} (${codigo})`, () => disponible && cambiar({ divisa: codigo }),
              <Text style={[s.ui, s.muted, { fontSize: 12 }]}>
                {codigo === "USD" ? "Moneda de los reportes" : d
                  ? `1 USD = ${d.porUsd.toLocaleString("es", { maximumFractionDigits: 4 })} ${codigo} · ${fechaCorta(d.fecha)} · ${d.fuente}`
                  : "Sin tasa disponible"}
              </Text>);
          })}
        </View>

        <View style={s.metrica}>
          <View style={[s.fila, { alignItems: "center", gap: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.hd, { fontSize: 18 }]}>Uso anónimo</Text>
              <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>
                Cuenta qué empresas se ven para mostrar tendencias y «quienes vieron esta también vieron». Sin nombre ni
                email: solo un número aleatorio de este dispositivo.
              </Text>
            </View>
            <Switch value={pref.analitica} onValueChange={(v) => cambiar({ analitica: v })}
              trackColor={{ true: tema.mint, false: tema.line }} accessibilityLabel="Compartir uso anónimo" />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
