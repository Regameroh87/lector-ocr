import { z } from "zod";
import type { Extras } from "./campos";

// Todos los campos son nullable (no optional) para que funcione con
// "structured outputs" estrictos de cualquier proveedor.
const num = z.number().nullable();
const str = z.string().nullable();

export const Parte = z.object({
  razonSocial: str.describe("Nombre o razón social"),
  idFiscal: str.describe("CUIT (solo dígitos, 11) o tax ID extranjero tal como aparece"),
  condicionIva: str.describe("Responsable Inscripto, Monotributo, Exento, Consumidor Final, etc."),
});

export const AlicuotaIva = z.object({
  alicuota: z.number().describe("Porcentaje: 21, 10.5, 27, 5, 2.5 o 0"),
  baseImponible: num,
  importe: z.number(),
});

export const Item = z.object({
  descripcion: z.string(),
  cantidad: num,
  precioUnitario: num,
  subtotal: num,
});

export const Factura = z.object({
  tipoDocumento: z
    .enum(["factura", "nota_credito", "nota_debito", "recibo", "ticket", "factura_exterior", "otro"])
    .describe("Clase de comprobante"),
  letra: z.enum(["A", "B", "C", "M", "E", "T", "otro"]).nullable().describe("Letra AFIP/ARCA si aplica; T = ticket"),
  codigoTipoAfip: z.number().nullable().describe("Código numérico AFIP del comprobante si figura (ej. 1, 6, 11)"),
  puntoVenta: num,
  numero: num,
  fechaEmision: str.describe("Formato YYYY-MM-DD"),
  pais: str.describe("Código ISO de 2 letras del país del emisor, ej. AR"),
  moneda: str.describe("Código ISO 4217, ej. ARS, USD, EUR"),
  cotizacion: num.describe("Tipo de cambio si la factura lo indica"),
  emisor: Parte,
  receptor: Parte,
  netoGravado: num,
  noGravado: num,
  exento: num,
  iva: z.array(AlicuotaIva).describe("IVA discriminado por alícuota; vacío si no está discriminado"),
  percepciones: num.describe("Suma de percepciones y retenciones (IIBB, IVA, Ganancias)"),
  otrosTributos: num,
  total: num,
  cae: str.describe("CAE o CAEA de 14 dígitos"),
  caeVencimiento: str.describe("YYYY-MM-DD"),
  items: z.array(Item),
  camposDudosos: z.array(z.string()).describe("Nombres de campos que no se leen con claridad"),
  notas: str.describe("Observaciones breves del modelo"),
});

/** `extras` solo existe si el usuario pidió campos personalizados. */
export type Factura = z.infer<typeof Factura> & { extras?: Extras };
export type AlicuotaIva = z.infer<typeof AlicuotaIva>;
