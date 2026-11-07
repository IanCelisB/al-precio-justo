"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

/**
 * Botón "Continuar con Google" (Google Identity Services). Google devuelve un ID
 * token firmado que la web envía a /api/sesion; nunca vemos la contraseña.
 */
export function IniciarSesion({ prueba }: { prueba: boolean }) {
  const boton = useRef<HTMLDivElement>(null);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const enviar = async (body: object) => {
    setError(null);
    const r = await fetch("/api/sesion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) router.refresh();
    else setError((await r.json().catch(() => ({}))).error ?? "No pudimos iniciar sesión.");
  };

  useEffect(() => {
    if (!listo || !CLIENT_ID || !window.google || !boton.current) return;
    window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: (r) => enviar({ idToken: r.credential }) });
    window.google.accounts.id.renderButton(boton.current, {
      theme: "outline", size: "large", shape: "pill", text: "continue_with", locale: "es", width: 300,
    });
  }, [listo]);

  return (
    <div className="login">
      {CLIENT_ID ? (
        <>
          <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={() => setListo(true)} />
          <div ref={boton} />
        </>
      ) : (
        <p className="nota">
          El inicio de sesión con Google está listo, pero falta configurarlo: define
          <code> NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> en la web y <code>GOOGLE_CLIENT_IDS</code> en la API.
        </p>
      )}
      {prueba && (
        <button className="agregar" onClick={() => enviar({ prueba: true })}>
          Entrar con un usuario de prueba (solo desarrollo)
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function CerrarSesion() {
  const router = useRouter();
  return (
    <button className="agregar" onClick={async () => { await fetch("/api/sesion", { method: "DELETE" }); router.refresh(); }}>
      Cerrar sesión
    </button>
  );
}

export function BorrarCuenta() {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  if (!confirmar) return <button className="borrar" onClick={() => setConfirmar(true)}>Borrar mi cuenta</button>;
  return (
    <div className="confirmar">
      <p>Se borrarán tu cuenta, tus empresas seguidas y tus métricas. No se puede deshacer.</p>
      <button className="borrar" onClick={async () => {
        await fetch("/api/yo/cuenta", { method: "DELETE" });
        router.refresh();
      }}>Sí, borrar</button>
      <button className="agregar" onClick={() => setConfirmar(false)}>Cancelar</button>
    </div>
  );
}
