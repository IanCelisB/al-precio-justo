import { dinero, fechaCorta, grande } from "@ancla/valoracion/formato";
import { fraseIngresos, mesCierre, monto, partes, textoBeta, type DatosClave, type Perfil } from "@ancla/valoracion/perfil";

const EJES = [
  { id: "segmentos", titulo: "Por negocio" },
  { id: "productos", titulo: "Por producto o servicio" },
  { id: "regiones", titulo: "Por región" },
] as const;

const num = (x: number, d = 1) => x.toLocaleString("es", { maximumFractionDigits: d });

/** A qué se dedica, datos de la empresa, de dónde vienen sus ingresos y datos clave para invertir. */
export function SobreEmpresa({ nombre, perfil, clave }: { nombre: string; perfil: Perfil | null; clave: DatosClave | null }) {
  const p = perfil ?? {};
  const ficha: [string, string | null | undefined][] = [
    ["Fundación", p.fundacion],
    ["Sede", p.sede],
    ["CEO", p.ceo],
    ["Empleados", p.empleados ? num(p.empleados, 0) : null],
    ["Industria (SEC)", p.industria],
    ["Bolsa", p.bolsas?.join(", ")],
    ["Cierre del año fiscal", mesCierre(p.cierreFiscal)],
  ];
  // Si la empresa informa por negocio y por producto, se muestra el más detallado de los dos.
  const ejes = EJES.filter((e) => p.ingresos?.[e.id]?.length);
  const mostrados = ejes.filter((e) => !(e.id === "segmentos" && ejes.some((x) => x.id === "productos")
    && (p.ingresos!.productos!.length >= p.ingresos!.segmentos!.length)));
  const r = clave?.rango52;

  return (
    <section className="sobre" aria-label={`Sobre ${nombre}`}>
      <b className="sobre-titulo">Sobre la empresa</b>

      {p.descripcion ? (
        <p className="sobre-desc">
          {p.descripcion.texto}{" "}
          <a href={p.descripcion.fuente} target="_blank" rel="noreferrer" className="muted">
            Wikipedia{p.descripcion.idioma !== "es" ? " (en inglés)" : ""}
          </a>
        </p>
      ) : (
        <p className="nota">Todavía no tenemos una descripción de esta empresa.</p>
      )}

      <dl className="sobre-ficha">
        {ficha.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
        {p.web && (
          <div><dt>Web</dt><dd><a href={p.web} target="_blank" rel="noreferrer">{p.web.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a></dd></div>
        )}
      </dl>

      {clave && (
        <>
          <b className="sobre-sub">Datos clave</b>
          <dl className="sobre-clave">
            {clave.capitalizacion !== null && <div><dt>Capitalización</dt><dd>{grande(clave.capitalizacion)}</dd></div>}
            <div><dt>PER</dt><dd>{clave.per !== null ? `${num(clave.per)}x` : "—"}</dd>
              <small>{clave.per !== null ? `pagas ${num(clave.per, 0)} años de beneficios` : "sin beneficios"}</small></div>
            {clave.rentabilidadDividendo !== null && (
              <div><dt>Dividendo</dt><dd>{clave.rentabilidadDividendo > 0 ? `${num(clave.rentabilidadDividendo * 100, 2)} %` : "No paga"}</dd>
                {clave.rentabilidadDividendo > 0 && <small>al año, sobre el precio</small>}</div>
            )}
            {clave.beta !== null && (
              <div><dt>Beta</dt><dd>{num(clave.beta, 2)}</dd><small>{textoBeta(clave.beta)}</small></div>
            )}
          </dl>
          {r && (
            <div className="rango52">
              <div className="rango52-cab"><span>Rango de 52 semanas</span><small className="muted">cierres semanales</small></div>
              <div className="rango52-barra"><span style={{ left: `${Math.min(100, Math.max(0, r.posicion * 100))}%` }} /></div>
              <div className="rango52-extremos mono"><span>{dinero(r.min)}</span><span>{dinero(r.max)}</span></div>
            </div>
          )}
        </>
      )}

      {mostrados.length > 0 && (
        <>
          <b className="sobre-sub">¿De dónde vienen sus ingresos?</b>
          {fraseIngresos(nombre, p.ingresos![mostrados[0].id], p.ingresosAnio) && (
            <p className="sobre-desc">{fraseIngresos(nombre, p.ingresos![mostrados[0].id], p.ingresosAnio)}</p>
          )}
          {mostrados.map((e) => (
            <div key={e.id} className="ingresos">
              <small className="muted">{e.titulo}</small>
              {partes(p.ingresos![e.id]).map((x) => (
                <div key={x.nombre} className="ingreso">
                  <div className="ingreso-cab"><span>{x.nombre}</span>
                    <span className="ingreso-monto"><b className="mono">{monto(x.valor)}</b> <small className="muted">{num(x.pct * 100, 0)} %</small></span></div>
                  <div className="ingreso-barra"><span style={{ width: `${Math.max(2, x.pct * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          ))}
          <p className="nota">Ventas del año fiscal {p.ingresosAnio}, según su {p.ingresosFuente?.replace(/\d{4}-\d{2}-\d{2}/, (d) => fechaCorta(d))} a la SEC.</p>
        </>
      )}
    </section>
  );
}
