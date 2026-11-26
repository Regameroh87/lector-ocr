import { generateText, Output, NoObjectGeneratedError, APICallError, type LanguageModel } from "ai";
import { z } from "zod";
import { Factura } from "./schema";
import { esquemaExtras, instruccionesCampos, type CampoExtraido } from "./campos";
import { getModeloConfig, costoEstimado } from "./models";
import { getModel } from "./providers";

class FormatoInvalidoError extends Error {}

export interface Imagen {
  data: Uint8Array;
  mediaType: string; // image/jpeg | image/png
}

export interface ResultadoExtraccion {
  factura: Factura;
  modelo: string;
  ms: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costoUsd: number | null;
  intentos: number;
  /** "estricto" = JSON Schema del proveedor; "json" = JSON pedido por prompt y validado con Zod */
  modo: "estricto" | "json";
}

/**
 * Modelos cuyo proveedor rechazó el JSON Schema estricto en esta ejecución.
 * OpenRouter enruta cada pedido a distintos proveedores (p. ej. Claude puede caer en Google Vertex,
 * que limita los campos opcionales), así que el rechazo se detecta en tiempo de ejecución.
 */
const sinEsquemaEstricto = new Set<string>();

/** ¿El error es el proveedor rechazando el esquema (y no un problema de red, key o límite)? */
export function esRechazoDeEsquema(err: unknown): boolean {
  if (!APICallError.isInstance(err)) return false;
  if (err.statusCode !== undefined && err.statusCode !== 400 && err.statusCode !== 422) return false;
  const texto = `${err.message} ${err.responseBody ?? ""}`;
  return /schema|anyOf|union|response_format|json_schema|structured output/i.test(texto);
}

const SYSTEM = `Sos un sistema de extracción de datos de comprobantes fiscales (facturas, notas de crédito/débito, tickets y facturas del exterior).
Reglas:
- Devolvé SOLO datos que estén visibles en el comprobante. Si un dato no aparece o no se lee, usá null. Nunca inventes ni completes por deducción.
- Si un valor se lee parcialmente o con dudas, cargalo igual y agregá el nombre del campo a "camposDudosos".
- Fechas en formato YYYY-MM-DD. Importes como número decimal con punto (convertí "1.234,56" a 1234.56).
- CUIT: solo los 11 dígitos, sin guiones.
- Para comprobantes argentinos electrónicos identificá letra (A/B/C/M/E), punto de venta, número, CAE y vencimiento del CAE.
- "iva": una entrada por cada alícuota discriminada. Si el IVA no está discriminado (típico en B y C), dejá el array vacío.
- Si hay varias páginas, son del mismo comprobante.`;

/** Capa de texto de un PDF digital: los caracteres son exactos, evita errores de lectura en CUIT, CAE e importes. */
function instruccionesTexto(texto?: string | null): string {
  if (!texto?.trim()) return "";
  return `Este es el texto que trae el PDF (extraído digitalmente, sin errores de lectura, aunque sin el orden visual).
Usalo para copiar exactamente números como CUIT, CAE, punto de venta, número e importes; la imagen manda para entender qué es cada dato.
<texto_pdf>
${texto}
</texto_pdf>`;
}

function instruccionesJsonSinSchema(schema: z.ZodType): string {
  const json = JSON.stringify(z.toJSONSchema(schema));
  return `Respondé únicamente con un objeto JSON válido (sin texto extra ni markdown) que cumpla este JSON Schema:\n${json}`;
}

export async function extraerFactura(
  imagenes: Imagen[],
  modeloId: string,
  opciones: { model?: LanguageModel; campos?: CampoExtraido[]; texto?: string | null } = {},
): Promise<ResultadoExtraccion> {
  const cfg = getModeloConfig(modeloId);
  const campos = opciones.campos ?? [];
  const schema = campos.length ? Factura.extend({ extras: esquemaExtras(campos) }) : Factura;
  const pedido = ["Extraé los datos de este comprobante.", instruccionesCampos(campos), instruccionesTexto(opciones.texto)].filter(Boolean).join("\n\n");
  const model = opciones.model ?? getModel(cfg);
  const t0 = Date.now();
  let modo: "estricto" | "json" = cfg.structuredOutputs && !sinEsquemaEstricto.has(modeloId) ? "estricto" : "json";

  const contenido = (m: typeof modo) => [
    {
      type: "text" as const,
      text: m === "estricto" ? pedido : `${pedido}\n\n${instruccionesJsonSinSchema(schema)}`,
    },
    ...imagenes.map((img) => ({ type: "file" as const, mediaType: img.mediaType, data: img.data })),
  ];

  let ultimoError: unknown;
  let inTok = 0;
  let outTok = 0;
  let tieneUso = false;
  let intentos = 0;
  let cambioDeModo = false;

  while (intentos < 2) {
    intentos++;
    try {
      const mensajes = [{ role: "user" as const, content: contenido(modo) }];
      if (intentos === 2 && ultimoError) {
        mensajes.push({
          role: "user" as const,
          content: [{ type: "text" as const, text: `El intento anterior no respetó el formato (${String(ultimoError).slice(0, 500)}). Corregilo y respondé de nuevo.` }],
        });
      }

      let factura: Factura;
      if (modo === "estricto") {
        const res = await generateText({ model, system: SYSTEM, messages: mensajes, output: Output.object({ schema }) });
        factura = res.output as Factura;
        sumarUso(res.usage);
      } else {
        const res = await generateText({ model, system: SYSTEM, messages: mensajes, output: Output.json() });
        sumarUso(res.usage);
        const parsed = schema.safeParse(res.output);
        if (!parsed.success) throw new FormatoInvalidoError(z.prettifyError(parsed.error));
        factura = parsed.data as Factura;
      }

      return {
        factura,
        modelo: modeloId,
        ms: Date.now() - t0,
        inputTokens: tieneUso ? inTok : null,
        outputTokens: tieneUso ? outTok : null,
        costoUsd: tieneUso ? costoEstimado(cfg, inTok, outTok) : null,
        intentos,
        modo,
      };
    } catch (err) {
      // El proveedor no acepta el esquema estricto: pasar a modo JSON sin gastar un intento.
      if (modo === "estricto" && !cambioDeModo && esRechazoDeEsquema(err)) {
        console.warn(`[extract] ${modeloId}: el proveedor rechazó el esquema estricto; uso modo JSON. (${(err as Error).message.slice(0, 160)})`);
        sinEsquemaEstricto.add(modeloId);
        modo = "json";
        cambioDeModo = true;
        intentos--;
        continue;
      }
      if (NoObjectGeneratedError.isInstance(err) && err.usage) sumarUso(err.usage);
      ultimoError = err instanceof Error ? err.message : err;
      // Errores de red/autenticación/límite: no tiene sentido reintentar con otro prompt.
      if (!(NoObjectGeneratedError.isInstance(err) || err instanceof FormatoInvalidoError)) throw err;
    }
  }
  throw new Error(`El modelo no devolvió un JSON válido tras 2 intentos: ${String(ultimoError)}`);

  function sumarUso(u?: { inputTokens?: number; outputTokens?: number }) {
    if (!u) return;
    if (typeof u.inputTokens === "number") { inTok += u.inputTokens; tieneUso = true; }
    if (typeof u.outputTokens === "number") { outTok += u.outputTokens; tieneUso = true; }
  }
}
