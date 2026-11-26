"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, Plus, QrCode } from "lucide-react";
import { ESTADO_TXT, TIPO_TXT, fmtNum, nombreFila, numeroComprobante, paginasTxt, resumenAdvertencias, type Fila } from "./comun";

export default function ListaDocumentos({ filas, seleccionada, onSeleccionar, onAgregar }: {
  filas: Fila[];
  seleccionada: string | null;
  onSeleccionar: (id: string) => void;
  onAgregar: (files: FileList) => void;
}) {
  return (
    <nav aria-label="Comprobantes" className="flex min-h-0 flex-col border-zinc-200 bg-[#fbfbfa] lg:border-r">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-zinc-200 px-3">
        <p className="text-xs font-medium text-zinc-600">
          {filas.length} {filas.length === 1 ? "comprobante" : "comprobantes"}
        </p>
        <label className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-medium text-zinc-800 hover:bg-zinc-200/60 focus-within:outline-2 focus-within:outline-zinc-900">
          <Plus className="size-3.5" />
          Agregar
          <input
            type="file"
            multiple
            accept="application/pdf,image/*"
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) onAgregar(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5 max-lg:max-h-72">
        {filas.map((f) => (
          <li key={f.id}>
            <Item fila={f} activa={f.id === seleccionada} onClick={() => onSeleccionar(f.id)} />
          </li>
        ))}
      </ul>
      <p className="hidden shrink-0 border-t border-zinc-200 px-3 py-2 text-[11px] text-zinc-500 lg:block">
        <kbd className="rounded border border-zinc-300 bg-white px-1 font-sans">↑</kbd> <kbd className="rounded border border-zinc-300 bg-white px-1 font-sans">↓</kbd> para moverte entre comprobantes
      </p>
    </nav>
  );
}

function Item({ fila, activa, onClick }: { fila: Fila; activa: boolean; onClick: () => void }) {
  const f = fila.res?.factura;
  const { errores, avisos } = resumenAdvertencias(fila.res);
  const procesando = fila.estado === "en_cola" || fila.estado === "preparando" || fila.estado === "extrayendo";

  return (
    <button
      onClick={onClick}
      aria-current={activa ? "true" : undefined}
      className={`flex w-full gap-2.5 rounded-md p-2 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-900 ${
        activa ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-zinc-300" : "hover:bg-zinc-200/50"
      }`}
    >
      <div className="h-12 w-9 shrink-0 overflow-hidden rounded-sm bg-white ring-1 ring-zinc-200">
        {fila.paginas?.[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fila.paginas[0]} alt="" className="h-full w-full object-cover object-top" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-zinc-900">
          {f?.emisor.razonSocial ?? nombreFila(fila)}
        </p>
        {f ? (
          <>
            <p className="truncate text-xs text-zinc-600">
              {TIPO_TXT[f.tipoDocumento] ?? "Comprobante"} {f.letra && f.letra !== "otro" ? f.letra : ""}{" "}
              <span className="font-mono tabular-nums">{numeroComprobante(f.puntoVenta, f.numero) ?? ""}</span>
            </p>
            {fila.paginasOrigen && <p className="truncate text-[11px] text-zinc-500">{paginasTxt(fila.paginasOrigen)}</p>}
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-medium tabular-nums text-zinc-900">{fmtNum(f.total, f.moneda)}</span>
              <span className="flex items-center gap-1">
                {procesando && <Loader2 className="size-3.5 animate-spin text-zinc-500" aria-label="Extrayendo de nuevo" />}
                {fila.res?.qr && <QrCode className="size-3.5 text-sky-700" aria-label="QR fiscal leído" />}
                {errores > 0 ? (
                  <span className="inline-flex items-center gap-0.5 text-xs text-red-700" title={`${errores} errores`}>
                    <AlertCircle className="size-3.5" />
                    {errores}
                  </span>
                ) : avisos > 0 ? (
                  <span className="inline-flex items-center gap-0.5 text-xs text-amber-700" title={`${avisos} avisos`}>
                    <AlertTriangle className="size-3.5" />
                    {avisos}
                  </span>
                ) : (
                  <CheckCircle2 className="size-3.5 text-emerald-700" aria-label="Sin observaciones" />
                )}
              </span>
            </div>
          </>
        ) : (
          <p className={`mt-0.5 flex items-center gap-1.5 text-xs ${fila.estado === "error" ? "text-red-700" : fila.estado === "esperando" ? "font-medium text-zinc-800" : "text-zinc-500"}`}>
            {fila.estado === "esperando" && <span className="size-1.5 rounded-full bg-zinc-800" aria-hidden />}
            {procesando && <Loader2 className="size-3 animate-spin" />}
            {fila.estado === "error" && <AlertCircle className="size-3" />}
            {fila.progreso ?? ESTADO_TXT[fila.estado]}
          </p>
        )}
      </div>
    </button>
  );
}
