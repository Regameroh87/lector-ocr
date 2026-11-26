// WSAA: autenticación de ARCA. Firma un "Ticket de Requerimiento de Acceso" (TRA)
// con el certificado propio y lo canjea por un token + sign válidos ~12 horas.
import forge from "node-forge";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ArcaConfig } from "./config";
import { postXml } from "./http";

export interface TicketAcceso {
  token: string;
  sign: string;
  expira: string; // ISO
}

const memoria = new Map<string, TicketAcceso>();

function rutaCache(cfg: ArcaConfig, servicio: string) {
  return join(tmpdir(), `facturas-ocr-ta-${cfg.env}-${cfg.cuit}-${servicio}.json`);
}

function vigente(ta?: TicketAcceso | null): ta is TicketAcceso {
  return !!ta && new Date(ta.expira).getTime() - Date.now() > 5 * 60_000;
}

function armarTra(servicio: string): string {
  const ahora = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(ahora / 1000)}</uniqueId>
    <generationTime>${iso(ahora - 10 * 60_000)}</generationTime>
    <expirationTime>${iso(ahora + 10 * 60_000)}</expirationTime>
  </header>
  <service>${servicio}</service>
</loginTicketRequest>`;
}

function firmarCms(tra: string, certPem: string, keyPem: string): string {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  const cert = forge.pki.certificateFromPem(certPem);
  p7.addCertificate(cert);
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(keyPem),
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign();
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
}

function desescapar(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function tag(xml: string, nombre: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${nombre}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${nombre}>`));
  return m ? m[1].trim() : null;
}

export async function obtenerTicket(cfg: ArcaConfig, servicio = "wscdc"): Promise<TicketAcceso> {
  const clave = `${cfg.env}:${cfg.cuit}:${servicio}`;
  const enMemoria = memoria.get(clave);
  if (vigente(enMemoria)) return enMemoria;

  try {
    const enDisco = JSON.parse(await readFile(rutaCache(cfg, servicio), "utf8")) as TicketAcceso;
    if (vigente(enDisco)) {
      memoria.set(clave, enDisco);
      return enDisco;
    }
  } catch {
    // sin cache
  }

  const cms = firmarCms(armarTra(servicio), cfg.cert, cfg.key);
  const envelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body>
</soapenv:Envelope>`;

  const res = await postXml(cfg.wsaaUrl, envelope, { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' });
  const xml = res.text;
  const ret = tag(xml, "loginCmsReturn");
  if (!ret) {
    const falla = tag(xml, "faultstring") ?? xml.slice(0, 300);
    throw new Error(`WSAA rechazó el login: ${desescapar(falla)}`);
  }
  const ticketXml = desescapar(ret);
  const ta: TicketAcceso = {
    token: tag(ticketXml, "token") ?? "",
    sign: tag(ticketXml, "sign") ?? "",
    expira: tag(ticketXml, "expirationTime") ?? new Date(Date.now() + 11 * 3600_000).toISOString(),
  };
  if (!ta.token || !ta.sign) throw new Error("WSAA devolvió un ticket sin token/sign");

  memoria.set(clave, ta);
  await writeFile(rutaCache(cfg, servicio), JSON.stringify(ta), { mode: 0o600 }).catch(() => {});
  return ta;
}

export { tag, desescapar };
