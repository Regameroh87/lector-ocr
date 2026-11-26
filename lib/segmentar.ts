// Separación de un PDF con varios comprobantes: decide qué páginas forman cada comprobante.
// Funciona con "señales" por página (de dónde salen no importa: QR, capa de texto del PDF o un modelo):
//   - firma: identifica al comprobante (punto de venta + número, o CAE). Páginas con la misma firma
//     son del mismo comprobante; una firma distinta abre un comprobante nuevo.
//   - copia: ORIGINAL / DUPLICADO / TRIPLICADO. De cada comprobante se conserva solo la primera copia.
//   - pagina: "Pág. 2/3". Una página 1 abre comprobante nuevo; una 2+ continúa el anterior.
import type { QrFiscal } from "./qr";

export type Copia = "original" | "duplicado" | "triplicado" | "cuadruplicado";

export interface SenalesPagina {
  firma: string | null;
  copia: Copia | null;
  pagina: { n: number; de: number | null } | null;
  enBlanco?: boolean;
}

export interface Segmentacion {
  /** Índices (base 0) de las páginas de cada comprobante, en orden. */
  grupos: number[][];
  /** Páginas descartadas: copias repetidas o en blanco. */
  descartadas: number[];
  /** Páginas sin ninguna señal: su ubicación es una suposición (conviene preguntarle al modelo). */
  dudosas: number[];
}

const SIN_SENALES: SenalesPagina = { firma: null, copia: null, pagina: null };

export function firmaDeQr(qr: QrFiscal): string {
  return `${qr.ptoVta}-${qr.nroCmp}`;
}

/** Normaliza un número de comprobante ("0003-00001234", "3 - 1234", "A 0003-00001234") a "3-1234". */
export function normalizarFirma(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const m = texto.match(/(\d{1,5})\s*-\s*(\d{1,8})/);
  if (m) return `${Number(m[1])}-${Number(m[2])}`;
  const solo = texto.replace(/\D/g, "");
  return solo.length >= 4 ? String(Number(solo)) : null;
}

/** Señales a partir de la capa de texto de un PDF digital y del QR (si se leyó). */
export function senalesDeTexto(texto: string, qr: QrFiscal | null): SenalesPagina {
  const t = texto.replace(/\s+/g, " ");
  let firma = qr ? firmaDeQr(qr) : null;
  if (!firma) {
    // Plantilla de ARCA: "Punto de Venta: 00003 Comp. Nro: 00001234"
    const pv = t.match(/Punto\s+de\s+Venta\s*:?\s*(\d{1,5})/i);
    const nro = t.match(/Comp(?:robante)?\.?\s*N(?:ro|[°º]|o|úmero)?\.?\s*:?\s*(\d{1,8})\b/i);
    if (pv && nro) firma = `${Number(pv[1])}-${Number(nro[1])}`;
  }
  if (!firma) {
    // "N° 0003-00001234" y variantes
    const m = t.match(/\bN(?:ro|[°º]|o|úmero)\.?\s*:?\s*(\d{4,5})\s*-\s*(\d{8})\b/i) ?? t.match(/\b(\d{4,5})-(\d{8})\b/);
    if (m) firma = `${Number(m[1])}-${Number(m[2])}`;
  }
  if (!firma) {
    const cae = t.match(/C\.?\s?A\.?\s?E\.?\s?A?\s*(?:N[°º.o]?)?\s*:?\s*(\d{14})\b/i);
    if (cae) firma = `cae:${cae[1]}`;
  }

  const c = t.match(/\b(ORIGINAL|DUPLICADO|TRIPLICADO|CUADRUPLICADO)\b/);
  const copia = c ? (c[1].toLowerCase() as Copia) : null;

  const p = t.match(/P[áa]g(?:ina|\.)?\s*:?\s*(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})\b/i) ?? t.match(/P[áa]g(?:ina|\.)?\s*:?\s*(\d{1,3})\b/i);
  const pagina = p ? { n: Number(p[1]), de: p[2] ? Number(p[2]) : null } : null;

  return { firma, copia, pagina, enBlanco: t.trim().length === 0 ? undefined : false };
}

/** Combina señales de dos fuentes: lo que falte en `base` se completa con `extra`. */
export function combinarSenales(base: SenalesPagina, extra: SenalesPagina | undefined): SenalesPagina {
  if (!extra) return base;
  return {
    firma: base.firma ?? extra.firma,
    copia: base.copia ?? extra.copia,
    pagina: base.pagina ?? extra.pagina,
    enBlanco: base.enBlanco === false ? false : extra.enBlanco,
  };
}

/** ¿Le falta a esta página información para ubicarla con seguridad? */
export function necesitaModelo(s: SenalesPagina): boolean {
  return !s.firma && !s.pagina && !s.enBlanco;
}

export function agrupar(paginas: SenalesPagina[]): Segmentacion {
  const descartadas: number[] = [];
  const dudosas: number[] = [];
  type Grupo = { firma: string | null; paginas: { i: number; copia: Copia | null }[] };
  const grupos: Grupo[] = [];
  let actual: Grupo | null = null;
  let copiaActual: Copia | null = null;

  paginas.forEach((s0, i) => {
    const s = s0 ?? SIN_SENALES;
    if (s.enBlanco) {
      descartadas.push(i);
      return;
    }
    if (s.copia) copiaActual = s.copia;
    else if (s.pagina?.n === 1 || (s.firma && s.firma !== actual?.firma)) copiaActual = null;

    let nuevo = !actual;
    if (actual) {
      // Con firma en ambos lados manda la firma (el DUPLICADO del mismo comprobante tiene "Pág. 1" pero la misma firma).
      if (s.firma && actual.firma) nuevo = s.firma !== actual.firma;
      else if (s.pagina?.n === 1) nuevo = true;
    }
    if (!s.firma && !s.pagina && paginas.length > 1) dudosas.push(i);

    if (nuevo) {
      // Si esta firma ya apareció antes (copias no consecutivas), sumar al grupo existente.
      const previo = s.firma ? grupos.find((g) => g.firma === s.firma) : undefined;
      actual = previo ?? { firma: s.firma, paginas: [] };
      if (!previo) grupos.push(actual);
    } else if (!actual!.firma && s.firma) {
      actual!.firma = s.firma;
    }
    actual!.paginas.push({ i, copia: copiaActual });
  });

  // De cada comprobante, quedarse con la primera copia (ORIGINAL) y descartar el resto.
  const resultado: number[][] = [];
  for (const g of grupos) {
    const primera = g.paginas.find((p) => p.copia)?.copia ?? null;
    const quedan: number[] = [];
    for (const p of g.paginas) {
      if (!primera || !p.copia || p.copia === primera) quedan.push(p.i);
      else descartadas.push(p.i);
    }
    resultado.push(quedan);
  }
  return { grupos: resultado.filter((g) => g.length), descartadas: descartadas.sort((a, b) => a - b), dudosas };
}

/** Rango legible de páginas (base 1): [2,3,4,7] → "2-4, 7". */
export function rangoPaginas(indices: number[]): string {
  const ns = indices.map((i) => i + 1);
  const partes: string[] = [];
  for (let k = 0; k < ns.length; k++) {
    let fin = k;
    while (fin + 1 < ns.length && ns[fin + 1] === ns[fin] + 1) fin++;
    partes.push(fin > k ? `${ns[k]}-${ns[fin]}` : String(ns[k]));
    k = fin;
  }
  return partes.join(", ");
}
