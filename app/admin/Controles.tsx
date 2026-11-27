"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Send } from "lucide-react";
import { invitar, type EstadoInvitar } from "./acciones";

const inicial: EstadoInvitar = { ok: null, mensaje: "" };

export function FormInvitar() {
  const [estado, accion, enviando] = useActionState(invitar, inicial);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  return (
    <form ref={form} action={accion} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex-1">
        <label htmlFor="email-invitar" className="sr-only">Mail a habilitar</label>
        <input
          id="email-invitar"
          name="email"
          type="email"
          required
          placeholder="mail@ejemplo.com"
          className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:border-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10"
        />
        {estado.mensaje && (
          <p role="status" className={`mt-1.5 text-xs ${estado.ok ? "text-emerald-700" : "text-red-700"}`}>
            {estado.mensaje}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={enviando}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-60"
      >
        {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        Dar acceso
      </button>
    </form>
  );
}

/** Botón de envío que muestra un spinner mientras corre la acción del formulario. */
export function BotonAccion({ children, peligro }: { children: React.ReactNode; peligro?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-zinc-900 disabled:opacity-50 ${
        peligro ? "text-red-700 hover:bg-red-50" : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"
      }`}
    >
      {pending && <Loader2 className="size-3 animate-spin" />}
      {children}
    </button>
  );
}
