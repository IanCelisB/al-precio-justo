/** Pasa a la API las operaciones del simulador (comprar, vender, reiniciar) con la sesión de la cookie. */
import { NextResponse, type NextRequest } from "next/server";
import { API, COOKIE_SESION } from "@/lib/api";

const ACCIONES = new Set(["comprar", "vender", "reiniciar"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ accion: string }> }) {
  const { accion } = await params;
  if (!ACCIONES.has(accion)) return NextResponse.json({ error: "Acción desconocida" }, { status: 404 });
  const token = req.cookies.get(COOKIE_SESION)?.value;
  if (!token) return NextResponse.json({ error: "Inicia sesión para usar el simulador." }, { status: 401 });
  const body = await req.text();
  const r = await fetch(`${API}/simulador/${accion}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body || undefined,
  });
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
