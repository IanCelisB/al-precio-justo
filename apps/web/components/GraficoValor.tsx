"use client";

import { useEffect, useMemo, useState } from "react";
import { ETIQUETA, estado, supuestosPorDefecto, valorar, type Supuestos, type Trimestre } from "@ancla/valoracion";
import { dinero, porcentaje } from "@ancla/valoracion/formato";
import {
  ajustar, CLAVE_MODELO, CONTROLES, geometriaValor, historialValor, type Cierre,
} from "@ancla/valoracion/grafico";

const PERIODOS = [1, 3, 5, 10];

function leer(ticker: string): Partial<Supuestos> {
  try { return JSON.parse(localStorage.getItem(CLAVE_MODELO(ticker)) ?? "{}"); } catch { return {}; }
}
function guardar(ticker: string, m: Partial<Supuestos>) {
  try {
    if (Object.keys(m).length) localStorage.setItem(CLAVE_MODELO(ticker), JSON.stringify(m));
    else localStorage.removeItem(CLAVE_MODELO(ticker));
  } catch { /* sin almacenamiento: el modelo dura lo que la visita */ }
}

/** Precio de cada semana sobre la banda de valor de cada momento, y "Tu modelo" para cambiar los supuestos. */
export function GraficoValor({ ticker, sector, trimestres, precios, precio }: {
  ticker: string; sector: string | null; trimestres: Trimestre[]; precios: Cierre[]; precio: number | null;
}) {
  const [anios, setAnios] = useState(5);
  const [modelo, setModelo] = useState<Partial<Supuestos>>({});
  const [abierto, setAbierto] = useState(false);
  useEffect(() => { const m = leer(ticker); setModelo(m); if (Object.keys(m).length) setAbierto(true); }, [ticker]);

  const cambiar = (m: Partial<Supuestos>) => { setModelo(m); guardar(ticker, m); };
  const sec = sector ?? undefined;

  const cierres = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 10);
    return precio && precios.at(-1)?.fecha !== hoy ? [...precios, { fecha: hoy, cierre: precio }] : precios;
  }, [precios, precio]);
  const historial = useMemo(() => historialValor(trimestres, cierres, { sector: sec, supuestos: modelo }), [trimestres, cierres, sec, modelo]);
  const desde = useMemo(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - anios); return d.toISOString().slice(0, 10);
  }, [anios]);
  const g = useMemo(() => geometriaValor(cierres, historial, desde), [cierres, historial, desde]);

  const base = useMemo(() => supuestosPorDefecto(trimestres, precio ?? undefined), [trimestres, precio]);
  const ahora = useMemo(() => valorar(trimestres, { precio: precio ?? undefined, sector: sec, supuestos: modelo }), [trimestres, precio, sec, modelo]);
  const propio = Object.keys(modelo).length > 0;
  const disponibles = Math.ceil((Date.now() - Date.parse(cierres[0]?.fecha ?? "")) / (365.25 * 86_400_000));

  if (!g) return null;
  const t = g.tiempo;
  return (
    <section className="grafico-valor" aria-label="Precio frente a su valor estimado">
      <div className="grafico-cab">
        <b>Precio frente a su valor</b>
        <div className="filtros" role="group" aria-label="Periodo">
          {PERIODOS.filter((a) => a === 1 || a <= disponibles).map((a) => (
            <button key={a} className={anios === a ? "chip on" : "chip"} onClick={() => setAnios(a)} aria-pressed={anios === a}>
              {a} {a === 1 ? "año" : "años"}
            </button>
          ))}
        </div>
      </div>

      <div className="grafico-lienzo">
        {g.marcasY.map((m) => (
          <div key={m.texto} className="grafico-guia" style={{ top: `${m.pos}%` }}><span className="mono">{m.texto}</span></div>
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img"
          aria-label={`Precio de ${ticker} y su banda de valor en ${anios} ${anios === 1 ? "año" : "años"}`}>
          {g.bandas.map((d, i) => <path key={i} d={d} className="g-banda" />)}
          {g.centro.map((d, i) => <path key={i} d={d} className="g-centro" />)}
          <path d={g.precio} className="g-precio" />
        </svg>
        {g.fin && <span className="grafico-punto" style={{ left: `${g.fin.x}%`, top: `${g.fin.y}%` }} />}
      </div>
      <div className="grafico-x mono">
        {g.marcasX.map((m) => <span key={m.texto} style={{ left: `${m.pos}%` }}>{m.texto}</span>)}
      </div>

      <div className="comparado-leyenda">
        <span><i className="precio" />Precio</span>
        <span><i className="banda" />Rango de valor{propio ? " (tu modelo)" : ""}</span>
      </div>
      {t && (
        <p className="nota">
          {g.cobertura < 0.9 ? "Desde que podemos estimar su valor" : anios === 1 ? "En el último año" : `En los últimos ${anios} años`} estuvo <b className="barata">barata</b> el {porcentaje(t.barata, 0)} del
          tiempo, <b>justa</b> el {porcentaje(t.rango, 0)} y <b className="cara">cara</b> el {porcentaje(t.cara, 0)}. Cada
          escalón es un reporte nuevo: el valor solo usa lo que se sabía en ese momento.
        </p>
      )}

      {sector !== "Financials" && (
        <div className="modelo">
          <button className="modelo-abrir" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
            <span>
              <b>Tu modelo</b>
              {ahora.ok && precio ? (
                <small> · {dinero(ahora.valor)} · <span className={estado(precio, ahora.valor)}>{ETIQUETA[estado(precio, ahora.valor)]}</span></small>
              ) : null}
            </span>
            <span aria-hidden>{abierto ? "−" : "+"}</span>
          </button>
          {abierto && (
            <>
              <p className="nota">Cambia los supuestos y mira cómo se mueve la banda. Se guarda en este dispositivo.</p>
              {CONTROLES.map((c) => {
                const v = modelo[c.id] ?? base[c.id];
                return (
                  <label key={c.id} className="control">
                    <span className="control-cab">
                      <span>{c.nombre} <small className="muted">{c.ayuda}</small></span>
                      <b className="mono">{porcentaje(v, c.paso < 0.005 ? 2 : 1)}</b>
                    </span>
                    <input type="range" min={c.min} max={c.max} step={c.paso} value={v}
                      onChange={(e) => cambiar({ ...modelo, [c.id]: ajustar(c.id, Number(e.target.value)) })} />
                  </label>
                );
              })}
              {!ahora.ok && <p className="nota en-contra">{ahora.motivo}</p>}
              {propio && <button className="enlace" onClick={() => cambiar({})}>Volver al modelo por defecto</button>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
