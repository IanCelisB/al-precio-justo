"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { dinero, dineroConSigno, leerMonto, porcentajeConSigno, tono } from "@ancla/valoracion/formato";

const RAPIDOS = [500, 1000, 5000];

interface Posicion { acciones: number; costeMedio: number; valor: number | null; ganancia: number | null; gananciaPct: number | null }

/** Comprar o vender con dinero ficticio desde la ficha de una empresa. */
export function PanelSimular({ ticker, nombre, precio, conSesion, efectivo, posicion }: {
  ticker: string; nombre: string; precio: number | null; conSesion: boolean; efectivo: number | null; posicion: Posicion | null;
}) {
  const [importe, setImporte] = useState("1000");
  const [estado, setEstado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const router = useRouter();

  if (!conSesion) {
    return (
      <div className="simular">
        <div className="simular-cab"><b>Simula una compra</b><span className="pildora-fake">Dinero ficticio</span></div>
        <p className="nota">Tienes 30.000 USD ficticios para probar tus ideas con precios reales. Inicia sesión para empezar.</p>
        <Link href="/perfil" className="cta-link">Empezar a simular</Link>
      </div>
    );
  }

  const operar = async (accion: "comprar" | "vender", body: object) => {
    setOcupado(true); setEstado(null);
    const r = await fetch(`/api/simulador/${accion}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) { setEstado({ tipo: "error", texto: d.error ?? "No se pudo completar." }); return; }
    const o = d.operacion;
    setEstado({ tipo: "ok", texto: accion === "comprar"
      ? `Compraste ${o.acciones.toLocaleString("es", { maximumFractionDigits: 4 })} acciones por ${dinero(o.importe)}.`
      : `Vendiste ${o.acciones.toLocaleString("es", { maximumFractionDigits: 4 })} acciones por ${dinero(o.importe)}.` });
    router.refresh();
  };

  const n = leerMonto(importe) ?? 0;
  return (
    <div className="simular">
      <div className="simular-cab"><b>Simula una compra</b><span className="pildora-fake">Dinero ficticio</span></div>
      {posicion && (
        <div className="simular-posicion">
          <div><small>Tienes</small><b className="mono">{posicion.acciones.toLocaleString("es", { maximumFractionDigits: 4 })} acc.</b></div>
          <div><small>Valen</small><b className="mono">{posicion.valor !== null ? dinero(posicion.valor) : "—"}</b></div>
          <div><small>Resultado</small>
            <b className={`mono ${tono(posicion.ganancia)}`}>
              {posicion.ganancia !== null ? dineroConSigno(posicion.ganancia) : "—"}
              {posicion.gananciaPct !== null && ` (${porcentajeConSigno(posicion.gananciaPct)})`}
            </b>
          </div>
        </div>
      )}
      <label className="simular-importe">
        <span>$</span>
        <input inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} aria-label="Importe a invertir en USD" />
      </label>
      <div className="filtros">
        {RAPIDOS.map((x) => <button key={x} className="chip" onClick={() => setImporte(String(x))}>{dinero(x, 0)}</button>)}
        {efectivo !== null && efectivo >= 1 && (
          <button className="chip" onClick={() => setImporte(String(Math.floor(efectivo * 100) / 100))}>Todo</button>
        )}
      </div>
      <p className="nota">
        {precio && n > 0 ? `≈ ${(n / precio).toLocaleString("es", { maximumFractionDigits: 4 })} acciones a ${dinero(precio)}. ` : ""}
        Disponible: {efectivo !== null ? dinero(efectivo) : "—"}.
      </p>
      <div className="acciones">
        <button className="cta-btn" disabled={ocupado || !(n > 0)} onClick={() => operar("comprar", { ticker, importe: n })}>
          Comprar {nombre}
        </button>
        {posicion && (
          <button className="agregar" disabled={ocupado} onClick={() => operar("vender", { ticker, acciones: null })}>
            Vender todo
          </button>
        )}
      </div>
      {estado && <p className={estado.tipo === "ok" ? "ok" : "error"}>{estado.texto} {estado.tipo === "ok" && <Link href="/simulador">Ver mi cartera</Link>}</p>}
    </div>
  );
}
