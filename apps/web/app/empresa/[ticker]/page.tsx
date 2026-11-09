import Link from "next/link";
import { notFound } from "next/navigation";
import { diferencia, ETIQUETA, pagasPorCadaDolar } from "@ancla/valoracion";
import { tono } from "@ancla/valoracion/portada";
import { Ilustracion } from "@/components/Ilustracion";
import { dinero, fechaCorta, nombreCorto, porcentaje, porcentajeConSigno } from "@ancla/valoracion/formato";
import { sectorDe } from "@ancla/valoracion/sectores";
import { Logo } from "@/components/Logo";
import { Metricas } from "@/components/Metricas";
import { PanelSimular } from "@/components/PanelSimular";
import { MaquinaTiempo } from "@/components/MaquinaTiempo";
import { GraficoValor } from "@/components/GraficoValor";
import { SobreEmpresa } from "@/components/SobreEmpresa";
import { RegistrarVista } from "@/components/Preferencias";
import { Tarjeta } from "@/components/Tarjeta";
import { preferencias } from "@/lib/preferencias";
import { BotonSeguir } from "@/components/BotonSeguir";
import { TIPOS } from "@ancla/valoracion/recomendaciones";
import { api, type Ficha } from "@/lib/api";

export const dynamic = "force-dynamic";

const FRASE = {
  cara: "Está cara.",
  barata: "Está barata.",
  rango: "Está dentro de su rango.",
} as const;

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return { title: `${ticker.toUpperCase()} · valor real según sus resultados · Al Precio Justo` };
}

/** Ficha amigable: precio frente a valor, las 7 métricas clave y las que el usuario añada. */
export default async function Empresa({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  let f: Ficha;
  try {
    f = await api.ficha(ticker);
  } catch {
    notFound();
  }
  const [yo, cartera, tambien, { pref }] = await Promise.all([api.yo(), api.simulador(), api.tambien(f.ticker), preferencias()]);
  const posicion = cartera?.posiciones.find((p) => p.ticker === f.ticker) ?? null;
  const nombre = nombreCorto(f.nombre);
  const a = f.analisis;
  const t = f.trimestres;
  const ultimo = t.at(-1);
  const v = f.valoracion;
  const sec = sectorDe(f.sector);

  return (
    <main className="wrap ficha">
      <section className="ficha-top" style={{ "--h": tono(f.ticker, f.sector) } as React.CSSProperties}>
        <div className="ficha-banda">
          <span className="ficha-glifo" aria-hidden><Ilustracion formas={sec.icono} size={260} /></span>
          <Link href="/" className="ficha-cerrar" aria-label="Volver al inicio">
            <svg viewBox="0 0 24 24" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
          </Link>
        </div>
        <div className="ficha-cuerpo">
          <Logo ticker={f.ticker} sector={f.sector} size={60} grande />
          <h1 className="ficha-nombre">{nombre}</h1>
          <div className="etiquetas">
            <span>{sec.nombre}</span>
            <span className="cy">{TIPOS[a.tipo].nombre}</span>
            {f.indice && <span>{f.indice}</span>}
            <span className="mono">{f.ticker}</span>
            {a.sugerida && <span className="cy">Idea prudente</span>}
          </div>
          <div className="ficha-precio">
            <b className="mono">{f.precio ? dinero(f.precio) : "—"}</b>
            {typeof f.cambio1a === "number" && (
              <span className={`mono ${f.cambio1a >= 0 ? "sube" : "baja"}`}>{porcentajeConSigno(f.cambio1a, 0)} en el año</span>
            )}
          </div>
          <div className="ficha-datos">
            <div><span>Valor estimado</span><b className="mono">{f.valor ? dinero(f.valor) : "—"}</b></div>
            <div><span>Frente a su valor</span>
              <b className={`mono ${f.estado ?? ""}`}>{f.precio && f.valor && f.estado ? `${ETIQUETA[f.estado]} ${diferencia(f.precio, f.valor)}` : "—"}</b></div>
          </div>
          <div className="ficha-acciones">
            <BotonSeguir ticker={f.ticker} seguida={!!yo?.seguidas.includes(f.ticker)} conSesion={!!yo} />
          </div>
        </div>
      </section>

      {f.precio && f.valor && f.estado ? (
        <p className="frase">
          Hoy pagas <strong className={f.estado}>${pagasPorCadaDolar(f.precio, f.valor)} por cada $1</strong> de
          valor que muestran sus resultados. {FRASE[f.estado]}{" "}
          <span className="muted">Rango de valor: {dinero(f.bandaMin!)} – {dinero(f.bandaMax!)}.</span>
        </p>
      ) : (
        <p className="frase">{f.sinModelo ?? "Todavía no podemos estimar su valor."}</p>
      )}

      <GraficoValor ticker={f.ticker} sector={f.sector} trimestres={t} precios={f.precios} precio={f.precio} />

      <div className={a.sugerida ? "analisis sugerida" : "analisis"}>
        <div className="analisis-cab">
          <span className={`pildora ${a.tipo}`}>{TIPOS[a.tipo].nombre}</span>
          <span className="mono">Calidad {a.calidad}/100</span>
        </div>
        <p className="analisis-motivo">{a.motivo}</p>
        {a.precioCompra && f.precio && (
          <p>Precio de compra prudente: <b>{dinero(a.precioCompra)}</b>{" "}
            <span className="muted">(valor estimado − {Math.round(TIPOS[a.tipo].margen * 100)} %). {TIPOS[a.tipo].explicacion}</span></p>
        )}
        {(f.razones.length > 0 || f.alertas.length > 0) && (
          <ul className="idea-razones">
            {f.razones.map((r) => <li key={r} className="a-favor">{r}</li>)}
            {f.alertas.map((r) => <li key={r} className="en-contra">{r}</li>)}
          </ul>
        )}
      </div>

      <RegistrarVista ticker={f.ticker} activo={pref.analitica} />
      {tambien.length > 0 && (
        <>
          <div className="sec">Quienes vieron {nombre} también vieron <span>últimos 30 días</span></div>
          <div className="tarjetas">{tambien.slice(0, 4).map((x) => <Tarjeta key={x.ticker} e={x.empresa} />)}</div>
        </>
      )}

      <SobreEmpresa nombre={nombre} perfil={f.perfil} clave={f.clave} />

      <div className="dos-columnas">
        <PanelSimular ticker={f.ticker} nombre={nombre} precio={f.precio} conSesion={!!yo}
          efectivo={cartera?.efectivo ?? null} posicion={posicion} />
        <MaquinaTiempo ticker={f.ticker} nombre={nombre} />
      </div>

      <Metricas trimestres={t} precio={f.precio} precios={f.precios} conSesion={!!yo} inicial={yo?.metricasExtra} />
      {ultimo && <p className="nota">Último trimestre reportado: cierre del {fechaCorta(ultimo.periodo)}.</p>}

      {v && (
        <p className="nota">
          Supuestos: crecimiento {porcentaje(v.supuestos.crecimiento)} anual · rentabilidad exigida{" "}
          {porcentaje(v.supuestos.descuento)} · recompra neta {porcentaje(v.supuestos.recompraNeta)} · crecimiento a
          perpetuidad {porcentaje(v.supuestos.crecimientoTerminal)}. Flujo de caja libre por acción (promedio de{" "}
          {v.aniosBase === 3 ? "3 años" : "12 meses"}): {dinero(v.fcfPorAccion)}.
        </p>
      )}
    </main>
  );
}
