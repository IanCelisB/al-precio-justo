"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { diferencia, ETIQUETA } from "@ancla/valoracion";
import { dinero, nombreCorto, porcentajeConSigno } from "@ancla/valoracion/formato";
import { tono } from "@ancla/valoracion/portada";
import { sectorDe } from "@ancla/valoracion/sectores";
import type { Resumen } from "@/lib/api";
import { Ilustracion } from "./Ilustracion";

const DURACION = 7000;

/** Portada: aurora animada y empresas destacadas que rotan (se pausa al pasar el ratón; se desliza con el dedo). */
export function Portada({ destacadas }: { destacadas: { etiqueta: string; empresa: Resumen }[] }) {
  const [i, setI] = useState(0);
  const [pausa, setPausa] = useState(false);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const objetivo = useRef(255);
  const inicioDedo = useRef<number | null>(null);
  const n = destacadas.length;
  const d = destacadas[i % Math.max(1, n)];
  const h = d ? tono(d.empresa.ticker, d.empresa.sector) : 255;
  objetivo.current = h;

  // Rotación automática.
  useEffect(() => {
    if (pausa || n < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setI((x) => (x + 1) % n), DURACION);
    return () => clearTimeout(t);
  }, [i, pausa, n]);

  // Aurora: manchas de color que se mueven despacio hacia el tono de la destacada.
  useEffect(() => {
    const cv = lienzo.current;
    if (!cv) return;
    const cx = cv.getContext("2d")!;
    const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let tonoActual = objetivo.current, t = 0, raf = 0;
    const tamano = () => {
      const r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      cv.width = r.width * dpr; cv.height = r.height * dpr;
    };
    const dibujar = () => {
      const w = cv.width, alto = cv.height;
      tonoActual = (tonoActual + (((objetivo.current - tonoActual + 540) % 360) - 180) * 0.04 + 360) % 360;
      cx.globalCompositeOperation = "source-over";
      cx.fillStyle = getComputedStyle(cv).getPropertyValue("--fondo-aurora") || "#07080C";
      cx.fillRect(0, 0, w, alto);
      // Sobre fondo oscuro las luces se suman; sobre fondo claro se pintan encima, más suaves.
      const fondo = getComputedStyle(cv).getPropertyValue("--fondo-aurora").trim();
      const claroFondo = /^#[ef]/i.test(fondo);
      cx.globalCompositeOperation = claroFondo ? "source-over" : "lighter";
      [[0.72, 0.35, 0.55, 0], [0.9, 0.75, 0.45, 40], [0.45, 0.15, 0.4, -35], [0.6, 0.9, 0.35, 80]].forEach((b, k) => {
        const x = w * (b[0] + Math.sin(t * 0.6 + k * 1.7) * 0.08), y = alto * (b[1] + Math.cos(t * 0.5 + k) * 0.08);
        const r = Math.max(w, alto) * b[2];
        const g = cx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `hsla(${tonoActual + b[3]},90%,${claroFondo ? 70 : 58}%,${claroFondo ? 0.35 : 0.5})`);
        g.addColorStop(1, `hsla(${tonoActual + b[3]},90%,40%,0)`);
        cx.fillStyle = g; cx.fillRect(0, 0, w, alto);
      });
      t += 0.012;
      if (!quieto && !document.hidden) raf = requestAnimationFrame(dibujar);
    };
    const volver = () => { if (!document.hidden && !quieto) { cancelAnimationFrame(raf); raf = requestAnimationFrame(dibujar); } };
    tamano(); dibujar();
    addEventListener("resize", tamano);
    document.addEventListener("visibilitychange", volver);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", tamano); document.removeEventListener("visibilitychange", volver); };
  }, []);

  if (!d) return null;
  const e = d.empresa;
  const sector = sectorDe(e.sector);
  const c = e.cambio1a;
  return (
    <section className={pausa ? "portada pausada" : "portada"} aria-roledescription="carrusel" aria-label="Empresas destacadas"
      style={{ "--h": h } as React.CSSProperties}
      onPointerEnter={(ev) => ev.pointerType === "mouse" && setPausa(true)}
      onPointerLeave={(ev) => ev.pointerType === "mouse" && setPausa(false)}
      onPointerDown={(ev) => { inicioDedo.current = ev.clientX; }}
      onPointerUp={(ev) => {
        if (inicioDedo.current === null) return;
        const dx = ev.clientX - inicioDedo.current; inicioDedo.current = null;
        if (Math.abs(dx) > 50) setI((x) => (x + (dx < 0 ? 1 : -1) + n) % n);
      }}>
      <canvas ref={lienzo} aria-hidden />
      <div className="portada-in">
        <div className="portada-glifo" aria-hidden key={`g${i}`}><Ilustracion formas={sector.icono} size={420} /></div>
        <div className="portada-texto" key={`t${i}`}>
          <span className="portada-kicker">{d.etiqueta}</span>
          <h1>{nombreCorto(e.nombre)}</h1>
          <p>{sector.nombre} · {e.ticker}{e.indice ? ` · ${e.indice}` : ""}</p>
          <div className="portada-datos">
            <div><b className="mono">{e.precio ? dinero(e.precio) : "—"}</b><span>Precio de la acción</span></div>
            {typeof c === "number" && (
              <div><b className={`mono ${c >= 0 ? "sube" : "baja"}`}>{porcentajeConSigno(c, 0)}</b><span>En el último año</span></div>
            )}
            {e.estado && e.precio && e.valor && (
              <div><b className={`mono ${e.estado}`}>{diferencia(e.precio, e.valor)}</b><span>{ETIQUETA[e.estado]} frente a su valor</span></div>
            )}
          </div>
        </div>
        <div className="portada-cta">
          <Link className="btn-pri" href={`/empresa/${e.ticker}`}>
            Ver empresa <svg viewBox="0 0 24 24" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
        </div>
        <div className="portada-puntos" role="tablist" aria-label="Elegir destacada">
          {destacadas.map((x, k) => (
            <button key={x.empresa.ticker} role="tab" aria-selected={k === i} aria-label={`${x.etiqueta}: ${nombreCorto(x.empresa.nombre)}`}
              className={k === i ? "on" : k < i ? "hecho" : ""} onClick={() => setI(k)}>
              <i key={k === i ? `on${i}` : "x"} style={{ "--dur": `${DURACION}ms` } as React.CSSProperties} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Fila de carrusel deslizable con flechas en pantallas con ratón. */
export function Carril({ titulo, sub, children }: { titulo: string; sub: string; children: React.ReactNode }) {
  const carril = useRef<HTMLDivElement>(null);
  const mover = (dir: number) => carril.current?.scrollBy({ left: dir * carril.current.clientWidth * 0.85, behavior: "smooth" });
  return (
    <section className="fila">
      <div className="fila-cab">
        <h2>{titulo}</h2>
        <span>{sub}</span>
        <div className="fila-flechas">
          <button type="button" onClick={() => mover(-1)} aria-label="Anteriores"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>
          <button type="button" onClick={() => mover(1)} aria-label="Siguientes"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg></button>
        </div>
      </div>
      <div className="carril" ref={carril}>{children}</div>
    </section>
  );
}
