// WSCDC: Constatación de Comprobantes de ARCA.
import type { ArcaConfig } from "./config";
import { obtenerTicket, tag, desescapar } from "./wsaa";
import { postXml } from "./http";

const NS = "http://servicios1.afip.gob.ar/wscdc/";

export interface ConsultaConstatacion {
  cbteModo: "CAE" | "CAEA";
  cuitEmisor: string;
  ptoVta: number;
  cbteTipo: number;
  cbteNro: number;
  cbteFch: string; // YYYY-MM-DD
  impTotal: number;
  codAutorizacion: string;
  docTipoReceptor?: number;
  docNroReceptor?: string;
}

export interface ResultadoConstatacion {
  resultado: "A" | "R";
  observaciones: string[];
  errores: string[];
}

function todos(xml: string, nombre: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${nombre}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${nombre}>`, "g");
  return [...xml.matchAll(re)].map((m) => m[1]);
}

function codigoYMensaje(bloque: string): string {
  return `${tag(bloque, "Code") ?? "?"}: ${desescapar(tag(bloque, "Msg") ?? "")}`;
}

async function soap(cfg: ArcaConfig, metodo: string, cuerpo: string): Promise<string> {
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body><${metodo} xmlns="${NS}">${cuerpo}</${metodo}></soap:Body>
</soap:Envelope>`;
  const res = await postXml(cfg.wscdcUrl, envelope, { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${NS}${metodo}"` });
  const xml = res.text;
  if ((res.status < 200 || res.status >= 300) && !xml.includes(`${metodo}Response`)) {
    throw new Error(`WSCDC ${metodo} HTTP ${res.status}: ${tag(xml, "faultstring") ?? xml.slice(0, 300)}`);
  }
  return xml;
}

/** Chequea que los servidores de ARCA respondan (no requiere autenticación). */
export async function dummy(cfg: ArcaConfig) {
  const xml = await soap(cfg, "ComprobanteDummy", "");
  return { app: tag(xml, "AppServer"), db: tag(xml, "DbServer"), auth: tag(xml, "AuthServer") };
}

export async function constatar(cfg: ArcaConfig, c: ConsultaConstatacion): Promise<ResultadoConstatacion> {
  const ta = await obtenerTicket(cfg, "wscdc");
  const doc =
    c.docTipoReceptor !== undefined && c.docNroReceptor
      ? `<DocTipoReceptor>${c.docTipoReceptor}</DocTipoReceptor><DocNroReceptor>${c.docNroReceptor}</DocNroReceptor>`
      : "";
  const cuerpo = `
    <Auth><Token>${ta.token}</Token><Sign>${ta.sign}</Sign><Cuit>${cfg.cuit}</Cuit></Auth>
    <CmpReq>
      <CbteModo>${c.cbteModo}</CbteModo>
      <CuitEmisor>${c.cuitEmisor}</CuitEmisor>
      <PtoVta>${c.ptoVta}</PtoVta>
      <CbteTipo>${c.cbteTipo}</CbteTipo>
      <CbteNro>${c.cbteNro}</CbteNro>
      <CbteFch>${c.cbteFch.replace(/-/g, "")}</CbteFch>
      <ImpTotal>${c.impTotal.toFixed(2)}</ImpTotal>
      <CodAutorizacion>${c.codAutorizacion}</CodAutorizacion>
      ${doc}
    </CmpReq>`;
  const xml = await soap(cfg, "ComprobanteConstatar", cuerpo);
  const resultado = tag(xml, "Resultado");
  const observaciones = todos(xml, "Obs").map(codigoYMensaje);
  const errores = todos(xml, "Err").map(codigoYMensaje);
  if (resultado !== "A" && resultado !== "R") {
    if (errores.length) return { resultado: "R", observaciones, errores };
    throw new Error(`Respuesta inesperada de WSCDC: ${xml.slice(0, 300)}`);
  }
  return { resultado, observaciones, errores };
}
