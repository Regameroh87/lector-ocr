// Para páginas sin QR ni texto (escaneos/fotos dentro de un PDF): el modelo lee de cada página
// el número de comprobante, la copia y el "Pág. n/m", y con eso se agrupan igual que con el texto.
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { getModeloConfig, costoEstimado } from "./models";
import { getModel } from "./providers";
import { esRechazoDeEsquema, type Imagen } from "./extract";
import { normalizarFirma, type SenalesPagina } from "./segmentar";

const PaginaLeida = z.object({
  imagen: z.number().describe("Número de imagen (1, 2, 3… en el orden recibido)"),
  numeroComprobante: z.string().nullable().describe("Punto de venta y número tal como figura, ej. 0003-00001234; null si la página no lo muestra"),
  copia: z.enum(["original", "duplicado", "triplicado", "cuadruplicado"]).nullable().describe("Si la página dice ORIGINAL/DUPLICADO/TRIPLICADO"),
  paginaN: z.number().nullable().describe("Número de página dentro del comprobante si figura (ej. 'Pág. 2/3' → 2)"),
  paginaDe: z.number().nullable().describe("Total de páginas del comprobante si figura (ej. 'Pág. 2/3' → 3)"),
  enBlanco: z.boolean().describe("true si la página está en blanco o no es parte de ningún comprobante (separador, carátula)"),
  empiezaComprobante: z.boolean().describe("true si en esta página empieza un comprobante (tiene encabezado con emisor, tipo y número)"),
});
const Respuesta = z.object({ paginas: z.array(PaginaLeida) });

const SYSTEM = `Recibís páginas sueltas de un PDF que contiene varios comprobantes fiscales (facturas, notas de crédito, tickets) escaneados uno detrás de otro.
Para cada imagen, respondé solo lo que se ve en ella; no deduzcas a partir de otras páginas. Si un dato no aparece, usá null.`;

export interface ResultadoSenales {
  senales: SenalesPagina[];
  costoUsd: number | null;
}

export async function senalesConModelo(imagenes: Imagen[], modeloId: string, opciones: { model?: LanguageModel } = {}): Promise<ResultadoSenales> {
  const cfg = getModeloConfig(modeloId);
  const model = opciones.model ?? getModel(cfg);
  const content = [
    { type: "text" as const, text: `Analizá estas ${imagenes.length} páginas. Devolvé una entrada por imagen, en orden.` },
    ...imagenes.map((img) => ({ type: "file" as const, mediaType: img.mediaType, data: img.data })),
  ];
  const messages = [{ role: "user" as const, content }];

  let leido: z.infer<typeof Respuesta>;
  let uso: { inputTokens?: number; outputTokens?: number } | undefined;
  try {
    if (!cfg.structuredOutputs) throw new Error("sin esquema estricto");
    const r = await generateText({ model, system: SYSTEM, messages, output: Output.object({ schema: Respuesta }) });
    leido = r.output;
    uso = r.usage;
  } catch (err) {
    if (cfg.structuredOutputs && !esRechazoDeEsquema(err)) throw err;
    const r = await generateText({
      model,
      system: `${SYSTEM}\nRespondé únicamente con un objeto JSON (sin markdown) que cumpla este JSON Schema:\n${JSON.stringify(z.toJSONSchema(Respuesta))}`,
      messages,
      output: Output.json(),
    });
    leido = Respuesta.parse(r.output);
    uso = r.usage;
  }

  const senales: SenalesPagina[] = imagenes.map((_, i) => {
    const p = leido.paginas.find((x) => x.imagen === i + 1) ?? leido.paginas[i];
    if (!p) return { firma: null, copia: null, pagina: null };
    // Sin "Pág. n/m" visible, el encabezado decide: si no empieza un comprobante, continúa el anterior.
    const n = p.empiezaComprobante ? 1 : (p.paginaN ?? 2);
    return {
      firma: normalizarFirma(p.numeroComprobante),
      copia: p.copia,
      pagina: n ? { n, de: p.paginaDe } : null,
      enBlanco: p.enBlanco,
    };
  });
  const costoUsd = uso ? costoEstimado(cfg, uso.inputTokens ?? 0, uso.outputTokens ?? 0) : null;
  return { senales, costoUsd };
}
