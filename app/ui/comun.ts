import type { RespuestaExtraccion } from "@/lib/types";
import type { EstadoArca } from "@/lib/arca/verificar";
import { rangoPaginas } from "@/lib/segmentar";

/**
 * preparando → esperando → en_cola → extrayendo → listo
 * "error" solo cuando no hay datos previos; si falla una re-extracción se conserva el resultado anterior.
 */
export type Estado = "preparando" | "esperando" | "en_cola" | "extrayendo" | "listo" | "error";

export interface Fila {
  id: string;
  archivo: File;
  /** object URL del archivo original (para "Abrir original") */
  original: string;
  estado: Estado;
  /** object URLs de las páginas renderizadas */
  paginas?: string[];
  /** imágenes listas para enviar al modelo + QR leído (se reutilizan al re-extraer) */
  pre?: { imagenes: Blob[]; qr: string | null; texto?: string | null };
  /** modelo elegido para la próxima extracción de este comprobante */
  modelo?: string;
  /** modelo con el que se está extrayendo ahora */
  modeloEnCurso?: string;
  error?: string;
  res?: RespuestaExtraccion;
  /** Si el comprobante salió de un PDF con varios: índices (base 0) de sus páginas en el PDF original. */
  paginasOrigen?: number[];
  /** Texto de progreso mientras se lee/separa el archivo. */
  progreso?: string;
  /** Aviso de la separación (copias descartadas, páginas dudosas, etc.). */
  nota?: string;
  /** Costo de identificar los comprobantes con el modelo (PDFs escaneados con varios). */
  costoSeparacion?: number;
}

/** Nombre para mostrar: "lote.pdf · págs. 3-4" si salió de un PDF con varios comprobantes. */
export function nombreFila(f: Pick<Fila, "archivo" | "paginasOrigen">): string {
  return f.paginasOrigen ? `${f.archivo.name} · ${paginasTxt(f.paginasOrigen)}` : f.archivo.name;
}

export function paginasTxt(indices: number[]): string {
  return `${indices.length === 1 ? "pág." : "págs."} ${rangoPaginas(indices)}`;
}

export const ESTADO_TXT: Record<Estado, string> = {
  preparando: "Leyendo archivo",
  esperando: "Listo para extraer",
  en_cola: "En cola",
  extrayendo: "Extrayendo datos",
  listo: "Listo",
  error: "Error",
};

export const ARCA_BADGE: Record<EstadoArca["estado"], { txt: string; cls: string }> = {
  valido: { txt: "Válido en ARCA", cls: "bg-emerald-50 text-emerald-800 ring-emerald-600/20" },
  rechazado: { txt: "Rechazado por ARCA", cls: "bg-red-50 text-red-800 ring-red-600/20" },
  no_verificable: { txt: "No verificable", cls: "bg-zinc-100 text-zinc-600 ring-zinc-500/15" },
  pendiente: { txt: "ARCA pendiente", cls: "bg-amber-50 text-amber-800 ring-amber-600/20" },
  error: { txt: "Error ARCA", cls: "bg-red-50 text-red-700 ring-red-600/20" },
  desactivado: { txt: "ARCA desactivada", cls: "bg-zinc-100 text-zinc-500 ring-zinc-500/15" },
};

export const TIPO_TXT: Record<string, string> = {
  factura: "Factura",
  nota_credito: "Nota de crédito",
  nota_debito: "Nota de débito",
  recibo: "Recibo",
  ticket: "Ticket",
  factura_exterior: "Factura del exterior",
  otro: "Comprobante",
};

export function fmtNum(n: number | null | undefined, moneda?: string | null) {
  if (n === null || n === undefined) return "—";
  const v = n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda ? `${moneda} ${v}` : v;
}

export function numeroComprobante(pv: number | null, nro: number | null) {
  if (pv === null && nro === null) return null;
  return `${pv !== null ? String(pv).padStart(5, "0") : "?????"}-${nro !== null ? String(nro).padStart(8, "0") : "????????"}`;
}

export function resumenAdvertencias(res?: RespuestaExtraccion) {
  const errores = res?.advertencias.filter((a) => a.nivel === "error").length ?? 0;
  const avisos = res?.advertencias.filter((a) => a.nivel === "aviso").length ?? 0;
  return { errores, avisos };
}

export function nombreModelo(modelos: { id: string; label: string }[], id?: string) {
  return modelos.find((m) => m.id === id)?.label ?? id ?? "";
}
