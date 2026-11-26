import { afterEach, describe, expect, it, vi } from "vitest";
import { verificarEnArca } from "../lib/arca/verificar";
import type { Factura } from "../lib/schema";

const f = {
  tipoDocumento: "factura", letra: "A", codigoTipoAfip: null, puntoVenta: 3, numero: 1234, fechaEmision: "2026-10-15",
  pais: "AR", moneda: "ARS", cotizacion: null,
  emisor: { razonSocial: "X", idFiscal: "33693450239", condicionIva: null },
  receptor: { razonSocial: null, idFiscal: null, condicionIva: null },
  netoGravado: 1000, noGravado: null, exento: null, iva: [], percepciones: null, otrosTributos: null,
  total: 1210, cae: "74123456789012", caeVencimiento: null, items: [], camposDudosos: [], notas: null,
} as Factura;

describe("verificarEnArca", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("devuelve 'desactivado' con ARCA_ENABLED=false", async () => {
    vi.stubEnv("ARCA_ENABLED", "false");
    expect((await verificarEnArca(f)).estado).toBe("desactivado");
  });
  it("devuelve 'pendiente' sin certificado", async () => {
    vi.stubEnv("ARCA_CERT_PATH", "");
    vi.stubEnv("ARCA_CERT", "");
    expect((await verificarEnArca(f)).estado).toBe("pendiente");
  });
  it("no verifica facturas del exterior", async () => {
    expect((await verificarEnArca({ ...f, pais: "US", tipoDocumento: "factura_exterior" })).estado).toBe("no_verificable");
  });
  it("informa error si la ruta del certificado no existe", async () => {
    vi.stubEnv("ARCA_CERT_PATH", "/no/existe.crt");
    vi.stubEnv("ARCA_KEY_PATH", "/no/existe.key");
    vi.stubEnv("ARCA_CUIT", "20123456789");
    const r = await verificarEnArca(f);
    expect(r.estado).toBe("error");
  });
});
