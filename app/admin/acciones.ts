"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";
import { accesoDe, exigirAdmin, olvidarAcceso } from "@/lib/auth/acceso";

export interface EstadoInvitar {
  ok: boolean | null;
  mensaje: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Habilita un mail: si ya tiene cuenta, le da acceso; si no, lo deja habilitado para cuando se registre (sin mandar mails). */
export async function invitar(_prev: EstadoInvitar, form: FormData): Promise<EstadoInvitar> {
  try {
    await exigirAdmin();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    if (!EMAIL.test(email)) return { ok: false, mensaje: "Escribí un mail válido." };
    const clerk = await clerkClient();

    const { data: existentes } = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });
    if (existentes[0]) {
      await clerk.users.updateUserMetadata(existentes[0].id, { publicMetadata: { acceso: "habilitado" } });
      olvidarAcceso(existentes[0].id);
      refresh();
      return { ok: true, mensaje: `${email} ya tenía cuenta: ahora tiene acceso.` };
    }

    // Sin mail: la invitación queda como "mail habilitado". Cuando esa persona se registre
    // por su cuenta (Google o mail y contraseña) con ese mail, entra directo.
    const h = await headers();
    const origen = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
    const params = {
      emailAddress: email,
      publicMetadata: { acceso: "habilitado" as const },
      redirectUrl: `${origen}/sign-up`,
      ignoreExisting: true,
      notify: false,
    };
    try {
      await clerk.invitations.createInvitation({ ...params, expiresInDays: 365 });
    } catch {
      await clerk.invitations.createInvitation(params); // si el plan no permite 365 días, usa el vencimiento por defecto
    }
    refresh();
    return { ok: true, mensaje: `${email} quedó habilitado. Pedile que se registre en ${origen} con ese mail (puede usar Google).` };
  } catch (e) {
    return { ok: false, mensaje: mensajeDe(e) };
  }
}

/** acceso: "habilitado" | "bloqueado" | "" (vuelve a depender de la lista del .env / invitación). */
export async function cambiarAcceso(form: FormData) {
  const yo = await exigirAdmin();
  const userId = String(form.get("userId") ?? "");
  const acceso = String(form.get("acceso") ?? "");
  if (!userId) throw new Error("Falta el usuario");
  if (acceso === "bloqueado") {
    if (userId === yo) throw new Error("No podés quitarte el acceso a vos mismo");
    if ((await accesoDe(userId)).admin) throw new Error("Los administradores se definen en APP_ADMINS y no se pueden bloquear desde acá");
  }
  await (await clerkClient()).users.updateUserMetadata(userId, {
    publicMetadata: { acceso: acceso === "habilitado" || acceso === "bloqueado" ? acceso : null },
  });
  olvidarAcceso(userId);
  refresh();
}

export async function revocarInvitacion(form: FormData) {
  await exigirAdmin();
  const id = String(form.get("invitacionId") ?? "");
  if (id) await (await clerkClient()).invitations.revokeInvitation(id);
  refresh();
}

function mensajeDe(e: unknown): string {
  const err = e as { errors?: { longMessage?: string; message?: string }[]; message?: string };
  return err.errors?.[0]?.longMessage ?? err.errors?.[0]?.message ?? err.message ?? "No se pudo completar la acción.";
}
