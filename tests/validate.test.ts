import { describe, expect, it } from "vitest";
import { cuitValido, validarFactura, aplicarQr, corregirCuitsConTexto, cuitsEnTexto } from "../lib/validate";
import { parseQrFiscal } from "../lib/qr";
import type { Factura } from "../lib/schema";

const base: Factura = {
  tipoDocumento: "factura",
  letra: "A",
  codigoTipoAfip: null,
  puntoVenta: 3,
  numero: 1234,
  fechaEmision: "2026-10-15",
  pais: "AR",
  moneda: "ARS",
  cotizacion: null,
  emisor: { razonSocial: "Proveedor SA", idFiscal: "33693450239", condicionIva: "Responsable Inscripto" },
  receptor: { razonSocial: "Cliente SRL", idFiscal: null, condicionIva: null },
  netoGravado: 1000,
  noGravado: null,
  exento: null,
  iva: [{ alicuota: 21, baseImponible: 1000, importe: 210 }],
  percepciones: null,
  otrosTributos: null,
  total: 1210,
  cae: "74123456789012",
  caeVencimiento: "2026-10-25",
  items: [],
  camposDudosos: [],
  notas: null,
};

function qrUrl(obj: object) {
  return "https://www.afip.gob.ar/fe/qr/?p=" + Buffer.from(JSON.stringify(obj)).toString("base64");
}

describe("cuitValido", () => {
  it("acepta CUIT válidos con o sin guiones", () => {
    expect(cuitValido("33693450239")).toBe(true);
    expect(cuitValido("33-69345023-9")).toBe(true);
  });
  it("rechaza dígito verificador incorrecto y largos inválidos", () => {
    expect(cuitValido("33693450238")).toBe(false);
    expect(cuitValido("123")).toBe(false);
    expect(cuitValido(null)).toBe(false);
  });
});

describe("validarFactura", () => {
  it("no marca nada en una factura consistente", () => {
    expect(validarFactura(base)).toEqual([]);
  });
  it("detecta importes que no cierran", () => {
    const adv = validarFactura({ ...base, total: 1500 });
    expect(adv.some((a) => a.campo === "total" && a.nivel === "aviso")).toBe(true);
  });
  it("detecta CUIT y CAE inválidos", () => {
    const adv = validarFactura({ ...base, emisor: { ...base.emisor, idFiscal: "33693450238" }, cae: "123" });
    expect(adv.filter((a) => a.nivel === "error").map((a) => a.campo).sort()).toEqual(["cae", "emisor.idFiscal"]);
  });
  it("no exige CAE ni CUIT a facturas del exterior", () => {
    const adv = validarFactura({ ...base, pais: "US", tipoDocumento: "factura_exterior", cae: null, emisor: { ...base.emisor, idFiscal: "EIN 12-3456789" } });
    expect(adv).toEqual([]);
  });
});

describe("QR fiscal", () => {
  const qrData = {
    ver: 1, fecha: "2026-10-15", cuit: 33693450239, ptoVta: 3, tipoCmp: 1, nroCmp: 1234,
    importe: 1210, moneda: "PES", ctz: 1, tipoDocRec: 80, nroDocRec: 20111111112, tipoCodAut: "E", codAut: 74123456789012,
  };

  it("decodifica un QR válido", () => {
    const qr = parseQrFiscal(qrUrl(qrData));
    expect(qr).not.toBeNull();
    expect(qr!.cuit).toBe(33693450239);
    expect(qr!.tipoCodAut).toBe("E");
  });
  it("devuelve null para QR corruptos o ajenos", () => {
    expect(parseQrFiscal("https://www.afip.gob.ar/fe/qr/?p=no-es-base64!!")).toBeNull();
    expect(parseQrFiscal("https://ejemplo.com/?p=" + Buffer.from("{}").toString("base64"))).toBeNull();
    expect(parseQrFiscal("hola")).toBeNull();
  });
  it("marca diferencias con el modelo y aplicarQr las corrige", () => {
    const qr = parseQrFiscal(qrUrl({ ...qrData, importe: 1250 }))!;
    const adv = validarFactura(base, qr);
    expect(adv.some((a) => a.campo === "total" && a.mensaje.includes("QR"))).toBe(true);
    expect(aplicarQr(base, qr).total).toBe(1250);
  });
});

describe("corregirCuitsConTexto", () => {
  const texto = "Razón Social: X SA  CUIT: 33-69345023-9  Ingresos Brutos: 123  CUIT cliente: 20-12345678-6";

  it("encuentra CUITs válidos en el texto con o sin guiones", () => {
    expect(cuitsEnTexto(texto)).toContain("33693450239");
    expect(cuitsEnTexto("30712345678 y 33693450239")).toEqual(["33693450239"]); // el primero no es válido
  });

  it("corrige un CUIT al que el modelo le comió un dígito", () => {
    const leida = { ...base, emisor: { ...base.emisor, idFiscal: "3369345239" } };
    const { factura, avisos } = corregirCuitsConTexto(leida, texto);
    expect(factura.emisor.idFiscal).toBe("33693450239");
    expect(avisos[0].campo).toBe("emisor.idFiscal");
    expect(validarFactura(factura).some((a) => a.campo === "emisor.idFiscal")).toBe(false);
  });

  it("no toca un CUIT válido ni corrige sin texto", () => {
    expect(corregirCuitsConTexto(base, texto).avisos).toEqual([]);
    const leida = { ...base, emisor: { ...base.emisor, idFiscal: "3369345239" } };
    expect(corregirCuitsConTexto(leida, null).factura.emisor.idFiscal).toBe("3369345239");
  });

  it("no adivina si el CUIT leído está lejos de todos los del texto", () => {
    const leida = { ...base, emisor: { ...base.emisor, idFiscal: "11111111111" } };
    expect(corregirCuitsConTexto(leida, texto).factura.emisor.idFiscal).toBe("11111111111");
  });
});
