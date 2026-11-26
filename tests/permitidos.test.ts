import { describe, expect, it } from "vitest";
import { emailPermitido, leerPermitidos } from "../lib/auth/permitidos";

describe("whitelist de mails", () => {
  const lista = leerPermitidos({ APP_EMAILS_PERMITIDOS: "Ana@Estudio.com, @miempresa.com.ar; contador@gmail.com" });

  it("habilita mails exactos sin importar mayúsculas", () => {
    expect(emailPermitido(["ana@estudio.com"], lista)).toBe(true);
    expect(emailPermitido(["CONTADOR@gmail.com"], lista)).toBe(true);
  });

  it("habilita todo un dominio con @dominio", () => {
    expect(emailPermitido(["juan@miempresa.com.ar"], lista)).toBe(true);
    expect(emailPermitido(["juan@otra.com.ar"], lista)).toBe(false);
  });

  it("no confunde subdominios ni sufijos", () => {
    expect(emailPermitido(["x@falso-miempresa.com.ar"], lista)).toBe(false);
    expect(emailPermitido(["x@miempresa.com.ar.evil.com"], lista)).toBe(false);
  });

  it("alcanza con que uno de los mails verificados esté habilitado", () => {
    expect(emailPermitido(["otro@gmail.com", "ana@estudio.com"], lista)).toBe(true);
    expect(emailPermitido([], lista)).toBe(false);
  });

  it("sin lista: abierta en desarrollo, cerrada en producción", () => {
    expect(emailPermitido(["x@y.com"], leerPermitidos({ NODE_ENV: "development" }))).toBe(true);
    expect(emailPermitido(["x@y.com"], leerPermitidos({ NODE_ENV: "production" }))).toBe(false);
  });
});
