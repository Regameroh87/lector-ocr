// Prueba la conexión con ARCA.
//   npm run arca:test                         → estado de servidores + login WSAA
//   npm run arca:test -- '<url del QR>'       → además constata ese comprobante
import { getArcaConfig } from "../lib/arca/config";
import { obtenerTicket } from "../lib/arca/wsaa";
import { dummy } from "../lib/arca/wscdc";
import { verificarEnArca } from "../lib/arca/verificar";
import { parseQrFiscal } from "../lib/qr";
import type { Factura } from "../lib/schema";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* sin .env.local */
}

async function main() {
  const cfg = getArcaConfig();
  if (!cfg) {
    console.error("Falta configurar ARCA_CERT_PATH, ARCA_KEY_PATH y ARCA_CUIT en .env.local (ver docs/arca-certificado.md)");
    process.exit(1);
  }
  console.log(`Entorno: ${cfg.env} · CUIT: ${cfg.cuit}`);

  console.log("Servidores WSCDC:", await dummy(cfg));

  const ta = await obtenerTicket(cfg, "wscdc");
  console.log(`Login WSAA OK. Token válido hasta ${ta.expira}`);

  const qrArg = process.argv[2];
  if (qrArg) {
    const qr = parseQrFiscal(qrArg);
    if (!qr) throw new Error("La URL no es un QR fiscal válido");
    const factura = { pais: "AR", tipoDocumento: "factura", cae: String(qr.codAut), emisor: { idFiscal: String(qr.cuit) }, receptor: {}, iva: [], items: [], camposDudosos: [] } as unknown as Factura;
    console.log("Constatación:", await verificarEnArca(factura, qr));
  }
}

main().catch((e) => {
  console.error("Error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
