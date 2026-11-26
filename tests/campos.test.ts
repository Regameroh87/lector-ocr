import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { claveDe, esquemaExtras, normalizarCampos } from "../lib/campos";
import { extraerFactura } from "../lib/extract";
import { columnas, toCSV, type FilaExport } from "../lib/export";
import { Factura } from "../lib/schema";

const base: z.infer<typeof Factura> = {
  tipoDocumento: "factura", letra: "A", codigoTipoAfip: 1, puntoVenta: 1, numero: 10, fechaEmision: "2026-11-01",
  pais: "AR", moneda: "ARS", cotizacion: null,
  emisor: { razonSocial: "ACME SA", idFiscal: null, condicionIva: null },
  receptor: { razonSocial: null, idFiscal: null, condicionIva: null },
  netoGravado: 100, noGravado: null, exento: null, iva: [{ alicuota: 21, baseImponible: 100, importe: 21 }],
  percepciones: null, otrosTributos: null, total: 121, cae: null, caeVencimiento: null, items: [], camposDudosos: [], notas: null,
};

describe("campos personalizados", () => {
  it("genera claves válidas y sin repetir", () => {
    expect(claveDe("Orden de compra Nº")).toBe("orden_de_compra_n");
    const c = normalizarCampos([{ nombre: "Período" }, { nombre: "periodo", tipo: "fecha" }, { nombre: "  " }, "x", { nombre: "Monto", tipo: "numero" }]);
    expect(c.map((x) => x.clave)).toEqual(["periodo", "periodo_2", "monto"]);
    expect(c[0].tipo).toBe("texto");
  });

  it("el esquema exige número o null según el tipo", () => {
    const s = esquemaExtras(normalizarCampos([{ nombre: "Monto", tipo: "numero" }]));
    expect(s.safeParse({ monto: 5 }).success).toBe(true);
    expect(s.safeParse({ monto: null }).success).toBe(true);
    expect(s.safeParse({ monto: "5" }).success).toBe(false);
  });

  it("los pide al modelo y los devuelve en extras", async () => {
    let prompt = "";
    const model = new MockLanguageModelV4({
      doGenerate: async (opts) => {
        prompt = JSON.stringify(opts.prompt);
        return {
          content: [{ type: "text", text: JSON.stringify({ ...base, extras: { orden_de_compra: "OC-77", categoria: "servicios" } }) }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } },
          warnings: [],
        };
      },
    });
    const campos = normalizarCampos([{ nombre: "Orden de compra" }, { nombre: "Categoría", descripcion: "servicios o insumos" }]);
    const r = await extraerFactura([{ data: new Uint8Array([1]), mediaType: "image/jpeg" }], "openai/gpt-6-luna", { model, campos });
    expect(r.factura.extras).toEqual({ orden_de_compra: "OC-77", categoria: "servicios" });
    expect(prompt).toContain("servicios o insumos");
  });

  it("agrega columnas al exportar", () => {
    const campos = normalizarCampos([{ nombre: "Orden de compra" }]);
    const fila: FilaExport = { archivo: "a.pdf", modelo: "m", factura: { ...base, extras: { orden_de_compra: "OC-77" } }, campos, advertencias: [], arca: null, costoUsd: null };
    const cols = columnas([fila]).map((c) => c.titulo);
    expect(cols.indexOf("Orden de compra")).toBe(cols.indexOf("Estado ARCA") - 1);
    expect(toCSV([fila])).toContain("OC-77");
  });
});
