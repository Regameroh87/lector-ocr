import type { Metadata } from "next";
import { Suspense } from "react";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Mail, ShieldAlert } from "lucide-react";
import EncabezadoPagina from "../ui/EncabezadoPagina";
import { accesoDe, leerGuardado } from "@/lib/auth/acceso";
import { leerAdmins, leerPermitidos, resolverAcceso, type OrigenAcceso } from "@/lib/auth/permitidos";
import { BotonAccion, CopiarLink, FormInvitar } from "./Controles";
import { cambiarAcceso, revocarInvitacion } from "./acciones";

export const metadata: Metadata = { title: "Usuarios · Lector OCR" };

export default function Admin() {
  return (
    <div className="flex min-h-dvh flex-col bg-[#fbfbfa]">
      <EncabezadoPagina titulo="Usuarios" />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        <Suspense fallback={<Cargando />}>
          <Panel />
        </Suspense>
      </main>
    </div>
  );
}

const ORIGEN: Record<OrigenAcceso, { txt: string; cls: string; ayuda: string }> = {
  admin: { txt: "Admin", cls: "bg-zinc-900 text-white ring-zinc-900", ayuda: "Definido en APP_ADMINS" },
  habilitado: { txt: "Con acceso", cls: "bg-emerald-50 text-emerald-800 ring-emerald-600/20", ayuda: "Habilitado desde este panel" },
  lista: { txt: "Con acceso", cls: "bg-emerald-50 text-emerald-800 ring-emerald-600/20", ayuda: "Por la lista APP_EMAILS_PERMITIDOS" },
  invitado: { txt: "Con acceso", cls: "bg-emerald-50 text-emerald-800 ring-emerald-600/20", ayuda: "Tiene una invitación" },
  bloqueado: { txt: "Bloqueado", cls: "bg-red-50 text-red-800 ring-red-600/20", ayuda: "Se le quitó el acceso desde este panel" },
  sin_acceso: { txt: "Esperando acceso", cls: "bg-amber-50 text-amber-800 ring-amber-600/20", ayuda: "Se registró pero nadie lo habilitó" },
};

const fecha = (ms: number | null) =>
  ms ? new Date(ms).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

async function Panel() {
  const { userId } = await auth();
  const yo = userId ? await accesoDe(userId) : null;
  if (!yo?.admin) {
    return (
      <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-sm ring-1 ring-zinc-200">
        <p className="flex items-center gap-2 font-medium text-zinc-900">
          <ShieldAlert className="size-4 text-amber-700" />
          Solo para administradores
        </p>
        <p className="mt-1.5 text-zinc-600">Para administrar usuarios, tu mail tiene que estar en la variable APP_ADMINS del servidor.</p>
      </div>
    );
  }

  const clerk = await clerkClient();
  const [{ data: usuarios, totalCount }, { data: invitaciones }] = await Promise.all([
    clerk.users.getUserList({ limit: 200, orderBy: "-created_at" }),
    clerk.invitations.getInvitationList({ status: "pending", limit: 100 }),
  ]);
  const admins = leerAdmins();
  const lista = leerPermitidos();
  const invitados = new Set(invitaciones.map((i) => i.emailAddress.toLowerCase()));

  const filas = usuarios.map((u) => {
    const emails = u.emailAddresses.filter((e) => e.verification?.status === "verified").map((e) => e.emailAddress);
    const principal = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? emails[0] ?? "(sin mail)";
    const guardado = leerGuardado(u.publicMetadata);
    const r = resolverAcceso({ emails, guardado, invitado: emails.some((e) => invitados.has(e.toLowerCase())) }, lista, admins);
    return { u, principal, guardado, ...r, nombre: [u.firstName, u.lastName].filter(Boolean).join(" ") };
  });
  const esperando = filas.filter((f) => f.origen === "sin_acceso");
  const resto = filas.filter((f) => f.origen !== "sin_acceso");

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-4 ring-1 ring-zinc-200 sm:p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Dar acceso a alguien</h2>
        <p className="mb-3 mt-0.5 text-sm text-zinc-600">
          Si ya tiene cuenta, se habilita al instante. Si no, le llega un mail de invitación para registrarse.
        </p>
        <FormInvitar />
      </section>

      {esperando.length > 0 && (
        <Seccion titulo={`Esperando acceso (${esperando.length})`} descripcion="Se registraron pero no están habilitados: no pueden usar la app.">
          {esperando.map((f) => (
            <FilaUsuario key={f.u.id} f={f} yo={userId!} />
          ))}
        </Seccion>
      )}

      <Seccion titulo={`Usuarios (${resto.length}${totalCount > usuarios.length ? ` de ${totalCount}` : ""})`}>
        {resto.length ? (
          resto.map((f) => <FilaUsuario key={f.u.id} f={f} yo={userId!} />)
        ) : (
          <li className="px-4 py-6 text-center text-sm text-zinc-500">Todavía no hay usuarios con acceso.</li>
        )}
      </Seccion>

      {invitaciones.length > 0 && (
        <Seccion titulo={`Invitaciones pendientes (${invitaciones.length})`} descripcion="Todavía no se registraron. Si el mail no les llegó (revisen spam), copiá el link y mandáselo por otro medio.">
          {invitaciones.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
              <Mail className="size-4 shrink-0 text-zinc-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-zinc-900">{i.emailAddress}</p>
                <p className="text-xs text-zinc-500">Enviada el {fecha(i.createdAt)}</p>
              </div>
              {i.url && <CopiarLink url={i.url} />}
              <form action={revocarInvitacion}>
                <input type="hidden" name="invitacionId" value={i.id} />
                <BotonAccion peligro>Cancelar</BotonAccion>
              </form>
            </li>
          ))}
        </Seccion>
      )}

      <p className="text-xs text-zinc-500">
        Los administradores se definen en <code className="rounded bg-zinc-100 px-1">APP_ADMINS</code>. Los mails o dominios de{" "}
        <code className="rounded bg-zinc-100 px-1">APP_EMAILS_PERMITIDOS</code> también tienen acceso, salvo que los bloquees acá.
      </p>
    </div>
  );
}

type Fila = {
  u: { id: string; imageUrl: string; createdAt: number; lastSignInAt: number | null };
  principal: string;
  nombre: string;
  guardado: "habilitado" | "bloqueado" | null;
  permitido: boolean;
  origen: OrigenAcceso;
};

function FilaUsuario({ f, yo }: { f: Fila; yo: string }) {
  const badge = ORIGEN[f.origen];
  const esYo = f.u.id === yo;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={f.u.imageUrl} alt="" className="size-8 shrink-0 rounded-full bg-zinc-100" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-zinc-900">
          {f.nombre || f.principal} {esYo && <span className="font-normal text-zinc-500">(vos)</span>}
        </p>
        <p className="truncate text-xs text-zinc-500">
          {f.nombre ? `${f.principal} · ` : ""}alta {fecha(f.u.createdAt)} · último ingreso {fecha(f.u.lastSignInAt)}
        </p>
      </div>
      <span title={badge.ayuda} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badge.cls}`}>
        {badge.txt}
      </span>
      <div className="flex w-28 justify-end">
        {f.origen === "admin" || esYo ? null : f.permitido ? (
          <form action={cambiarAcceso}>
            <input type="hidden" name="userId" value={f.u.id} />
            <input type="hidden" name="acceso" value="bloqueado" />
            <BotonAccion peligro>Quitar acceso</BotonAccion>
          </form>
        ) : (
          <form action={cambiarAcceso}>
            <input type="hidden" name="userId" value={f.u.id} />
            <input type="hidden" name="acceso" value="habilitado" />
            <BotonAccion>{f.origen === "bloqueado" ? "Devolver acceso" : "Dar acceso"}</BotonAccion>
          </form>
        )}
      </div>
    </li>
  );
}

function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-zinc-900">{titulo}</h2>
      {descripcion && <p className="mt-0.5 text-sm text-zinc-600">{descripcion}</p>}
      <ul className="mt-2 divide-y divide-zinc-100 rounded-xl bg-white ring-1 ring-zinc-200">{children}</ul>
    </section>
  );
}

function Cargando() {
  return (
    <div className="space-y-3" aria-label="Cargando usuarios">
      <div className="h-28 animate-pulse rounded-xl bg-white ring-1 ring-zinc-200" />
      <div className="h-64 animate-pulse rounded-xl bg-white ring-1 ring-zinc-200" />
    </div>
  );
}
