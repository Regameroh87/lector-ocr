import { describe, expect, it } from "vitest";
import { EntradaPlantilla, instruccionesPlantilla, plantillaPorCuit } from "../lib/plantillas";

const base = {
  nombre: "Facturas de Proveedor X",
  tipoDocumento: "factura",
  descripcion: "",
  fiscal: true,
  campos: [{ nombre: "Orden de compra", descripcion: "", tipo: "texto" as const }],
  columnas: null,
  cuitsEmisor: [],
  compartida: true,
};

describe("EntradaPlantilla", () => {
  it("normaliza CUITs con guiones y saca repetidos", () => {
    const r = EntradaPlantilla.parse({ ...base, cuitsEmisor: ["30-71234567-8", "30712345678"] });
    expect(r.cuitsEmisor).toEqual(["30712345678"]);
  });

  it("rechaza CUITs incompletos y nombres vacíos", () => {
    expect(EntradaPlantilla.safeParse({ ...base, cuitsEmisor: ["3071234"] }).success).toBe(false);
    expect(EntradaPlantilla.safeParse({ ...base, nombre: "  " }).success).toBe(false);
  });

  it("rechaza campos sin nombre", () => {
    expect(EntradaPlantilla.safeParse({ ...base, campos: [{ nombre: "", descripcion: "", tipo: "texto" }] }).success).toBe(false);
  });
});

describe("plantillaPorCuit", () => {
  const ps = [
    { id: "a", cuitsEmisor: ["30712345678"] },
    { id: "b", cuitsEmisor: ["20111111112", "27222222223"] },
  ];

  it("encuentra la plantilla por el CUIT del QR (número) o del texto", () => {
    expect(plantillaPorCuit(ps, [30712345678])?.id).toBe("a");
    expect(plantillaPorCuit(ps, ["33999999990", "27-22222222-3"])?.id).toBe("b");
  });

  it("devuelve null si ningún CUIT coincide", () => {
    expect(plantillaPorCuit(ps, ["33999999990"])).toBeNull();
    expect(plantillaPorCuit(ps, [null, undefined])).toBeNull();
  });
});

describe("instruccionesPlantilla", () => {
  it("avisa cuando el documento no es fiscal", () => {
    const t = instruccionesPlantilla({ nombre: "Remitos", tipoDocumento: "remito", descripcion: "Cantidades en la tabla", fiscal: false });
    expect(t).toContain("Remito");
    expect(t).toContain("Cantidades en la tabla");
    expect(t).toContain("no ser un comprobante fiscal");
  });
});
