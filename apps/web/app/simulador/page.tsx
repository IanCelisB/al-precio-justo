import Link from "next/link";
import { dinero, dineroConSigno as usd, nombreCorto, porcentajeConSigno as pct, tono } from "@ancla/valoracion/formato";
import { SALDO_INICIAL } from "@ancla/valoracion/simulador";
import { Reiniciar, VenderTodo } from "@/components/AccionesSimulador";
import { Comparado } from "@/components/Comparado";
import { Logo } from "@/components/Logo";
import { MaquinaTiempo } from "@/components/MaquinaTiempo";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";
export const metadata = { title: "Simulador · Al Precio Justo" };


export default async function Simulador() {
  const cartera = await api.simulador();

  if (!cartera) {
    return (
      <main className="wrap">
        <h1 className="hd titulo">Simulador</h1>
        <div className="tarjeta-login">
          <span className="pildora-fake">Dinero ficticio · precios reales</span>
          <h2 className="hd">Practica con {dinero(SALDO_INICIAL, 0)} sin arriesgar nada</h2>
          <p>Compra y vende acciones reales con dinero de mentira. Si Nvidia sube un 100 %, lo verás en tu cartera.
            Compara tus resultados con el S&P 500 y descubre si tus ideas funcionan antes de invertir de verdad.</p>
          <Link href="/perfil" className="cta-link">Iniciar sesión para empezar</Link>
        </div>
        <MaquinaTiempo ticker="NVDA" nombre="Nvidia" />
      </main>
    );
  }

  const c = cartera;
  const vsIndice = c.referencia !== null ? c.valorTotal - c.referencia : null;
  return (
    <main className="wrap">
      <div className="fila-top">
        <h1 className="hd titulo">Simulador</h1>
        <span className="pildora-fake">Dinero ficticio</span>
      </div>

      <div className="cartera">
        <small>Valor de tu cartera</small>
        <b className="cartera-total">{dinero(c.valorTotal)}</b>
        <span className={tono(c.ganancia)}>{usd(c.ganancia)} ({pct(c.gananciaPct)}) desde que empezaste</span>
        <div className="cartera-datos">
          <div><small>Disponible</small><b className="mono">{dinero(c.efectivo)}</b></div>
          <div><small>Invertido</small><b className="mono">{dinero(c.valorPosiciones)}</b></div>
          <div><small>Ya ganado al vender</small><b className={`mono ${tono(c.realizada)}`}>{usd(c.realizada)}</b></div>
        </div>
        {c.curva.length > 1 && (
          <Comparado valores={c.curva.map((p) => p.valor)} referencia={c.curva.map((p) => p.referencia)} etiquetas={["Tu cartera", "S&P 500"]} />
        )}
        {vsIndice !== null && c.posiciones.length > 0 && (
          <p className="nota">
            Si hubieras puesto lo mismo en el S&P 500 tendrías {dinero(c.referencia!)}:
            {" "}{vsIndice >= 0 ? `le vas ganando por ${dinero(vsIndice)}.` : `te va ganando por ${dinero(-vsIndice)}.`}
          </p>
        )}
      </div>

      <div className="sec">Tus posiciones <span>{c.posiciones.length || "ninguna todavía"}</span></div>
      {c.posiciones.length === 0 ? (
        <div className="vacio">
          <p>Abre una empresa y pulsa «Comprar» para tu primera inversión simulada. Puedes empezar por las ideas con buen precio.</p>
          <Link href="/buscar" className="cta-link">Ver ideas con buen precio</Link>
        </div>
      ) : (
        <div className="posiciones">
          {c.posiciones.map((p) => (
            <div key={p.ticker} className="posicion">
              <Link href={`/empresa/${p.ticker}`} className="posicion-nombre">
                <Logo ticker={p.ticker} sector={p.sector} size={40} />
                <div>
                  <b>{nombreCorto(p.nombre)}</b>
                  <small className="mono">{p.acciones.toLocaleString("es", { maximumFractionDigits: 4 })} acc. · coste {dinero(p.costeMedio)}</small>
                </div>
              </Link>
              <div className="posicion-valor">
                <b className="mono">{p.valor !== null ? dinero(p.valor) : "—"}</b>
                {p.ganancia !== null && p.gananciaPct !== null && (
                  <small className={tono(p.ganancia)}>{usd(p.ganancia)} ({pct(p.gananciaPct)})</small>
                )}
              </div>
              <VenderTodo ticker={p.ticker} />
            </div>
          ))}
        </div>
      )}

      {c.operaciones.length > 0 && (
        <>
          <div className="sec">Movimientos <span>últimos {c.operaciones.length}</span></div>
          <ul className="movimientos">
            {c.operaciones.map((o, i) => (
              <li key={i}>
                <span className={o.tipo === "compra" ? "tipo compra" : "tipo venta"}>{o.tipo === "compra" ? "Compra" : "Venta"}</span>
                <span>{nombreCorto(o.nombre)} · {o.acciones.toLocaleString("es", { maximumFractionDigits: 4 })} acc. a {dinero(o.precio)}</span>
                <b className="mono">{dinero(o.importe)}</b>
                <small className="muted">{new Date(o.fecha).toLocaleDateString("es", { day: "numeric", month: "short" })}</small>
              </li>
            ))}
          </ul>
        </>
      )}

      <Reiniciar />
      <p className="nota">{c.aviso}</p>
    </main>
  );
}
