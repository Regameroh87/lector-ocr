import { z } from "zod";

// Campos adicionales que define el usuario (además de los fijos de la factura).
// Se extraen en `factura.extras[clave]`.

export type TipoCampoPersonalizado = "texto" | "numero" | "fecha";

export interface CampoPersonalizado {
  /** id estable para la UI */
  id: string;
  /** Cómo lo llama el usuario, ej. "Orden de compra" */
  nombre: string;
  /** Pista opcional para el modelo: dónde suele estar, formato, valores posibles */
  descripcion: string;
  tipo: TipoCampoPersonalizado;
}

/** Campo ya normalizado en el servidor, con la clave que usa el modelo en el JSON. */
export interface CampoExtraido {
  clave: string;
  nombre: string;
  descripcion: string;
  tipo: TipoCampoPersonalizado;
}

export type Extras = Record<string, string | number | null>;

export const MAX_CAMPOS = 15;

/** "Orden de compra Nº" → "orden_de_compra_n" (clave válida para JSON Schema estricto). */
export function claveDe(nombre: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return base || "campo";
}

const Entrada = z.object({
  nombre: z.string().trim().min(1).max(60),
  descripcion: z.string().trim().max(300).optional().default(""),
  tipo: z.enum(["texto", "numero", "fecha"]).optional().default("texto"),
});

/** Valida lo que manda el cliente: descarta vacíos, recorta a MAX_CAMPOS y evita claves repetidas. */
export function normalizarCampos(raw: unknown): CampoExtraido[] {
  if (!Array.isArray(raw)) return [];
  const usadas = new Set<string>();
  const out: CampoExtraido[] = [];
  for (const item of raw) {
    const p = Entrada.safeParse(item);
    if (!p.success) continue;
    let clave = claveDe(p.data.nombre);
    for (let i = 2; usadas.has(clave); i++) clave = `${claveDe(p.data.nombre)}_${i}`;
    usadas.add(clave);
    out.push({ clave, nombre: p.data.nombre, descripcion: p.data.descripcion, tipo: p.data.tipo });
    if (out.length >= MAX_CAMPOS) break;
  }
  return out;
}

/** Esquema Zod del objeto `extras` para estos campos. */
export function esquemaExtras(campos: CampoExtraido[]) {
  const forma: Record<string, z.ZodType> = {};
  for (const c of campos) {
    const desc = [c.nombre, c.descripcion, c.tipo === "fecha" ? "Formato YYYY-MM-DD" : ""].filter(Boolean).join(". ");
    forma[c.clave] = (c.tipo === "numero" ? z.number() : z.string()).nullable().describe(desc);
  }
  return z.object(forma).describe("Campos adicionales pedidos por el usuario");
}

/** Texto para el prompt con los campos pedidos. */
export function instruccionesCampos(campos: CampoExtraido[]): string {
  if (!campos.length) return "";
  const lista = campos
    .map((c) => `- "${c.clave}": ${c.nombre}${c.descripcion ? ` (${c.descripcion})` : ""} [${c.tipo === "numero" ? "número" : c.tipo === "fecha" ? "fecha YYYY-MM-DD" : "texto"}]`)
    .join("\n");
  return `Además, completá el objeto "extras" con estos campos pedidos por el usuario:
${lista}
El comprobante puede rotularlos con otras palabras o en otro idioma: buscá el dato por su significado, no por el texto exacto.
Si el campo pide una clasificación o un resumen (por ejemplo una categoría de gasto), podés inferirlo del contenido. Si es un dato que debería figurar impreso y no está, usá null.`;
}
