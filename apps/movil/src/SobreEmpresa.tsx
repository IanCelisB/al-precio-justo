/** A qué se dedica, datos de la empresa y de dónde vienen sus ingresos (y cómo han cambiado en 5 años). */
import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { dinero, fechaCorta, grande, porcentajeConSigno } from "@ancla/valoracion/formato";
import {
  fraseIngresos, historiaIngresos, monto, partes, type DatosClave, type EjeIngresos, type Perfil,
} from "@ancla/valoracion/perfil";
import type { Estilos } from "./estilos";
import type { Tema } from "./tema";

const EJES: { id: EjeIngresos; titulo: string }[] = [
  { id: "segmentos", titulo: "Por negocio" },
  { id: "productos", titulo: "Por producto" },
  { id: "regiones", titulo: "Por región" },
];

const num = (x: number, d = 1) => x.toLocaleString("es", { maximumFractionDigits: d });

/** Texto con "Ver más": una línea con puntos suspensivos y, al pulsar, la descripción completa. */
function Descripcion({ s, tema, texto, fuente, fecha }: { s: Estilos; tema: Tema; texto: string; fuente: string; fecha: string }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={[s.ui, { fontSize: 15, lineHeight: 22 }]} numberOfLines={abierta ? undefined : 1}>{texto}</Text>
      <View style={{ flexDirection: "row", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Pressable onPress={() => setAbierta(!abierta)} accessibilityRole="button" accessibilityState={{ expanded: abierta }}>
          <Text style={[s.uiB, s.enlace, { fontSize: 13.5 }]}>{abierta ? "Ver menos" : "Ver más"}</Text>
        </Pressable>
        {abierta && (
          <Text style={[s.ui, s.muted, { fontSize: 12, textDecorationLine: "underline" }]} onPress={() => Linking.openURL(fuente)}>
            De su informe anual (10-K) a la SEC, {fechaCorta(fecha)} · en inglés
          </Text>
        )}
      </View>
    </View>
  );
}

/** Barras pequeñas de un valor por año (la última, resaltada). */
function Barras({ valores, color, fondo, alto = 26 }: { valores: (number | null)[]; color: string; fondo: string; alto?: number }) {
  const max = Math.max(...valores.map((v) => v ?? 0), 1);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: alto }}>
      {valores.map((v, i) => (
        <View key={i} style={{ width: 9, height: Math.max(2, ((v ?? 0) / max) * alto), borderRadius: 2,
          backgroundColor: v === null ? fondo : color, opacity: i === valores.length - 1 ? 1 : 0.45 }} />
      ))}
    </View>
  );
}

export function SobreEmpresa({ s, tema, nombre, perfil, clave }: {
  s: Estilos; tema: Tema; nombre: string; perfil: Perfil | null; clave: DatosClave | null;
}) {
  const p = perfil ?? {};
  const ficha: [string, string | null | undefined][] = [
    ["Fundación", p.fundacion], ["Sede", p.sede],
    ["Empleados", p.empleados ? num(p.empleados, 0) : null], ["Industria", p.industria],
    ["Bolsa", p.bolsas?.join(", ")],
  ];
  // Si la empresa informa por negocio y por producto, se elige por defecto el más detallado.
  const conHistoria = EJES.filter((e) => (p.ingresosHistoria?.[e.id]?.length ?? 0) >= 2);
  const conUltimo = EJES.filter((e) => p.ingresos?.[e.id]?.length);
  const disponibles = conHistoria.length ? conHistoria : conUltimo;
  const preferido = disponibles.find((e) => e.id === "productos"
    && (p.ingresos?.productos?.length ?? 0) >= (p.ingresos?.segmentos?.length ?? 0)) ?? disponibles[0];
  const [eje, setEje] = useState<EjeIngresos | null>(null);
  const ejeActivo = disponibles.find((e) => e.id === eje) ?? preferido;
  const h = ejeActivo ? historiaIngresos(p.ingresosHistoria?.[ejeActivo.id]) : null;
  const ultimo = ejeActivo ? p.ingresos?.[ejeActivo.id] ?? p.ingresosHistoria?.[ejeActivo.id]?.at(-1)?.partes : undefined;
  const r = clave?.rango52;

  const celda = (k: string, v: React.ReactNode, nota?: string) => (
    <View key={k} style={{ width: "50%", paddingRight: 10, paddingBottom: 10 }}>
      <Text style={[s.ui, s.muted, { fontSize: 12 }]}>{k}</Text>
      {typeof v === "string" ? <Text style={[s.uiB, { fontSize: 14.5 }]}>{v}</Text> : v}
      {nota && <Text style={[s.ui, s.muted, { fontSize: 11.5 }]}>{nota}</Text>}
    </View>
  );
  const grandeTxt = (v: string) => <Text style={[s.hd, { fontSize: 19 }]}>{v}</Text>;
  const crece = (x: number | null) => x === null ? null : (
    <Text style={[s.uiB, { fontSize: 12, color: x >= 0 ? tema.good : tema.down }]}>{porcentajeConSigno(x, Math.abs(x) >= 0.1 ? 0 : 1)}/año</Text>
  );

  return (
    <View style={[s.metrica, { gap: 10 }]}>
      <Text style={[s.hd, { fontSize: 18 }]}>Sobre la empresa</Text>
      {p.actividad && <Descripcion s={s} tema={tema} texto={p.actividad.texto} fuente={p.actividad.fuente} fecha={p.actividad.fecha} />}

      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {ficha.filter(([, v]) => v).map(([k, v]) => celda(k, v!))}
        {clave?.capitalizacion != null && celda("Capitalización", grandeTxt(grande(clave.capitalizacion)))}
        {clave && celda("PER", grandeTxt(clave.per !== null ? `${num(clave.per)}x` : "—"),
          clave.per !== null ? `pagas ${num(clave.per, 0)} años de beneficios` : "sin beneficios")}
        {clave?.rentabilidadDividendo != null && celda("Dividendo",
          grandeTxt(clave.rentabilidadDividendo > 0 ? `${num(clave.rentabilidadDividendo * 100, 2)} %` : "Sin dividendos"),
          clave.rentabilidadDividendo > 0 ? "al año, sobre el precio" : undefined)}
      </View>
      {r && (
        <View style={{ gap: 6 }}>
          <View style={s.fila}>
            <Text style={[s.ui, { fontSize: 13 }]}>Rango de 52 semanas</Text>
            <Text style={[s.ui, s.muted, { fontSize: 11.5 }]}>cierres semanales</Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: tema.band, marginHorizontal: 7 }}>
            <View style={{ position: "absolute", top: -4, left: `${Math.min(100, Math.max(0, r.posicion * 100))}%`, marginLeft: -7,
              width: 14, height: 14, borderRadius: 7, backgroundColor: tema.link, borderWidth: 3, borderColor: tema.card }} />
          </View>
          <View style={s.fila}>
            <Text style={[s.mono, s.muted, { fontSize: 11.5 }]}>{dinero(r.min)}</Text>
            <Text style={[s.mono, s.muted, { fontSize: 11.5 }]}>{dinero(r.max)}</Text>
          </View>
        </View>
      )}

      {ejeActivo && (ultimo?.length || h) && (
        <>
          <Text style={[s.hd, { fontSize: 17, marginTop: 6 }]}>¿De dónde vienen sus ingresos?</Text>
          {disponibles.length > 1 && (
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {disponibles.map((e) => {
                const on = e.id === ejeActivo.id;
                return (
                  <Pressable key={e.id} onPress={() => setEje(e.id)} style={[s.chip, on && s.chipOn, { paddingVertical: 5 }]}
                    accessibilityRole="tab" accessibilityState={{ selected: on }}>
                    <Text style={[s.uiB, { fontSize: 12.5, color: on ? tema.onAcc : tema.fg }]}>{e.titulo}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {ultimo && fraseIngresos(nombre, ultimo, p.ingresosAnio) && (
            <Text style={[s.ui, { fontSize: 15, lineHeight: 22 }]}>{fraseIngresos(nombre, ultimo, p.ingresosAnio)}</Text>
          )}

          {h ? (
            <View style={{ gap: 10 }}>
              <View style={[s.fila, { alignItems: "center", backgroundColor: tema.bg, borderRadius: 12, padding: 10 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.uiB, { fontSize: 14 }]}>Ventas totales</Text>
                  <Text style={[s.ui, s.muted, { fontSize: 12 }]}>{h.anios[0]}–{h.anios.at(-1)} · {monto(h.total.at(-1) ?? 0)} el último año</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Barras valores={h.total} color={tema.link} fondo={tema.line} />
                  {crece(h.cagrTotal)}
                </View>
              </View>
              {h.cagrTotal !== null && h.cagrTotal < 0 && (
                <View style={{ borderLeftWidth: 3, borderColor: tema.down, paddingLeft: 10 }}>
                  <Text style={[s.ui, { fontSize: 13, lineHeight: 18 }]}>
                    Sus ventas caen un {num(Math.abs(h.cagrTotal) * 100, 1)} % al año. Una empresa que se achica puede verse barata
                    y no ser una buena oportunidad: el valor estimado supone que sus ventas no siguen cayendo.
                  </Text>
                </View>
              )}
              {h.filas.map((x) => (
                <View key={x.nombre} style={{ gap: 4 }}>
                  <View style={[s.fila, { gap: 10, alignItems: "center" }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.ui, { fontSize: 14 }]} numberOfLines={2}>{x.nombre}</Text>
                      <Text style={[s.ui, s.muted, { fontSize: 12 }]}>
                        {monto(x.ultimo)} · {num(x.pct * 100, 0)} % del total
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Barras valores={x.valores} color={tema.mint} fondo={tema.line} alto={22} />
                      {crece(x.cagr)}
                    </View>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: tema.bg, overflow: "hidden" }}>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: tema.mint, width: `${Math.max(2, x.pct * 100)}%` }} />
                  </View>
                </View>
              ))}
              <Text style={[s.ui, s.muted, { fontSize: 11.5 }]}>
                Barras: un año fiscal cada una, de {h.anios[0]} a {h.anios.at(-1)}. «/año»: crecimiento anual compuesto del periodo.
              </Text>
            </View>
          ) : (
            partes(ultimo).map((x) => (
              <View key={x.nombre} style={{ gap: 4 }}>
                <View style={[s.fila, { gap: 10 }]}>
                  <Text style={[s.ui, { fontSize: 14, flex: 1 }]}>{x.nombre}</Text>
                  <Text style={[s.mono, { fontSize: 13 }]}>{monto(x.valor)}</Text>
                  <Text style={[s.ui, s.muted, { fontSize: 12, width: 36, textAlign: "right" }]}>{num(x.pct * 100, 0)} %</Text>
                </View>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: tema.bg, overflow: "hidden" }}>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: tema.mint, width: `${Math.max(2, x.pct * 100)}%` }} />
                </View>
              </View>
            ))
          )}
          {p.ingresosFuente && (
            <Text style={[s.ui, s.muted, { fontSize: 11.5 }]}>
              Según sus informes anuales (10-K) a la SEC; el último, {p.ingresosFuente.replace(/^10-K presentado el /, "").replace(/\d{4}-\d{2}-\d{2}/, (d) => fechaCorta(d))}.
            </Text>
          )}
        </>
      )}
    </View>
  );
}
