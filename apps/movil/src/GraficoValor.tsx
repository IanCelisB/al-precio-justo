/** Precio frente a la banda de valor de cada momento, y "Tu modelo" para cambiar los supuestos. */
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ETIQUETA, estado, supuestosPorDefecto, valorar, type Supuestos, type Trimestre } from "@ancla/valoracion";
import { dinero, divisaActual, porcentaje } from "@ancla/valoracion/formato";
import { ajustar, CLAVE_MODELO, CONTROLES, geometriaValor, historialValor, valorEn, type Cierre } from "@ancla/valoracion/grafico";
import { fechaEje, textoEje } from "@ancla/valoracion/ejes";
import { historialPer, mediana } from "@ancla/valoracion/ficha";
import type { Estilos } from "./estilos";
import type { Tema } from "./tema";
import { Grafico } from "./Grafico";

const PERIODOS = [1, 3, 5, 10];

/** Etiquetas del eje en la divisa elegida: "$200", "CLP$150.000"… */
export const ejeDinero = (v: number, paso: number) => {
  const d = divisaActual();
  return textoEje(v * d.porUsd, paso * d.porUsd, d.simbolo);
};

const desdeHace = (anios: number) => { const d = new Date(); d.setFullYear(d.getFullYear() - anios); return d.toISOString().slice(0, 10); };

function Periodos({ s, tema, anios, setAnios, disponibles }: {
  s: Estilos; tema: Tema; anios: number; setAnios: (a: number) => void; disponibles: number;
}) {
  return (
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
  );
}

/** PER semana a semana: cuántos años de beneficios pagas al precio de cada momento, y su mediana. */
export function GraficoPer({ s, tema, ticker, trimestres, precios, precio }: {
  s: Estilos; tema: Tema; ticker: string; trimestres: Trimestre[]; precios: Cierre[]; precio: number | null;
}) {
  const [anios, setAnios] = useState(5);
  const cierres = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 10);
    return precio && precios.at(-1)?.fecha !== hoy ? [...precios, { fecha: hoy, cierre: precio }] : precios;
  }, [precios, precio]);
  const todo = useMemo(() => historialPer(trimestres, cierres), [trimestres, cierres]);
  const desde = desdeHace(anios);
  const puntos = todo.filter((p) => p.fecha >= desde);
  if (puntos.filter((p) => p.per !== null).length < 4) return null;
  const actual = puntos.at(-1)?.per ?? null;
  const med = mediana(puntos.map((p) => p.per));
  // PER por encima de 150 (beneficios casi nulos) aplasta el gráfico: el eje se corta ahí.
  const techo = Math.min(150, Math.max(...puntos.map((p) => p.per ?? 0)));
  const disponibles = Math.ceil((Date.now() - Date.parse(cierres[0]?.fecha ?? "")) / (365.25 * 86_400_000));
  const veces = (v: number) => `${v.toLocaleString("es", { maximumFractionDigits: 1 })}x`;
  return (
    <View style={[s.metrica, { gap: 10 }]}>
      <View style={[s.fila, { alignItems: "center" }]}>
        <Text style={[s.hd, { fontSize: 18 }]}>PER histórico</Text>
        <Text style={[s.ui, s.muted, { fontSize: 11.5 }]}>precio / beneficio de 12 meses</Text>
      </View>
      <Periodos s={s} tema={tema} anios={anios} setAnios={setAnios} disponibles={disponibles} />
      <Grafico s={s} tema={tema} xs={puntos.map((p) => Date.parse(p.fecha + "T00:00:00Z"))} etiquetas={puntos.map((p) => fechaEje(p.fecha))}
        techo={techo} alto={200} desdeCero descripcion={`PER de ${ticker} en ${anios} ${anios === 1 ? "año" : "años"}`}
        series={[
          { id: "per", nombre: "PER", color: tema.link, valores: puntos.map((p) => (p.per === null ? null : Math.min(p.per, techo))), area: true },
          ...(med !== null ? [{ id: "mediana", nombre: "Mediana", color: tema.muted, valores: puntos.map(() => med), punteada: true, grosor: 1.25, sinCursor: true }] : []),
        ]}
        formatoEje={(v) => `${Math.round(v)}x`} formatoValor={veces} />
      <Text style={[s.ui, s.muted, { fontSize: 12.5, lineHeight: 18 }]}>
        {actual !== null ? <>Hoy pagas <Text style={[s.uiB, s.cFg]}>{veces(actual)}</Text> sus beneficios de 12 meses</> : "Hoy tiene pérdidas: el PER no aplica"}
        {med !== null ? <>; su mediana en {anios === 1 ? "el último año" : `${anios} años`} es <Text style={[s.uiB, s.cFg]}>{veces(med)}</Text>.</> : "."}
        {" "}Un PER bajo su mediana puede indicar que está barata frente a su propia historia (si sus beneficios no se están deteriorando).
      </Text>
    </View>
  );
}

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
  const datos = useMemo(() => {
    const cs = cierres.filter((c) => c.fecha >= desde && c.cierre > 0);
    const v = cs.map((c) => valorEn(historial, c.fecha));
    return {
      xs: cs.map((c) => Date.parse(c.fecha.slice(0, 10) + "T00:00:00Z")),
      etiquetas: cs.map((c) => fechaEje(c.fecha)),
      precio: cs.map((c) => c.cierre),
      valor: v.map((p) => p?.valor ?? null),
      min: v.map((p) => p?.min ?? null),
      max: v.map((p) => p?.max ?? null),
      // Si el valor se dispara (un año de caja extraordinaria), el eje se corta para que el precio se lea.
      techo: Math.max(...cs.map((c) => c.cierre)) * 2.5,
    };
  }, [cierres, historial, desde]);
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
      <Periodos s={s} tema={tema} anios={anios} setAnios={setAnios} disponibles={disponibles} />

      <Grafico s={s} tema={tema} xs={datos.xs} etiquetas={datos.etiquetas} techo={datos.techo} alto={250}
        descripcion={`Precio de ${ticker} y su rango de valor en ${anios} ${anios === 1 ? "año" : "años"}. Pasa el dedo o el ratón para ver cada fecha.`}
        series={[
          { id: "valor", nombre: "Valor estimado", color: tema.good, valores: datos.valor, punteada: true, grosor: 1.25 },
          { id: "precio", nombre: "Precio", color: tema.fg, valores: datos.precio, grosor: 2 },
        ]}
        banda={{ nombre: `Rango${propio ? " (tu modelo)" : ""}`, color: tema.band, min: datos.min, max: datos.max }}
        formatoEje={ejeDinero} formatoValor={(v) => dinero(v)} />

      <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 16, borderTopWidth: 2, borderColor: tema.fg }} />
          <Text style={[s.ui, s.muted, { fontSize: 12 }]}>Precio</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 16, borderTopWidth: 1.5, borderColor: tema.good, borderStyle: "dashed" }} />
          <Text style={[s.ui, s.muted, { fontSize: 12 }]}>Valor estimado</Text>
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
                  <Text style={[s.uiB, s.enlace, { fontSize: 14 }]}>Volver al modelo por defecto</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}
