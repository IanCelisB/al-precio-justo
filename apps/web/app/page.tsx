import Link from "next/link";
import { FILTROS, type FiltroPortada } from "@ancla/valoracion/portada";
import { Carril, Portada } from "@/components/Portada";
import { Poster } from "@/components/Poster";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Portada "cine": destacadas que rotan y filas de carruseles con las ~1.000 empresas. */
export default async function Inicio({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const { filtro: f } = await searchParams;
  const filtro = (FILTROS.some((x) => x.id === f) ? f : "todo") as FiltroPortada;
  const p = await api.portada(filtro);

  return (
    <main className="cine">
      <Portada destacadas={p.destacadas} />

      <nav className="filtros-cine" aria-label="Filtros de la portada">
        {FILTROS.map((x) => (
          <Link key={x.id} href={x.id === "todo" ? "/" : `/?filtro=${x.id}`} scroll={false}
            className="chip-cine" aria-current={x.id === filtro ? "page" : undefined}>{x.nombre}</Link>
        ))}
      </nav>

      {(filtro === "tamano" || filtro === "descubre") && (
        <div className="explica-ciclo">
          <div><b>Grandes</b><span>Más de US$1.000 millones en bolsa: suelen ser negocios consolidados.</span></div>
          <div><b>Pequeñas</b><span>Menos de US$1.000 millones: más espacio para crecer y más riesgo.</span></div>
        </div>
      )}

      {p.filas.map((fila) => (
        <Carril key={fila.id} titulo={fila.titulo} sub={fila.sub}>
          {fila.empresas.map((e, k) => <Poster key={e.ticker} e={e} puesto={fila.ranking ? k + 1 : undefined} />)}
        </Carril>
      ))}

      <p className="nota pie-cine">
        Valor estimado con flujo de caja libre descontado a 5 años, a partir de los reportes 10-Q y 10-K presentados a la
        SEC. El porcentaje de cada póster es el cambio del precio en 12 meses. No es una recomendación de inversión.
      </p>
    </main>
  );
}
