import { senalesConModelo } from "@/lib/senales-modelo";
import type { Imagen } from "@/lib/extract";
import { getModeloConfig } from "@/lib/models";

export const maxDuration = 120;

const MAX_IMAGENES = 20;
const MAX_BYTES = 4 * 1024 * 1024;

// POST multipart/form-data: modelo, imagenes (1..20 páginas, image/*).
// Devuelve { senales: SenalesPagina[], costoUsd } en el mismo orden que las imágenes.
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
    if (archivos.length > MAX_IMAGENES) return Response.json({ error: `Máximo ${MAX_IMAGENES} páginas por pedido` }, { status: 400 });

    const imagenes: Imagen[] = [];
    for (const f of archivos) {
      if (!f.type.startsWith("image/")) return Response.json({ error: `Tipo no soportado: ${f.type}` }, { status: 400 });
      if (f.size > MAX_BYTES) return Response.json({ error: "Imagen demasiado grande" }, { status: 413 });
      imagenes.push({ data: new Uint8Array(await f.arrayBuffer()), mediaType: f.type });
    }
    return Response.json(await senalesConModelo(imagenes, modelo));
  } catch (err) {
    console.error("[segmentar]", err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
