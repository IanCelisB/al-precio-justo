import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Mono, DM_Sans } from "next/font/google";
import "./globals.css";
import { Navegacion } from "@/components/Navegacion";

const head = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "800"], variable: "--f-head" });
const ui = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--f-ui" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--f-mono" });

export const metadata: Metadata = {
  title: "Al Precio Justo · el valor real de cada empresa",
  description: "Precio de hoy frente al valor que muestran sus resultados trimestrales.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${head.variable} ${ui.variable} ${mono.variable}`}>
      <body>
        <Navegacion />
        {children}
      </body>
    </html>
  );
}
