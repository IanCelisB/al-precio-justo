import Link from "next/link";
import { Tarjeta } from "@/components/Tarjeta";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seguidas · Ancla" };

export default async function Seguidas() {
  const yo = await api.yo();
  const lista = yo ? await api.algunas(yo.seguidas) : [];
  return (
    <main className="wrap">
      <h1 className="hd titulo">Seguidas</h1>
      {!yo ? (
        <div className="vacio">
          <p>Inicia sesión para seguir empresas y verlas aquí y en tu inicio, en la web y en el móvil.</p>
          <Link href="/perfil" className="cta-link">Iniciar sesión</Link>
        </div>
      ) : lista.length === 0 ? (
        <div className="vacio">
          <p>Todavía no sigues ninguna empresa. Abre una y pulsa «♡ Seguir».</p>
          <Link href="/buscar" className="cta-link">Buscar empresas</Link>
        </div>
      ) : (
        <div className="tarjetas">{lista.map((e) => <Tarjeta key={e.ticker} e={e} />)}</div>
      )}
    </main>
  );
}
