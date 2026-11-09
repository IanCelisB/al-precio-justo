"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSinLeer } from "./Avisos";

const PESTANAS = [
  { href: "/", nombre: "Inicio", icono: <path d="M3 11l9-7 9 7v9H3z" /> },
  { href: "/buscar", nombre: "Buscar", icono: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></> },
  { href: "/simulador", nombre: "Simulador", icono: <><path d="M3 17l5-5 4 4 8-8" /><path d="M14 8h6v6" /></> },
  { href: "/seguidas", nombre: "Seguidas", icono: <path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z" /> },
  { href: "/avisos", nombre: "Avisos", icono: <><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></> },
  { href: "/perfil", nombre: "Perfil", icono: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></> },
];

/** Pestañas abajo en el móvil, arriba a la derecha en pantallas grandes. */
export function Navegacion() {
  const ruta = usePathname();
  const activa = (href: string) => (href === "/" ? ruta === "/" : ruta.startsWith(href));
  const sinLeer = useSinLeer();
  return (
    <nav className="nav" aria-label="Principal">
      <Link href="/" className="nav-logo logo" aria-label="Al Precio Justo, inicio">Al Precio <i>Justo</i></Link>
      <div className="nav-pestanas">
        {PESTANAS.map((p) => (
          <Link key={p.href} href={p.href} className={activa(p.href) ? "on" : ""} aria-current={activa(p.href) ? "page" : undefined}>
            <span className="nav-icono">
              <svg viewBox="0 0 24 24" aria-hidden>{p.icono}</svg>
              {p.href === "/avisos" && sinLeer > 0 && <i className="insignia" aria-label={`${sinLeer} sin leer`}>{sinLeer > 9 ? "9+" : sinLeer}</i>}
            </span>
            <span>{p.nombre}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
