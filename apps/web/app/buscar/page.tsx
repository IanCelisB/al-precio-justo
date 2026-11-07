import { TIPOS, type Tipo } from "@ancla/valoracion/recomendaciones";
import { Buscador } from "@/components/Buscador";
import { Idea } from "@/components/Idea";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";
export const metadata = { title: "Buscar · Al Precio Justo" };

export default async function Buscar() {
  const rec = await api.recomendaciones();
  return (
    <main className="wrap">
      <h1 className="hd titulo">Buscar</h1>
      <Buscador>
        <div className="sec">Buen precio de compra hoy <span>{rec.sugeridas.length} empresas</span></div>
        <p className="explica">
          Empresas sólidas que hoy cotizan por debajo de su <b>precio de compra</b>: su valor estimado menos un
          margen de seguridad que crece cuanto más incierto es el negocio.
        </p>
        <div className="criterios">
          {(Object.keys(TIPOS) as Tipo[]).map((t) => (
            <div key={t} className={`criterio ${t}`}>
              <b>{TIPOS[t].nombre} · −{Math.round(TIPOS[t].margen * 100)} %</b>
              <span>{TIPOS[t].explicacion}</span>
            </div>
          ))}
        </div>
        <div className="ideas">{rec.sugeridas.map((e) => <Idea key={e.ticker} e={e} />)}</div>

        <div className="sec">Para vigilar <span>buenas empresas, casi en precio</span></div>
        <div className="ideas">{rec.vigilar.map((e) => <Idea key={e.ticker} e={e} />)}</div>

        <p className="nota">{rec.criterio} {rec.aviso}</p>
      </Buscador>
    </main>
  );
}
