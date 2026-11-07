import Link from "next/link";
import { FormularioPreferencias } from "@/components/Preferencias";
import { preferencias } from "@/lib/preferencias";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuración · Al Precio Justo" };

export default async function Configuracion() {
  const { pref, divisas } = await preferencias();
  return (
    <main className="wrap">
      <Link href="/perfil" className="volver">‹ Perfil</Link>
      <h1 className="hd titulo">Configuración</h1>
      <FormularioPreferencias inicial={pref} detalle={divisas?.detalle ?? []} />
    </main>
  );
}
