import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Mono, Figtree } from "next/font/google";
import "./globals.css";
import { Navegacion } from "@/components/Navegacion";
import { DivisaCliente } from "@/components/Preferencias";
import { preferencias } from "@/lib/preferencias";
import { ACENTOS } from "@ancla/valoracion/apariencia";

const head = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "700", "800"], variable: "--f-head" });
const ui = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--f-ui" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--f-mono" });

export const metadata: Metadata = {
  title: "Al Precio Justo · el valor real de cada empresa",
  description: "Precio de hoy frente al valor que muestran sus resultados trimestrales.",
};

/** Variables del color de acento elegido (claro, oscuro del sistema y oscuro forzado). */
function cssAcento(id: keyof typeof ACENTOS): string {
  if (id === "violeta") return ""; // el acento por defecto ya está en globals.css
  const a = ACENTOS[id];
  const v = (c: typeof a.claro) => `--accent:${c.accent};--mint:${c.mint};--on-mint:${c.onMint};--band:${c.band};--link:${c.link};`;
  return `:root{${v(a.claro)}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${v(a.oscuro)}}}:root[data-theme="dark"]{${v(a.oscuro)}}`;
}

export default async function Layout({ children }: { children: React.ReactNode }) {
  const { pref, divisa } = await preferencias();
  const tema = pref.tema === "claro" ? "light" : pref.tema === "oscuro" ? "dark" : undefined;
  const acento = cssAcento(pref.acento);
  return (
    <html lang="es" className={`${head.variable} ${ui.variable} ${mono.variable}`} data-theme={tema}>
      <body>
        {acento && <style dangerouslySetInnerHTML={{ __html: acento }} />}
        <DivisaCliente divisa={divisa} />
        <Navegacion />
        {children}
      </body>
    </html>
  );
}
