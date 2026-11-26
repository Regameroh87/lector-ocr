import { describe, expect, it } from "vitest";
import { agrupar, normalizarFirma, rangoPaginas, senalesDeTexto, type SenalesPagina } from "../lib/segmentar";
import { paginasParaExtraer } from "../lib/client/separar";

const arca = (pv: number, nro: number, copia: string, pag = "") =>
  `${copia} FACTURA A COD. 01 Punto de Venta: ${String(pv).padStart(5, "0")} Comp. Nro: ${String(nro).padStart(8, "0")} Fecha de Emisión: 15/10/2026 CUIT: 30712345678 ${pag} CAE N°: 74123456789012`;

const s = (firma: string | null, extra: Partial<SenalesPagina> = {}): SenalesPagina => ({ firma, copia: null, pagina: null, ...extra });

describe("senalesDeTexto", () => {
  it("lee punto de venta, número, copia y página de la plantilla de ARCA", () => {
    expect(senalesDeTexto(arca(3, 1234, "DUPLICADO", "Pág. 2/3"), null)).toEqual({
      firma: "3-1234",
      copia: "duplicado",
      pagina: { n: 2, de: 3 },
      enBlanco: false,
    });
  });

  it("usa el formato 0003-00001234 si no está la plantilla", () => {
    expect(senalesDeTexto("Factura B N° 0003-00001234 Total $ 100", null).firma).toBe("3-1234");
  });

  it("sin texto (escaneo) no hay señales", () => {
    const r = senalesDeTexto("", null);
    expect(r.firma).toBeNull();
    expect(r.pagina).toBeNull();
  });
});

describe("agrupar", () => {
  it("un comprobante por factura y descarta DUPLICADO/TRIPLICADO", () => {
    const paginas = [
      senalesDeTexto(arca(3, 1, "ORIGINAL"), null),
      senalesDeTexto(arca(3, 1, "DUPLICADO"), null),
      senalesDeTexto(arca(3, 1, "TRIPLICADO"), null),
      senalesDeTexto(arca(3, 2, "ORIGINAL"), null),
      senalesDeTexto(arca(3, 2, "DUPLICADO"), null),
    ];
    expect(agrupar(paginas)).toEqual({ grupos: [[0], [3]], descartadas: [1, 2, 4], dudosas: [] });
  });

  it("comprobantes de varias páginas, con copias", () => {
    const paginas = [
      senalesDeTexto(arca(1, 10, "ORIGINAL", "Pág. 1/2"), null),
      senalesDeTexto(arca(1, 10, "ORIGINAL", "Pág. 2/2"), null),
      senalesDeTexto(arca(1, 10, "DUPLICADO", "Pág. 1/2"), null),
      senalesDeTexto(arca(1, 10, "DUPLICADO", "Pág. 2/2"), null),
      senalesDeTexto(arca(1, 11, "ORIGINAL", "Pág. 1/1"), null),
    ];
    expect(agrupar(paginas).grupos).toEqual([[0, 1], [4]]);
  });

  it("una página sin número que continúa la anterior (Pág. 2)", () => {
    const r = agrupar([s("1-5", { pagina: { n: 1, de: 2 } }), s(null, { pagina: { n: 2, de: 2 } }), s("1-6")]);
    expect(r.grupos).toEqual([[0, 1], [2]]);
    expect(r.dudosas).toEqual([]);
  });

  it("si la primera página no tiene número y la siguiente sí, es el mismo comprobante", () => {
    expect(agrupar([s(null, { pagina: { n: 1, de: null } }), s("2-7")]).grupos).toEqual([[0, 1]]);
  });

  it("sin firma, 'Pág. 1' abre comprobante nuevo", () => {
    const p1 = { n: 1, de: 1 };
    expect(agrupar([s(null, { pagina: p1 }), s(null, { pagina: p1 }), s(null, { pagina: p1 })]).grupos).toEqual([[0], [1], [2]]);
  });

  it("descarta páginas en blanco y marca las que no tienen ninguna señal", () => {
    const r = agrupar([s("1-1"), s(null, { enBlanco: true }), s(null), s("1-2")]);
    expect(r.grupos).toEqual([[0, 2], [3]]);
    expect(r.descartadas).toEqual([1]);
    expect(r.dudosas).toEqual([2]);
  });

  it("junta copias no consecutivas del mismo comprobante", () => {
    const r = agrupar([s("1-1", { copia: "original" }), s("1-2", { copia: "original" }), s("1-1", { copia: "duplicado" }), s("1-2", { copia: "duplicado" })]);
    expect(r.grupos).toEqual([[0], [1]]);
    expect(r.descartadas).toEqual([2, 3]);
  });

  it("si solo vino el DUPLICADO, se conserva", () => {
    expect(agrupar([s("4-9", { copia: "duplicado" })]).grupos).toEqual([[0]]);
  });
});

describe("utilidades", () => {
  it("normalizarFirma", () => {
    expect(normalizarFirma("A 0003-00001234")).toBe("3-1234");
    expect(normalizarFirma(null)).toBeNull();
  });
  it("rangoPaginas", () => {
    expect(rangoPaginas([1, 2, 3, 6])).toBe("2-4, 7");
  });
  it("paginasParaExtraer: primeras 3 + últimas 2", () => {
    expect(paginasParaExtraer([1, 2, 3, 4, 5, 6, 7])).toEqual([1, 2, 3, 6, 7]);
    expect(paginasParaExtraer([1, 2])).toEqual([1, 2]);
  });
});
