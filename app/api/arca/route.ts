import { connection } from "next/server";
import { Factura } from "@/lib/schema";
import { verificarEnArca, arcaHabilitadaEnServidor } from "@/lib/arca/verificar";
import { getArcaConfig } from "@/lib/arca/config";
import type { QrFiscal } from "@/lib/qr";
import type { EstadoServidorArca } from "@/lib/types";

// Estado de la integración (para el panel de Configuración). No expone datos del certificado.
export async function GET() {
  await connection(); // leer env en cada request, no en el build
  const body: EstadoServidorArca = { habilitada: arcaHabilitadaEnServidor(), configurada: false, entorno: null };
  try {
    const cfg = getArcaConfig();
    if (cfg) {
      body.configurada = true;
      body.entorno = cfg.env;
    }
  } catch (err) {
    body.error = `No se pudo leer el certificado: ${err instanceof Error ? err.message : err}`;
  }
  return Response.json(body);
}

// Verificación manual (después de corregir datos, o con la verificación automática apagada).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = Factura.safeParse(body?.factura);
  if (!parsed.success) return Response.json({ error: "Factura inválida" }, { status: 400 });
  const qr = (body?.qr ?? null) as QrFiscal | null;
  return Response.json(await verificarEnArca(parsed.data, qr));
}
