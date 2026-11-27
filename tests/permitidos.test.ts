import { describe, expect, it } from "vitest";
import { emailPermitido, leerAdmins, leerPermitidos, resolverAcceso } from "../lib/auth/permitidos";

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

describe("resolverAcceso", () => {
  const admins = leerAdmins({ APP_ADMINS: "Jefe@estudio.com" });
  const lista = leerPermitidos({ APP_EMAILS_PERMITIDOS: "@estudio.com" });
  const vacia = leerPermitidos({ NODE_ENV: "production" });
  const d = (emails: string[], guardado: "habilitado" | "bloqueado" | null = null, invitado = false) => ({ emails, guardado, invitado });

  it("el admin siempre entra, aunque esté marcado como bloqueado", () => {
    expect(resolverAcceso(d(["jefe@estudio.com"], "bloqueado"), vacia, admins)).toEqual({ permitido: true, origen: "admin" });
  });
  it("bloqueado gana sobre la lista del .env", () => {
    expect(resolverAcceso(d(["ana@estudio.com"], "bloqueado"), lista, admins).permitido).toBe(false);
  });
  it("habilitado desde el panel entra aunque no esté en la lista", () => {
    expect(resolverAcceso(d(["x@gmail.com"], "habilitado"), vacia, admins)).toEqual({ permitido: true, origen: "habilitado" });
  });
  it("por lista, por invitación o sin acceso", () => {
    expect(resolverAcceso(d(["ana@estudio.com"]), lista, admins).origen).toBe("lista");
    expect(resolverAcceso(d(["x@gmail.com"], null, true), vacia, admins).origen).toBe("invitado");
    expect(resolverAcceso(d(["x@gmail.com"]), vacia, admins)).toEqual({ permitido: false, origen: "sin_acceso" });
  });
});
