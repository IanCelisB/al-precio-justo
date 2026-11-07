/**
 * Inicio de sesión con Google.
 *
 * La web y el móvil obtienen de Google un "ID token" (firmado por Google) y lo
 * envían a POST /auth/google. La API comprueba la firma y que el token sea para
 * nuestros IDs de cliente, y responde con una sesión propia (JWT de 30 días).
 *
 * Configuración (variables de entorno):
 *   GOOGLE_CLIENT_IDS  IDs de cliente OAuth de Google (web, iOS, Android), separados por comas
 *   ANCLA_SECRETO      clave para firmar las sesiones (obligatoria en producción)
 *   ANCLA_LOGIN_PRUEBA=1  habilita POST /auth/prueba, SOLO para desarrollo local
 */
import { OAuth2Client } from "google-auth-library";
import { jwtVerify, SignJWT } from "jose";
import type { Usuario } from "./usuarios.ts";

export const CLIENT_IDS = (process.env.GOOGLE_CLIENT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
export const LOGIN_PRUEBA = process.env.ANCLA_LOGIN_PRUEBA === "1" && process.env.NODE_ENV !== "production";

const secretoTexto = process.env.ANCLA_SECRETO
  ?? (process.env.NODE_ENV === "production" ? null : "solo-para-desarrollo-cambiar-en-produccion");
if (!secretoTexto) throw new Error("Define ANCLA_SECRETO para firmar las sesiones.");
const SECRETO = new TextEncoder().encode(secretoTexto);

const google = new OAuth2Client();

export class ErrorAuth extends Error {
  codigo: number;
  constructor(codigo: number, mensaje: string) {
    super(mensaje);
    this.codigo = codigo;
  }
}

/** Verifica el ID token de Google y devuelve los datos del usuario. */
export async function verificarGoogle(idToken: string): Promise<Usuario> {
  if (!CLIENT_IDS.length) {
    throw new ErrorAuth(503, "El inicio de sesión con Google no está configurado (falta GOOGLE_CLIENT_IDS).");
  }
  let p;
  try {
    const ticket = await google.verifyIdToken({ idToken, audience: CLIENT_IDS });
    p = ticket.getPayload();
  } catch {
    throw new ErrorAuth(401, "No pudimos verificar tu cuenta de Google.");
  }
  if (!p?.sub || !p.email || !p.email_verified) throw new ErrorAuth(401, "Tu cuenta de Google no tiene un email verificado.");
  return { id: `google:${p.sub}`, email: p.email, nombre: p.name ?? p.email.split("@")[0], foto: p.picture ?? null };
}

export async function crearSesion(u: Usuario): Promise<string> {
  return new SignJWT({ email: u.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(u.id)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRETO);
}

/** Id del usuario de la cabecera "Authorization: Bearer <sesión>", o null. */
export async function usuarioDeSesion(cabecera: string | undefined): Promise<string | null> {
  const token = cabecera?.startsWith("Bearer ") ? cabecera.slice(7) : null;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRETO, { algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
