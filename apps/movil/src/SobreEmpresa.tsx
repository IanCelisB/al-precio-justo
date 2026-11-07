/** A qué se dedica, datos de la empresa, datos clave para invertir y de dónde vienen sus ingresos. */
import { Linking, Pressable, Text, View } from "react-native";
import { dinero, fechaCorta, grande } from "@ancla/valoracion/formato";
import { fraseIngresos, mesCierre, monto, partes, textoBeta, type DatosClave, type Perfil } from "@ancla/valoracion/perfil";
import type { Estilos } from "./estilos";
import type { Tema } from "./tema";

const EJES = [
  { id: "segmentos", titulo: "Por negocio" },
  { id: "productos", titulo: "Por producto o servicio" },
  { id: "regiones", titulo: "Por región" },
] as const;

const num = (x: number, d = 1) => x.toLocaleString("es", { maximumFractionDigits: d });

export function SobreEmpresa({ s, tema, nombre, perfil, clave }: {
  s: Estilos; tema: Tema; nombre: string; perfil: Perfil | null; clave: DatosClave | null;
}) {
  const p = perfil ?? {};
  const ficha: [string, string | null | undefined][] = [
    ["Fundación", p.fundacion], ["Sede", p.sede], ["CEO", p.ceo],
    ["Empleados", p.empleados ? num(p.empleados, 0) : null], ["Industria (SEC)", p.industria],
    ["Bolsa", p.bolsas?.join(", ")], ["Cierre del año fiscal", mesCierre(p.cierreFiscal)],
  ];
  const ejes = EJES.filter((e) => p.ingresos?.[e.id]?.length);
  const mostrados = ejes.filter((e) => !(e.id === "segmentos" && ejes.some((x) => x.id === "productos")
    && p.ingresos!.productos!.length >= p.ingresos!.segmentos!.length));
  const r = clave?.rango52;

  const celda = (k: string, v: React.ReactNode, nota?: string) => (
    <View key={k} style={{ width: "50%", paddingRight: 10, paddingBottom: 10 }}>
      <Text style={[s.ui, s.muted, { fontSize: 12 }]}>{k}</Text>
      {typeof v === "string" ? <Text style={[s.uiB, { fontSize: 14.5 }]}>{v}</Text> : v}
      {nota && <Text style={[s.ui, s.muted, { fontSize: 11.5 }]}>{nota}</Text>}
    </View>
  );
  const grandeTxt = (v: string) => <Text style={[s.hd, { fontSize: 19 }]}>{v}</Text>;

  return (
    <View style={[s.metrica, { gap: 10 }]}>
      <Text style={[s.hd, { fontSize: 18 }]}>Sobre la empresa</Text>
      {p.descripcion ? (
        <Text style={[s.ui, { fontSize: 15, lineHeight: 22 }]}>
          {p.descripcion.texto}{" "}
          <Text style={[s.ui, s.muted, { fontSize: 12.5, textDecorationLine: "underline" }]}
            onPress={() => Linking.openURL(p.descripcion!.fuente)}>
            Wikipedia{p.descripcion.idioma !== "es" ? " (en inglés)" : ""}
          </Text>
        </Text>
      ) : (
        <Text style={[s.ui, s.muted, { fontSize: 13 }]}>Todavía no tenemos una descripción de esta empresa.</Text>
      )}

      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {ficha.filter(([, v]) => v).map(([k, v]) => celda(k, v!))}
        {p.web ? celda("Web", (
          <Pressable onPress={() => Linking.openURL(p.web!)} accessibilityRole="link">
            <Text style={[s.uiB, s.enlace, { fontSize: 14.5 }]}>{p.web.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</Text>
          </Pressable>
        )) : null}
      </View>

      {clave && (
        <>
          <Text style={[s.hd, { fontSize: 15.5 }]}>Datos clave</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {clave.capitalizacion !== null && celda("Capitalización", grandeTxt(grande(clave.capitalizacion)))}
            {celda("PER", grandeTxt(clave.per !== null ? `${num(clave.per)}x` : "—"),
              clave.per !== null ? `pagas ${num(clave.per, 0)} años de beneficios` : "sin beneficios")}
            {clave.rentabilidadDividendo !== null && celda("Dividendo", grandeTxt(clave.rentabilidadDividendo > 0 ? `${num(clave.rentabilidadDividendo * 100, 2)} %` : "No paga"),
              clave.rentabilidadDividendo > 0 ? "al año, sobre el precio" : undefined)}
            {clave.beta !== null && celda("Beta", grandeTxt(num(clave.beta, 2)), textoBeta(clave.beta))}
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
        </>
      )}

      {mostrados.length > 0 && (
        <>
          <Text style={[s.hd, { fontSize: 15.5 }]}>¿De dónde vienen sus ingresos?</Text>
          {fraseIngresos(nombre, p.ingresos![mostrados[0].id], p.ingresosAnio) && (
            <Text style={[s.ui, { fontSize: 15, lineHeight: 22 }]}>{fraseIngresos(nombre, p.ingresos![mostrados[0].id], p.ingresosAnio)}</Text>
          )}
          {mostrados.map((e) => (
            <View key={e.id} style={{ gap: 8 }}>
              <Text style={[s.ui, s.muted, { fontSize: 12.5 }]}>{e.titulo}</Text>
              {partes(p.ingresos![e.id]).map((x) => (
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
              ))}
            </View>
          ))}
          <Text style={[s.ui, s.muted, { fontSize: 11.5 }]}>
            Ventas del año fiscal {p.ingresosAnio}, según su {p.ingresosFuente?.replace(/\d{4}-\d{2}-\d{2}/, (d) => fechaCorta(d))} a la SEC.
          </Text>
        </>
      )}
    </View>
  );
}
