"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Seguir o dejar de seguir una empresa. Sin sesión, invita a iniciarla. */
export function BotonSeguir({ ticker, seguida, conSesion }: { ticker: string; seguida: boolean; conSesion: boolean }) {
  const [on, setOn] = useState(seguida);
  const [ocupado, setOcupado] = useState(false);
  const router = useRouter();

  if (!conSesion) {
    return <Link href="/perfil" className="seguir">♡ Seguir</Link>;
  }
  const alternar = async () => {
    setOcupado(true);
    const r = await fetch(`/api/yo/seguidas/${ticker}`, { method: on ? "DELETE" : "PUT" });
    setOcupado(false);
    if (r.ok) { setOn(!on); router.refresh(); }
  };
  return (
    <button className={on ? "seguir on" : "seguir"} onClick={alternar} disabled={ocupado} aria-pressed={on}>
      {on ? "♥ Siguiendo" : "♡ Seguir"}
    </button>
  );
}
