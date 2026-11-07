/** Piezas del simulador en el móvil: gráfico comparado, máquina del tiempo y panel de compra. */
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { dineroUsd, dineroConSigno, leerMonto, MONTO_MAXIMO, porcentajeConSigno, tono } from "@ancla/valoracion/formato";
import { trazosComparados } from "@ancla/valoracion/simulador";
import { api, type PosicionSim, type Tiempo } from "./api";
import type { Estilos } from "./estilos";
import { useSesion } from "./sesion";
import type { Tema } from "./tema";

export const colorTono = (tema: Tema, x: number | null | undefined) =>
  ({ sube: tema.good, baja: tema.down, "": tema.fg } as const)[tono(x)];

/** Dos líneas sobre la misma escala: la inversión (menta) y el S&P 500 (gris punteado). */
export function Comparado({ s, tema, valores, referencia, alto = 110, etiquetas }: {
  s: Estilos; tema: Tema; valores: number[]; referencia: (number | null)[]; alto?: number; etiquetas?: [string, string];
}) {
  const [mia, sp] = trazosComparados([valores, referencia]);
  return (
    <View>
      <View style={{ height: alto, position: "relative" }}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute" }}>
          {sp.d ? <Path d={sp.d} fill="none" stroke={tema.muted} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7}
            vectorEffect="non-scaling-stroke" /> : null}
          {mia.d ? <Path d={mia.d} fill="none" stroke={tema.mint} strokeWidth={2.5} strokeLinejoin="round"
            vectorEffect="non-scaling-stroke" /> : null}
        </Svg>
        {mia.fin && (
          <View style={{ position: "absolute", left: `${mia.fin.x}%`, top: `${mia.fin.y}%`, width: 10, height: 10,
            marginLeft: -5, marginTop: -5, borderRadius: 5, backgroundColor: tema.mint }} />
        )}
      </View>
      <View style={{ flexDirection: "row", gap: 14, marginTop: 6 }}>
        {[[etiquetas?.[0] ?? "Tu inversión", tema.mint, false], [etiquetas?.[1] ?? "S&P 500", tema.muted, true]].map(([t, c, punteada]) => (
          <View key={t as string} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 16, borderTopWidth: punteada ? 1.5 : 2.5, borderColor: c as string, borderStyle: punteada ? "dashed" : "solid" }} />
            <Text style={[s.ui, s.muted, { fontSize: 12 }]}>{t as string}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const PERIODOS = [1, 3, 5, 10];
const IMPORTES = [100, 1000, 10000];

/** "Si hubieras invertido X hace N años", con precios reales frente al S&P 500. */
export function MaquinaTiempo({ s, tema, ticker, nombre }: { s: Estilos; tema: Tema; ticker: string; nombre: string }) {
  const [anios, setAnios] = useState(1);
  const [texto, setTexto] = useState("1000");
  const [importe, setImporte] = useState(1000);
  const monto = leerMonto(texto);
  const montoMalo = monto === null || monto > MONTO_MAXIMO;
  useEffect(() => {
    if (montoMalo || monto === importe) return;
    const id = setTimeout(() => setImporte(monto!), 400);
    return () => clearTimeout(id);
  }, [monto, montoMalo, importe]);
  const [r, setR] = useState<Tiempo | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vigente = true;
    const d = new Date();
    d.setFullYear(d.getFullYear() - anios);
    api.tiempo(ticker, importe, d.toISOString().slice(0, 10))
      .then((x) => { if (vigente) { setR(x); setError(false); } })
      .catch(() => { if (vigente) setError(true); });
    return () => { vigente = false; };
  }, [ticker, anios, importe]);

  const pct = (x: number) => porcentajeConSigno(x, Math.abs(x) >= 10 ? 0 : 1);
  const chip = (on: boolean, texto: string, onPress: () => void) => (
    <Pressable key={texto} onPress={onPress} style={[s.chip, on && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[s.uiB, { fontSize: 13, color: on ? tema.onAcc : tema.fg }]}>{texto}</Text>
    </Pressable>
  );

  return (
    <View style={[s.metrica, { gap: 10 }]}>
      <View style={[s.fila, { alignItems: "center" }]}>
        <Text style={[s.hd, { fontSize: 18 }]}>Máquina del tiempo</Text>
        <Text style={[s.ui, s.muted, { fontSize: 11.5 }]}>Precios reales</Text>
      </View>
      <Text style={[s.ui, { fontSize: 14.5 }]}>Si hubieras invertido… en {nombre}</Text>
      <View style={[s.buscador, { paddingVertical: 6 }, montoMalo && { borderColor: tema.down }]}>
        <Text style={[s.hd, s.muted, { fontSize: 22 }]}>$</Text>
        <TextInput value={texto} onChangeText={setTexto} keyboardType="decimal-pad" style={[s.entrada, s.hd, { fontSize: 24 }]}
          accessibilityLabel="Monto a invertir en USD" />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {IMPORTES.map((i) => chip(monto === i, dineroUsd(i, 0), () => setTexto(String(i))))}
      </View>
      {montoMalo && (
        <Text style={[s.ui, { fontSize: 12.5, color: tema.down }]}>Escribe un monto entre $1 y {dineroUsd(MONTO_MAXIMO, 0)}.</Text>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {PERIODOS.map((a) => chip(anios === a, `hace ${a} ${a === 1 ? "año" : "años"}`, () => setAnios(a)))}
      </View>
      {error && <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>No tenemos precios de tanto tiempo para esta empresa.</Text>}
      {r && !error && (
        <>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={[s.ui, s.muted, { fontSize: 11.5 }]}>Hoy tendrías</Text>
              <Text style={[s.hd, { fontSize: 24, color: colorTono(tema, r.ganancia) }]}>{dineroUsd(r.valorHoy, 0)}</Text>
              <Text style={[s.uiB, { fontSize: 13, color: colorTono(tema, r.ganancia) }]}>{pct(r.gananciaPct)}</Text>
            </View>
            {r.referenciaHoy !== null && (
              <View style={{ flex: 1 }}>
                <Text style={[s.ui, s.muted, { fontSize: 11.5 }]}>En el S&P 500</Text>
                <Text style={[s.hd, { fontSize: 24 }]}>{dineroUsd(r.referenciaHoy, 0)}</Text>
                <Text style={[s.uiB, s.muted, { fontSize: 13 }]}>{pct(r.referenciaHoy / importe - 1)}</Text>
              </View>
            )}
          </View>
          <Comparado s={s} tema={tema} valores={r.serie.map((p) => p.valor)} referencia={r.serie.map((p) => p.referencia)}
            etiquetas={[nombre, "S&P 500"]} />
          <Text style={[s.ui, s.muted, { fontSize: 11.5 }]}>
            {r.referenciaHoy !== null && (r.valorHoy >= r.referenciaHoy ? `${nombre} le ganó al S&P 500 en este periodo. ` : `El S&P 500 le ganó a ${nombre} en este periodo. `)}
            Los resultados pasados no garantizan resultados futuros.
          </Text>
        </>
      )}
    </View>
  );
}

const RAPIDOS = [500, 1000, 5000];

/** Comprar o vender con dinero ficticio desde la ficha. */
export function PanelSimular({ s, tema, ticker, nombre, precio, irAPerfil }: {
  s: Estilos; tema: Tema; ticker: string; nombre: string; precio: number | null; irAPerfil?: () => void;
}) {
  const { token, yo } = useSesion();
  const [importe, setImporte] = useState("1000");
  const [efectivo, setEfectivo] = useState<number | null>(null);
  const [posicion, setPosicion] = useState<PosicionSim | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const aplicar = (c: { efectivo: number; posiciones: PosicionSim[] }) => {
    setEfectivo(c.efectivo);
    setPosicion(c.posiciones.find((p) => p.ticker === ticker) ?? null);
  };
  useEffect(() => { if (token) api.simulador(token).then(aplicar).catch(() => {}); }, [token, ticker]);

  const caja = (hijos: React.ReactNode) => (
    <View style={[s.metrica, { gap: 10 }]}>
      <View style={[s.fila, { alignItems: "center" }]}>
        <Text style={[s.hd, { fontSize: 18 }]}>Simula una compra</Text>
        <View style={[s.pildora, { backgroundColor: tema.band }]}><Text style={[s.uiB, s.cFg, { fontSize: 11 }]}>Dinero ficticio</Text></View>
      </View>
      {hijos}
    </View>
  );

  if (!yo || !token) {
    return caja(
      <Text style={[s.ui, s.muted, { fontSize: 13.5 }]}>
        Tienes 30.000 USD ficticios para probar tus ideas con precios reales. Inicia sesión en Perfil para empezar.
      </Text>,
    );
  }

  const n = leerMonto(importe) ?? 0;
  const operar = async (f: () => Promise<{ operacion: { acciones: number; importe: number }; cartera: any }>, verbo: string) => {
    setOcupado(true); setMensaje(null);
    try {
      const r = await f();
      aplicar(r.cartera);
      setMensaje({ ok: true, texto: `${verbo} ${r.operacion.acciones.toLocaleString("es", { maximumFractionDigits: 4 })} acciones por ${dineroUsd(r.operacion.importe)}.` });
    } catch (e) {
      setMensaje({ ok: false, texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  };

  return caja(
    <>
      {posicion && (
        <View style={{ flexDirection: "row", backgroundColor: tema.bg, borderRadius: 14, padding: 10 }}>
          {[["Tienes", `${posicion.acciones.toLocaleString("es", { maximumFractionDigits: 4 })} acc.`, tema.fg],
            ["Valen", posicion.valor !== null ? dineroUsd(posicion.valor) : "—", tema.fg],
            ["Resultado", posicion.ganancia !== null ? dineroConSigno(posicion.ganancia) : "—", colorTono(tema, posicion.ganancia)]]
            .map(([k, v, c]) => (
              <View key={k} style={{ flex: 1 }}>
                <Text style={[s.ui, s.muted, { fontSize: 11 }]}>{k}</Text>
                <Text style={[s.mono, { fontSize: 13, color: c }]}>{v}</Text>
              </View>
            ))}
        </View>
      )}
      <View style={[s.buscador, { paddingVertical: 6 }]}>
        <Text style={[s.hd, s.muted, { fontSize: 22 }]}>$</Text>
        <TextInput value={importe} onChangeText={setImporte} keyboardType="decimal-pad" style={[s.entrada, s.hd, { fontSize: 24 }]}
          accessibilityLabel="Importe a invertir en USD" />
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {RAPIDOS.map((x) => (
          <Pressable key={x} style={s.chip} onPress={() => setImporte(String(x))} accessibilityRole="button">
            <Text style={[s.uiB, { fontSize: 13 }]}>{dineroUsd(x, 0)}</Text>
          </Pressable>
        ))}
        {efectivo !== null && efectivo >= 1 && (
          <Pressable style={s.chip} onPress={() => setImporte(String(Math.floor(efectivo * 100) / 100))} accessibilityRole="button">
            <Text style={[s.uiB, { fontSize: 13 }]}>Todo</Text>
          </Pressable>
        )}
      </View>
      <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>
        {precio && n > 0 ? `≈ ${(n / precio).toLocaleString("es", { maximumFractionDigits: 4 })} acciones a ${dineroUsd(precio)}. ` : ""}
        Disponible: {efectivo !== null ? dineroUsd(efectivo) : "—"}.
      </Text>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <Pressable style={[s.boton, (ocupado || !(n > 0)) && { opacity: 0.5 }]} disabled={ocupado || !(n > 0)}
          onPress={() => operar(() => api.comprar(token, ticker, n), "Compraste")} accessibilityRole="button">
          <Text style={[s.uiB, { color: tema.onAcc }]}>Comprar {nombre}</Text>
        </Pressable>
        {posicion && (
          <Pressable style={s.agregar} disabled={ocupado} onPress={() => operar(() => api.vender(token, ticker), "Vendiste")}
            accessibilityRole="button">
            <Text style={[s.uiB, { color: tema.link }]}>Vender todo</Text>
          </Pressable>
        )}
      </View>
      {mensaje && <Text style={[s.ui, { fontSize: 13.5, color: mensaje.ok ? tema.good : tema.down }]}>{mensaje.texto}</Text>}
    </>,
  );
}
