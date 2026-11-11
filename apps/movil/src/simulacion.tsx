/** Piezas del simulador en el móvil: gráfico comparado, máquina del tiempo y panel de compra. */
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { dineroUsd, dineroConSigno, leerMonto, MONTO_MAXIMO, nombreCorto, porcentajeConSigno, tono } from "@ancla/valoracion/formato";
import { fechaEje, textoEje } from "@ancla/valoracion/ejes";
import { api, type PosicionSim, type Resumen, type Tiempo } from "./api";
import { Grafico } from "./Grafico";
import type { Estilos } from "./estilos";
import { useSesion } from "./sesion";
import type { Tema } from "./tema";

export const colorTono = (tema: Tema, x: number | null | undefined) =>
  ({ sube: tema.good, baja: tema.down, "": tema.fg } as const)[tono(x)];

/** Dos líneas con ejes y cursor: la inversión (menta) y la referencia (gris punteado). */
export function Comparado({ s, tema, valores, referencia, fechas, alto = 190, etiquetas }: {
  s: Estilos; tema: Tema; valores: number[]; referencia: (number | null)[]; fechas: string[]; alto?: number; etiquetas?: [string, string];
}) {
  const hayRef = referencia.some((v) => v !== null);
  return (
    <View style={{ gap: 6 }}>
      <Grafico s={s} tema={tema} alto={alto} xs={fechas.map((f) => Date.parse(f.slice(0, 10) + "T00:00:00Z"))}
        etiquetas={fechas.map((f) => fechaEje(f))} descripcion={`${etiquetas?.[0] ?? "Tu inversión"} en el tiempo`}
        series={[
          ...(hayRef ? [{ id: "ref", nombre: etiquetas?.[1] ?? "S&P 500", color: tema.muted, valores: referencia, punteada: true, grosor: 1.5 }] : []),
          { id: "mia", nombre: etiquetas?.[0] ?? "Tu inversión", color: tema.mint, valores, grosor: 2.5 },
        ]}
        formatoEje={(v, paso) => textoEje(v, paso, "$")} formatoValor={(v) => dineroUsd(v, 0)} />
      <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap" }}>
        {[[etiquetas?.[0] ?? "Tu inversión", tema.mint, false], ...(hayRef ? [[etiquetas?.[1] ?? "S&P 500", tema.muted, true]] : [])].map(([t, c, punteada]) => (
          <View key={t as string} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 16, borderTopWidth: punteada ? 1.5 : 2.5, borderColor: c as string, borderStyle: punteada ? "dashed" : "solid" }} />
            <Text style={[s.ui, s.muted, { fontSize: 12 }]}>{t as string}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Buscador corto para elegir otra empresa con la que comparar. */
function ElegirEmpresa({ s, tema, excluir, elegir, cancelar }: {
  s: Estilos; tema: Tema; excluir: string; elegir: (t: { ticker: string; nombre: string }) => void; cancelar: () => void;
}) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Resumen[]>([]);
  useEffect(() => {
    if (!q.trim()) { setRes([]); return; }
    let vigente = true;
    const id = setTimeout(() => api.buscar({ q: q.trim(), limite: 6 }).then((r) => { if (vigente) setRes(r.resultados.filter((x) => x.ticker !== excluir)); }).catch(() => {}), 180);
    return () => { vigente = false; clearTimeout(id); };
  }, [q]);
  return (
    <View style={{ gap: 6 }}>
      <View style={[s.buscador, { paddingVertical: 6 }]}>
        <TextInput value={q} onChangeText={setQ} placeholder="Compara con… (ticker o nombre)" placeholderTextColor={tema.muted}
          style={s.entrada} autoFocus autoCorrect={false} autoCapitalize="none" accessibilityLabel="Empresa para comparar" />
        <Pressable onPress={cancelar} accessibilityRole="button"><Text style={[s.uiB, s.muted, { fontSize: 13 }]}>Cancelar</Text></Pressable>
      </View>
      {res.map((r) => (
        <Pressable key={r.ticker} onPress={() => elegir({ ticker: r.ticker, nombre: nombreCorto(r.nombre) })} accessibilityRole="button"
          style={({ pressed }) => [{ paddingVertical: 8, paddingHorizontal: 4 }, pressed && { opacity: 0.6 }]}>
          <Text style={[s.ui, { fontSize: 14 }]}><Text style={s.uiB}>{r.ticker}</Text> · {r.nombre}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const PERIODOS = [1, 3, 5, 10];
const IMPORTES = [100, 1000, 10000];

/** "Si hubieras invertido X hace N años", con precios reales; opcionalmente frente a otra empresa que elijas. */
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
  const [contra, setContra] = useState<{ ticker: string; nombre: string } | null>(null);
  const [eligiendo, setEligiendo] = useState(false);

  useEffect(() => {
    let vigente = true;
    const d = new Date();
    d.setFullYear(d.getFullYear() - anios);
    api.tiempo(ticker, importe, d.toISOString().slice(0, 10), contra?.ticker)
      .then((x) => { if (vigente) { setR(x); setError(false); } })
      .catch(() => { if (vigente) setError(true); });
    return () => { vigente = false; };
  }, [ticker, anios, importe, contra?.ticker]);

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
      {eligiendo ? (
        <ElegirEmpresa s={s} tema={tema} excluir={ticker} cancelar={() => setEligiendo(false)}
          elegir={(x) => { setContra(x); setEligiendo(false); }} />
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {contra ? (
            <>
              <Text style={[s.ui, s.muted, { fontSize: 13 }]}>Comparando con <Text style={[s.uiB, s.cFg]}>{contra.nombre}</Text></Text>
              <Pressable onPress={() => setEligiendo(true)} accessibilityRole="button"><Text style={[s.uiB, s.enlace, { fontSize: 13 }]}>Cambiar</Text></Pressable>
              <Pressable onPress={() => setContra(null)} accessibilityRole="button"><Text style={[s.uiB, s.muted, { fontSize: 13 }]}>Quitar</Text></Pressable>
            </>
          ) : (
            <Pressable onPress={() => setEligiendo(true)} style={s.agregar} accessibilityRole="button">
              <Text style={[s.uiB, { color: tema.link, fontSize: 13.5 }]}>+ Comparar con otra empresa</Text>
            </Pressable>
          )}
        </View>
      )}
      {error && <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>No tenemos precios de tanto tiempo para esta empresa.</Text>}
      {r && !error && (
        <>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={[s.ui, s.muted, { fontSize: 11.5 }]}>Hoy tendrías</Text>
              <Text style={[s.hd, { fontSize: 24, color: colorTono(tema, r.ganancia) }]}>{dineroUsd(r.valorHoy, 0)}</Text>
              <Text style={[s.uiB, { fontSize: 13, color: colorTono(tema, r.ganancia) }]}>{pct(r.gananciaPct)}</Text>
            </View>
            {r.referenciaHoy !== null && contra && (
              <View style={{ flex: 1 }}>
                <Text style={[s.ui, s.muted, { fontSize: 11.5 }]} numberOfLines={1}>En {contra.nombre}</Text>
                <Text style={[s.hd, { fontSize: 24 }]}>{dineroUsd(r.referenciaHoy, 0)}</Text>
                <Text style={[s.uiB, s.muted, { fontSize: 13 }]}>{pct(r.referenciaHoy / importe - 1)}</Text>
              </View>
            )}
          </View>
          <Comparado s={s} tema={tema} valores={r.serie.map((p) => p.valor)} fechas={r.serie.map((p) => p.fecha)}
            referencia={contra ? r.serie.map((p) => p.referencia) : r.serie.map(() => null)} etiquetas={[nombre, contra?.nombre ?? ""]} />
          <Text style={[s.ui, s.muted, { fontSize: 11.5 }]}>
            {contra && r.referenciaHoy !== null && (r.valorHoy >= r.referenciaHoy ? `${nombre} le ganó a ${contra.nombre} en este periodo. ` : `${contra.nombre} le ganó a ${nombre} en este periodo. `)}
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
