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
