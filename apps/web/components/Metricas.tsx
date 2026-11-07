"use client";

import { useEffect, useState } from "react";
import type { Trimestre } from "@ancla/valoracion";
import { porcentajeConSigno } from "@ancla/valoracion/formato";
import type { Cierre } from "@ancla/valoracion/grafico";
import {
  ADICIONALES, CLAVE_GUARDADO, CLAVE_PERIODO, EXTRA_POR_DEFECTO, PERIODO_POR_DEFECTO, PERIODOS_METRICAS, PRINCIPALES,
  geometriaLinea, mostrar, porId, serieMetrica, type Metrica, type PeriodoMetricas, type PuntoMetrica,
} from "@ancla/valoracion/metricas";

type Ctx = { trimestres: Trimestre[]; precio: number | null; precios: Cierre[]; anios: PeriodoMetricas };

/** Las 7 métricas principales y las que el usuario decida añadir (se guardan en este navegador). */
export function Metricas({ trimestres, precio, precios, conSesion = false, inicial }: {
  trimestres: Trimestre[]; precio: number | null; precios: Cierre[]; conSesion?: boolean; inicial?: string[];
}) {
  const [extra, setExtra] = useState<string[]>(inicial ?? EXTRA_POR_DEFECTO);
  const [abierto, setAbierto] = useState(false);
  const [anios, setAnios] = useState<PeriodoMetricas>(PERIODO_POR_DEFECTO);
  useEffect(() => {
    try {
      const g = Number(localStorage.getItem(CLAVE_PERIODO));
      if ((PERIODOS_METRICAS as readonly number[]).includes(g)) setAnios(g as PeriodoMetricas);
    } catch { /* sin almacenamiento */ }
  }, []);
  const elegirPeriodo = (a: PeriodoMetricas) => {
    setAnios(a);
    try { localStorage.setItem(CLAVE_PERIODO, String(a)); } catch { /* ignorar */ }
  };
  // Años de historia: no se ofrecen periodos sin datos.
  const historia = trimestres.length / 4;

  useEffect(() => {
    if (conSesion) return; // vienen de la cuenta
    try {
      const g = JSON.parse(localStorage.getItem(CLAVE_GUARDADO) ?? "null");
      if (Array.isArray(g)) setExtra(g.filter((id) => porId(id)));
    } catch { /* sin almacenamiento: se usan las de por defecto */ }
  }, [conSesion]);

  const guardar = (ids: string[]) => {
    setExtra(ids);
    if (conSesion) {
      fetch("/api/yo/metricas", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }).catch(() => {});
      return;
    }
    try { localStorage.setItem(CLAVE_GUARDADO, JSON.stringify(ids)); } catch { /* ignorar */ }
  };
  const alternar = (id: string) => guardar(extra.includes(id) ? extra.filter((x) => x !== id) : [...extra, id]);
  const ctx: Ctx = { trimestres, precio, precios, anios };

  return (
    <>
      <div className="sec">Las 7 métricas clave <span>últimos 12 meses</span></div>
      <div className="periodos" role="group" aria-label="Periodo de los gráficos">
        <small className="muted">Gráficos de</small>
        {PERIODOS_METRICAS.filter((a) => a <= 2 || a <= Math.ceil(historia)).map((a) => (
          <button key={a} className={anios === a ? "chip on" : "chip"} onClick={() => elegirPeriodo(a)} aria-pressed={anios === a}>
            {a} {a === 1 ? "año" : "años"}
          </button>
        ))}
      </div>
      <div className="metricas">
        {PRINCIPALES.map((m) => <FichaMetrica key={m.id} m={m} ctx={ctx} />)}
      </div>

      <div className="sec">Tus métricas <span>{extra.length ? extra.length === 1 ? "1 añadida" : `${extra.length} añadidas` : "elige las que quieras"}</span></div>
      {extra.length > 0 && (
        <div className="metricas">
          {extra.map((id) => porId(id)).filter((m): m is Metrica => !!m).map((m) => (
            <FichaMetrica key={m.id} m={m} ctx={ctx} onQuitar={() => alternar(m.id)} />
          ))}
        </div>
      )}
      <button className="agregar" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
        {abierto ? "Listo" : "+ Agregar métricas"}
      </button>
      {abierto && (
        <div className="selector" role="group" aria-label="Métricas disponibles">
          {ADICIONALES.map((m) => {
            const on = extra.includes(m.id);
            return (
              <label key={m.id} className={on ? "opcion on" : "opcion"}>
                <input type="checkbox" checked={on} onChange={() => alternar(m.id)} aria-label={m.nombre} />
                <span>
                  <b>{m.nombre}</b>
                  <small>{m.descripcion}</small>
                </span>
                <em className="mono">{mostrar(m.valor({ trimestres, precio }), m.formato)}</em>
              </label>
            );
          })}
        </div>
      )}
    </>
  );
}

function FichaMetrica({ m, ctx, onQuitar }: { m: Metrica; ctx: Ctx; onQuitar?: () => void }) {
  const s0 = serieMetrica(m, ctx.trimestres, ctx.anios, { precios: ctx.precios, precio: ctx.precio });
  const puntos = s0.puntos.some((p) => p.valor !== null) ? s0.puntos : [];
  const valor = m.valor(ctx);
  const cambio = s0.cambio;
  return (
    <div className="metrica">
      <div className="metrica-cab">
        <small>{m.nombre}</small>
        {onQuitar && <button className="quitar" onClick={onQuitar} aria-label={`Quitar ${m.nombre}`}>×</button>}
      </div>
      {valor === null ? <b className="sin-dato">No lo informa</b> : <b>{mostrar(valor, m.formato)}</b>}
      <p>{m.descripcion}</p>
      {cambio !== null && puntos.length > 1 && (
        <p className={`metrica-cambio ${(cambio >= 0) !== !!m.menosEsMejor ? "sube" : "baja"}`}>
          {porcentajeConSigno(cambio, Math.abs(cambio) >= 1 ? 0 : 1)} en {ctx.anios} {ctx.anios === 1 ? "año" : "años"}
        </p>
      )}
      {puntos.length > 1 && <Linea puntos={puntos} m={m} anual={s0.modo === "anual"} />}
    </div>
  );
}

/**
 * Gráfico de línea de los últimos trimestres. La línea es un SVG que se estira al
 * ancho; los puntos son elementos aparte para que sigan siendo redondos. Cada punto
 * queda centrado sobre su etiqueta. Un punto negativo va en rojo solo si negativo es malo
 * (caja, beneficios); en la deuda neta, negativo significa que sobra caja.
 */
function Linea({ puntos, m, anual }: { puntos: PuntoMetrica[]; m: Metrica; anual: boolean }) {
  const g = geometriaLinea(puntos.map((p) => p.valor));
  const ultimo = puntos.length - 1;
  return (
    <div className="grafico" aria-label={`${m.nombre} por ${anual ? "año" : "trimestre"}`}>
      <div className="linea">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {g.cero !== null && <line x1="0" x2="100" y1={g.cero} y2={g.cero} className="linea-cero" />}
          {g.areas.map((d, i) => <path key={`a${i}`} d={d} className="linea-area" />)}
          {g.tramos.map((d, i) => <path key={`t${i}`} d={d} className="linea-trazo" />)}
        </svg>
        {g.puntos.map((p, i) => p && (
          <span key={puntos[i].etiqueta}
            className={`linea-punto${i === ultimo ? " ultimo" : ""}${(puntos[i].valor ?? 0) < 0 && !m.menosEsMejor ? " neg" : ""}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            title={`${puntos[i].etiqueta}: ${mostrar(puntos[i].valor, m.formato)}`} />
        ))}
      </div>
      <div className="barras-etiquetas" aria-hidden>
        {puntos.map((p) => <small key={p.etiqueta}>{p.visible ? p.etiqueta : ""}</small>)}
      </div>
    </div>
  );
}
