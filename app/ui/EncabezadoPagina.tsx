import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Encabezado de las pantallas secundarias (Usuarios, Configuración, Plantillas): volver a la app + título. */
export default function EncabezadoPagina({ titulo, volverA = "/", acciones }: { titulo: string; volverA?: string; acciones?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <Link
          href={volverA}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-zinc-900"
        >
          <ArrowLeft className="size-4" />
          Volver
        </Link>
        <span className="h-5 w-px bg-zinc-200" aria-hidden />
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-zinc-900">{titulo}</h1>
        {acciones}
      </div>
    </header>
  );
}
