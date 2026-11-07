"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Vender una posición entera desde la cartera. */
export function VenderTodo({ ticker }: { ticker: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  return (
    <button className="vender" disabled={ocupado} onClick={async () => {
      setOcupado(true);
      await fetch("/api/simulador/vender", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker, acciones: null }) });
      setOcupado(false);
      router.refresh();
    }}>Vender</button>
  );
}

/** Empezar de nuevo con 30.000 USD ficticios, con confirmación. */
export function Reiniciar() {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  if (!confirmar) return <button className="borrar" onClick={() => setConfirmar(true)}>Reiniciar cartera</button>;
  return (
    <div className="confirmar">
      <p>Se borrarán tus operaciones simuladas y volverás a tener 30.000 USD ficticios.</p>
      <div className="acciones">
        <button className="borrar" onClick={async () => {
          await fetch("/api/simulador/reiniciar", { method: "POST" });
          setConfirmar(false);
          router.refresh();
        }}>Sí, reiniciar</button>
        <button className="agregar" onClick={() => setConfirmar(false)}>Cancelar</button>
      </div>
    </div>
  );
}
