import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { usuarioConAcceso } from "@/lib/auth/acceso";
import { obtenerPlantilla } from "@/lib/db/plantillas";
import EncabezadoPagina from "../../ui/EncabezadoPagina";
import EditorPlantilla from "../EditorPlantilla";

export const metadata: Metadata = { title: "Plantilla · Lector OCR" };

export default function PaginaPlantilla({ params }: PageProps<"/plantillas/[id]">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, admin } = await usuarioConAcceso();
  const plantilla = z.uuid().safeParse(id).success ? await obtenerPlantilla(id, userId, admin) : null;
  if (!plantilla) {
    return (
      <div className="flex min-h-dvh flex-col bg-[#fbfbfa]">
        <EncabezadoPagina titulo="Plantilla" volverA="/plantillas" />
        <main className="mx-auto w-full max-w-3xl px-4 py-10 text-sm text-zinc-600 sm:px-6">
          <p className="font-medium text-zinc-900">No encontramos esa plantilla.</p>
          <p className="mt-1">Puede que la hayan borrado o que sea privada de otra persona.</p>
          <Link href="/plantillas" className="mt-4 inline-block text-zinc-900 underline underline-offset-2">Ver todas las plantillas</Link>
        </main>
      </div>
    );
  }
  return <EditorPlantilla key={plantilla.id + plantilla.actualizadaEn} inicial={plantilla} />;
}

function Cargando() {
  return (
    <div className="flex min-h-dvh flex-col bg-[#fbfbfa]">
      <EncabezadoPagina titulo="Plantilla" volverA="/plantillas" />
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10 sm:px-6" aria-label="Cargando plantilla">
        <div className="h-48 animate-pulse rounded-xl bg-white ring-1 ring-zinc-200" />
        <div className="h-32 animate-pulse rounded-xl bg-white ring-1 ring-zinc-200" />
      </div>
    </div>
  );
}
