import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight, Lock, Plus } from "lucide-react";
import EncabezadoPagina from "../ui/EncabezadoPagina";
import { usuarioConAcceso } from "@/lib/auth/acceso";
import { listarPlantillas } from "@/lib/db/plantillas";
import { nombreTipo } from "@/lib/plantillas";

export const metadata: Metadata = { title: "Plantillas · Lector OCR" };

const botonNueva =
  "inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-2.5 text-[13px] font-medium text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";

export default function PaginaPlantillas() {
  return (
    <div className="flex min-h-dvh flex-col bg-[#fbfbfa]">
      <EncabezadoPagina
        titulo="Plantillas"
        acciones={
          <Link href="/plantillas/nueva" className={botonNueva}>
            <Plus className="size-4" />
            Nueva<span className="hidden sm:inline"> plantilla</span>
          </Link>
        }
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:py-10">
        <p className="mb-5 max-w-[65ch] text-sm text-zinc-600">
          Cada plantilla dice qué datos sacar de un tipo de documento y qué columnas exportar. Por ejemplo, «Facturas de Proveedor X» con su
          número de pedido, o «Remitos» con cantidades y destino. Se elige arriba en la pantalla principal; si le cargás el CUIT del proveedor,
          se aplica sola a sus facturas.
        </p>
        <Suspense fallback={<Cargando />}>
          <Lista />
        </Suspense>
      </main>
    </div>
  );
}

async function Lista() {
  const { userId, admin } = await usuarioConAcceso();
  const lista = await listarPlantillas(userId, admin);

  if (!lista.length) {
    return (
      <div className="rounded-xl bg-white px-6 py-12 text-center ring-1 ring-zinc-200">
        <p className="text-[15px] font-semibold text-zinc-900">Todavía no hay plantillas</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-zinc-600">
          Mientras no elijas una, se usan los campos y columnas de Configuración.
        </p>
        <Link href="/plantillas/nueva" className={`${botonNueva} mt-5`}>
          <Plus className="size-4" />
          Crear la primera
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-zinc-100 rounded-xl bg-white ring-1 ring-zinc-200">
      {lista.map((p) => (
        <li key={p.id}>
          <Link
            href={`/plantillas/${p.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-900"
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-[13px] font-medium text-zinc-900">
                {p.nombre}
                {!p.compartida && (
                  <span className="inline-flex items-center gap-1 text-xs font-normal text-zinc-500" title="Solo la ves vos">
                    <Lock className="size-3" />
                    Privada
                  </span>
                )}
              </p>
              <p className="mt-0.5 truncate text-xs text-zinc-500">
                {nombreTipo(p.tipoDocumento)}
                {" · "}
                {p.campos.length ? `${p.campos.length} ${p.campos.length === 1 ? "campo" : "campos"}: ${p.campos.map((c) => c.nombre).join(", ")}` : "sin campos extra"}
              </p>
            </div>
            {p.cuitsEmisor.length > 0 && (
              <span
                className="hidden shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-inset ring-sky-600/20 sm:inline-flex"
                title={p.cuitsEmisor.join(", ")}
              >
                Automática · {p.cuitsEmisor.length} CUIT{p.cuitsEmisor.length > 1 ? "s" : ""}
              </span>
            )}
            <ChevronRight className="size-4 shrink-0 text-zinc-400" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Cargando() {
  return <div className="h-48 animate-pulse rounded-xl bg-white ring-1 ring-zinc-200" aria-label="Cargando plantillas" />;
}
