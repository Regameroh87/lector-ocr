"use client";

import { Plus, X } from "lucide-react";
import { MAX_CAMPOS, type CampoPersonalizado, type TipoCampoPersonalizado } from "@/lib/campos";

const SUGERENCIAS: Omit<CampoPersonalizado, "id">[] = [
  { nombre: "Condición de venta", descripcion: "Contado, cuenta corriente, etc.", tipo: "texto" },
  { nombre: "Orden de compra", descripcion: "Número de OC o referencia del cliente", tipo: "texto" },
  { nombre: "Fecha de vencimiento de pago", descripcion: "", tipo: "fecha" },
  { nombre: "Período facturado", descripcion: "Desde / hasta, típico en servicios", tipo: "texto" },
  { nombre: "Categoría de gasto", descripcion: "Una de: servicios, insumos, combustible, comida, viajes, alquiler, otros", tipo: "texto" },
  { nombre: "CBU / alias", descripcion: "Datos bancarios para el pago", tipo: "texto" },
];

const TIPOS: { v: TipoCampoPersonalizado; txt: string }[] = [
  { v: "texto", txt: "Texto" },
  { v: "numero", txt: "Número" },
  { v: "fecha", txt: "Fecha" },
];

export function validarCampos(x: unknown): CampoPersonalizado[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter((c): c is CampoPersonalizado => !!c && typeof c === "object" && typeof (c as CampoPersonalizado).id === "string" && typeof (c as CampoPersonalizado).nombre === "string")
    .map((c) => ({ id: c.id, nombre: c.nombre, descripcion: typeof c.descripcion === "string" ? c.descripcion : "", tipo: TIPOS.some((t) => t.v === c.tipo) ? c.tipo : "texto" }));
}

const input =
  "h-8 rounded-md border border-zinc-300 bg-white px-2 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus-visible:border-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10";

export default function EditorCampos({ campos, onCambiar }: { campos: CampoPersonalizado[]; onCambiar: (c: CampoPersonalizado[]) => void }) {
  const lleno = campos.length >= MAX_CAMPOS;
  const agregar = (c: Omit<CampoPersonalizado, "id"> = { nombre: "", descripcion: "", tipo: "texto" }) => {
    if (lleno) return;
    onCambiar([...campos, { ...c, id: crypto.randomUUID() }]);
    if (!c.nombre) requestAnimationFrame(() => [...document.querySelectorAll<HTMLInputElement>("[data-campo-nuevo]")].at(-1)?.focus());
  };
  const cambiar = (id: string, cambio: Partial<CampoPersonalizado>) => onCambiar(campos.map((c) => (c.id === id ? { ...c, ...cambio } : c)));
  const usados = new Set(campos.map((c) => c.nombre.trim().toLowerCase()));
  const sugerencias = SUGERENCIAS.filter((s) => !usados.has(s.nombre.toLowerCase()));

  return (
    <div className="py-3 text-sm">
      <p className="font-medium text-zinc-900">Campos personalizados</p>
      <p className="mt-0.5 text-zinc-600">
        Datos que querés además de los fijos (CUIT, importes, CAE…). Escribí el nombre como lo dirías vos; la descripción es opcional y sirve para
        indicar formato o valores posibles. Aparecen en el detalle y como columnas en el CSV/Excel.
      </p>

      {campos.length > 0 && (
        <ul className="mt-3 space-y-2">
          {campos.map((c) => (
            <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_6.5rem_auto]">
              <input
                data-campo-nuevo
                value={c.nombre}
                maxLength={60}
                onChange={(e) => cambiar(c.id, { nombre: e.target.value })}
                placeholder="Nombre del campo"
                aria-label="Nombre del campo"
                className={input}
              />
              <button
                onClick={() => onCambiar(campos.filter((x) => x.id !== c.id))}
                aria-label={`Quitar ${c.nombre || "campo"}`}
                className="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-zinc-900 sm:order-last"
              >
                <X className="size-4" />
              </button>
              <input
                value={c.descripcion}
                maxLength={300}
                onChange={(e) => cambiar(c.id, { descripcion: e.target.value })}
                placeholder="Descripción o pista (opcional)"
                aria-label={`Descripción de ${c.nombre || "campo"}`}
                className={input}
              />
              <select
                value={c.tipo}
                onChange={(e) => cambiar(c.id, { tipo: e.target.value as TipoCampoPersonalizado })}
                aria-label={`Tipo de ${c.nombre || "campo"}`}
                className={input}
              >
                {TIPOS.map((t) => (
                  <option key={t.v} value={t.v}>{t.txt}</option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => agregar()}
          disabled={lleno}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-zinc-900 disabled:opacity-40"
        >
          <Plus className="size-3.5" />
          Agregar campo
        </button>
        {!lleno &&
          sugerencias.map((s) => (
            <button
              key={s.nombre}
              onClick={() => agregar(s)}
              title={s.descripcion || undefined}
              className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs text-zinc-600 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-900"
            >
              <Plus className="size-3" />
              {s.nombre}
            </button>
          ))}
        {lleno && <span className="text-xs text-zinc-500">Máximo {MAX_CAMPOS} campos.</span>}
      </div>
    </div>
  );
}
