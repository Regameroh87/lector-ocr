import type { Metadata } from "next";
import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";

export const metadata: Metadata = { title: "Iniciar sesión · Facturas OCR" };

export default function Page() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-[#fbfbfa] p-4">
      <p className="text-[15px] font-semibold tracking-tight text-zinc-900">Facturas OCR</p>
      {/* El componente lee la URL: se renderiza en el request, no en el build. */}
      <Suspense fallback={<div className="h-[420px] w-full max-w-[400px] animate-pulse rounded-xl bg-white ring-1 ring-zinc-200" />}>
        <SignIn />
      </Suspense>
    </main>
  );
}
