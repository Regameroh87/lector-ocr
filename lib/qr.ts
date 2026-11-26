// QR fiscal de ARCA/AFIP (RG 4291). El QR contiene una URL del tipo
// https://www.afip.gob.ar/fe/qr/?p=<JSON en base64>

export interface QrFiscal {
  ver: number;
  fecha: string; // YYYY-MM-DD
  cuit: number;
  ptoVta: number;
  tipoCmp: number;
  nroCmp: number;
  importe: number;
  moneda: string; // PES, DOL, ...
  ctz: number;
  tipoDocRec?: number;
  nroDocRec?: number;
  tipoCodAut: "E" | "A"; // E = CAE, A = CAEA
  codAut: number;
}

function base64Decode(b64: string): string {
  const norm = b64.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
  const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4);
  if (typeof atob === "function") {
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(padded, "base64").toString("utf8");
}

/** Devuelve los datos del QR fiscal o null si el texto no es un QR de AFIP/ARCA válido. */
export function parseQrFiscal(texto: string): QrFiscal | null {
  try {
    const url = new URL(texto.trim());
    if (!/(afip|arca)\.gob\.ar$/.test(url.hostname)) return null;
    const p = url.searchParams.get("p");
    if (!p) return null;
    const json = JSON.parse(base64Decode(p));
    const requeridos = ["fecha", "cuit", "ptoVta", "tipoCmp", "nroCmp", "importe", "codAut"];
    if (!requeridos.every((k) => json[k] !== undefined && json[k] !== null)) return null;
    return {
      ver: Number(json.ver ?? 1),
      fecha: String(json.fecha).slice(0, 10),
      cuit: Number(json.cuit),
      ptoVta: Number(json.ptoVta),
      tipoCmp: Number(json.tipoCmp),
      nroCmp: Number(json.nroCmp),
      importe: Number(json.importe),
      moneda: String(json.moneda ?? "PES"),
      ctz: Number(json.ctz ?? 1),
      tipoDocRec: json.tipoDocRec !== undefined ? Number(json.tipoDocRec) : undefined,
      nroDocRec: json.nroDocRec !== undefined ? Number(json.nroDocRec) : undefined,
      tipoCodAut: json.tipoCodAut === "A" ? "A" : "E",
      codAut: Number(json.codAut),
    };
  } catch {
    return null;
  }
}

const MONEDA_ISO: Record<string, string> = { PES: "ARS", DOL: "USD", "060": "EUR", "012": "BRL" };
export function monedaQrAIso(m: string): string {
  return MONEDA_ISO[m] ?? m;
}
