"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TIPOS_AVISO, UMBRALES, type AjustesAvisos } from "@ancla/valoracion/avisos";
import { dineroUsd, leerMonto } from "@ancla/valoracion/formato";

const json = (body: unknown) => ({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Número de avisos sin leer (se revisa cada minuto y al cambiar de página). 0 sin sesión. */
export function useSinLeer(): number {
  const [n, setN] = useState(0);
  const ruta = usePathname();
  useEffect(() => {
    let vivo = true;
    const mirar = () => fetch("/api/yo/avisos").then((r) => (r.ok ? r.json() : { sinLeer: 0 }))
      .then((d) => { if (vivo) setN(d.sinLeer ?? 0); }).catch(() => {});
    mirar();
    const t = setInterval(mirar, 60_000);
    return () => { vivo = false; clearInterval(t); };
  }, [ruta]);
  return n;
}

/** Al abrir la página de avisos, los marca como leídos (se ven resaltados esta vez). */
export function MarcarLeidos({ hay }: { hay: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!hay) return;
    const t = setTimeout(() => fetch("/api/yo/avisos/leidos", json({})).then(() => router.refresh()), 2500);
    return () => clearTimeout(t);
  }, [hay, router]);
  return null;
}

/** Qué avisos quiere recibir el usuario. */
export function FormularioAvisos({ inicial }: { inicial: AjustesAvisos }) {
  const [a, setA] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const cambiar = async (x: Partial<AjustesAvisos>) => {
    const previo = a;
    setA({ ...a, ...x });
    const r = await fetch("/api/yo/avisos/ajustes", json(x)).catch(() => null);
    if (!r?.ok) { setA(previo); setError("No pudimos guardar el cambio. Inténtalo de nuevo."); return; }
    setError(null);
    setA(await r.json());
  };
  return (
    <section className="config-caja">
      <b>Qué avisos quieres</b>
      <div className="config-lista">
        {TIPOS_AVISO.map((t) => (
          <label key={t.id} className="config-opcion config-interruptor">
            <span><b className="aviso-nombre">{t.nombre}</b><small className="muted">{t.descripcion}</small></span>
            <input type="checkbox" role="switch" checked={a[t.id]} onChange={(e) => cambiar({ [t.id]: e.target.checked })} />
          </label>
        ))}
      </div>
      {a.movimiento && (
        <>
          <small className="muted">Movimiento fuerte: avisar desde</small>
          <div className="filtros" role="radiogroup" aria-label="Umbral de movimiento">
            {UMBRALES.map((u) => (
              <button key={u} className={a.umbral === u ? "chip on" : "chip"} role="radio" aria-checked={a.umbral === u}
                onClick={() => cambiar({ umbral: u })}>±{u} % en el día</button>
            ))}
          </div>
        </>
      )}
      {error && <p className="nota baja" role="alert">{error}</p>}
    </section>
  );
}

/** Fijar, cambiar o quitar el precio objetivo de una empresa (en la ficha). */
export function PrecioObjetivo({ ticker, precioActual, inicial, conSesion }: {
  ticker: string; precioActual: number | null; inicial: { precio: number; cumplido: string | null } | null; conSesion: boolean;
}) {
  const [obj, setObj] = useState(inicial);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(inicial ? String(inicial.precio) : precioActual ? (precioActual * 0.9).toFixed(2) : "");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  if (!conSesion) return <Link href="/perfil" className="seguir objetivo-btn">🔔 Avisarme</Link>;

  const guardar = async () => {
    const precio = leerMonto(texto);
    if (precio === null) { setError("Escribe un precio válido."); return; }
    setOcupado(true);
    const r = await fetch(`/api/yo/objetivos/${ticker}`, json({ precio })).catch(() => null);
    setOcupado(false);
    const d = await r?.json().catch(() => ({}));
    if (!r?.ok) { setError(d?.error ?? "No pudimos guardar el precio objetivo."); return; }
    setObj({ precio: d.precio, cumplido: null }); setAbierto(false); setError(null);
  };
  const quitar = async () => {
    setOcupado(true);
    const r = await fetch(`/api/yo/objetivos/${ticker}`, { method: "DELETE" }).catch(() => null);
    setOcupado(false);
    if (r?.ok) { setObj(null); setAbierto(false); }
  };

  if (!abierto) {
    return (
      <button className={obj && !obj.cumplido ? "seguir objetivo-btn activo" : "seguir objetivo-btn"} onClick={() => setAbierto(true)}>
        🔔 {obj && !obj.cumplido ? `Aviso a ${dineroUsd(obj.precio)}` : obj?.cumplido ? "Objetivo cumplido" : "Avisarme"}
      </button>
    );
  }
  return (
    <form className="objetivo" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
      <label>
        <small className="muted">Avísame cuando la acción llegue a (USD)</small>
        <span className="objetivo-campo">
          <b aria-hidden>$</b>
          <input inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus
            aria-describedby={`obj-ayuda-${ticker}`} />
        </span>
      </label>
      <small id={`obj-ayuda-${ticker}`} className="muted">
        {precioActual ? `Hoy cotiza a ${dineroUsd(precioActual)}. Te avisamos dentro de la app.` : "Te avisamos dentro de la app."}
      </small>
      {error && <small className="baja" role="alert">{error}</small>}
      <div className="objetivo-botones">
        <button type="submit" className="btn-pri" disabled={ocupado}>Guardar</button>
        {obj && <button type="button" className="chip" onClick={quitar} disabled={ocupado}>Quitar aviso</button>}
        <button type="button" className="chip" onClick={() => setAbierto(false)}>Cancelar</button>
      </div>
    </form>
  );
}

/** Quitar un precio objetivo desde la lista de avisos. */
export function QuitarObjetivo({ ticker }: { ticker: string }) {
  const router = useRouter();
  return (
    <button className="chip" onClick={async () => {
      await fetch(`/api/yo/objetivos/${ticker}`, { method: "DELETE" });
      router.refresh();
    }}>Quitar</button>
  );
}
