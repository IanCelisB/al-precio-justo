/** Ventana "¿Cómo calculamos el valor?": la fórmula del valor estimado con los números de la empresa. */
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Trimestre, Valoracion } from "@ancla/valoracion";
import { dinero, porcentaje } from "@ancla/valoracion/formato";
import { explicarValor, TOPE_CRECIMIENTO } from "@ancla/valoracion/ficha";
import type { Estilos } from "./estilos";
import type { Tema } from "./tema";

export function Formula({ s, tema, visible, cerrar, nombre, trimestres, valoracion, precio }: {
  s: Estilos; tema: Tema; visible: boolean; cerrar: () => void; nombre: string;
  trimestres: Trimestre[]; valoracion: Valoracion | null; precio: number | null;
}) {
  const x = valoracion ? explicarValor(trimestres, valoracion) : null;
  const pct = (v: number) => porcentaje(v, Math.abs(v) < 0.1 ? 1 : 0);
  const Paso = ({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) => (
    <View style={{ flexDirection: "row", gap: 12 }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: tema.acc, alignItems: "center", justifyContent: "center" }}>
        <Text style={[s.uiB, { color: tema.onAcc, fontSize: 13 }]}>{n}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[s.uiB, { fontSize: 15 }]}>{titulo}</Text>
        {children}
      </View>
    </View>
  );
  const T = ({ children }: { children: React.ReactNode }) => <Text style={[s.ui, { fontSize: 14, lineHeight: 20 }]}>{children}</Text>;
  const B = ({ children }: { children: React.ReactNode }) => <Text style={s.uiB}>{children}</Text>;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" transparent={false} onRequestClose={cerrar}>
      <SafeAreaView style={s.pantalla} edges={["top", "bottom"]}>
        <View style={[s.fila, { padding: 16, alignItems: "center" }]}>
          <Text style={[s.hd, { fontSize: 21, flex: 1 }]}>¿Cómo calculamos el valor?</Text>
          <Pressable onPress={cerrar} accessibilityRole="button"><Text style={[s.uiB, { color: tema.link, fontSize: 16 }]}>Cerrar</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 16 }}>
          <Text style={[s.ui, s.muted, { fontSize: 14, lineHeight: 20 }]}>
            Usamos un modelo de flujo de caja descontado: una empresa vale el dinero que generará para sus accionistas,
            traído a hoy. Son supuestos prudentes e iguales para todas; en «Tu modelo» puedes cambiarlos si eres más
            o menos conservador.
          </Text>
          {!x ? (
            <Text style={[s.ui, { fontSize: 14 }]}>Para {nombre} todavía no podemos estimar un valor con este modelo.</Text>
          ) : (
            <>
              <View style={[s.metrica, { gap: 6, backgroundColor: tema.bg2 }]}>
                <Text style={[s.mono, { fontSize: 13, lineHeight: 20 }]}>
                  Valor = Σ (flujo año t ÷ (1 + r)^t) + valor terminal ÷ (1 + r)^5 − deuda neta
                </Text>
                <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>
                  t = 1…5 años · r = rentabilidad exigida · todo por acción
                </Text>
              </View>

              <Paso n={1} titulo="Flujo de caja libre por acción">
                <T>
                  Caja que generan sus operaciones menos lo que invierte en activos,{" "}
                  {x.aniosBase === 3 ? "promedio de los últimos 3 años" : "de los últimos 12 meses"} (para que un año raro no mueva todo):{" "}
                  <B>{dinero(x.fcfPorAccion)}</B> por acción.
                </T>
              </Paso>

              <Paso n={2} titulo="Crecimiento de los próximos 5 años">
                <T>
                  Sale de {x.fuenteCrecimiento}
                  {x.crecimientoHistorico !== null ? <>, que crecieron un <B>{pct(x.crecimientoHistorico)}</B> al año</> : null}.
                  {" "}Usamos <B>{pct(x.crecimiento)}</B>
                  {x.topado === "maximo" ? <>, el máximo del modelo ({pct(TOPE_CRECIMIENTO.max)}): por prudencia no suponemos que un crecimiento muy alto dure 5 años más</> : null}
                  {x.topado === "minimo" ? <>: si sus ventas caen, suponemos que al menos no siguen cayendo</> : null}.
                  {x.recompraNeta !== 0 ? <> Además {x.recompraNeta > 0 ? "recompra" : "emite"} un <B>{pct(Math.abs(x.recompraNeta))}</B> de sus acciones al año,
                    así que el flujo por acción crece un <B>{pct(x.crecimientoPorAccion)}</B>.</> : null}
                </T>
                {x.topado === "maximo" && (
                  <View style={{ borderLeftWidth: 3, borderColor: tema.link, paddingLeft: 10, marginTop: 4 }}>
                    <Text style={[s.ui, s.muted, { fontSize: 13, lineHeight: 18 }]}>
                      Por eso las empresas que crecen muy rápido suelen salir «caras»: el modelo no paga hoy por un crecimiento
                      que todavía no ocurrió. Si crees que seguirá creciendo más, súbelo en «Tu modelo».
                    </Text>
                  </View>
                )}
              </Paso>

              <Paso n={3} titulo={`Rentabilidad exigida: ${pct(x.descuento)} al año`}>
                <T>Lo que un inversor espera ganar al año en bolsa a largo plazo. Cuanto más alta, más prudente es el valor.</T>
                <View style={{ gap: 2, marginTop: 4 }}>
                  {x.flujos.map((f) => (
                    <View key={f.anio} style={{ flexDirection: "row" }}>
                      <Text style={[s.ui, s.muted, { fontSize: 13, width: 60 }]}>Año {f.anio}</Text>
                      <Text style={[s.mono, { fontSize: 13, flex: 1 }]}>{dinero(f.flujo)}</Text>
                      <Text style={[s.mono, s.muted, { fontSize: 13 }]}>hoy vale {dinero(f.presente)}</Text>
                    </View>
                  ))}
                  <Text style={[s.uiB, { fontSize: 13.5, marginTop: 2 }]}>Suma de los 5 años, a hoy: {dinero(x.sumaFlujos)}</Text>
                </View>
              </Paso>

              <Paso n={4} titulo="Valor terminal (después del año 5)">
                <T>
                  Suponemos que después crece un <B>{pct(x.crecimientoTerminal)}</B> al año para siempre (como la economía):
                  vale {dinero(x.valorTerminal)} en el año 5, que hoy son <B>{dinero(x.terminalPresente)}</B>.
                </T>
              </Paso>

              <Paso n={5} titulo="Menos la deuda neta">
                <T>
                  {x.deudaNetaPorAccion >= 0
                    ? <>Restamos su deuda menos su caja: <B>{dinero(x.deudaNetaPorAccion)}</B> por acción.</>
                    : <>Tiene más caja que deuda: sumamos <B>{dinero(-x.deudaNetaPorAccion)}</B> por acción.</>}
                </T>
              </Paso>

              <View style={[s.metrica, { gap: 4, borderColor: tema.mint, borderWidth: 2 }]}>
                <Text style={[s.ui, s.muted, { fontSize: 13 }]}>
                  {dinero(x.sumaFlujos)} + {dinero(x.terminalPresente)} − {dinero(x.deudaNetaPorAccion)} =
                </Text>
                <Text style={[s.hd, { fontSize: 26 }]}>Valor estimado: {dinero(x.valor)}</Text>
                <Text style={[s.ui, { fontSize: 13.5, lineHeight: 19 }]}>
                  Como ningún modelo es exacto, damos un rango de ±15 %: entre <B>{dinero(x.banda.min)}</B> y <B>{dinero(x.banda.max)}</B>.
                  {precio ? <> Por debajo del rango la llamamos barata; por encima, cara. Hoy cotiza a <B>{dinero(precio)}</B>.</> : null}
                </Text>
              </View>
            </>
          )}
          <Text style={[s.ui, s.muted, { fontSize: 11.5 }]}>
            Datos de los reportes presentados a la SEC. Es una estimación educativa, no una recomendación de inversión.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
