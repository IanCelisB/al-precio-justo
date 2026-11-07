import Link from "next/link";
import { diferencia, ETIQUETA } from "@ancla/valoracion";
import { dinero, nombreCorto } from "@ancla/valoracion/formato";
import { sectorDe } from "@ancla/valoracion/sectores";
import type { Resumen } from "@/lib/api";
import { Logo } from "./Logo";

/** Tarjeta de empresa: su logo, su industria, precio de hoy y su estado en una palabra. */
export function Tarjeta({ e }: { e: Resumen }) {
  const nombre = nombreCorto(e.nombre);
  const sector = sectorDe(e.sector);
  return (
    <Link href={`/empresa/${e.ticker}`} className="tarjeta" style={{ background: `var(--c${sector.tono})` }}>
      <div className="tarjeta-top">
        <Logo ticker={e.ticker} sector={e.sector} />
        <small className="industria">{sector.nombre}</small>
      </div>
      <b title={e.nombre}>{nombre}</b>
      <span className="mono">{e.precio ? dinero(e.precio) : "—"}</span>
      {e.estado && e.precio && e.valor ? (
        <span className={`estado ${e.estado}`}>{ETIQUETA[e.estado]} · {diferencia(e.precio, e.valor)}</span>
      ) : (
        <span className="estado sin">Sin valor estimado</span>
      )}
    </Link>
  );
}
