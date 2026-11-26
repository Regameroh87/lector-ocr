import type { Factura } from "./schema";

// Códigos de tipo de comprobante de ARCA/AFIP (tabla de parámetros FEParamGetTiposCbte).
const CODIGOS: Record<string, Partial<Record<Factura["tipoDocumento"], number>>> = {
  A: { factura: 1, nota_debito: 2, nota_credito: 3, recibo: 4 },
  B: { factura: 6, nota_debito: 7, nota_credito: 8, recibo: 9 },
  C: { factura: 11, nota_debito: 12, nota_credito: 13, recibo: 15 },
  M: { factura: 51, nota_debito: 52, nota_credito: 53, recibo: 54 },
  E: { factura: 19, nota_debito: 20, nota_credito: 21 },
};

export function codigoTipoAfip(f: Pick<Factura, "letra" | "tipoDocumento" | "codigoTipoAfip">): number | null {
  if (f.codigoTipoAfip) return f.codigoTipoAfip;
  if (!f.letra) return null;
  return CODIGOS[f.letra]?.[f.tipoDocumento] ?? null;
}
