/**
 * Preferencias en la web (servidor): se guardan en la cookie `apj_pref` y se leen en cada
 * petición. La divisa se fija por petición (React `cache`), no como global compartida,
 * para que dos visitantes con divisas distintas no se mezclen.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { leerPreferencias, type Preferencias } from "@ancla/valoracion/apariencia";
import { divisa, registrarProveedorDivisa, USD, type Divisa } from "@ancla/valoracion/formato";

export const COOKIE_PREFERENCIAS = "apj_pref";
const API = process.env.ANCLA_API ?? "http://localhost:4000";

export interface Divisas {
  base: "USD";
  tasas: Record<string, number>;
  detalle: { codigo: string; porUsd: number; fecha: string; fuente: string }[];
}

const porPeticion = cache(() => ({ divisa: USD as Divisa }));
registrarProveedorDivisa(() => porPeticion().divisa);

/** Tasas del día (se publican una vez al día: basta con pedirlas cada hora). */
export async function divisas(): Promise<Divisas | null> {
  try {
    const r = await fetch(`${API}/divisas`, { next: { revalidate: 3600 } });
    return r.ok ? ((await r.json()) as Divisas) : null;
  } catch {
    return null;
  }
}

/** Preferencias y divisa de esta petición. Se llama antes de pintar montos. */
export const preferencias = cache(async (): Promise<{ pref: Preferencias; divisa: Divisa; divisas: Divisas | null }> => {
  const pref = leerPreferencias((await cookies()).get(COOKIE_PREFERENCIAS)?.value);
  const d = await divisas();
  const elegida = divisa(pref.divisa, d?.tasas);
  porPeticion().divisa = elegida;
  return { pref, divisa: elegida, divisas: d };
});
