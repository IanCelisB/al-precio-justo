"use client";

import { useEffect, useState } from "react";
import { dinero, leerMonto, MONTO_MAXIMO, porcentajeConSigno, tono } from "@ancla/valoracion/formato";
import { Comparado } from "./Comparado";

const API = process.env.NEXT_PUBLIC_ANCLA_API ?? "http://localhost:4000";
const PERIODOS = [
  { anios: 1, nombre: "1 año" }, { anios: 3, nombre: "3 años" }, { anios: 5, nombre: "5 años" }, { anios: 10, nombre: "10 años" },
];
const IMPORTES = [100, 1000, 10000];

interface Resultado {
  fechaCompra: string; valorHoy: number; ganancia: number; gananciaPct: number; referenciaHoy: number | null;
  serie: { fecha: string; valor: number; referencia: number | null }[];
}

const pct = (x: number) => porcentajeConSigno(x, Math.abs(x) >= 10 ? 0 : 1);

/** "Si hubieras invertido X hace N años": resultado real con precios históricos, frente al S&P 500. */
export function MaquinaTiempo({ ticker, nombre }: { ticker: string; nombre: string }) {
  const [anios, setAnios] = useState(1);
  const [texto, setTexto] = useState("1000");
  const [importe, setImporte] = useState(1000);
  const monto = leerMonto(texto);
  const montoMalo = monto === null || monto > MONTO_MAXIMO;
  // Espera a que la persona deje de escribir antes de consultar.
  useEffect(() => {
    if (montoMalo || monto === importe) return;
    const id = setTimeout(() => setImporte(monto!), 400);
    return () => clearTimeout(id);
  }, [monto, montoMalo, importe]);
  const [r, setR] = useState<Resultado | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const desde = new Date();
    desde.setFullYear(desde.getFullYear() - anios);
    const ctl = new AbortController();
    fetch(`${API}/simulador/tiempo?ticker=${ticker}&importe=${importe}&desde=${desde.toISOString().slice(0, 10)}`, { signal: ctl.signal })
      .then(async (x) => { if (!x.ok) throw new Error(); setR(await x.json()); setError(false); })
      .catch((e) => { if (e?.name !== "AbortError") setError(true); });
    return () => ctl.abort();
  }, [ticker, anios, importe]);

  const leGanaAlIndice = r && r.referenciaHoy !== null ? r.valorHoy >= r.referenciaHoy : null;

  return (
    <div className="maquina">
      <div className="maquina-cab">
        <b>Máquina del tiempo</b>
        <small>Precios reales, dinero imaginario</small>
      </div>
      <p className="maquina-frase">Si hubieras invertido en {nombre}…</p>
      <label className="simular-importe">
        <span>$</span>
        <input inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)}
          aria-label="Monto a invertir en USD" aria-invalid={montoMalo} />
      </label>
      <div className="filtros">
        {IMPORTES.map((i) => (
          <button key={i} className={monto === i ? "chip on" : "chip"} onClick={() => setTexto(String(i))} aria-pressed={monto === i}>
            {dinero(i, 0)}
          </button>
        ))}
      </div>
      {montoMalo && <p className="nota en-contra">Escribe un monto entre $1 y {dinero(MONTO_MAXIMO, 0)}.</p>}
      <p className="maquina-frase">…hace</p>
      <div className="filtros">
        {PERIODOS.map((p) => (
          <button key={p.anios} className={anios === p.anios ? "chip on" : "chip"} onClick={() => setAnios(p.anios)} aria-pressed={anios === p.anios}>
            {p.nombre}
          </button>
        ))}
      </div>
      {error && <p className="nota">No tenemos precios de tanto tiempo para esta empresa.</p>}
      {r && !error && (
        <>
          <div className="maquina-resultado">
            <div>
              <small>Hoy tendrías</small>
              <b className={tono(r.ganancia)}>{dinero(r.valorHoy, 0)}</b>
              <span className={tono(r.ganancia)}>{pct(r.gananciaPct)}</span>
            </div>
            {r.referenciaHoy !== null && (
              <div>
                <small>En el S&P 500</small>
                <b>{dinero(r.referenciaHoy, 0)}</b>
                <span className="muted">{pct(r.referenciaHoy / importe - 1)}</span>
              </div>
            )}
          </div>
          <Comparado valores={r.serie.map((p) => p.valor)} referencia={r.serie.map((p) => p.referencia)} alto={110}
            etiquetas={[nombre, "S&P 500"]} />
          {leGanaAlIndice !== null && (
            <p className="nota">
              {leGanaAlIndice ? `${nombre} le ganó al S&P 500 en este periodo.` : `El S&P 500 le ganó a ${nombre} en este periodo.`}
              {" "}Comprando el {new Date(`${r.fechaCompra}T12:00:00Z`).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}.
              Los resultados pasados no garantizan resultados futuros.
            </p>
          )}
        </>
      )}
    </div>
  );
}
