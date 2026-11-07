import Link from "next/link";
import { dinero, nombreCorto } from "@ancla/valoracion/formato";
import { TIPOS } from "@ancla/valoracion/recomendaciones";
import { sectorDe } from "@ancla/valoracion/sectores";
import type { ConRazones, Resumen } from "@/lib/api";
import { Logo } from "./Logo";

/** Tarjeta de una empresa con su análisis prudente: tipo, calidad, precio de compra y razones. */
export function Idea({ e }: { e: Resumen | ConRazones }) {
  const a = e.analisis;
  const sector = sectorDe(e.sector);
  const razones = "razones" in e ? e.razones : [];
  const alertas = "alertas" in e ? e.alertas : [];
  const distancia = e.precio && a.precioCompra ? e.precio / a.precioCompra - 1 : null;
  return (
    <Link href={`/empresa/${e.ticker}`} className="idea">
      <div className="idea-cab">
        <Logo ticker={e.ticker} sector={e.sector} size={42} />
        <div className="idea-nombre">
          <b>{nombreCorto(e.nombre)}</b>
          <small className="mono">{e.ticker} · {sector.nombre}</small>
        </div>
        <span className={`pildora ${a.tipo}`}>{TIPOS[a.tipo].nombre}</span>
      </div>
      <div className="idea-precios">
        <div><small>Precio hoy</small><b className="mono">{e.precio ? dinero(e.precio) : "—"}</b></div>
        <div><small>Precio de compra</small><b className="mono">{a.precioCompra ? dinero(a.precioCompra) : "—"}</b></div>
        <div><small>Calidad</small><b className="mono">{a.calidad}/100</b></div>
      </div>
      {distancia !== null && (
        <p className={a.buenPrecio ? "idea-estado bueno" : "idea-estado"}>
          {a.buenPrecio
            ? `${Math.round(-distancia * 100)} % por debajo de su precio de compra`
            : `A ${Math.round(distancia * 100)} % de su precio de compra`}
        </p>
      )}
      <p className="idea-motivo">{a.motivo}</p>
      {(razones.length > 0 || alertas.length > 0) && (
        <ul className="idea-razones">
          {razones.slice(0, 3).map((r) => <li key={r} className="a-favor">{r}</li>)}
          {alertas.slice(0, 2).map((r) => <li key={r} className="en-contra">{r}</li>)}
        </ul>
      )}
    </Link>
  );
}
