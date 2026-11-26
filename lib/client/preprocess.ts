// Preprocesamiento en el navegador: PDF/imagen → JPEGs listos para el modelo + lectura del QR.
import jsQR from "jsqr";

export interface Preprocesado {
  imagenes: Blob[]; // JPEG, una por página
  qr: string | null; // texto crudo del QR si se encontró
  paginas: string[]; // object URLs para el visor, una por página
}

const MAX_LADO = 2000; // px del lado mayor enviado al modelo
const MAX_PAGINAS_PDF = 300;

function canvasABlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo generar la imagen"))), "image/jpeg", 0.9));
}

function escanear(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const { width, height } = canvas;
  const r = jsQR(ctx.getImageData(0, 0, width, height).data, width, height, { inversionAttempts: "attemptBoth" });
  if (r?.data) return r.data;
  // QR chico en una página grande: probar por cuadrantes
  const mw = Math.ceil(width / 2);
  const mh = Math.ceil(height / 2);
  for (const [x, y] of [[0, mh], [mw, mh], [0, 0], [mw, 0]]) {
    const w = Math.min(mw, width - x);
    const h = Math.min(mh, height - y);
    const q = jsQR(ctx.getImageData(x, y, w, h).data, w, h, { inversionAttempts: "attemptBoth" });
    if (q?.data) return q.data;
  }
  return null;
}

function leerQr(canvas: HTMLCanvasElement): string | null {
  const directo = escanear(canvas);
  if (directo) return directo;
  // Imágenes de baja resolución (capturas, fotos chicas): reintentar ampliando.
  const factor = Math.min(3, Math.floor(3000 / Math.max(canvas.width, canvas.height)));
  if (factor < 2) return null;
  const grande = document.createElement("canvas");
  grande.width = canvas.width * factor;
  grande.height = canvas.height * factor;
  const ctx = grande.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, grande.width, grande.height);
  return escanear(grande);
}

function canvasNuevo(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d", { willReadFrequently: true });
  return c;
}

function redimensionar(origen: HTMLCanvasElement): HTMLCanvasElement {
  const escala = Math.min(1, MAX_LADO / Math.max(origen.width, origen.height));
  if (escala === 1) return origen;
  const c = document.createElement("canvas");
  c.width = Math.round(origen.width * escala);
  c.height = Math.round(origen.height * escala);
  c.getContext("2d")!.drawImage(origen, 0, 0, c.width, c.height);
  return c;
}

async function desdeImagen(file: File): Promise<Preprocesado> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`El navegador no puede abrir ${file.name}. Si es HEIC, exportala como JPG.`);
  }
  const c = canvasNuevo(bitmap.width, bitmap.height);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bitmap, 0, 0);
  const qr = leerQr(c);
  const blob = await canvasABlob(redimensionar(c));
  return { imagenes: [blob], qr, paginas: [URL.createObjectURL(blob)] };
}

export interface PaginaPdf {
  imagen: Blob; // JPEG para el modelo
  url: string; // object URL para el visor
  qr: string | null;
  texto: string; // capa de texto del PDF (vacía en escaneos)
}

/** Lee todas las páginas de un PDF: imagen, QR y texto. `onProgreso` recibe (hechas, total). */
export async function leerPdf(file: File, onProgreso?: (hechas: number, total: number) => void): Promise<PaginaPdf[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const tarea = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const doc = await tarea.promise;
    if (doc.numPages > MAX_PAGINAS_PDF) throw new Error(`El PDF tiene ${doc.numPages} páginas; el máximo es ${MAX_PAGINAS_PDF}. Dividilo en partes.`);
    const paginas: PaginaPdf[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      onProgreso?.(i - 1, doc.numPages);
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, MAX_LADO / Math.max(base.width, base.height)) });
      const c = canvasNuevo(Math.round(viewport.width), Math.round(viewport.height));
      await page.render({ canvas: c, viewport, background: "#ffffff" }).promise;
      const contenido = await page.getTextContent();
      const texto = contenido.items.map((it) => ("str" in it ? it.str : "")).join(" ");
      const imagen = await canvasABlob(c);
      paginas.push({ imagen, url: URL.createObjectURL(imagen), qr: leerQr(c), texto });
      page.cleanup();
      c.width = c.height = 0; // liberar memoria del canvas
    }
    onProgreso?.(doc.numPages, doc.numPages);
    return paginas;
  } finally {
    await tarea.destroy();
  }
}

/** Versión reducida de una página (para que el modelo la clasifique sin gastar de más). */
export async function miniatura(imagen: Blob, lado = 1400): Promise<Blob> {
  const bmp = await createImageBitmap(imagen);
  const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const c = canvasNuevo(Math.round(bmp.width * escala), Math.round(bmp.height * escala));
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return canvasABlob(c);
}

export function esPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/** Imagen suelta → un comprobante. */
export async function preprocesarImagen(file: File): Promise<Preprocesado> {
  return desdeImagen(file);
}
