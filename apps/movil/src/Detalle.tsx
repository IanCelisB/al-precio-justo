import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Line, Path } from "react-native-svg";
import { diferencia, ETIQUETA, pagasPorCadaDolar } from "@ancla/valoracion";
import { tono } from "@ancla/valoracion/portada";
import { FondoTono } from "./Portada";
import { Ilustracion } from "./Ilustracion";
import { fuentes } from "./tema";
import { dinero, fechaCorta, nombreCorto, porcentaje, porcentajeConSigno } from "@ancla/valoracion/formato";
import {
  ADICIONALES, CLAVE_GUARDADO, CLAVE_PERIODO, EXTRA_POR_DEFECTO, PERIODO_POR_DEFECTO, PERIODOS_METRICAS, PRINCIPALES,
  geometriaLinea, mostrar, porId, serieMetrica, type Contexto, type Metrica, type PeriodoMetricas, type PuntoMetrica,
} from "@ancla/valoracion/metricas";
import { sectorDe } from "@ancla/valoracion/sectores";
import { TIPOS } from "@ancla/valoracion/recomendaciones";
import { api, type Ficha, type Resumen } from "./api";
import type { Estilos } from "./estilos";
import { Logo } from "./componentes";
import { MaquinaTiempo, PanelSimular } from "./simulacion";
import { GraficoValor } from "./GraficoValor";
import { SobreEmpresa } from "./SobreEmpresa";
import { useSesion } from "./sesion";
import { useConfig } from "./config";
import { Rejilla } from "./componentes";
import type { Tema } from "./tema";

/** Montos largos (p. ej. en pesos chilenos) en letra más chica para que quepan en la caja. */
const tamano = (x: number | null) => { const n = x ? dinero(x).length : 0; return n > 12 ? 18 : n > 9 ? 22 : 26; };

const FRASE = { cara: "Está cara.", barata: "Está barata.", rango: "Está dentro de su rango." } as const;

/** Ficha de empresa: precio frente a valor, las 7 métricas clave y las que el usuario añada. */
export function Detalle({ ticker, s, tema, volver, abrir }: {
  ticker: string; s: Estilos; tema: Tema; volver: () => void; abrir: (t: string) => void;
}) {
  const { registrarVista } = useConfig();
  const [tambien, setTambien] = useState<Resumen[]>([]);
  useEffect(() => {
    registrarVista(ticker);
    api.tambien(ticker).then((x) => setTambien(x.map((t) => t.empresa))).catch(() => setTambien([]));
  }, [ticker]);
  const [f, setF] = useState<Ficha | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extra, setExtra] = useState<string[]>(EXTRA_POR_DEFECTO);
  const [selector, setSelector] = useState(false);
  const sesion = useSesion();
  const seguida = !!sesion.yo?.seguidas.includes(ticker);

  useEffect(() => {
    api.ficha(ticker).then(setF).catch(() => setError("No pudimos cargar esta empresa."));
  }, [ticker]);

  useEffect(() => {
    if (sesion.yo) { setExtra(sesion.yo.metricasExtra.filter((id) => porId(id))); return; }
    AsyncStorage.getItem(CLAVE_GUARDADO)
      .then((g) => {
        const ids = g ? JSON.parse(g) : null;
        if (Array.isArray(ids)) setExtra(ids.filter((id: string) => porId(id)));
      })
      .catch(() => { /* sin almacenamiento: las de por defecto */ });
  }, [sesion.yo?.usuario.id]);

  const alternar = (id: string) => {
    const ids = extra.includes(id) ? extra.filter((x) => x !== id) : [...extra, id];
    setExtra(ids);
    if (sesion.yo) { sesion.guardarMetricas(ids).catch(() => {}); return; }
    AsyncStorage.setItem(CLAVE_GUARDADO, JSON.stringify(ids)).catch(() => {});
  };

  const [anios, setAnios] = useState<PeriodoMetricas>(PERIODO_POR_DEFECTO);
  useEffect(() => {
    AsyncStorage.getItem(CLAVE_PERIODO).then((g) => {
      const n = Number(g);
      if ((PERIODOS_METRICAS as readonly number[]).includes(n)) setAnios(n as PeriodoMetricas);
    }).catch(() => {});
  }, []);
  const elegirPeriodo = (a: PeriodoMetricas) => { setAnios(a); AsyncStorage.setItem(CLAVE_PERIODO, String(a)).catch(() => {}); };

  const sec = sectorDe(f?.sector);
  const ctx: Contexto | null = f ? { trimestres: f.trimestres, precio: f.precio } : null;
  const serieDe = (m: Metrica) => serieMetrica(m, f!.trimestres, anios, { precios: f!.precios, precio: f!.precio });
  const ultimo = f?.trimestres.at(-1);

  return (
    <SafeAreaView style={s.pantalla} edges={["top"]}>
      <ScrollView contentContainerStyle={s.contenido}>
        {error && (
          <>
            <Pressable onPress={volver} accessibilityRole="button"><Text style={[s.uiB, s.enlace, { fontSize: 15 }]}>‹ Volver</Text></Pressable>
            <Text style={[s.ui, { color: tema.down }]}>{error}</Text>
          </>
        )}
        {!f && !error && <ActivityIndicator color={tema.link} style={{ marginTop: 40 }} />}

        {f && ctx && (
          <>
            {/* Cabecera tipo panel: degradado del tono de la empresa, logo, etiquetas y precio */}
            <View style={{ marginHorizontal: -16, marginTop: -16, backgroundColor: tema.bg2, borderBottomLeftRadius: 28,
              borderBottomRightRadius: 28, borderWidth: 1, borderTopWidth: 0, borderColor: tema.line, overflow: "hidden" }}>
              <View style={{ height: 180, overflow: "hidden" }}>
                <FondoTono h={tono(f.ticker, f.sector)} id="ficha" fundido={tema.bg2} />
                <View style={{ position: "absolute", right: -30, bottom: -70, opacity: 0.3 }}>
                  <Ilustracion formas={sec.icono} size={240} color="#FFFFFF" />
                </View>
                <Pressable onPress={volver} accessibilityRole="button" accessibilityLabel="Volver"
                  style={{ position: "absolute", left: 12, top: 12, width: 40, height: 40, borderRadius: 20,
                    backgroundColor: "rgba(7,8,12,0.5)", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#FFFFFF", fontSize: 22, lineHeight: 24, marginTop: -2 }}>‹</Text>
                </Pressable>
              </View>
              <View style={{ paddingHorizontal: 20, paddingBottom: 20, marginTop: -56, gap: 4 }}>
                <Logo ticker={f.ticker} sector={f.sector} size={60} s={s} />
                <Text style={{ fontFamily: fuentes.head, fontSize: 36, color: tema.fg, letterSpacing: -1.2, marginTop: 12 }} numberOfLines={2}>
                  {nombreCorto(f.nombre)}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                  {[[sec.nombre, false], [TIPOS[f.analisis.tipo].nombre, true], ...(f.indice ? [[f.indice, false]] : []), [f.ticker, false],
                    ...(f.analisis.sugerida ? [["Idea prudente", true]] : [])].map(([t, cy]) => (
                    <View key={t as string} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
                      borderColor: cy ? tema.mint : tema.line, backgroundColor: tema.card }}>
                      <Text style={[s.ui, { fontSize: 12.5, color: cy ? tema.mint : tema.muted }]}>{t as string}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                  <Text style={{ fontFamily: fuentes.headMedio, fontSize: tamano(f.precio) + 16, color: tema.fg, letterSpacing: -1 }}>
                    {f.precio ? dinero(f.precio) : "—"}
                  </Text>
                  {typeof f.cambio1a === "number" && (
                    <Text style={[s.uiB, { fontSize: 15, color: f.cambio1a >= 0 ? tema.good : tema.down }]}>
                      {porcentajeConSigno(f.cambio1a, 0)} en el año
                    </Text>
                  )}
                </View>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  {[["Valor estimado", f.valor ? dinero(f.valor) : "—", tema.fg],
                    ["Frente a su valor", f.precio && f.valor && f.estado ? `${ETIQUETA[f.estado]} ${diferencia(f.precio, f.valor)}` : "—",
                      f.estado === "barata" ? tema.good : f.estado === "cara" ? tema.down : tema.fg]].map(([k, v, col]) => (
                    <View key={k} style={{ flex: 1, borderRadius: 16, padding: 12, backgroundColor: tema.card, borderWidth: 1, borderColor: tema.line }}>
                      <Text style={[s.ui, s.muted, { fontSize: 12 }]}>{k}</Text>
                      <Text style={{ fontFamily: fuentes.headMedio, fontSize: 19, color: col }} numberOfLines={1} adjustsFontSizeToFit>{v}</Text>
                    </View>
                  ))}
                </View>
                {sesion.yo && (
                  <Pressable onPress={() => sesion.seguir(ticker, !seguida).catch(() => {})} accessibilityRole="button"
                    accessibilityState={{ selected: seguida }}
                    style={({ pressed }) => [{ marginTop: 16, height: 48, borderRadius: 999, alignItems: "center", justifyContent: "center",
                      backgroundColor: seguida ? tema.good : tema.acc }, pressed && { transform: [{ scale: 0.97 }] }]}>
                    <Text style={[s.uiB, { fontSize: 15, color: seguida ? "#04221A" : tema.onAcc }]}>{seguida ? "✓ En mi lista" : "+ Mi lista"}</Text>
                  </Pressable>
                )}
              </View>
            </View>

            {f.precio && f.valor && f.estado ? (
              <Text style={[s.ui, { fontSize: 16, lineHeight: 23 }]}>
                Hoy pagas{" "}
                <Text style={[s.uiB, { color: f.estado === "cara" ? tema.down : f.estado === "barata" ? tema.good : tema.fg }]}>
                  ${pagasPorCadaDolar(f.precio, f.valor)} por cada $1
                </Text>{" "}
                de valor que muestran sus resultados. {FRASE[f.estado]}{" "}
                <Text style={s.muted}>Rango de valor: {dinero(f.bandaMin!)} – {dinero(f.bandaMax!)}.</Text>
              </Text>
            ) : (
              <Text style={[s.ui, { fontSize: 16 }]}>{f.sinModelo ?? "Todavía no podemos estimar su valor."}</Text>
            )}

            <GraficoValor s={s} tema={tema} ticker={f.ticker} sector={f.sector} trimestres={f.trimestres} precios={f.precios}
              precio={f.precio} />

            <View style={[s.metrica, { gap: 6 }, f.analisis.sugerida && { borderColor: tema.mint, borderWidth: 2 }]}>
              <View style={[s.fila, { alignItems: "center" }]}>
                <View style={[s.pildora, { backgroundColor: tema.pastel[{ defensiva: 1, estable: 0, ciclica: 3 }[f.analisis.tipo]] }]}>
                  <Text style={[s.uiB, s.cFg, { fontSize: 11.5 }]}>{TIPOS[f.analisis.tipo].nombre}</Text>
                </View>
                <Text style={[s.mono, { fontSize: 12.5 }]}>Calidad {f.analisis.calidad}/100</Text>
              </View>
              <Text style={[s.uiB, { fontSize: 14.5 }]}>{f.analisis.motivo}</Text>
              {f.analisis.precioCompra && (
                <Text style={[s.ui, { fontSize: 14 }]}>
                  Precio de compra prudente: <Text style={s.uiB}>{dinero(f.analisis.precioCompra)}</Text>
                  <Text style={s.muted}> (valor estimado − {Math.round(TIPOS[f.analisis.tipo].margen * 100)} %)</Text>
                </Text>
              )}
              {f.razones.map((r) => (
                <Text key={r} style={[s.ui, s.muted, { fontSize: 12.5 }]}><Text style={{ color: tema.good }}>✓ </Text>{r}</Text>
              ))}
              {f.alertas.map((r) => (
                <Text key={r} style={[s.ui, s.muted, { fontSize: 12.5 }]}><Text style={{ color: tema.down }}>! </Text>{r}</Text>
              ))}
            </View>

            {tambien.length > 0 && (
              <>
                <Cabecera s={s} titulo={`Quienes vieron ${nombreCorto(f.nombre)} también vieron`} extra="últimos 30 días" />
                <Rejilla s={s} tema={tema} empresas={tambien.slice(0, 4)} abrir={abrir} />
              </>
            )}

            <SobreEmpresa s={s} tema={tema} nombre={nombreCorto(f.nombre)} perfil={f.perfil} clave={f.clave} />

            <PanelSimular s={s} tema={tema} ticker={f.ticker} nombre={nombreCorto(f.nombre)} precio={f.precio} />
            <MaquinaTiempo s={s} tema={tema} ticker={f.ticker} nombre={nombreCorto(f.nombre)} />

            <Cabecera s={s} titulo="Las 7 métricas clave" extra="últimos 12 meses" />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <Text style={[s.ui, s.muted, { fontSize: 12.5, marginRight: 2 }]}>Gráficos de</Text>
              {PERIODOS_METRICAS.filter((a) => a <= 2 || a <= Math.ceil(f.trimestres.length / 4)).map((a) => {
                const on = anios === a;
                return (
                  <Pressable key={a} onPress={() => elegirPeriodo(a)} accessibilityRole="button" accessibilityState={{ selected: on }}
                    style={[s.chip, on && s.chipOn, { paddingHorizontal: 10, paddingVertical: 5 }]}>
                    <Text style={[s.uiB, { fontSize: 12.5, color: on ? tema.onAcc : tema.fg }]}>{a} {a === 1 ? "año" : "años"}</Text>
                  </Pressable>
                );
              })}
            </View>
            {PRINCIPALES.map((m) => <TarjetaMetrica key={m.id} m={m} ctx={ctx} s={s} tema={tema} serieDe={serieDe} anios={anios} />)}

            <Cabecera s={s} titulo="Tus métricas" extra={extra.length ? extra.length === 1 ? "1 añadida" : `${extra.length} añadidas` : "elige las que quieras"} />
            {extra.map((id) => porId(id)).filter((m): m is Metrica => !!m).map((m) => (
              <TarjetaMetrica key={m.id} m={m} ctx={ctx} s={s} tema={tema} serieDe={serieDe} anios={anios} onQuitar={() => alternar(m.id)} />
            ))}
            <Pressable style={({ pressed }) => [s.agregar, pressed && { opacity: 0.7 }]} onPress={() => setSelector(true)}
              accessibilityRole="button">
              <Text style={[s.uiB, { color: tema.link, fontSize: 15 }]}>+ Agregar métricas</Text>
            </Pressable>

            {ultimo && (
              <Text style={[s.ui, s.muted, { fontSize: 11 }]}>Último trimestre reportado: cierre del {fechaCorta(ultimo.periodo)}.</Text>
            )}
            {f.valoracion && (
              <Text style={[s.ui, s.muted, { fontSize: 11 }]}>
                Supuestos: crecimiento {porcentaje(f.valoracion.supuestos.crecimiento)} anual · rentabilidad exigida{" "}
                {porcentaje(f.valoracion.supuestos.descuento)} · recompra neta {porcentaje(f.valoracion.supuestos.recompraNeta)}.
              </Text>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={selector} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelector(false)}>
        <SafeAreaView style={s.pantalla} edges={["top", "bottom"]}>
          <View style={[s.fila, { padding: 16, alignItems: "center" }]}>
            <Text style={[s.hd, { fontSize: 22 }]}>Agregar métricas</Text>
            <Pressable onPress={() => setSelector(false)} accessibilityRole="button">
              <Text style={[s.uiB, { color: tema.link, fontSize: 16 }]}>Listo</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 8 }}>
            {ADICIONALES.map((m) => {
              const on = extra.includes(m.id);
              return (
                <Pressable key={m.id} onPress={() => alternar(m.id)}
                  style={[s.opcion, on && { borderColor: tema.mint, borderWidth: 2 }]}
                  accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={m.nombre}>
                  <View style={[s.casilla, on && { backgroundColor: tema.acc, borderColor: tema.acc }]}>
                    {on && (
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={tema.onAcc} strokeWidth={3}
                        strokeLinecap="round" strokeLinejoin="round"><Path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.uiB, { fontSize: 14.5 }]}>{m.nombre}</Text>
                    <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>{m.descripcion}</Text>
                  </View>
                  {ctx && <Text style={[s.mono, { fontSize: 12.5 }]}>{mostrar(m.valor(ctx), m.formato)}</Text>}
                </Pressable>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Cabecera({ s, titulo, extra }: { s: Estilos; titulo: string; extra: string }) {
  return (
    <View style={[s.fila, { alignItems: "baseline", marginTop: 6 }]}>
      <Text style={[s.uiB, { fontSize: 16 }]}>{titulo}</Text>
      <Text style={[s.ui, s.muted, { fontSize: 12 }]}>{extra}</Text>
    </View>
  );
}

function TarjetaMetrica({ m, ctx, s, tema, serieDe, anios, onQuitar }: {
  m: Metrica; ctx: Contexto; s: Estilos; tema: Tema; serieDe: (m: Metrica) => ReturnType<typeof serieMetrica>;
  anios: PeriodoMetricas; onQuitar?: () => void;
}) {
  const valor = m.valor(ctx);
  const s0 = serieDe(m);
  const puntos = s0.puntos.some((p) => p.valor !== null) ? s0.puntos : [];
  const cambio = s0.cambio;
  return (
    <View style={s.metrica}>
      <View style={[s.fila, { alignItems: "center" }]}>
        <Text style={[s.ui, s.muted, { fontSize: 13 }]}>{m.nombre}</Text>
        {onQuitar && (
          <Pressable style={s.quitar} onPress={onQuitar} accessibilityRole="button" accessibilityLabel={`Quitar ${m.nombre}`}>
            <Text style={[s.uiB, s.muted, { fontSize: 15 }]}>×</Text>
          </Pressable>
        )}
      </View>
      {valor === null
        ? <Text style={[s.ui, s.muted, { fontSize: 16, paddingVertical: 4 }]}>No lo informa</Text>
        : <Text style={[s.hd, { fontSize: 24 }]}>{mostrar(valor, m.formato)}</Text>}
      <Text style={[s.ui, s.muted, { fontSize: 12.5, lineHeight: 17 }]}>{m.descripcion}</Text>
      {cambio !== null && puntos.length > 1 && (
        <Text style={[s.uiB, { fontSize: 12.5, color: (cambio >= 0) !== !!m.menosEsMejor ? tema.good : tema.down }]}>
          {porcentajeConSigno(cambio, Math.abs(cambio) >= 1 ? 0 : 1)} en {anios} {anios === 1 ? "año" : "años"}
        </Text>
      )}
      {puntos.length > 1 && <Linea puntos={puntos} m={m} s={s} tema={tema} anual={s0.modo === "anual"} />}
    </View>
  );
}

/**
 * Gráfico de línea de los últimos trimestres (la misma geometría que la web).
 * La línea se estira al ancho; los puntos son vistas aparte para que sigan redondos.
 */
function Linea({ puntos, m, s, tema, anual }: {
  puntos: PuntoMetrica[]; m: Metrica; s: Estilos; tema: Tema; anual: boolean;
}) {
  const g = geometriaLinea(puntos.map((p) => p.valor));
  const ultimo = puntos.length - 1;
  return (
    <View style={{ marginTop: 10 }} accessibilityLabel={`${m.nombre} por ${anual ? "año" : "trimestre"}`}>
      <View style={s.linea}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute" }}>
          {g.cero !== null && (
            <Line x1={0} x2={100} y1={g.cero} y2={g.cero} stroke={tema.line} strokeWidth={1} strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke" />
          )}
          {g.areas.map((d, i) => <Path key={`a${i}`} d={d} fill={tema.link} fillOpacity={0.08} />)}
          {g.tramos.map((d, i) => (
            <Path key={`t${i}`} d={d} fill="none" stroke={tema.link} strokeWidth={2.25} strokeLinejoin="round"
              strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ))}
        </Svg>
        {g.puntos.map((p, i) => {
          if (!p) return null;
          const fin = i === ultimo;
          const t = fin ? 12 : 8;
          return (
            <View key={puntos[i].etiqueta} style={{
              position: "absolute", left: `${p.x}%`, top: `${p.y}%`, width: t, height: t, marginLeft: -t / 2, marginTop: -t / 2,
              borderRadius: t, borderWidth: 2, backgroundColor: fin ? tema.mint : tema.card,
              borderColor: fin ? tema.mint : (puntos[i].valor ?? 0) < 0 && !m.menosEsMejor ? tema.down : tema.link,
            }} />
          );
        })}
      </View>
      <View style={s.etiquetas}>
        {puntos.map((p) => (
          <Text key={p.etiqueta} style={[s.mono, s.muted, s.etiqueta]} numberOfLines={1}>{p.visible ? p.etiqueta : ""}</Text>
        ))}
      </View>
    </View>
  );
}
