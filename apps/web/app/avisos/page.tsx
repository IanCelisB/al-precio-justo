import Link from "next/link";
import { AJUSTES_AVISOS_POR_DEFECTO } from "@ancla/valoracion/avisos";
import { dineroUsd, fechaCorta, nombreCorto } from "@ancla/valoracion/formato";
import { FormularioAvisos, MarcarLeidos, QuitarObjetivo } from "@/components/Avisos";
import { Logo } from "@/components/Logo";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";
export const metadata = { title: "Avisos · Al Precio Justo" };

const ICONO: Record<string, string> = { objetivo: "🎯", estado: "⚖️", reporte: "📄", movimiento: "⚡" };

export default async function Avisos() {
  const [lista, ajustes, objetivos] = await Promise.all([api.avisos(), api.ajustesAvisos(), api.objetivos()]);

  if (!lista) {
    return (
      <main className="wrap">
        <h1 className="hd titulo">Avisos</h1>
        <div className="vacio">
          <p>Inicia sesión para recibir avisos: cuando una acción llegue a tu precio objetivo, cuando una empresa que sigues
            pase a barata o publique su reporte.</p>
          <Link href="/perfil" className="cta-link">Iniciar sesión</Link>
        </div>
      </main>
    );
  }

  const pendientes = objetivos.filter((o) => !o.cumplido);
  return (
    <main className="wrap avisos-pagina">
      <h1 className="hd titulo">Avisos</h1>
      <MarcarLeidos hay={lista.sinLeer > 0} />

      <section className="avisos-lista" aria-label="Tus avisos">
        {lista.avisos.length === 0 ? (
          <div className="vacio">
            <p>Todavía no tienes avisos. Abre una empresa y pulsa «🔔 Avisarme» para fijar un precio objetivo.</p>
            <Link href="/buscar" className="cta-link">Buscar empresas</Link>
          </div>
        ) : lista.avisos.map((a) => (
          <Link key={a.id} href={`/empresa/${a.ticker}`} className={a.leido ? "aviso" : "aviso nuevo"}>
            <Logo ticker={a.ticker} sector={a.sector} size={44} />
            <span className="aviso-cuerpo">
              <b>{ICONO[a.tipo]} {a.titulo}</b>
              <small>{a.texto}</small>
              <small className="muted">{fechaCorta(a.creado.slice(0, 10))}</small>
            </span>
            {!a.leido && <i className="aviso-punto" aria-label="Nuevo" />}
          </Link>
        ))}
      </section>

      <section className="config-caja">
        <b>Tus precios objetivo</b>
        {pendientes.length === 0 ? (
          <p className="nota">No tienes precios objetivo activos.</p>
        ) : (
          <div className="config-lista">
            {pendientes.map((o) => (
              <div key={o.ticker} className="config-opcion objetivo-fila">
                <Logo ticker={o.ticker} sector={o.sector} size={36} />
                <span>
                  <Link href={`/empresa/${o.ticker}`}><b>{nombreCorto(o.nombre)}</b></Link>
                  <small className="muted">
                    Cuando {o.direccion === "baja" ? "baje" : "suba"} a {dineroUsd(o.precio)}
                    {o.precioActual ? ` · hoy ${dineroUsd(o.precioActual)}` : ""}
                  </small>
                </span>
                <QuitarObjetivo ticker={o.ticker} />
              </div>
            ))}
          </div>
        )}
      </section>

      <FormularioAvisos inicial={ajustes ?? AJUSTES_AVISOS_POR_DEFECTO} />
      <p className="nota">Los precios llegan con retraso y se revisan varias veces al día. Los avisos son informativos, no una
        recomendación de compra o venta.</p>
    </main>
  );
}
