"use client";

// Piezas de formulario compartidas por Configuración y Plantillas.

export function Seccion({ id, titulo, descripcion, children }: { id: string; titulo: string; descripcion: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-20">
      <h2 id={`${id}-titulo`} className="text-[15px] font-semibold tracking-tight text-zinc-900">
        {titulo}
      </h2>
      <p className="mt-1 max-w-[65ch] text-sm text-zinc-600">{descripcion}</p>
      <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-zinc-200 sm:p-5">{children}</div>
    </section>
  );
}

export function Opcion({ id, titulo, descripcion, activo, onCambiar, bloqueado, nota }: {
  id: string;
  titulo: string;
  descripcion: string;
  activo: boolean;
  onCambiar: (v: boolean) => void;
  bloqueado?: boolean;
  nota?: { txt: string; cls: string };
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="text-sm">
        <p id={`${id}-label`} className="font-medium text-zinc-900">
          {titulo}
        </p>
        <p className="mt-0.5 max-w-[60ch] text-zinc-600">{descripcion}</p>
        {nota && <p className={`mt-2 text-xs ${nota.cls}`}>{nota.txt}</p>}
      </div>
      <button
        role="switch"
        aria-checked={activo}
        aria-labelledby={`${id}-label`}
        disabled={bloqueado}
        onClick={() => onCambiar(!activo)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 ${activo ? "bg-emerald-600" : "bg-zinc-300"}`}
      >
        <span className={`inline-block size-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform duration-200 ${activo ? "translate-x-5.5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}
