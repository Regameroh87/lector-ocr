import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { emailPermitido, leerPermitidos } from "./permitidos";

// Cache corta de mails verificados por usuario, para no consultar la API de Clerk en cada request.
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { emails: string[]; hasta: number }>();

/** Mails verificados del usuario (los no verificados no habilitan el acceso). */
export async function emailsVerificados(userId: string): Promise<string[]> {
  const c = cache.get(userId);
  if (c && c.hasta > Date.now()) return c.emails;
  const user = await (await clerkClient()).users.getUser(userId);
  const emails = user.emailAddresses.filter((e) => e.verification?.status === "verified").map((e) => e.emailAddress);
  cache.set(userId, { emails, hasta: Date.now() + CACHE_MS });
  return emails;
}

export async function usuarioPermitido(userId: string): Promise<boolean> {
  const lista = leerPermitidos();
  if (lista.modo !== "lista") return lista.modo === "abierta";
  return emailPermitido(await emailsVerificados(userId), lista);
}

/**
 * Para route handlers: null si la persona inició sesión y está en la whitelist;
 * si no, la respuesta de error a devolver. (El proxy ya filtra, esto es una segunda barrera.)
 */
export async function exigirAcceso(): Promise<Response | null> {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sesión vencida: volvé a iniciar sesión" }, { status: 401 });
  if (!(await usuarioPermitido(userId))) return Response.json({ error: "Tu cuenta no tiene acceso a esta app" }, { status: 403 });
  return null;
}
