/** Piezas compartidas por las pantallas del móvil: logo, tarjetas, secciones. */
import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { diferencia, ETIQUETA } from "@ancla/valoracion";
import { dinero, nombreCorto } from "@ancla/valoracion/formato";
import { TIPOS } from "@ancla/valoracion/recomendaciones";
import { sectorDe } from "@ancla/valoracion/sectores";
import { urlLogo, type ConRazones, type Resumen } from "./api";
import type { Estilos } from "./estilos";
import { Ilustracion } from "./Ilustracion";
import type { Tema } from "./tema";

export type Abrir = (ticker: string) => void;

/** Logo de la empresa sobre blanco; si no hay, la ilustración de su sector. */
export function Logo({ ticker, sector, size = 38, s }: { ticker: string; sector: string | null; size?: number; s: Estilos }) {
  const [falla, setFalla] = useState(false);
  return (
    <View style={[s.logo, { width: size, height: size, borderRadius: size * 0.3 }]}>
      {falla ? (
        <Ilustracion formas={sectorDe(sector).icono} size={Math.round(size * 0.58)} color="#0E2A4D" />
      ) : (
        <Image source={{ uri: urlLogo(ticker) }} style={{ width: size * 0.78, height: size * 0.78 }}
          resizeMode="contain" onError={() => setFalla(true)} accessibilityIgnoresInvertColors />
      )}
    </View>
  );
}

export function Seccion({ s, titulo, extra, onExtra }: { s: Estilos; titulo: string; extra?: string; onExtra?: () => void }) {
  return (
    <View style={[s.fila, { alignItems: "baseline", marginTop: 4 }]}>
      <Text style={[s.uiB, { fontSize: 16 }]}>{titulo}</Text>
      {extra && (onExtra
        ? <Pressable onPress={onExtra}><Text style={[s.uiB, { fontSize: 12.5 }, { color: s.enlace.color }]}>{extra}</Text></Pressable>
        : <Text style={[s.ui, s.muted, { fontSize: 12 }]}>{extra}</Text>)}
    </View>
  );
}

export function Tarjeta({ s, tema, e, abrir }: { s: Estilos; tema: Tema; e: Resumen; abrir: Abrir }) {
  const nombre = nombreCorto(e.nombre);
  const sector = sectorDe(e.sector);
  return (
    <Pressable style={({ pressed }) => [s.tarjeta, { backgroundColor: tema.pastel[sector.tono - 1] }, pressed && { opacity: 0.85 }]}
      accessibilityRole="button" accessibilityLabel={`${nombre}, ${sector.nombre}`} onPress={() => abrir(e.ticker)}>
      <View style={s.tarjetaTop}>
        <Logo ticker={e.ticker} sector={e.sector} s={s} />
        <Text style={[s.ui, s.muted, { fontSize: 11, flex: 1 }]} numberOfLines={1}>{sector.nombre}</Text>
      </View>
      <Text style={[s.hd, s.cFg, { fontSize: 17 }]} numberOfLines={1}>{nombre}</Text>
      <Text style={[s.mono, s.cFg]}>{e.precio ? dinero(e.precio) : "—"}</Text>
      <Text style={[e.estado ? s.uiB : s.ui, s.cFg, { fontSize: 12, opacity: e.estado ? 1 : 0.75 },
        e.estado === "barata" && { color: tema.good }, e.estado === "cara" && { color: tema.down }]}>
        {e.estado && e.precio && e.valor ? `${ETIQUETA[e.estado]} · ${diferencia(e.precio, e.valor)}` : "Sin valor estimado"}
      </Text>
    </Pressable>
  );
}

export function Rejilla({ s, tema, empresas, abrir }: { s: Estilos; tema: Tema; empresas: Resumen[]; abrir: Abrir }) {
  return <View style={s.rejilla}>{empresas.map((e) => <Tarjeta key={e.ticker} s={s} tema={tema} e={e} abrir={abrir} />)}</View>;
}

/** Empresa con su análisis prudente: tipo, calidad, precio de compra y razones. */
export function Idea({ s, tema, e, abrir }: { s: Estilos; tema: Tema; e: ConRazones; abrir: Abrir }) {
  const a = e.analisis;
  const sector = sectorDe(e.sector);
  const distancia = e.precio && a.precioCompra ? e.precio / a.precioCompra - 1 : null;
  const tono = { defensiva: 1, estable: 0, ciclica: 3 }[a.tipo];
  return (
    <Pressable style={({ pressed }) => [s.metrica, { gap: 8 }, pressed && { opacity: 0.85 }]} onPress={() => abrir(e.ticker)}
      accessibilityRole="button" accessibilityLabel={nombreCorto(e.nombre)}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Logo ticker={e.ticker} sector={e.sector} size={42} s={s} />
        <View style={{ flex: 1 }}>
          <Text style={[s.hd, { fontSize: 17 }]} numberOfLines={1}>{nombreCorto(e.nombre)}</Text>
          <Text style={[s.mono, s.muted, { fontSize: 11 }]}>{e.ticker} · {sector.nombre}</Text>
        </View>
        <View style={[s.pildora, { backgroundColor: tema.pastel[tono] }]}>
          <Text style={[s.uiB, s.cFg, { fontSize: 11 }]}>{TIPOS[a.tipo].nombre}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row" }}>
        {[["Precio hoy", e.precio ? dinero(e.precio) : "—"], ["Precio de compra", a.precioCompra ? dinero(a.precioCompra) : "—"],
          ["Calidad", `${a.calidad}/100`]].map(([k, v]) => (
          <View key={k} style={{ flex: 1 }}>
            <Text style={[s.ui, s.muted, { fontSize: 11 }]}>{k}</Text>
            <Text style={[s.mono, { fontSize: 13.5 }]}>{v}</Text>
          </View>
        ))}
      </View>
      {distancia !== null && (
        <Text style={[s.uiB, { fontSize: 13, color: a.buenPrecio ? tema.good : tema.muted }]}>
          {a.buenPrecio ? `${Math.round(-distancia * 100)} % por debajo de su precio de compra` : `A ${Math.round(distancia * 100)} % de su precio de compra`}
        </Text>
      )}
      <Text style={[s.ui, { fontSize: 13 }]}>{a.motivo}</Text>
      {e.razones.slice(0, 3).map((r) => (
        <Text key={r} style={[s.ui, s.muted, { fontSize: 12.5 }]}><Text style={{ color: tema.good }}>✓ </Text>{r}</Text>
      ))}
      {e.alertas.slice(0, 2).map((r) => (
        <Text key={r} style={[s.ui, s.muted, { fontSize: 12.5 }]}><Text style={{ color: tema.down }}>! </Text>{r}</Text>
      ))}
    </Pressable>
  );
}
