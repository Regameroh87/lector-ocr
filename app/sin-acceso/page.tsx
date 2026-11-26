import type { Metadata } from "next";
import { SignOutButton } from "@clerk/nextjs";
import { ShieldAlert } from "lucide-react";

export const metadata: Metadata = { title: "Sin acceso · Facturas OCR" };

export default function SinAcceso() {
  return (
    <main className="flex flex-1 items-center justify-center bg-[#fbfbfa] p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_-12px_rgba(0,0,0,0.15)] ring-1 ring-zinc-200 sm:p-8">
        <span className="flex size-10 items-center justify-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-600/20">
          <ShieldAlert className="size-5" />
        </span>
        <h1 className="mt-4 text-[15px] font-semibold text-zinc-900">Tu cuenta todavía no tiene acceso</h1>
        <p className="mt-1.5 text-zinc-600">
          Te registraste bien, pero tu mail no está habilitado para usar la app. Pedile al administrador que lo agregue y después volvé a entrar.
        </p>
        <SignOutButton>
          <button className="mt-6 inline-flex h-9 w-full items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900">
            Salir y entrar con otra cuenta
          </button>
        </SignOutButton>
      </div>
    </main>
  );
}
