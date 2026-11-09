import Link from "next/link";
import { diferencia, ETIQUETA } from "@ancla/valoracion";
import { dinero, nombreCorto, porcentajeConSigno } from "@ancla/valoracion/formato";
import { tono } from "@ancla/valoracion/portada";
import { sectorDe } from "@ancla/valoracion/sectores";
import type { Resumen } from "@/lib/api";
import { Ilustracion } from "./Ilustracion";
import { Logo } from "./Logo";

/** Póster de empresa: degradado del color de su sector, su logo, el cambio en 12 meses y su estado. */
export function Poster({ e, puesto }: { e: Resumen; puesto?: number }) {
  const sector = sectorDe(e.sector);
  const nombre = nombreCorto(e.nombre);
  const c = e.cambio1a;
  const tarjeta = (
    <Link href={`/empresa/${e.ticker}`} className="poster-card" style={{ "--h": tono(e.ticker, e.sector) } as React.CSSProperties}
      aria-label={`${nombre}, ${sector.nombre}${e.estado ? `, ${ETIQUETA[e.estado]}` : ""}`}>
      <span className="poster">
        <span className="poster-glifo"><Ilustracion formas={sector.icono} size={160} /></span>
        <span className="poster-logo"><Logo ticker={e.ticker} sector={e.sector} size={34} /></span>
        {typeof c === "number" && (
          <span className={`poster-pill mono ${c >= 0 ? "sube" : "baja"}`} title="Cambio del precio en 12 meses">
            {porcentajeConSigno(c, Math.abs(c) >= 0.1 ? 0 : 1)}
          </span>
        )}
        <span className="poster-nombre"><b>{nombre}</b><small>{sector.nombre}</small></span>
      </span>
      <span className="poster-meta">
        <b className="mono">{e.precio ? dinero(e.precio) : "—"}</b>
        {e.estado && e.precio && e.valor
          ? <span className={e.estado}>{ETIQUETA[e.estado]} · {diferencia(e.precio, e.valor)}</span>
          : <span>Sin valor estimado</span>}
      </span>
    </Link>
  );
  if (!puesto) return tarjeta;
  return (
    <div className="ranking" style={{ "--h": tono(e.ticker, e.sector) } as React.CSSProperties}>
      <span className="ranking-n" aria-hidden>{puesto}</span>
      {tarjeta}
    </div>
  );
}
