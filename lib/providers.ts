import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { ModeloConfig } from "./models";

// Devuelve una instancia de modelo del AI SDK según el proveedor configurado.
// Para sumar un proveedor nuevo: agregá un case acá y el valor en `Proveedor`.
export function getModel(cfg: ModeloConfig) {
  switch (cfg.proveedor) {
    case "openrouter": {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error("Falta OPENROUTER_API_KEY en .env.local");
      return createOpenRouter({ apiKey })(cfg.id, { usage: { include: true } });
    }
  }
}
