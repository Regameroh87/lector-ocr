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

function rutaCache(clave: string) {
  return join(tmpdir(), `facturas-ocr-ta-${clave.replace(/:/g, "-")}.json`);
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

/** Dónde se guarda el ticket además de la memoria de la instancia. */
export interface AlmacenTickets {
  leer(clave: string): Promise<TicketAcceso | null>;
  guardar(clave: string, ta: TicketAcceso): Promise<void>;
}

/** Archivo en /tmp: sirve en local y en scripts; en Vercel cada instancia tiene el suyo. */
const almacenDisco: AlmacenTickets = {
  async leer(clave) {
    return JSON.parse(await readFile(rutaCache(clave), "utf8")) as TicketAcceso;
  },
  async guardar(clave, ta) {
    await writeFile(rutaCache(clave), JSON.stringify(ta), { mode: 0o600 });
  },
};

/** Neon si hay base (compartido entre instancias); si no (scripts, sin DATABASE_URL), solo disco. */
async function almacenes(): Promise<AlmacenTickets[]> {
  if (!process.env.DATABASE_URL) return [almacenDisco];
  try {
    const { almacenNeon } = await import("./tickets-db");
    return [almacenNeon, almacenDisco];
  } catch {
    return [almacenDisco]; // fuera de Next (tsx), "server-only" no se puede importar
  }
}

/** Pedidos de ticket en curso en esta instancia: si llegan varias facturas juntas, piden uno solo. */
const enCurso = new Map<string, Promise<TicketAcceso>>();

/** ARCA ya entregó un ticket vigente para este certificado y servicio (lo pidió otra instancia). */
export function esTicketYaEntregado(err: unknown): boolean {
  return /ya posee un TA v[aá]lido/i.test(err instanceof Error ? err.message : String(err));
}

export interface Dependencias {
  almacenes: AlmacenTickets[];
  login: () => Promise<TicketAcceso>;
  esperar?: (ms: number) => Promise<void>;
}

/**
 * Busca un ticket vigente (memoria → almacenes) y, si no hay, lo pide a ARCA una sola vez.
 * Si ARCA responde que ya entregó uno, es que otra instancia lo está guardando: se espera y se relee.
 */
export async function conseguirTicket(clave: string, dep: Dependencias): Promise<TicketAcceso> {
  const enMemoria = memoria.get(clave);
  if (vigente(enMemoria)) return enMemoria;
  const pendiente = enCurso.get(clave);
  if (pendiente) return pendiente;

  const tarea = (async () => {
    const guardado = await leerDeAlmacenes(clave, dep.almacenes);
    if (guardado) return guardado;
    try {
      const ta = await dep.login();
      memoria.set(clave, ta);
      for (const a of dep.almacenes) await a.guardar(clave, ta).catch((e) => console.warn("[arca] no se pudo guardar el ticket:", (e as Error).message));
      return ta;
    } catch (err) {
      if (!esTicketYaEntregado(err)) throw err;
      const esperar = dep.esperar ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
      for (const ms of [500, 1000, 2000, 4000]) {
        await esperar(ms);
        const otro = await leerDeAlmacenes(clave, dep.almacenes);
        if (otro) return otro;
      }
      throw new Error(
        "ARCA ya entregó un permiso de acceso a otro servidor que no lo compartió (por ejemplo, una prueba local con otra base). Se libera solo cuando vence, en hasta 12 horas.",
      );
    }
  })();
  enCurso.set(clave, tarea);
  try {
    return await tarea;
  } finally {
    enCurso.delete(clave);
  }
}

async function leerDeAlmacenes(clave: string, lista: AlmacenTickets[]): Promise<TicketAcceso | null> {
  for (const a of lista) {
    const ta = await a.leer(clave).catch(() => null);
    if (vigente(ta)) {
      memoria.set(clave, ta);
      return ta;
    }
  }
  return null;
}

export async function obtenerTicket(cfg: ArcaConfig, servicio = "wscdc"): Promise<TicketAcceso> {
  return conseguirTicket(`${cfg.env}:${cfg.cuit}:${servicio}`, { almacenes: await almacenes(), login: () => pedirTicket(cfg, servicio) });
}

/** Canjea un TRA firmado por un ticket nuevo en WSAA. */
async function pedirTicket(cfg: ArcaConfig, servicio: string): Promise<TicketAcceso> {
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
  return ta;
}

/** Solo para tests. */
export function _olvidarTickets() {
  memoria.clear();
  enCurso.clear();
}

export { tag, desescapar };
