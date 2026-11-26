import { describe, expect, it } from "vitest";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { extraerFactura, esRechazoDeEsquema } from "../lib/extract";

const factura = {
  tipoDocumento: "factura", letra: "A", codigoTipoAfip: 1, puntoVenta: 3, numero: 1234, fechaEmision: "2026-10-15",
  pais: "AR", moneda: "ARS", cotizacion: null,
  emisor: { razonSocial: "X", idFiscal: "33693450239", condicionIva: null },
  receptor: { razonSocial: null, idFiscal: null, condicionIva: null },
  netoGravado: 1000, noGravado: null, exento: null, iva: [], percepciones: null, otrosTributos: null,
  total: 1210, cae: "74123456789012", caeVencimiento: null, items: [], camposDudosos: [], notas: null,
};

const ok = (text: string) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const, raw: undefined },
  usage: {
    inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 50, text: 50, reasoning: undefined },
  },
  warnings: [],
});

const rechazoGoogle = () =>
  new APICallError({
    message: "[Google] Schemas contains too many parameters with union types (27 parameters with type arrays or anyOf).",
    url: "https://openrouter.ai/api/v1/chat/completions",
    requestBodyValues: {},
    statusCode: 400,
  });

const img = [{ data: new Uint8Array([1, 2, 3]), mediaType: "image/jpeg" }];

describe("extraerFactura", () => {
  it("pasa a modo JSON si el proveedor rechaza el esquema estricto, y lo recuerda", async () => {
    const formatos: string[] = [];
    const model = new MockLanguageModelV4({
      doGenerate: async (opts) => {
        formatos.push(opts.responseFormat?.type === "json" && opts.responseFormat.schema ? "estricto" : "json");
        if (formatos.length === 1) throw rechazoGoogle();
        return ok(JSON.stringify(factura));
      },
    });
    const r = await extraerFactura(img, "anthropic/claude-haiku-5.5", { model });
    expect(r.modo).toBe("json");
    expect(r.intentos).toBe(1);
    expect(r.factura.total).toBe(1210);
    expect(formatos).toEqual(["estricto", "json"]);

    // La segunda vez arranca directo en modo JSON
    const r2 = await extraerFactura(img, "anthropic/claude-haiku-5.5", { model });
    expect(r2.modo).toBe("json");
    expect(formatos).toEqual(["estricto", "json", "json"]);
  });

  it("usa el esquema estricto cuando el proveedor lo acepta", async () => {
    const model = new MockLanguageModelV4({ doGenerate: async () => ok(JSON.stringify(factura)) });
    const r = await extraerFactura(img, "openai/gpt-6-luna", { model });
    expect(r.modo).toBe("estricto");
  });

  it("no oculta errores que no son de esquema (p. ej. key inválida)", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({ message: "Invalid API key", url: "x", requestBodyValues: {}, statusCode: 401 });
      },
    });
    await expect(extraerFactura(img, "qwen/qwen3.8-flash", { model })).rejects.toThrow("Invalid API key");
  });

  it("reconoce rechazos de esquema", () => {
    expect(esRechazoDeEsquema(rechazoGoogle())).toBe(true);
    expect(esRechazoDeEsquema(new Error("schema"))).toBe(false);
  });
});
