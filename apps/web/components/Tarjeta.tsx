import type { Resumen } from "@/lib/api";
import { Poster } from "./Poster";

/** Tarjeta de empresa en las cuadrículas (Seguidas, búsqueda…): el mismo póster de la portada. */
export function Tarjeta({ e }: { e: Resumen }) {
  return <Poster e={e} />;
}
