/** Precio frente a la banda de valor de cada momento, y "Tu modelo" para cambiar los supuestos. */
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Path } from "react-native-svg";
import { ETIQUETA, estado, supuestosPorDefecto, valorar, type Supuestos, type Trimestre } from "@ancla/valoracion";
import { dinero, porcentaje } from "@ancla/valoracion/formato";
import { ajustar, CLAVE_MODELO, CONTROLES, geometriaValor, historialValor, type Cierre } from "@ancla/valoracion/grafico";
import type { Estilos } from "./estilos";
import type { Tema } from "./tema";

const PERIODOS = [1, 3, 5, 10];

export function GraficoValor({ s, tema, ticker, sector, trimestres, precios, precio }: {
  s: Estilos; tema: Tema; ticker: string; sector: string | null; trimestres: Trimestre[]; precios: Cierre[]; precio: number | null;
}) {
  const [anios, setAnios] = useState(5);
  const [modelo, setModelo] = useState<Partial<Supuestos>>({});
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CLAVE_MODELO(ticker))
      .then((x) => { const m = x ? JSON.parse(x) : {}; setModelo(m); if (Object.keys(m).length) setAbierto(true); })
      .catch(() => {});
  }, [ticker]);
  const cambiar = (m: Partial<Supuestos>) => {
    setModelo(m);
    (Object.keys(m).length ? AsyncStorage.setItem(CLAVE_MODELO(ticker), JSON.stringify(m)) : AsyncStorage.removeItem(CLAVE_MODELO(ticker)))
      .catch(() => {});
  };

  const sec = sector ?? undefined;
  const cierres = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 10);
    return precio && precios.at(-1)?.fecha !== hoy ? [...precios, { fecha: hoy, cierre: precio }] : precios;
  }, [precios, precio]);
  const historial = useMemo(() => historialValor(trimestres, cierres, { sector: sec, supuestos: modelo }), [trimestres, cierres, sec, modelo]);
  const desde = useMemo(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - anios); return d.toISOString().slice(0, 10);
  }, [anios]);
  const g = useMemo(() => geometriaValor(cierres, historial, desde), [cierres, historial, desde]);
  const base = useMemo(() => supuestosPorDefecto(trimestres, precio ?? undefined), [trimestres, precio]);
  const ahora = useMemo(() => valorar(trimestres, { precio: precio ?? undefined, sector: sec, supuestos: modelo }), [trimestres, precio, sec, modelo]);
  const propio = Object.keys(modelo).length > 0;
  const disponibles = Math.ceil((Date.now() - Date.parse(cierres[0]?.fecha ?? "")) / (365.25 * 86_400_000));

  if (!g) return null;
  const t = g.tiempo;
  const colorEstado = (e: "barata" | "rango" | "cara") => ({ barata: tema.good, rango: tema.fg, cara: tema.down })[e];

  return (
    <View style={[s.metrica, { gap: 10 }]}>
      <Text style={[s.hd, { fontSize: 18 }]}>Precio frente a su valor</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {PERIODOS.filter((a) => a === 1 || a <= disponibles).map((a) => {
          const on = anios === a;
          return (
            <Pressable key={a} onPress={() => setAnios(a)} style={[s.chip, on && s.chipOn, { paddingHorizontal: 11, paddingVertical: 5 }]}
              accessibilityRole="button" accessibilityState={{ selected: on }}>
              <Text style={[s.uiB, { fontSize: 12.5, color: on ? tema.onAcc : tema.fg }]}>{a} {a === 1 ? "año" : "años"}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ height: 210, marginRight: 6 }}
        accessible accessibilityLabel={`Precio de ${ticker} y su banda de valor en ${anios} ${anios === 1 ? "año" : "años"}`}>
        {g.marcasY.map((m) => (
          <View key={m.texto} style={{ position: "absolute", left: 0, right: 0, top: `${m.pos}%`, borderTopWidth: 1, borderColor: tema.line, borderStyle: "dashed" }}>
            <Text style={[s.mono, s.muted, { position: "absolute", top: -15, fontSize: 10, backgroundColor: tema.card, paddingRight: 4 }]}>{m.texto}</Text>
          </View>
        ))}
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute" }}>
          {g.bandas.map((d, i) => <Path key={`b${i}`} d={d} fill={tema.band} opacity={0.9} />)}
          {g.centro.map((d, i) => (
            <Path key={`c${i}`} d={d} fill="none" stroke={tema.good} strokeWidth={1} strokeDasharray="3 3" opacity={0.7} vectorEffect="non-scaling-stroke" />
          ))}
          <Path d={g.precio} fill="none" stroke={tema.fg} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </Svg>
        {g.fin && (
          <View style={{ position: "absolute", left: `${g.fin.x}%`, top: `${g.fin.y}%`, width: 10, height: 10, marginLeft: -5, marginTop: -5,
            borderRadius: 5, backgroundColor: tema.fg, borderWidth: 2, borderColor: tema.card }} />
        )}
      </View>
      <View style={{ height: 14 }}>
        {g.marcasX.map((m) => (
          <Text key={m.texto} style={[s.mono, s.muted, { position: "absolute", left: `${m.pos}%`, width: 40, marginLeft: -20, textAlign: "center", fontSize: 10 }]}>
            {m.texto}
          </Text>
        ))}
      </View>

      <View style={{ flexDirection: "row", gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 16, borderTopWidth: 2, borderColor: tema.fg }} />
          <Text style={[s.ui, s.muted, { fontSize: 12 }]}>Precio</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 16, height: 10, borderRadius: 3, backgroundColor: tema.band }} />
          <Text style={[s.ui, s.muted, { fontSize: 12 }]}>Rango de valor{propio ? " (tu modelo)" : ""}</Text>
        </View>
      </View>
      {t && (
        <Text style={[s.ui, s.muted, { fontSize: 12.5, lineHeight: 18 }]}>
          {g.cobertura < 0.9 ? "Desde que podemos estimar su valor" : anios === 1 ? "En el último año" : `En los últimos ${anios} años`} estuvo{" "}
          <Text style={[s.uiB, { color: tema.good }]}>barata</Text> el {porcentaje(t.barata, 0)} del tiempo,{" "}
          <Text style={[s.uiB, s.cFg]}>justa</Text> el {porcentaje(t.rango, 0)} y{" "}
          <Text style={[s.uiB, { color: tema.down }]}>cara</Text> el {porcentaje(t.cara, 0)}. Cada escalón es un reporte nuevo:
          el valor solo usa lo que se sabía en ese momento.
        </Text>
      )}

      {sector !== "Financials" && (
        <View style={{ borderTopWidth: 1, borderColor: tema.line, paddingTop: 10, gap: 12 }}>
          <Pressable onPress={() => setAbierto(!abierto)} accessibilityRole="button" accessibilityState={{ expanded: abierto }}
            style={[s.fila, { alignItems: "center" }]}>
            <Text style={[s.ui, { fontSize: 13, flex: 1 }]}>
              <Text style={[s.hd, { fontSize: 16 }]}>Tu modelo</Text>
              {ahora.ok && precio ? (
                <Text style={s.muted}> · {dinero(ahora.valor)} · <Text style={[s.uiB, { color: colorEstado(estado(precio, ahora.valor)) }]}>
                  {ETIQUETA[estado(precio, ahora.valor)]}</Text></Text>
              ) : null}
            </Text>
            <Text style={[s.uiB, { fontSize: 22, color: tema.link, width: 24, textAlign: "center" }]}>{abierto ? "−" : "+"}</Text>
          </Pressable>
          {abierto && (
            <>
              <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>Cambia los supuestos y mira cómo se mueve la banda. Se guarda en este dispositivo.</Text>
              {CONTROLES.map((c) => {
                const v = modelo[c.id] ?? base[c.id];
                const mover = (dir: number) => cambiar({ ...modelo, [c.id]: ajustar(c.id, v + dir * c.paso) });
                const boton = (dir: number, signo: string, tope: boolean) => (
                  <Pressable onPress={() => mover(dir)} disabled={tope} accessibilityRole="button"
                    accessibilityLabel={`${dir > 0 ? "Subir" : "Bajar"} ${c.nombre.toLowerCase()}`}
                    style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: tema.line, alignItems: "center", justifyContent: "center",
                      opacity: tope ? 0.4 : 1 }}>
                    <Text style={[s.uiB, { fontSize: 20, color: tema.link }]}>{signo}</Text>
                  </Pressable>
                );
                return (
                  <View key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.uiB, { fontSize: 14 }]}>{c.nombre}</Text>
                      <Text style={[s.ui, s.muted, { fontSize: 11.5 }]}>{c.ayuda}</Text>
                    </View>
                    {boton(-1, "−", v <= c.min)}
                    <Text style={[s.mono, { fontSize: 14, width: 62, textAlign: "center" }]}>{porcentaje(v, c.paso < 0.005 ? 2 : 1)}</Text>
                    {boton(1, "+", v >= c.max)}
                  </View>
                );
              })}
              {!ahora.ok && <Text style={[s.ui, { fontSize: 12.5, color: tema.down }]}>{ahora.motivo}</Text>}
              {propio && (
                <Pressable onPress={() => cambiar({})} accessibilityRole="button" style={{ alignSelf: "flex-start" }}>
                  <Text style={[s.uiB, s.enlace, { fontSize: 14 }]}>Volver al modelo de Ancla</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}
