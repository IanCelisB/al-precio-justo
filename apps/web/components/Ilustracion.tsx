import type { Forma } from "@ancla/valoracion/sectores";

/** Dibuja una ilustración de sector (iconos de línea 24×24). */
export function Ilustracion({ formas, size = 24, className }: { formas: Forma[]; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden
      fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {formas.map((f, i) =>
        f.t === "path" ? <path key={i} d={f.d} />
          : f.t === "circle" ? <circle key={i} cx={f.cx} cy={f.cy} r={f.r} />
            : <rect key={i} x={f.x} y={f.y} width={f.w} height={f.h} rx={f.rx} />,
      )}
    </svg>
  );
}
