import https from "node:https";

// Algunos servidores de producción de ARCA (p. ej. servicios1.afip.gov.ar) usan
// parámetros Diffie-Hellman cortos que OpenSSL 3 rechaza ("dh key too small").
// Bajamos el nivel de seguridad SOLO para estas llamadas a ARCA; el certificado
// del servidor se sigue validando normalmente.
const agente = new https.Agent({ ciphers: "DEFAULT@SECLEVEL=1", keepAlive: true });

export function postXml(url: string, body: string, headers: Record<string, string>): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: "POST", agent: agente, headers: { ...headers, "Content-Length": Buffer.byteLength(body) }, timeout: 30_000 },
      (res) => {
        const partes: Buffer[] = [];
        res.on("data", (c: Buffer) => partes.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(partes).toString("utf8") }));
      },
    );
    req.on("timeout", () => req.destroy(new Error(`Timeout conectando a ${new URL(url).host}`)));
    req.on("error", reject);
    req.end(body);
  });
}
