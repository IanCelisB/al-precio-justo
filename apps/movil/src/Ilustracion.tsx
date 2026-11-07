import Svg, { Circle, Path, Rect } from "react-native-svg";
import type { Forma } from "@ancla/valoracion/sectores";

/** Dibuja una ilustración de sector (los mismos iconos que la web). */
export function Ilustracion({ formas, size = 24, color }: { formas: Forma[]; size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round">
      {formas.map((f, i) =>
        f.t === "path" ? <Path key={i} d={f.d} />
          : f.t === "circle" ? <Circle key={i} cx={f.cx} cy={f.cy} r={f.r} />
            : <Rect key={i} x={f.x} y={f.y} width={f.w} height={f.h} rx={f.rx} />,
      )}
    </Svg>
  );
}
