import Link from "next/link";
import { pagasPorCadaDolar } from "@ancla/valoracion";
import { fechaLarga, nombreCorto, saludo } from "@ancla/valoracion/formato";
import { Tarjeta } from "@/components/Tarjeta";
import { Logo } from "@/components/Logo";
import { sectorDe } from "@ancla/valoracion/sectores";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function Inicio() {
  const [inicio, tendencias] = await Promise.all([api.inicio(), api.tendencias(7)]);
  const vistas = tendencias.vistas.slice(0, 4).map((v) => v.empresa);
  const op = inicio.oportunidad;
  const baratas = inicio.baratas;
  // Las fechas se muestran en hora de Nueva York (la de la bolsa).
  const ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));

  return (
    <main className="wrap">
      <div className="hola">
        <small className="muted">{fechaLarga(ahora)}</small>
        <h1 className="hd">{saludo(ahora)}</h1>
      </div>

      {op && op.precio && op.valor && (
        <Link href={`/empresa/${op.ticker}`} className="hero">
          <small>Oportunidad del día · {sectorDe(op.sector).nombre}</small>
          <div className="hero-nombre">
            <Logo ticker={op.ticker} sector={op.sector} size={44} />
            <h2 className="hd">{nombreCorto(op.nombre)}</h2>
          </div>
          <div className="fila">
            <div>
              <div className="pct">−{Math.round((1 - op.precio / op.valor) * 100)}%</div>
              <small>bajo su valor estimado</small>
            </div>
            <span className="cta">Ver por qué</span>
          </div>
          <p>Hoy pagas ${pagasPorCadaDolar(op.precio, op.valor)} por cada $1 de valor que muestran sus resultados.</p>
        </Link>
      )}

      <div className="sec">{inicio.seguidasPropias ? "Tus empresas" : "Populares"} <Link href="/seguidas">{inicio.seguidasPropias ? "Ver todas" : "Sigue las tuyas"}</Link></div>
      <div className="tarjetas">
        {inicio.seguidas.map((e) => <Tarjeta key={e.ticker} e={e} />)}
      </div>

      {vistas.length >= 2 && (
        <>
          <div className="sec">Lo más visto esta semana <span>tendencia</span></div>
          <div className="tarjetas">{vistas.map((e) => <Tarjeta key={e.ticker} e={e} />)}</div>
        </>
      )}
      <div className="sec">Más baratas hoy <span>respecto a su valor</span></div>
      <div className="tarjetas">
        {baratas.map((e) => <Tarjeta key={e.ticker} e={e} />)}
      </div>

      <p className="nota">
        Valor estimado con flujo de caja libre descontado a 5 años, a partir de los reportes 10-Q y 10-K
        presentados a la SEC. No es una recomendación de inversión. {inicio.precioFuente}.
      </p>
    </main>
  );
}
