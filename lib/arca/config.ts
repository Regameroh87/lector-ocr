import { readFileSync } from "node:fs";

export interface ArcaConfig {
  cert: string;
  key: string;
  cuit: string;
  env: "homologacion" | "produccion";
  wsaaUrl: string;
  wscdcUrl: string;
}

const URLS = {
  homologacion: {
    wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    wscdc: "https://wswhomo.afip.gov.ar/WSCDC/service.asmx",
  },
  produccion: {
    wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
    wscdc: "https://servicios1.afip.gov.ar/WSCDC/service.asmx",
  },
};

function leerPem(valor?: string, ruta?: string): string | null {
  if (valor && valor.includes("-----BEGIN")) return valor.replace(/\\n/g, "\n");
  if (ruta) return readFileSync(ruta, "utf8");
  return null;
}

/** Devuelve la configuración de ARCA o null si no hay certificado cargado. */
export function getArcaConfig(): ArcaConfig | null {
  const cert = leerPem(process.env.ARCA_CERT, process.env.ARCA_CERT_PATH);
  const key = leerPem(process.env.ARCA_KEY, process.env.ARCA_KEY_PATH);
  const cuit = process.env.ARCA_CUIT?.replace(/\D/g, "");
  if (!cert || !key || !cuit) return null;
  const env = process.env.ARCA_ENV === "produccion" ? "produccion" : "homologacion";
  return {
    cert,
    key,
    cuit,
    env,
    wsaaUrl: process.env.ARCA_WSAA_URL || URLS[env].wsaa,
    wscdcUrl: process.env.ARCA_WSCDC_URL || URLS[env].wscdc,
  };
}
