"use client";

import type { ModeloConfig } from "@/lib/models";

export default function SelectorModelo({ modelos, valor, onChange, className = "", id, ...rest }: {
  modelos: ModeloConfig[];
  valor: string;
  onChange: (id: string) => void;
  className?: string;
  id?: string;
  "aria-label"?: string;
}) {
  return (
    <select
      id={id}
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      title="Precio en US$ por millón de tokens (entrada / salida)"
      aria-label={rest["aria-label"]}
      className={`h-8 rounded-md border border-zinc-300 bg-white px-2 text-[13px] text-zinc-900 focus-visible:border-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10 ${className}`}
    >
      <optgroup label="Pagos">
        {modelos.filter((m) => !m.gratis).map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} · ${m.precio?.input} / ${m.precio?.output}
          </option>
        ))}
      </optgroup>
      <optgroup label="Gratis">
        {modelos.filter((m) => m.gratis).map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </optgroup>
    </select>
  );
}
