"use client";

import { useEffect, useState } from "react";
import { TIPOS, type Tipo } from "@ancla/valoracion/recomendaciones";
import type { Resumen } from "@/lib/api";
import { Tarjeta } from "./Tarjeta";

const API = process.env.NEXT_PUBLIC_ANCLA_API ?? "http://localhost:4000";

/** Búsqueda por nombre o ticker, con filtros por tipo de empresa y buen precio. */
export function Buscador({ children }: { children: React.ReactNode }) {
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<Tipo | "">("");
  const [buenPrecio, setBuenPrecio] = useState(false);
  const [res, setRes] = useState<{ total: number; resultados: Resumen[] } | null>(null);
  const activo = q.trim() !== "" || tipo !== "" || buenPrecio;

  useEffect(() => {
    if (!activo) { setRes(null); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      const p = new URLSearchParams({ q: q.trim(), limite: "24" });
      if (tipo) p.set("tipo", tipo);
      if (buenPrecio) p.set("buenPrecio", "1");
      try {
        const r = await fetch(`${API}/buscar?${p}`, { signal: ctl.signal });
        if (r.ok) setRes(await r.json());
      } catch { /* búsqueda cancelada */ }
    }, 180);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, tipo, buenPrecio, activo]);

  return (
    <>
      <label className="buscador">
        <svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
          placeholder="Busca una empresa o ticker: Apple, KO…" aria-label="Buscar empresa" />
      </label>
      <div className="filtros" role="group" aria-label="Filtros">
        <button className={tipo === "" ? "chip on" : "chip"} onClick={() => setTipo("")} aria-pressed={tipo === ""}>Todas</button>
        {(Object.keys(TIPOS) as Tipo[]).map((t) => (
          <button key={t} className={tipo === t ? "chip on" : "chip"} onClick={() => setTipo(tipo === t ? "" : t)}
            aria-pressed={tipo === t} title={TIPOS[t].explicacion}>{TIPOS[t].nombre}s</button>
        ))}
        <button className={buenPrecio ? "chip on" : "chip"} onClick={() => setBuenPrecio(!buenPrecio)} aria-pressed={buenPrecio}>
          Solo buen precio
        </button>
      </div>
      {activo ? (
        <>
          <div className="sec">{res ? `${res.total} ${res.total === 1 ? "empresa" : "empresas"}` : "Buscando…"}
            <span>ordenadas por el criterio prudente</span></div>
          <div className="tarjetas">{res?.resultados.map((e) => <Tarjeta key={e.ticker} e={e} />)}</div>
          {res && res.total === 0 && <p className="nota">No hay empresas con esos filtros.</p>}
        </>
      ) : children}
    </>
  );
}
