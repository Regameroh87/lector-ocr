import { exigirAcceso } from "@/lib/auth/acceso";
import { extraerFactura, type Imagen } from "@/lib/extract";
import { parseQrFiscal, type QrFiscal } from "@/lib/qr";
import { aplicarQr, compararConQr, corregirCuitsConTexto, validarFactura } from "@/lib/validate";
import { verificarEnArca, ARCA_DESACTIVADA_USUARIO, type EstadoArca } from "@/lib/arca/verificar";
import { getModeloConfig } from "@/lib/models";
import { normalizarCampos } from "@/lib/campos";
import { instruccionesPlantilla } from "@/lib/plantillas";
import { z } from "zod";
import type { RespuestaExtraccion } from "@/lib/types";

export const maxDuration = 120;

const PlantillaForm = z.object({
  nombre: z.string().trim().min(1).max(80),
  tipoDocumento: z.string().trim().min(1).max(40),
  descripcion: z.string().max(500).default(""),
  fiscal: z.boolean().default(true),
});

const ARCA_NO_FISCAL: EstadoArca = { estado: "desactivado", detalle: ["La plantilla indica que no es un comprobante fiscal"] };

const MAX_IMAGENES = 5;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TEXTO = 30_000;

// POST multipart/form-data: modelo, qr (texto crudo del QR, opcional), arca ("0" para no verificar),
// campos (JSON con campos personalizados, opcional), texto (capa de texto del PDF, opcional),
// plantilla (JSON {nombre, tipoDocumento, descripcion, fiscal}, opcional),
// imagenes (1..5 archivos image/*)
export async function POST(req: Request) {
  const sinAcceso = await exigirAcceso();
  if (sinAcceso) return sinAcceso;
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

    const textoForm = form.get("texto");
    const texto = typeof textoForm === "string" && textoForm.trim() ? textoForm.slice(0, MAX_TEXTO) : null;

    let plantilla: z.infer<typeof PlantillaForm> | null = null;
    const plantillaTexto = form.get("plantilla");
    if (typeof plantillaTexto === "string" && plantillaTexto) {
      try {
        plantilla = PlantillaForm.parse(JSON.parse(plantillaTexto));
      } catch {
        return Response.json({ error: "Plantilla inválida" }, { status: 400 });
      }
    }
    const fiscal = plantilla?.fiscal ?? true;

    const r = await extraerFactura(imagenes, modelo, { campos, texto, contexto: plantilla ? instruccionesPlantilla(plantilla) : null });
    // Correcciones: primero el QR (exacto), después CUITs mal leídos contra el texto del PDF.
    const conQr = qr ? aplicarQr(r.factura, qr) : r.factura;
    const { factura, avisos } = corregirCuitsConTexto(conQr, texto);
    // Validación sobre la factura final (no marcar como error algo que ya se corrigió)
    // + dónde difería el modelo del QR.
    // Documentos no fiscales (remitos, presupuestos…): sin validación de CUIT/CAE ni consulta a ARCA.
    const advertencias = fiscal ? [...validarFactura(factura), ...avisos, ...(qr ? compararConQr(r.factura, qr) : [])] : avisos;
    const arca = !fiscal ? ARCA_NO_FISCAL : form.get("arca") === "0" ? ARCA_DESACTIVADA_USUARIO : await verificarEnArca(factura, qr);

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
