import type { Factura } from "../schema";
import type { QrFiscal } from "../qr";
import { codigoTipoAfip } from "../afip-codigos";
import { esArgentina } from "../validate";
import { getArcaConfig } from "./config";
import { constatar, type ConsultaConstatacion } from "./wscdc";

export type EstadoArca =
  | { estado: "valido"; detalle: string[] }
  | { estado: "rechazado"; detalle: string[] }
  | { estado: "no_verificable"; detalle: string[] }
  | { estado: "pendiente"; detalle: string[] }
  | { estado: "error"; detalle: string[] }
  | { estado: "desactivado"; detalle: string[] };

/** ARCA_ENABLED=false apaga la verificación para toda la instalación. */
export function arcaHabilitadaEnServidor(): boolean {
  return process.env.ARCA_ENABLED !== "false";
}

export const ARCA_DESACTIVADA_USUARIO: EstadoArca = {
  estado: "desactivado",
  detalle: ["Verificación automática desactivada en Configuración"],
};

function armarConsulta(f: Factura, qr?: QrFiscal | null): ConsultaConstatacion | string {
  if (qr) {
    return {
      cbteModo: qr.tipoCodAut === "A" ? "CAEA" : "CAE",
      cuitEmisor: String(qr.cuit),
      ptoVta: qr.ptoVta,
      cbteTipo: qr.tipoCmp,
      cbteNro: qr.nroCmp,
      cbteFch: qr.fecha,
      impTotal: qr.importe,
      codAutorizacion: String(qr.codAut),
      docTipoReceptor: qr.tipoDocRec,
      docNroReceptor: qr.nroDocRec !== undefined ? String(qr.nroDocRec) : undefined,
    };
  }
  const tipo = codigoTipoAfip(f);
  const faltan: string[] = [];
  if (!f.emisor.idFiscal) faltan.push("CUIT emisor");
  if (f.puntoVenta === null) faltan.push("punto de venta");
  if (f.numero === null) faltan.push("número");
  if (!f.fechaEmision) faltan.push("fecha");
  if (f.total === null) faltan.push("total");
  if (!f.cae) faltan.push("CAE");
  if (tipo === null) faltan.push("tipo de comprobante");
  if (faltan.length) return `Faltan datos para consultar: ${faltan.join(", ")}`;

  const docRec = f.receptor.idFiscal?.replace(/\D/g, "") ?? "";
  let docTipoReceptor: number | undefined;
  if (docRec.length === 11) docTipoReceptor = 80; // CUIT
  else if (docRec.length >= 7 && docRec.length <= 8) docTipoReceptor = 96; // DNI

  return {
    cbteModo: "CAE",
    cuitEmisor: f.emisor.idFiscal!.replace(/\D/g, ""),
    ptoVta: f.puntoVenta!,
    cbteTipo: tipo!,
    cbteNro: f.numero!,
    cbteFch: f.fechaEmision!,
    impTotal: f.total!,
    codAutorizacion: f.cae!,
    docTipoReceptor,
    docNroReceptor: docTipoReceptor ? docRec : undefined,
  };
}

export async function verificarEnArca(f: Factura, qr?: QrFiscal | null): Promise<EstadoArca> {
  if (!arcaHabilitadaEnServidor()) return { estado: "desactivado", detalle: ["Desactivada en el servidor (ARCA_ENABLED=false)"] };
  if (!esArgentina(f)) return { estado: "no_verificable", detalle: ["Comprobante del exterior"] };
  if (f.tipoDocumento === "ticket" && !qr) return { estado: "no_verificable", detalle: ["Ticket de controlador fiscal (no tiene CAE)"] };
  if (!qr && !f.cae) return { estado: "no_verificable", detalle: ["Sin CAE/CAEA"] };

  const consulta = armarConsulta(f, qr);
  if (typeof consulta === "string") return { estado: "no_verificable", detalle: [consulta] };

  let cfg;
  try {
    cfg = getArcaConfig();
  } catch (err) {
    return { estado: "error", detalle: [`No se pudo leer el certificado: ${err instanceof Error ? err.message : err}`] };
  }
  if (!cfg) return { estado: "pendiente", detalle: ["Sin certificado de ARCA configurado (ver docs/arca-certificado.md)"] };

  try {
    const r = await constatar(cfg, consulta);
    const detalle = [...r.observaciones, ...r.errores];
    if (cfg.env === "homologacion") detalle.unshift("(homologación)");
    return r.resultado === "A" ? { estado: "valido", detalle } : { estado: "rechazado", detalle };
  } catch (err) {
    return { estado: "error", detalle: [err instanceof Error ? err.message : String(err)] };
  }
}
