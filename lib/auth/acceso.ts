import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { esAdmin, leerAdmins, leerPermitidos, resolverAcceso, type AccesoGuardado, type OrigenAcceso } from "./permitidos";

// Cache corta por usuario para no consultar la API de Clerk en cada request.
// Los cambios hechos desde /admin la invalidan al instante; en otros servidores tardan hasta CACHE_MS.
const CACHE_MS = 60 * 1000;
const cache = new Map<string, { valor: Acceso; hasta: number }>();

export interface Acceso {
  permitido: boolean;
  origen: OrigenAcceso;
  admin: boolean;
  emails: string[];
}

export function leerGuardado(meta: Record<string, unknown> | undefined): AccesoGuardado {
  const v = meta?.acceso;
  return v === "habilitado" || v === "bloqueado" ? v : null;
}

/** ¿Hay una invitación (pendiente o aceptada) para alguno de estos mails? */
async function tieneInvitacion(emails: string[]): Promise<boolean> {
  const clerk = await clerkClient();
  for (const e of emails) {
    const { data } = await clerk.invitations.getInvitationList({ query: e, limit: 5 });
    if (data.some((i) => i.emailAddress.toLowerCase() === e.toLowerCase() && (i.status === "pending" || i.status === "accepted"))) return true;
  }
  return false;
}

export async function accesoDe(userId: string): Promise<Acceso> {
  const c = cache.get(userId);
  if (c && c.hasta > Date.now()) return c.valor;
  const user = await (await clerkClient()).users.getUser(userId);
  const emails = user.emailAddresses.filter((e) => e.verification?.status === "verified").map((e) => e.emailAddress);
  const guardado = leerGuardado(user.publicMetadata);
  const admins = leerAdmins();
  const lista = leerPermitidos();
  // Solo se consultan invitaciones si nada más le da acceso (evita llamadas de más).
  let r = resolverAcceso({ emails, guardado, invitado: false }, lista, admins);
  if (!r.permitido && r.origen === "sin_acceso" && emails.length) r = resolverAcceso({ emails, guardado, invitado: await tieneInvitacion(emails) }, lista, admins);
  // Primer ingreso de un mail habilitado: se guarda en el usuario, así no depende de que la invitación siga vigente.
  if (r.origen === "invitado") {
    await (await clerkClient()).users.updateUserMetadata(userId, { publicMetadata: { acceso: "habilitado" } }).catch(() => {});
    r = { permitido: true, origen: "habilitado" };
  }
  const valor: Acceso = { ...r, admin: esAdmin(emails, admins), emails };
  cache.set(userId, { valor, hasta: Date.now() + CACHE_MS });
  return valor;
}

export function olvidarAcceso(userId: string) {
  cache.delete(userId);
}

export async function usuarioPermitido(userId: string): Promise<boolean> {
  return (await accesoDe(userId)).permitido;
}

/**
 * Para route handlers: null si la persona inició sesión y tiene acceso;
 * si no, la respuesta de error a devolver. (El proxy ya filtra, esto es una segunda barrera.)
 */
export async function exigirAcceso(): Promise<Response | null> {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sesión vencida: volvé a iniciar sesión" }, { status: 401 });
  if (!(await usuarioPermitido(userId))) return Response.json({ error: "Tu cuenta no tiene acceso a esta app" }, { status: 403 });
  return null;
}

/** Para el panel y sus acciones: el userId si es admin; si no, lanza. */
export async function exigirAdmin(): Promise<string> {
  const { userId } = await auth();
  if (!userId || !(await accesoDe(userId)).admin) throw new Error("Solo los administradores pueden hacer esto");
  return userId;
}
