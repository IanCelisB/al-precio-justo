/** Pasa a la API las acciones de la cuenta (seguir, métricas, borrar) con la sesión de la cookie. */
import { NextResponse, type NextRequest } from "next/server";
import { API, COOKIE_SESION } from "@/lib/api";

async function reenviar(req: NextRequest, ruta: string[]) {
  const token = req.cookies.get(COOKIE_SESION)?.value;
  if (!token) return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
  const destino = `${API}/yo/${ruta.map(encodeURIComponent).join("/")}`.replace(/\/yo\/$/, "/yo");
  const body = req.method === "PUT" ? await req.text() : undefined;
  const r = await fetch(destino, {
    method: req.method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body,
  });
  const res = NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
  if (req.method === "DELETE" && ruta.length === 1 && ruta[0] === "cuenta" && r.ok) res.cookies.delete(COOKIE_SESION);
  return res;
}

type Ctx = { params: Promise<{ ruta: string[] }> };
// Lecturas desde el navegador (p. ej. el contador de avisos de la barra).
export const GET = async (req: NextRequest, { params }: Ctx) => reenviar(req, (await params).ruta);
export const PUT = async (req: NextRequest, { params }: Ctx) => reenviar(req, (await params).ruta);
export const DELETE = async (req: NextRequest, { params }: Ctx) => {
  const { ruta } = await params;
  // DELETE /api/yo/cuenta borra la cuenta entera (DELETE /yo en la API)
  return reenviar(req, ruta.length === 1 && ruta[0] === "cuenta" ? [""] : ruta);
};
