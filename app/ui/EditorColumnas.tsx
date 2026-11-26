"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { aplicarConfig, catalogo, COLUMNAS_BASICAS, type ConfigColumnas, type Grupo } from "@/lib/export";

const GRUPOS: Grupo[] = ["Comprobante", "Emisor y receptor", "Importes", "ARCA y control", "Campos personalizados"];

export function validarConfigColumnas(x: unknown): ConfigColumnas | null {
  if (!x || typeof x !== "object") return null;
  const c = x as Partial<ConfigColumnas>;
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
  return { visibles: lista(c.visibles), conocidas: lista(c.conocidas), hojaItems: c.hojaItems !== false };
}

const boton =
  "inline-flex h-7 items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-zinc-900";
const icono =
  "inline-flex size-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-900 disabled:pointer-events-none disabled:opacity-30";

export default function EditorColumnas({ config, onCambiar, extras }: {
  config: ConfigColumnas | null;
  onCambiar: (c: ConfigColumnas | null) => void;
  /** Campos personalizados configurados (para ofrecerlos como columnas). */
  extras: { clave: string; nombre: string }[];
}) {
  const todas = catalogo(extras);
  const visibles = aplicarConfig(todas, config);
  const ids = new Set(visibles.map((c) => c.id));
  const hojaItems = config?.hojaItems ?? true;

  const guardar = (nuevas: string[], hoja = hojaItems) => onCambiar({ visibles: nuevas, conocidas: todas.map((c) => c.id), hojaItems: hoja });
  const actuales = visibles.map((c) => c.id);
  const mover = (i: number, d: -1 | 1) => {
    const n = [...actuales];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    guardar(n);
  };

  return (
    <div className="py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-zinc-900">Columnas del Excel y CSV</p>
          <p className="mt-0.5 text-zinc-600">Elegí qué columnas salen y en qué orden. Los campos personalizados nuevos se suman al final.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className={boton} onClick={() => guardar(COLUMNAS_BASICAS.filter((id) => todas.some((c) => c.id === id)))}>
            Básicas
          </button>
          <button className={boton} onClick={() => guardar(todas.map((c) => c.id))}>
            Todas
          </button>
          <button className={boton} onClick={() => onCambiar(null)} disabled={!config}>
            Restablecer
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-medium text-zinc-600">
            En el archivo ({visibles.length}){visibles.length === 0 && <span className="text-red-700"> · elegí al menos una</span>}
          </p>
          <ol className="max-h-80 overflow-y-auto rounded-md ring-1 ring-zinc-200">
            {visibles.map((c, i) => (
              <li key={c.id} className="flex items-center gap-1 border-b border-zinc-100 py-0.5 pl-2.5 pr-1 last:border-b-0">
                <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-zinc-400">{i + 1}</span>
                <span className="ml-1.5 min-w-0 flex-1 truncate text-[13px] text-zinc-900" title={c.grupo}>
                  {c.titulo}
                </span>
                <button className={icono} onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir ${c.titulo}`}>
                  <ArrowUp className="size-3.5" />
                </button>
                <button className={icono} onClick={() => mover(i, 1)} disabled={i === visibles.length - 1} aria-label={`Bajar ${c.titulo}`}>
                  <ArrowDown className="size-3.5" />
                </button>
                <button className={icono} onClick={() => guardar(actuales.filter((id) => id !== c.id))} aria-label={`Quitar ${c.titulo}`}>
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-zinc-600">Agregar</p>
          <div className="space-y-2.5">
            {GRUPOS.map((g) => {
              const disponibles = todas.filter((c) => c.grupo === g && !ids.has(c.id));
              if (!disponibles.length) return null;
              return (
                <div key={g}>
                  <p className="text-[11px] uppercase tracking-wide text-zinc-400">{g}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {disponibles.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => guardar([...actuales, c.id])}
                        className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs text-zinc-700 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-900"
                      >
                        <Plus className="size-3" />
                        {c.titulo}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {ids.size === todas.length && <p className="text-xs text-zinc-500">Están todas las columnas.</p>}
          </div>
          <label className="mt-4 flex items-center gap-2 text-[13px] text-zinc-800">
            <input type="checkbox" checked={hojaItems} onChange={(e) => guardar(actuales, e.target.checked)} className="size-4 accent-zinc-900" />
            Incluir hoja “Ítems” en el Excel (detalle de productos)
          </label>
        </div>
      </div>
    </div>
  );
}
