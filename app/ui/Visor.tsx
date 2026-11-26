"use client";

import { useState } from "react";
import { ExternalLink, Maximize2, Minus, Plus, FileText, Loader2 } from "lucide-react";
import { nombreFila, type Fila } from "./comun";

const ZOOMS = [1, 1.5, 2, 3];

export default function Visor({ fila }: { fila: Fila }) {
  // El estado se reinicia al cambiar de documento porque el padre usa key={fila.id}.
  const [pagina, setPagina] = useState(0);
  const [zoom, setZoom] = useState(0); // índice en ZOOMS; 0 = ajustar al ancho

  const paginas = fila.paginas ?? [];
  const src = paginas[Math.min(pagina, paginas.length - 1)];

  return (
    <section aria-label="Vista previa del comprobante" className="flex min-h-0 flex-col bg-[#e9e8e3]">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-black/10 bg-[#f1f0ec] px-2">
        <p className="mr-auto truncate px-1 text-xs text-zinc-600" title={nombreFila(fila)}>
          {nombreFila(fila)}
        </p>
        {paginas.length > 0 && (
          <>
            <BotonIcono etiqueta="Alejar" disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))}>
              <Minus className="size-4" />
            </BotonIcono>
            <button
              onClick={() => setZoom(0)}
              className="h-7 min-w-14 rounded px-1.5 text-xs tabular-nums text-zinc-700 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-zinc-900"
              title="Ajustar al ancho"
            >
              {zoom === 0 ? "Ajustado" : `${ZOOMS[zoom] * 100}%`}
            </button>
            <BotonIcono etiqueta="Acercar" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}>
              <Plus className="size-4" />
            </BotonIcono>
            <BotonIcono etiqueta="Ajustar al ancho" disabled={zoom === 0} onClick={() => setZoom(0)}>
              <Maximize2 className="size-3.5" />
            </BotonIcono>
          </>
        )}
        <a
          href={fila.paginasOrigen ? `${fila.original}#page=${fila.paginasOrigen[0] + 1}` : fila.original}
          target="_blank"
          rel="noreferrer"
          className="ml-1 inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs text-zinc-700 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-zinc-900"
        >
          <ExternalLink className="size-3.5" />
          Original
        </a>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto">
        {src ? (
          <div className="flex min-h-full justify-center p-4 sm:p-6" style={{ width: zoom === 0 ? undefined : `${ZOOMS[zoom] * 100}%` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`Página ${pagina + 1} de ${nombreFila(fila)}`}
              onDoubleClick={() => setZoom((z) => (z === 0 ? 2 : 0))}
              className={`h-auto w-full max-w-[900px] self-start bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_24px_-8px_rgba(0,0,0,0.25)] ${zoom === 0 ? "cursor-zoom-in" : "max-w-none cursor-zoom-out"}`}
              draggable={false}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-zinc-500">
            {fila.estado === "error" ? (
              <>
                <FileText className="size-8 text-zinc-400" strokeWidth={1.5} />
                <p>No se pudo generar la vista previa</p>
              </>
            ) : (
              <>
                <Loader2 className="size-6 animate-spin text-zinc-400" />
                <p>Preparando vista previa…</p>
              </>
            )}
          </div>
        )}
      </div>

      {paginas.length > 1 && (
        <nav aria-label="Páginas" className="flex shrink-0 gap-2 overflow-x-auto border-t border-black/10 bg-[#f1f0ec] p-2">
          {paginas.map((p, i) => (
            <button
              key={p}
              onClick={() => setPagina(i)}
              aria-current={i === pagina ? "page" : undefined}
              className={`relative shrink-0 rounded-sm ring-offset-2 ring-offset-[#f1f0ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 ${i === pagina ? "ring-2 ring-zinc-900" : "opacity-70 hover:opacity-100"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p} alt="" className="h-16 w-auto bg-white shadow-sm" />
              <span className="absolute bottom-0.5 right-0.5 rounded bg-zinc-900/80 px-1 text-[10px] tabular-nums text-white">{i + 1}</span>
            </button>
          ))}
        </nav>
      )}
    </section>
  );
}

function BotonIcono({ etiqueta, children, ...props }: { etiqueta: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={etiqueta}
      title={etiqueta}
      className="inline-flex size-7 items-center justify-center rounded text-zinc-700 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-zinc-900 disabled:pointer-events-none disabled:opacity-35"
      {...props}
    >
      {children}
    </button>
  );
}
