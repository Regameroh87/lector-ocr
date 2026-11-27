// Compresión de las páginas antes de mandarlas al servidor.
// Vercel corta los pedidos de más de 4,5 MB: si las imágenes de un pedido pasan el límite,
// se vuelven a codificar con menos calidad y, si hace falta, más chicas, hasta que entren.

/** Margen bajo los 4,5 MB de Vercel (el formulario agrega texto y encabezados). */
export const LIMITE_PEDIDO = 4_000_000;

export interface Paso {
  calidad: number;
  /** Lado mayor máximo en px. */
  lado: number;
}

/** De menos a más agresivo. Hasta 1400 px el texto de una factura se sigue leyendo bien. */
export const PASOS: Paso[] = [
  { calidad: 0.8, lado: 2000 },
  { calidad: 0.7, lado: 2000 },
  { calidad: 0.7, lado: 1700 },
  { calidad: 0.65, lado: 1400 },
  { calidad: 0.6, lado: 1200 },
];

export type Recodificar = (imagen: Blob, paso: Paso) => Promise<Blob>;

const peso = (xs: Blob[]) => xs.reduce((s, b) => s + b.size, 0);

/**
 * Devuelve las imágenes tal cual si entran en `limite` bytes; si no, prueba los PASOS
 * (siempre desde las originales, para no recomprimir lo ya comprimido) hasta que entren.
 * Si ni el último paso alcanza, devuelve ese resultado y el servidor avisa.
 */
export async function ajustarPeso(imagenes: Blob[], limite = LIMITE_PEDIDO, recodificar: Recodificar = recodificarJpeg): Promise<Blob[]> {
  if (peso(imagenes) <= limite) return imagenes;
  let ultimo = imagenes;
  for (const paso of PASOS) {
    // Una imagen que ya pesa menos que su parte proporcional se deja como está.
    const cuota = limite / imagenes.length;
    ultimo = await Promise.all(imagenes.map((b) => (b.size <= cuota ? b : recodificar(b, paso))));
    if (peso(ultimo) <= limite) return ultimo;
  }
  return ultimo;
}

/** JPEG con fondo blanco, achicado si supera `lado`. Nunca devuelve algo más pesado que el original. */
export async function recodificarJpeg(imagen: Blob, { calidad, lado }: Paso): Promise<Blob> {
  const bmp = await createImageBitmap(imagen);
  const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * escala);
  c.height = Math.round(bmp.height * escala);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const nueva = await new Promise<Blob>((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo comprimir la imagen"))), "image/jpeg", calidad));
  c.width = c.height = 0;
  return nueva.size < imagen.size ? nueva : imagen;
}
