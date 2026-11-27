import { z } from "zod";
import { MAX_CAMPOS, type CampoPersonalizado } from "./campos";
import type { ConfigColumnas } from "./export";

// Plantillas: "para este tipo de documento (o este proveedor), extraé estos datos y exportá estas columnas".
// Este módulo sirve para cliente y servidor (validación y textos); el acceso a la base está en lib/db/plantillas.ts.

export const TIPOS_DOCUMENTO = [
  { v: "factura", txt: "Factura" },
  { v: "nota_credito", txt: "Nota de crédito / débito" },
  { v: "ticket", txt: "Ticket" },
  { v: "remito", txt: "Remito" },
  { v: "recibo", txt: "Recibo" },
  { v: "orden_compra", txt: "Orden de compra" },
  { v: "presupuesto", txt: "Presupuesto" },
  { v: "extracto", txt: "Extracto / resumen" },
  { v: "otro", txt: "Otro" },
] as const;

export function nombreTipo(v: string): string {
  return TIPOS_DOCUMENTO.find((t) => t.v === v)?.txt ?? v;
}

/** Plantilla tal como la usa la interfaz (fechas como texto, campos con id para editar). */
export interface PlantillaCliente {
  id: string;
  nombre: string;
  tipoDocumento: string;
  descripcion: string;
  fiscal: boolean;
  campos: CampoPersonalizado[];
  columnas: ConfigColumnas | null;
  cuitsEmisor: string[];
  compartida: boolean;
  /** ¿Puede editarla quien la está viendo? (la creó o es admin) */
  editable: boolean;
  actualizadaEn: string;
}

const soloDigitos = (s: string) => s.replace(/\D/g, "");

const Campo = z.object({
  nombre: z.string().trim().min(1, "Hay un campo sin nombre").max(60),
  descripcion: z.string().trim().max(300).default(""),
  tipo: z.enum(["texto", "numero", "fecha"]).default("texto"),
});

const Columnas = z
  .object({
    visibles: z.array(z.string().max(80)).max(200),
    conocidas: z.array(z.string().max(80)).max(200),
    hojaItems: z.boolean(),
  })
  .nullable();

/** Lo que manda el editor al guardar. */
export const EntradaPlantilla = z.object({
  id: z.uuid().optional(),
  nombre: z.string().trim().min(1, "Poné un nombre").max(80),
  tipoDocumento: z.string().trim().min(1).max(40),
  descripcion: z.string().trim().max(500).default(""),
  fiscal: z.boolean(),
  campos: z.array(Campo).max(MAX_CAMPOS, `Máximo ${MAX_CAMPOS} campos`),
  columnas: Columnas,
  cuitsEmisor: z
    .array(z.string())
    .max(50)
    .transform((xs) => [...new Set(xs.map(soloDigitos).filter(Boolean))])
    .refine((xs) => xs.every((c) => c.length === 11), "Cada CUIT tiene que tener 11 dígitos"),
  compartida: z.boolean(),
});
export type EntradaPlantilla = z.input<typeof EntradaPlantilla>;

/** Texto para el modelo: qué tipo de documento es y qué aclaró quien armó la plantilla. */
export function instruccionesPlantilla(p: { nombre: string; tipoDocumento: string; descripcion: string; fiscal: boolean }): string {
  const lineas = [`El documento se procesa con la plantilla "${p.nombre}" (tipo: ${nombreTipo(p.tipoDocumento)}).`];
  if (p.descripcion.trim()) lineas.push(`Indicaciones de quien armó la plantilla: ${p.descripcion.trim()}`);
  if (!p.fiscal)
    lineas.push(
      "Puede no ser un comprobante fiscal: los datos de factura que no figuren (CAE, letra, IVA, etc.) van en null. Lo importante son los campos pedidos en \"extras\".",
    );
  return lineas.join("\n");
}

/** Elige la plantilla que corresponde a alguno de estos CUITs (el del QR o los que aparecen en el PDF). */
export function plantillaPorCuit<T extends { cuitsEmisor: string[] }>(plantillas: T[], cuits: (string | number | null | undefined)[]): T | null {
  const buscados = new Set(cuits.filter((c) => c != null).map((c) => soloDigitos(String(c))));
  if (!buscados.size) return null;
  return plantillas.find((p) => p.cuitsEmisor.some((c) => buscados.has(c))) ?? null;
}
