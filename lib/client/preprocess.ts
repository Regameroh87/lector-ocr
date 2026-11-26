// Preprocesamiento en el navegador: PDF/imagen → JPEGs listos para el modelo + lectura del QR.
import jsQR from "jsqr";

export interface Preprocesado {
  imagenes: Blob[]; // JPEG, una por página
  qr: string | null; // texto crudo del QR si se encontró
  paginas: string[]; // object URLs para el visor, una por página
}

const MAX_LADO = 2000; // px del lado mayor enviado al modelo
const MAX_PAGINAS_PDF = 300;
const ALTA_RES = 5000; // px del lado mayor para buscar el QR si no apareció a resolución normal

function canvasABlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo generar la imagen"))), "image/jpeg", 0.9));
}

/** Solo interesa el QR fiscal de ARCA/AFIP; otros QR (Mercado Pago, links de pago) se ignoran. */
const esQrFiscal = (t: string) => /(afip|arca)\.gob\.ar/i.test(t);

type Detector = { detect(fuente: CanvasImageSource): Promise<{ rawValue: string }[]> };
let detector: Detector | null | undefined;

/** BarcodeDetector nativo del navegador (Chrome/Edge): más rápido y robusto que jsQR con QR chicos. */
async function conDetectorNativo(canvas: HTMLCanvasElement): Promise<string | null> {
  if (detector === undefined) {
    const BD = (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    try {
      detector = BD ? new BD({ formats: ["qr_code"] }) : null;
    } catch {
      detector = null;
    }
  }
  if (!detector) return null;
  try {
    const r = await detector.detect(canvas);
    return r.map((x) => x.rawValue).find(esQrFiscal) ?? null;
  } catch {
    return null;
  }
}

function jsqrEn(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): string | null {
  const r = jsQR(ctx.getImageData(x, y, w, h).data, w, h, { inversionAttempts: "attemptBoth" });
  return r?.data && esQrFiscal(r.data) ? r.data : null;
}

/**
 * jsQR devuelve un solo código por llamada y falla con QR chicos en páginas grandes:
 * se prueba la imagen entera y después una grilla de 3×3 ventanas solapadas (mitad de ancho y alto).
 */
function conJsqr(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const { width: W, height: H } = canvas;
  const entero = jsqrEn(ctx, 0, 0, W, H);
  if (entero) return entero;
  const w = Math.ceil(W / 2);
  const h = Math.ceil(H / 2);
  // El QR de ARCA suele ir abajo: primero las ventanas inferiores.
  for (const fy of [1, 0.5, 0]) {
    for (const fx of [0, 0.5, 1]) {
      const x = Math.round((W - w) * fx);
      const y = Math.round((H - h) * fy);
      const q = jsqrEn(ctx, x, y, w, h);
      if (q) return q;
    }
  }
  return null;
}

function ampliado(canvas: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const g = canvasNuevo(Math.round(canvas.width * factor), Math.round(canvas.height * factor));
  const ctx = g.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, g.width, g.height);
  return g;
}

/** Busca el QR fiscal: detector nativo, después jsQR por ventanas y, si la imagen es chica, ampliada. */
async function leerQr(canvas: HTMLCanvasElement, { ampliar = true } = {}): Promise<string | null> {
  const nativo = await conDetectorNativo(canvas);
  if (nativo) return nativo;
  const directo = conJsqr(canvas);
  if (directo || !ampliar) return directo;
  // Capturas o fotos chicas: reintentar al doble (o triple) de tamaño.
  const factor = Math.min(3, Math.max(2, Math.floor(4000 / Math.max(canvas.width, canvas.height))));
  if (Math.max(canvas.width, canvas.height) * factor > 6000) return null;
  const g = ampliado(canvas, factor);
  const r = (await conDetectorNativo(g)) ?? conJsqr(g);
  g.width = g.height = 0;
  return r;
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
  const qr = await leerQr(c);
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
      let qr = await leerQr(c, { ampliar: false });
      if (!qr && (!texto.trim() || /C\.?\s?A\.?\s?E/i.test(texto))) {
        // El QR de ARCA es chico y denso: volver a renderizar la página en alta resolución.
        // (En PDFs digitales da detalle real; en escaneos equivale a ampliar la imagen.)
        const escala = Math.min(8, ALTA_RES / Math.max(base.width, base.height));
        const vp = page.getViewport({ scale: escala });
        const g = canvasNuevo(Math.round(vp.width), Math.round(vp.height));
        await page.render({ canvas: g, viewport: vp, background: "#ffffff" }).promise;
        qr = await leerQr(g, { ampliar: false });
        g.width = g.height = 0;
      }
      paginas.push({ imagen, url: URL.createObjectURL(imagen), qr, texto });
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
