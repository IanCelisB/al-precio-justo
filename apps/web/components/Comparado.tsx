import { trazosComparados } from "@ancla/valoracion/simulador";

/** Dos líneas sobre la misma escala: la inversión (menta) y el S&P 500 (gris punteado). */
export function Comparado({ valores, referencia, alto = 120, etiquetas }: {
  valores: number[]; referencia: (number | null)[]; alto?: number; etiquetas?: [string, string];
}) {
  const [mia, sp] = trazosComparados([valores, referencia]);
  return (
    <div className="comparado">
      <div className="comparado-grafico" style={{ height: alto }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {sp.d && <path d={sp.d} className="comparado-sp" />}
          {mia.d && <path d={mia.d} className="comparado-mia" />}
        </svg>
        {mia.fin && <span className="comparado-punto" style={{ left: `${mia.fin.x}%`, top: `${mia.fin.y}%` }} />}
      </div>
      <div className="comparado-leyenda">
        <span><i className="mia" />{etiquetas?.[0] ?? "Tu inversión"}</span>
        <span><i className="sp" />{etiquetas?.[1] ?? "S&P 500"}</span>
      </div>
    </div>
  );
}
