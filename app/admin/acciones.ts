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

/** Habilita un mail: si ya tiene cuenta, le da acceso; si no, le manda una invitación por mail. */
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

    const h = await headers();
    const origen = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
    await clerk.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: { acceso: "habilitado" },
      redirectUrl: `${origen}/sign-up`,
      ignoreExisting: true,
    });
    refresh();
    return { ok: true, mensaje: `Invitación enviada a ${email}. Cuando se registre va a tener acceso.` };
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
