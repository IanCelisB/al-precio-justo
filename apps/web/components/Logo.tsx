"use client";

import { useState } from "react";
import { sectorDe } from "@ancla/valoracion/sectores";
import { Ilustracion } from "./Ilustracion";

const API = process.env.NEXT_PUBLIC_ANCLA_API ?? "http://localhost:4000";

/** Logo de la empresa sobre fondo blanco. Si no hay logo, la ilustración de su sector. */
export function Logo({ ticker, sector, size = 38, grande = false }: {
  ticker: string; sector: string | null; size?: number; grande?: boolean;
}) {
  const [falla, setFalla] = useState(false);
  const s = sectorDe(sector);
  return (
    <span className={grande ? "logo-emp grande" : "logo-emp"} style={{ width: size, height: size }}
      title={falla ? s.nombre : undefined}>
      {falla ? (
        <Ilustracion formas={s.icono} size={Math.round(size * 0.58)} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`${API}/logos/${encodeURIComponent(ticker)}`} alt="" loading="lazy" decoding="async"
          width={size} height={size} onError={() => setFalla(true)} />
      )}
    </span>
  );
}
