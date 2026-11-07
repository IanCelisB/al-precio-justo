import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Mono, DM_Sans } from "next/font/google";
import "./globals.css";
import { Navegacion } from "@/components/Navegacion";
import { DivisaCliente } from "@/components/Preferencias";
import { preferencias } from "@/lib/preferencias";
import { ACENTOS } from "@ancla/valoracion/apariencia";

const head = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "800"], variable: "--f-head" });
const ui = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--f-ui" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--f-mono" });

export const metadata: Metadata = {
  title: "Al Precio Justo · el valor real de cada empresa",
  description: "Precio de hoy frente al valor que muestran sus resultados trimestrales.",
};

/** Variables del color de acento elegido (claro, oscuro del sistema y oscuro forzado). */
function cssAcento(id: keyof typeof ACENTOS): string {
  if (id === "menta") return "";
  const a = ACENTOS[id];
  const claro = `--mint:${a.claro.mint};--on-mint:${a.claro.onMint};--band:${a.claro.band};`;
  const oscuro = `--mint:${a.oscuro.mint};--on-mint:${a.oscuro.onMint};--band:${a.oscuro.band};--link:${a.oscuro.link};`;
  return `:root{${claro}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${oscuro}}}:root[data-theme="dark"]{${oscuro}}`;
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
