// Whitelist de acceso: APP_EMAILS_PERMITIDOS="ana@estudio.com, @miempresa.com.ar"
//   - un mail completo habilita a esa persona
//   - "@dominio" habilita a cualquier mail de ese dominio
// Cualquiera puede registrarse en Clerk, pero solo entra a la app quien esté en la lista.

export type ListaPermitidos =
  | { modo: "abierta" } // desarrollo sin lista: entra cualquiera registrado
  | { modo: "vacia" } // producción sin lista: no entra nadie
  | { modo: "lista"; emails: Set<string>; dominios: Set<string> };

export function leerPermitidos(env: Record<string, string | undefined> = process.env): ListaPermitidos {
  const items = (env.APP_EMAILS_PERMITIDOS ?? "")
    .split(/[,;\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (!items.length) return env.NODE_ENV === "production" ? { modo: "vacia" } : { modo: "abierta" };
  const emails = new Set<string>();
  const dominios = new Set<string>();
  for (const it of items) {
    if (it.startsWith("@")) dominios.add(it.slice(1));
    else if (it.includes("@")) emails.add(it);
  }
  return { modo: "lista", emails, dominios };
}

/** ¿Alguno de estos mails (ya verificados) está habilitado? */
export function emailPermitido(emails: string[], lista: ListaPermitidos): boolean {
  if (lista.modo === "abierta") return true;
  if (lista.modo === "vacia") return false;
  return emails.some((e) => {
    const m = e.trim().toLowerCase();
    return lista.emails.has(m) || lista.dominios.has(m.slice(m.lastIndexOf("@") + 1));
  });
}

/** Estado de acceso guardado en Clerk (publicMetadata.acceso), lo cambian los admins desde /admin. */
export type AccesoGuardado = "habilitado" | "bloqueado" | null;

export type OrigenAcceso = "admin" | "habilitado" | "lista" | "invitado" | "bloqueado" | "sin_acceso";

export interface DatosAcceso {
  emails: string[]; // verificados
  guardado: AccesoGuardado;
  invitado: boolean; // tiene una invitación pendiente o aceptada
}

/** Admins: APP_ADMINS="ana@estudio.com,otro@x.com". Siempre tienen acceso y no se pueden bloquear desde el panel. */
export function leerAdmins(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set(
    (env.APP_ADMINS ?? "")
      .split(/[,;\s]+/)
      .map((x) => x.trim().toLowerCase())
      .filter((x) => x.includes("@")),
  );
}

export function esAdmin(emails: string[], admins: Set<string>): boolean {
  return emails.some((e) => admins.has(e.trim().toLowerCase()));
}

/**
 * Orden de prioridad: admin > bloqueado > habilitado en el panel > lista del .env > invitación.
 * Así un admin nunca se queda afuera, y "Quitar acceso" gana aunque el mail esté en la lista del .env.
 */
export function resolverAcceso(d: DatosAcceso, lista: ListaPermitidos, admins: Set<string>): { permitido: boolean; origen: OrigenAcceso } {
  if (esAdmin(d.emails, admins)) return { permitido: true, origen: "admin" };
  if (d.guardado === "bloqueado") return { permitido: false, origen: "bloqueado" };
  if (d.guardado === "habilitado") return { permitido: true, origen: "habilitado" };
  if (lista.modo !== "vacia" && emailPermitido(d.emails, lista)) return { permitido: true, origen: "lista" };
  if (d.invitado) return { permitido: true, origen: "invitado" };
  return { permitido: false, origen: "sin_acceso" };
}
