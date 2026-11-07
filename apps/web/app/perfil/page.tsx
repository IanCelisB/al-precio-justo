import Link from "next/link";
import { porId } from "@ancla/valoracion/metricas";
import { BorrarCuenta, CerrarSesion, IniciarSesion } from "@/components/IniciarSesion";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";
export const metadata = { title: "Perfil · Ancla" };

export default async function Perfil() {
  const [yo, config] = await Promise.all([api.yo(), api.config()]);

  if (!yo) {
    return (
      <main className="wrap">
        <h1 className="hd titulo">Perfil</h1>
        <div className="tarjeta-login">
          <h2 className="hd">Guarda tus empresas</h2>
          <p>Inicia sesión con tu cuenta de Google para seguir empresas y guardar tus métricas en todos tus dispositivos.
            Solo usamos tu nombre, tu email y tu foto.</p>
          <IniciarSesion prueba={config.prueba} />
        </div>
      </main>
    );
  }

  const u = yo.usuario;
  return (
    <main className="wrap">
      <h1 className="hd titulo">Perfil</h1>
      <div className="perfil">
        {u.foto
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={u.foto} alt="" width={64} height={64} className="avatar" referrerPolicy="no-referrer" />
          : <span className="avatar inicial">{u.nombre.charAt(0)}</span>}
        <div>
          <h2 className="hd">{u.nombre}</h2>
          <small className="muted">{u.email}</small>
        </div>
      </div>

      <div className="datos">
        <Link href="/seguidas" className="dato">
          <small>Empresas seguidas</small><b>{yo.seguidas.length}</b>
        </Link>
        <div className="dato">
          <small>Tus métricas</small>
          <b>{yo.metricasExtra.length}</b>
          {yo.metricasExtra.length > 0 && (
            <p className="nota">{yo.metricasExtra.map((id) => porId(id)?.nombre).filter(Boolean).join(" · ")}</p>
          )}
        </div>
      </div>

      <div className="acciones">
        <CerrarSesion />
        <BorrarCuenta />
      </div>
    </main>
  );
}
