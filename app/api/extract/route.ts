import { extraerFactura, type Imagen } from "@/lib/extract";
import { parseQrFiscal, type QrFiscal } from "@/lib/qr";
import { aplicarQr, validarFactura } from "@/lib/validate";
import { verificarEnArca, ARCA_DESACTIVADA_USUARIO } from "@/lib/arca/verificar";
import { getModeloConfig } from "@/lib/models";
import { normalizarCampos } from "@/lib/campos";
import type { RespuestaExtraccion } from "@/lib/types";

export const maxDuration = 120;

const MAX_IMAGENES = 5;
const MAX_BYTES = 8 * 1024 * 1024;

// POST multipart/form-data: modelo, qr (texto crudo del QR, opcional), arca ("0" para no verificar),
// campos (JSON con campos personalizados, opcional), imagenes (1..5 archivos image/*)
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const modelo = String(form.get("modelo") ?? "");
    try {
      getModeloConfig(modelo);
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }

    const archivos = form.getAll("imagenes").filter((x): x is File => x instanceof File);
    if (!archivos.length) return Response.json({ error: "No se recibieron imágenes" }, { status: 400 });
    if (archivos.length > MAX_IMAGENES) return Response.json({ error: `Máximo ${MAX_IMAGENES} páginas por comprobante` }, { status: 400 });

    const imagenes: Imagen[] = [];
    for (const f of archivos) {
      if (!f.type.startsWith("image/")) return Response.json({ error: `Tipo no soportado: ${f.type}` }, { status: 400 });
      if (f.size > MAX_BYTES) return Response.json({ error: "Imagen demasiado grande" }, { status: 413 });
      imagenes.push({ data: new Uint8Array(await f.arrayBuffer()), mediaType: f.type });
    }

    const qrTexto = form.get("qr");
    const qr: QrFiscal | null = typeof qrTexto === "string" && qrTexto ? parseQrFiscal(qrTexto) : null;

    let campos = normalizarCampos([]);
    const camposTexto = form.get("campos");
    if (typeof camposTexto === "string" && camposTexto) {
      try {
        campos = normalizarCampos(JSON.parse(camposTexto));
      } catch {
        return Response.json({ error: "Campos personalizados inválidos" }, { status: 400 });
      }
    }

    const r = await extraerFactura(imagenes, modelo, { campos });
    // Advertencias se calculan sobre lo que leyó el modelo (para ver dónde difiere del QR);
    // la factura que se devuelve ya tiene los datos del QR aplicados.
    const advertencias = validarFactura(r.factura, qr);
    const factura = qr ? aplicarQr(r.factura, qr) : r.factura;
    const arca = form.get("arca") === "0" ? ARCA_DESACTIVADA_USUARIO : await verificarEnArca(factura, qr);

    const body: RespuestaExtraccion = {
      factura,
      facturaModelo: r.factura,
      qr,
      campos,
      advertencias,
      arca,
      uso: { modelo: r.modelo, ms: r.ms, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costoUsd: r.costoUsd, intentos: r.intentos, modo: r.modo },
    };
    return Response.json(body);
  } catch (err) {
    console.error("[extract]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}
