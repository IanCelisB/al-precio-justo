"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ACENTOS, MODOS, type Acento, type Preferencias } from "@ancla/valoracion/apariencia";
import { DIVISAS, establecerDivisa, fechaCorta, type Divisa } from "@ancla/valoracion/formato";

const COOKIE = "apj_pref";
const API = process.env.NEXT_PUBLIC_ANCLA_API ?? "http://localhost:4000";

/** Fija la divisa en el navegador (y en el render de servidor de los componentes de cliente). */
export function DivisaCliente({ divisa }: { divisa: Divisa }) {
  establecerDivisa(divisa);
  return null;
}

function guardarCookie(p: Preferencias) {
  document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(p))}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** Pantalla de configuración: tema, color de acento, divisa y uso anónimo. */
export function FormularioPreferencias({ inicial, detalle }: {
  inicial: Preferencias; detalle: { codigo: string; porUsd: number; fecha: string; fuente: string }[];
}) {
  const [p, setP] = useState(inicial);
  const router = useRouter();
  const tasas = new Map(detalle.map((d) => [d.codigo, d]));
  const cambiar = (x: Partial<Preferencias>) => {
    const n = { ...p, ...x };
    setP(n);
    guardarCookie(n);
    router.refresh(); // el servidor vuelve a pintar con el tema y la divisa nuevos
  };

  return (
    <div className="config">
      <section className="config-caja">
        <b>Apariencia</b>
        <div className="filtros" role="radiogroup" aria-label="Tema">
          {MODOS.map((m) => (
            <button key={m.id} className={p.tema === m.id ? "chip on" : "chip"} role="radio" aria-checked={p.tema === m.id}
              onClick={() => cambiar({ tema: m.id })}>{m.nombre}</button>
          ))}
        </div>
        <small className="muted">Color de acento</small>
        <div className="acentos" role="radiogroup" aria-label="Color de acento">
          {(Object.keys(ACENTOS) as Acento[]).map((a) => (
            <button key={a} className={p.acento === a ? "acento on" : "acento"} role="radio" aria-checked={p.acento === a}
              onClick={() => cambiar({ acento: a })}>
              <i style={{ background: ACENTOS[a].claro.mint }} aria-hidden />{ACENTOS[a].nombre}
            </button>
          ))}
        </div>
      </section>

      <section className="config-caja">
        <b>Divisa</b>
        <p className="nota">Precios, valores y métricas se muestran en esta moneda. El simulador sigue en USD.</p>
        <div className="config-lista" role="radiogroup" aria-label="Divisa">
          {Object.entries(DIVISAS).map(([codigo, info]) => {
            const d = tasas.get(codigo);
            const disponible = codigo === "USD" || !!d;
            return (
              <label key={codigo} className={disponible ? "config-opcion" : "config-opcion apagada"}>
                <input type="radio" name="divisa" checked={p.divisa === codigo} disabled={!disponible}
                  onChange={() => cambiar({ divisa: codigo })} />
                <span>
                  <b>{info.nombre} ({codigo})</b>
                  <small className="muted">
                    {codigo === "USD" ? "Moneda de los reportes" : d
                      ? `1 USD = ${d.porUsd.toLocaleString("es", { maximumFractionDigits: 4 })} ${codigo} · ${fechaCorta(d.fecha)} · ${d.fuente}`
                      : "Sin tasa disponible"}
                  </small>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="config-caja">
        <label className="config-interruptor">
          <span>
            <b>Uso anónimo</b>
            <small className="muted">Cuenta qué empresas se ven para mostrar tendencias y «quienes vieron esta también
              vieron». Sin nombre ni email: solo un número aleatorio de este navegador.</small>
          </span>
          <input type="checkbox" role="switch" checked={p.analitica} onChange={(e) => cambiar({ analitica: e.target.checked })} />
        </label>
      </section>
    </div>
  );
}

/** Anota la vista de una empresa (si el usuario no lo desactivó). */
export function RegistrarVista({ ticker, activo }: { ticker: string; activo: boolean }) {
  useEffect(() => {
    if (!activo) return;
    let sesion: string | null = null;
    try {
      sesion = localStorage.getItem("apj.sesionAnonima");
      if (!sesion) { sesion = crypto.randomUUID(); localStorage.setItem("apj.sesionAnonima", sesion); }
    } catch { return; }
    fetch(`${API}/eventos`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "vista", ticker, sesion }),
    }).catch(() => {});
  }, [ticker, activo]);
  return null;
}
