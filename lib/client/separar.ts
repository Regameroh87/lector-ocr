// Separa un PDF en comprobantes: primero con QR + texto (gratis); las páginas sin señales
// (escaneos) se le mandan al modelo en tandas para que lea número de comprobante, copia y página.
import { parseQrFiscal } from "../qr";
import { agrupar, combinarSenales, necesitaModelo, senalesDeTexto, type Segmentacion, type SenalesPagina } from "../segmentar";
import { miniatura, type PaginaPdf } from "./preprocess";
import { ajustarPeso } from "./comprimir";

const TANDA = 20; // páginas por pedido a /api/segmentar
const CONCURRENCIA = 2;

export interface ResultadoSeparacion extends Segmentacion {
  costoUsd: number;
  paginasConModelo: number;
  /** Mensaje si el modelo falló y se separó solo con QR/texto. */
  aviso?: string;
}

export async function separarPdf(paginas: PaginaPdf[], modelo: string, onProgreso?: (txt: string) => void): Promise<ResultadoSeparacion> {
  const senales: SenalesPagina[] = paginas.map((p) => senalesDeTexto(p.texto, p.qr ? parseQrFiscal(p.qr) : null));
  if (paginas.length === 1) return { grupos: [[0]], descartadas: [], dudosas: [], costoUsd: 0, paginasConModelo: 0 };

  const faltan = senales.flatMap((s, i) => (necesitaModelo(s) ? [i] : []));
  let costoUsd = 0;
  let aviso: string | undefined;

  if (faltan.length) {
    const tandas: number[][] = [];
    for (let k = 0; k < faltan.length; k += TANDA) tandas.push(faltan.slice(k, k + TANDA));
    let hechas = 0;
    onProgreso?.(`Identificando comprobantes (0 de ${faltan.length} págs.)`);
    const procesar = async (tanda: number[]) => {
      const fd = new FormData();
      fd.set("modelo", modelo);
      const minis = await ajustarPeso(await Promise.all(tanda.map((i) => miniatura(paginas[i].imagen))));
      minis.forEach((b, j) => fd.append("imagenes", b, `pagina-${tanda[j] + 1}.jpg`));
      const r = await fetch("/api/segmentar", { method: "POST", body: fd });
      if (r.status === 413) throw new Error("las páginas pesan demasiado aun comprimidas");
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
      (json.senales as SenalesPagina[]).forEach((s, j) => (senales[tanda[j]] = combinarSenales(senales[tanda[j]], s)));
      costoUsd += json.costoUsd ?? 0;
      hechas += tanda.length;
      onProgreso?.(`Identificando comprobantes (${hechas} de ${faltan.length} págs.)`);
    };
    try {
      const cola = [...tandas];
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCIA, cola.length) }, async () => {
          while (cola.length) await procesar(cola.shift()!);
        }),
      );
    } catch (e) {
      aviso = `No se pudo usar el modelo para separar las páginas escaneadas (${e instanceof Error ? e.message : String(e)}). Se separaron solo con QR y texto: revisá que estén bien.`;
    }
  }

  return { ...agrupar(senales), costoUsd, paginasConModelo: faltan.length, aviso };
}

/** El endpoint de extracción acepta hasta 5 imágenes: si el comprobante es más largo, primeras 3 + últimas 2 (los totales suelen ir al final). */
export function paginasParaExtraer<T>(paginas: T[], max = 5): T[] {
  if (paginas.length <= max) return paginas;
  return [...paginas.slice(0, max - 2), ...paginas.slice(-2)];
}
