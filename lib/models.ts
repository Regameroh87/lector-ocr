// Registro de modelos. Para sumar o cambiar uno, agregá una entrada acá.
// Precios en USD por millón de tokens (referencia, tomados de OpenRouter 2026-11).
// IDs vigentes: https://openrouter.ai/models?input_modalities=image

export type Proveedor = "openrouter";

export interface ModeloConfig {
  id: string; // id del modelo en el proveedor
  label: string;
  proveedor: Proveedor;
  /** true si el modelo soporta JSON Schema estricto (structured outputs). */
  structuredOutputs: boolean;
  gratis?: boolean;
  precio?: { input: number; output: number };
}

export const MODELOS: ModeloConfig[] = [
  // --- Baratos ---
  { id: "openai/gpt-6-luna", label: "GPT-6 Luna", proveedor: "openrouter", structuredOutputs: true, precio: { input: 0.1, output: 0.5 } },
  { id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5", proveedor: "openrouter", structuredOutputs: true, precio: { input: 0.1, output: 0.5 } },
  { id: "qwen/qwen3.8-flash", label: "Qwen 3.8 Flash", proveedor: "openrouter", structuredOutputs: true, precio: { input: 0.15, output: 0.47 } },
  { id: "mistralai/mistral-large-4-0", label: "Mistral Large 4", proveedor: "openrouter", structuredOutputs: true, precio: { input: 0.7, output: 2.1 } },
  { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash", proveedor: "openrouter", structuredOutputs: true, precio: { input: 0.825, output: 4.125 } },
  // --- Gratis (límites de uso; el proveedor puede retener los datos) ---
  { id: "nvidia/nemotron-3.5-super-vl:free", label: "Nemotron 3.5 Super VL", proveedor: "openrouter", structuredOutputs: true, gratis: true },
  { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B", proveedor: "openrouter", structuredOutputs: false, gratis: true },
  { id: "inclusionai/ling-3.2-flash:free", label: "Ling 3.2 Flash", proveedor: "openrouter", structuredOutputs: true, gratis: true },
];

export function getModeloConfig(id: string): ModeloConfig {
  const m = MODELOS.find((x) => x.id === id);
  if (!m) throw new Error(`Modelo no registrado en lib/models.ts: ${id}`);
  return m;
}

export function modeloPorDefecto(): string {
  const id = process.env.DEFAULT_MODEL;
  return id && MODELOS.some((m) => m.id === id) ? id : MODELOS[0].id;
}

export function costoEstimado(m: ModeloConfig, inputTokens = 0, outputTokens = 0): number | null {
  if (m.gratis) return 0;
  if (!m.precio) return null;
  return (inputTokens * m.precio.input + outputTokens * m.precio.output) / 1e6;
}
