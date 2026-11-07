/**
 * Sesión de la web. El navegador envía aquí el ID token de Google; Next.js lo
 * pasa a la API y guarda la sesión en una cookie httpOnly (el JavaScript de la
 * página no puede leerla).
 */
import { NextResponse, type NextRequest } from "next/server";
import { API, COOKIE_SESION } from "@/lib/api";

const TREINTA_DIAS = 30 * 24 * 3600;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { idToken?: string; prueba?: boolean };
  const r = body.prueba
    ? await fetch(`${API}/auth/prueba`, { method: "POST" })
    : await fetch(`${API}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: body.idToken }),
    });
  const datos = await r.json().catch(() => ({ error: "Respuesta inválida" }));
  if (!r.ok) return NextResponse.json(datos, { status: r.status });
  const res = NextResponse.json({ usuario: datos.usuario });
  res.cookies.set(COOKIE_SESION, datos.token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TREINTA_DIAS,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_SESION);
  return res;
}
