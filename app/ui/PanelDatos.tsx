"use client";

import { useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, LayoutTemplate, Play, QrCode, RotateCcw, ShieldCheck, Loader2 } from "lucide-react";
import type { PlantillaCliente } from "@/lib/plantillas";
import type { ModeloConfig } from "@/lib/models";
import SelectorModelo from "./SelectorModelo";
import { Factura } from "@/lib/schema";
import type { CampoPersonalizado } from "@/lib/campos";
import type { Advertencia } from "@/lib/validate";
import { ARCA_BADGE, ESTADO_TXT, TIPO_TXT, fmtNum, nombreModelo, type Fila } from "./comun";

type TipoCampo = "texto" | "numero" | "fecha";
interface DefCampo {
  k: string;
  label: string;
  tipo: TipoCampo;
  ancho?: "completo";
  mono?: boolean;
}

const GRUPOS: { titulo: string; campos: DefCampo[] }[] = [
  {
    titulo: "Comprobante",
    campos: [
      { k: "letra", label: "Letra", tipo: "texto" },
      { k: "codigoTipoAfip", label: "Código AFIP", tipo: "numero", mono: true },
      { k: "puntoVenta", label: "Punto de venta", tipo: "numero", mono: true },
      { k: "numero", label: "Número", tipo: "numero", mono: true },
      { k: "fechaEmision", label: "Fecha de emisión", tipo: "fecha" },
      { k: "moneda", label: "Moneda", tipo: "texto" },
    ],
  },
  {
    titulo: "Emisor",
    campos: [
      { k: "emisor.razonSocial", label: "Razón social", tipo: "texto", ancho: "completo" },
      { k: "emisor.idFiscal", label: "CUIT / ID fiscal", tipo: "texto", mono: true },
      { k: "emisor.condicionIva", label: "Condición IVA", tipo: "texto" },
    ],
  },
  {
    titulo: "Receptor",
    campos: [
      { k: "receptor.razonSocial", label: "Razón social", tipo: "texto", ancho: "completo" },
      { k: "receptor.idFiscal", label: "CUIT / ID fiscal", tipo: "texto", mono: true },
      { k: "receptor.condicionIva", label: "Condición IVA", tipo: "texto" },
    ],
  },
  {
    titulo: "Importes",
    campos: [
      { k: "netoGravado", label: "Neto gravado", tipo: "numero", mono: true },
      { k: "noGravado", label: "No gravado", tipo: "numero", mono: true },
      { k: "exento", label: "Exento", tipo: "numero", mono: true },
      { k: "percepciones", label: "Percepciones", tipo: "numero", mono: true },
      { k: "otrosTributos", label: "Otros tributos", tipo: "numero", mono: true },
    ],
  },
  {
    titulo: "Autorización",
    campos: [
      { k: "cae", label: "CAE / CAEA", tipo: "texto", mono: true },
      { k: "caeVencimiento", label: "Vencimiento CAE", tipo: "fecha" },
    ],
  },
];

function leer(f: Factura, k: string): unknown {
  return k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown> | null)?.[p], f);
}
function escribir(f: Factura, k: string, v: unknown): Factura {
  const [a, b] = k.split(".");
  if (b) return { ...f, [a]: { ...(f as unknown as Record<string, object>)[a], [b]: v } } as Factura;
  return { ...f, [a]: v } as Factura;
}
function parsear(raw: string, tipo: TipoCampo): { ok: true; v: string | number | null } | { ok: false } {
  const t = raw.trim();
  if (t === "") return { ok: true, v: null };
  if (tipo !== "numero") return { ok: true, v: t };
  // Acepta "1.234,56", "1234,56" y "1234.56"
  const norm = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const n = Number(norm);
  return Number.isFinite(n) ? { ok: true, v: n } : { ok: false };
}

/** Selector de plantilla por comprobante. */
export interface ControlPlantilla {
  plantillas: PlantillaCliente[];
  /** id de la plantilla que se va a usar, o null = sin plantilla */
  elegida: string | null;
  onElegir: (id: string | null) => void;
}

export default function PanelDatos({ fila, modelos, modeloElegido, onElegirModelo, onExtraer, arcaDisponible, camposPedidos, plantilla, onEditar, onReverificar }: {
  fila: Fila;
  plantilla: ControlPlantilla;
  modelos: ModeloConfig[];
  modeloElegido: string;
  onElegirModelo: (id: string) => void;
  onExtraer: () => void;
  arcaDisponible: boolean;
  camposPedidos: CampoPersonalizado[];
  onEditar: (f: Factura) => void;
  onReverificar: () => Promise<void>;
}) {
  const res = fila.res;
  const ocupado = fila.estado === "en_cola" || fila.estado === "extrayendo";
  const control = (texto: string, primario: boolean) => (
    <ControlExtraccion
      modelos={modelos}
      valor={modeloElegido}
      onChange={onElegirModelo}
      onExtraer={onExtraer}
      plantilla={plantilla}
      plantillaAuto={!!fila.plantillaAuto}
      texto={texto}
      primario={primario}
      deshabilitado={ocupado || fila.estado === "preparando"}
    />
  );

  // Sin datos todavía
  if (!res) {
    if (fila.estado === "error") {
      return (
        <Contenedor>
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium text-red-800">
              <AlertCircle className="size-4" />
              {fila.pre ? "No se pudieron extraer los datos" : "No se pudo leer el archivo"}
            </p>
            <p className="mt-1 break-words text-red-700">{fila.error}</p>
          </div>
          <div className="px-4">{control(fila.pre ? "Reintentar" : "Volver a leer el archivo", true)}</div>
        </Contenedor>
      );
    }

    if (fila.estado === "esperando") {
      return (
        <Contenedor>
          <div className="space-y-4 p-4">
            <div>
              <h2 className="text-[15px] font-semibold text-zinc-900">Listo para extraer</h2>
              <p className="mt-1 text-sm text-zinc-600">Revisá la vista previa, elegí el modelo y extraé los datos.</p>
            </div>
            {fila.pre?.qr ? (
              <p className="flex items-start gap-2 rounded-md bg-sky-50 p-3 text-xs text-sky-900 ring-1 ring-inset ring-sky-600/20">
                <QrCode className="mt-px size-3.5 shrink-0" />
                Se leyó el QR fiscal: CUIT, número, fecha, total y CAE se van a tomar de ahí y se compararán con lo que lea el modelo.
              </p>
            ) : (
              <p className="text-xs text-zinc-500">No se encontró QR fiscal. Todos los datos los va a leer el modelo.</p>
            )}
            {fila.nota && <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-inset ring-amber-600/20">{fila.nota}</p>}
            {camposPedidos.length > 0 && (
              <p className="text-xs text-zinc-600">
                <span className="font-medium text-zinc-800">Campos a extraer además de los fijos:</span> {camposPedidos.map((c) => c.nombre.trim()).join(", ")}.
              </p>
            )}
            {control("Extraer datos", true)}
          </div>
        </Contenedor>
      );
    }

    return (
      <Contenedor>
        <p className="flex items-center gap-2 px-4 pt-4 text-sm text-zinc-600" aria-live="polite">
          <Loader2 className="size-4 animate-spin" />
          {fila.progreso ?? ESTADO_TXT[fila.estado]}
          {fila.modeloEnCurso && ocupado ? ` con ${nombreModelo(modelos, fila.modeloEnCurso)}` : ""}…
        </p>
        <div className="space-y-6 p-4" aria-hidden>
          {[4, 3, 3].map((n, g) => (
            <div key={g} className="space-y-3">
              <div className="h-3 w-24 rounded bg-zinc-200" />
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: n }).map((_, i) => (
                  <div key={i} className="h-9 animate-pulse rounded-md bg-zinc-100" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Contenedor>
    );
  }

  const f = res.factura;
  const porCampo = (k: string): Advertencia[] => res.advertencias.filter((a) => a.campo === k);
  const extraidos = res.campos ?? [];
  const defsExtras: DefCampo[] = extraidos.map((c) => ({ k: `extras.${c.clave}`, label: c.nombre, tipo: c.tipo, ancho: c.tipo === "texto" ? "completo" : undefined }));
  const camposConInput = new Set(GRUPOS.flatMap((g) => g.campos.map((c) => c.k)).concat("tipoDocumento", "total", ...defsExtras.map((d) => d.k)));
  // ¿La configuración actual pide campos distintos a los de esta extracción?
  const firma = (xs: { nombre: string; descripcion: string; tipo: string }[]) => JSON.stringify(xs.map((c) => [c.nombre.trim(), c.descripcion.trim(), c.tipo]));
  const camposCambiaron = firma(camposPedidos) !== firma(extraidos);
  const ivaTotal = f.iva.reduce((s, a) => s + a.importe, 0);

  const enfocar = (campo: string) => {
    const el = document.getElementById(`campo-${campo}`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.focus({ preventScroll: true });
    }
  };

  return (
    <Contenedor>
      {ocupado && (
        <p className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-200 bg-zinc-900 px-4 py-2 text-xs text-white" aria-live="polite">
          <Loader2 className="size-3.5 animate-spin" />
          {fila.estado === "en_cola" ? "En cola para" : "Extrayendo de nuevo con"} {nombreModelo(modelos, fila.modeloEnCurso)}… los datos de abajo se van a reemplazar.
        </p>
      )}
      {fila.error && !ocupado && (
        <p className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800" role="alert">
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          <span>La última extracción falló ({fila.error}). Se muestran los datos anteriores.</span>
        </p>
      )}
      {fila.nota && <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">{fila.nota}</p>}
      <div className="space-y-4 border-b border-zinc-200 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <EstadoArcaBadge estado={res.arca.estado} />
          {fila.plantillaUsada && (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700" title="Plantilla usada en esta extracción">
              <LayoutTemplate className="size-3" />
              {fila.plantillaUsada.nombre}
            </span>
          )}
          {res.qr && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-inset ring-sky-600/20" title="Los datos principales se tomaron del QR fiscal de la factura">
              <QrCode className="size-3" />
              QR fiscal leído
            </span>
          )}
        </div>
        {res.arca.detalle.length > 0 && <p className="text-xs text-zinc-600">{res.arca.detalle.join(" · ")}</p>}
        {arcaDisponible && <BotonVerificar estado={res.arca.estado} onReverificar={onReverificar} />}

        <Revisar advertencias={res.advertencias} onIr={(c) => camposConInput.has(c) && enfocar(c)} />
      </div>

      <div className="space-y-6 p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600">Tipo de comprobante</span>
          <select
            id="campo-tipoDocumento"
            value={f.tipoDocumento}
            onChange={(e) => onEditar({ ...f, tipoDocumento: e.target.value as Factura["tipoDocumento"] })}
            className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm focus-visible:border-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/15"
          >
            {Factura.shape.tipoDocumento.options.map((t) => (
              <option key={t} value={t}>{TIPO_TXT[t] ?? t}</option>
            ))}
          </select>
        </label>

        {GRUPOS.map((g) => (
          <fieldset key={g.titulo}>
            <legend className="mb-2 text-[13px] font-semibold text-zinc-900">{g.titulo}</legend>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              {g.campos.map((c) => (
                <Campo key={`${fila.id}-${c.k}`} def={c} factura={f} advertencias={porCampo(c.k)} onEditar={onEditar} />
              ))}
            </div>
            {g.titulo === "Importes" && (
              <div className="mt-3 space-y-1.5 rounded-md bg-zinc-50 p-3 text-sm ring-1 ring-inset ring-zinc-200">
                {f.iva.length === 0 ? (
                  <p className="text-xs text-zinc-500">IVA no discriminado</p>
                ) : (
                  f.iva.map((a, i) => (
                    <div key={i} className="flex justify-between text-zinc-700">
                      <span>IVA {String(a.alicuota).replace(".", ",")}%</span>
                      <span className="font-mono tabular-nums">{fmtNum(a.importe)}</span>
                    </div>
                  ))
                )}
                {f.iva.length > 1 && (
                  <div className="flex justify-between border-t border-zinc-200 pt-1.5 text-zinc-700">
                    <span>Total IVA</span>
                    <span className="font-mono tabular-nums">{fmtNum(ivaTotal)}</span>
                  </div>
                )}
                <Campo
                  key={`${fila.id}-total`}
                  def={{ k: "total", label: `Total${f.moneda ? ` (${f.moneda})` : ""}`, tipo: "numero", mono: true, ancho: "completo" }}
                  factura={f}
                  advertencias={porCampo("total")}
                  onEditar={onEditar}
                  destacado
                />
              </div>
            )}
          </fieldset>
        ))}

        {defsExtras.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold text-zinc-900">Campos personalizados</legend>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              {defsExtras.map((c) => (
                <Campo key={`${fila.id}-${c.k}`} def={c} factura={f} advertencias={porCampo(c.k)} onEditar={onEditar} />
              ))}
            </div>
          </fieldset>
        )}

        {f.items.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-[13px] font-semibold text-zinc-900 marker:text-zinc-400">
              Ítems <span className="font-normal text-zinc-500">({f.items.length})</span>
            </summary>
            <table className="mt-2 w-full text-xs">
              <thead className="text-left text-zinc-500">
                <tr>
                  <th className="py-1 pr-2 font-medium">Descripción</th>
                  <th className="py-1 pr-2 text-right font-medium">Cant.</th>
                  <th className="py-1 text-right font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {f.items.map((it, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-2 text-zinc-800">{it.descripcion}</td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{it.cantidad ?? "—"}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{fmtNum(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}

        {f.notas && (
          <p className="rounded-md bg-zinc-50 p-3 text-xs text-zinc-600 ring-1 ring-inset ring-zinc-200">
            <span className="font-medium text-zinc-700">Nota del modelo:</span> {f.notas}
          </p>
        )}

        <div className="space-y-2 border-t border-zinc-200 pt-4">
          <p className="text-[13px] font-semibold text-zinc-900">Volver a extraer</p>
          {camposCambiaron && (
            <p className="rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-600/20">
              Los campos a extraer cambiaron desde esta extracción (otra plantilla o configuración). Volvé a extraer para obtenerlos.
            </p>
          )}
          <p className="text-xs text-zinc-600">Probá otro modelo si algún dato quedó mal. Se reemplazan los datos y las correcciones manuales.</p>
          {control("Volver a extraer", false)}
        </div>

        <p className="text-xs text-zinc-500">
          Extraído con {nombreModelo(modelos, res.uso.modelo)} · {(res.uso.ms / 1000).toFixed(1)} s
          {res.uso.inputTokens !== null && <> · {res.uso.inputTokens.toLocaleString("es-AR")} / {res.uso.outputTokens?.toLocaleString("es-AR")} tokens</>}
          {res.uso.costoUsd !== null && <> · US$ {res.uso.costoUsd.toFixed(5)}</>}
          {res.uso.intentos > 1 && <> · {res.uso.intentos} intentos</>}
          {res.uso.modo === "json" && <span title="El proveedor no aceptó el esquema estricto; se pidió JSON por prompt y se validó igual"> · modo JSON</span>}
        </p>
      </div>
    </Contenedor>
  );
}

function Contenedor({ children }: { children: React.ReactNode }) {
  return (
    <section aria-label="Datos extraídos" className="min-h-0 overflow-y-auto border-zinc-200 bg-white lg:border-l">
      {children}
    </section>
  );
}

export function EstadoArcaBadge({ estado }: { estado: keyof typeof ARCA_BADGE }) {
  const b = ARCA_BADGE[estado];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${b.cls}`}>
      {estado === "valido" && <ShieldCheck className="size-3" />}
      {b.txt}
    </span>
  );
}

function BotonVerificar({ estado, onReverificar }: { estado: string; onReverificar: () => Promise<void> }) {
  const [cargando, setCargando] = useState(false);
  return (
    <button
      disabled={cargando}
      onClick={async () => {
        setCargando(true);
        await onReverificar().finally(() => setCargando(false));
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-zinc-900 disabled:opacity-60"
    >
      {cargando ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
      {cargando ? "Consultando ARCA…" : estado === "desactivado" ? "Verificar en ARCA" : "Volver a verificar en ARCA"}
    </button>
  );
}

function Revisar({ advertencias, onIr }: { advertencias: Advertencia[]; onIr: (campo: string) => void }) {
  if (advertencias.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-800">
        <CheckCircle2 className="size-4" />
        Sin observaciones
      </p>
    );
  }
  const ordenadas = [...advertencias].sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "error" ? -1 : 1));
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold text-zinc-900">
        {advertencias.length === 1 ? "1 cosa para revisar" : `${advertencias.length} cosas para revisar`}
      </p>
      <ul className="space-y-1">
        {ordenadas.map((a, i) => (
          <li key={i}>
            <button
              onClick={() => onIr(a.campo)}
              className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-zinc-900 ${a.nivel === "error" ? "text-red-800" : "text-amber-900"}`}
            >
              {a.nivel === "error" ? <AlertCircle className="mt-px size-3.5 shrink-0" /> : <AlertTriangle className="mt-px size-3.5 shrink-0" />}
              <span>{a.mensaje}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Campo({ def, factura, advertencias, onEditar, destacado }: {
  def: DefCampo;
  factura: Factura;
  advertencias: Advertencia[];
  onEditar: (f: Factura) => void;
  destacado?: boolean;
}) {
  const valor = leer(factura, def.k);
  const texto = valor === null || valor === undefined ? "" : def.tipo === "numero" && typeof valor === "number" && !def.k.match(/puntoVenta|numero|codigoTipoAfip/) ? fmtNum(valor) : String(valor);
  const [invalido, setInvalido] = useState(false);
  const nivel = invalido || advertencias.some((a) => a.nivel === "error") ? "error" : advertencias.length ? "aviso" : null;
  const id = `campo-${def.k}`;

  return (
    <label className={`block ${def.ancho === "completo" || destacado ? "col-span-2" : ""}`}>
      <span className={`mb-1 block text-xs font-medium ${destacado ? "text-zinc-800" : "text-zinc-600"}`}>{def.label}</span>
      <input
        id={id}
        // key en el padre incluye el doc; acá se re-sincroniza si el valor cambia por otra vía (p. ej. QR)
        key={texto}
        defaultValue={texto}
        inputMode={def.tipo === "numero" ? "decimal" : undefined}
        placeholder={def.tipo === "fecha" ? "AAAA-MM-DD" : "—"}
        aria-invalid={nivel === "error" || undefined}
        aria-describedby={advertencias.length ? `${id}-adv` : undefined}
        onChange={() => invalido && setInvalido(false)}
        onBlur={(e) => {
          const p = parsear(e.target.value, def.tipo);
          if (!p.ok) return setInvalido(true);
          if (p.v !== (valor ?? null)) onEditar(escribir(factura, def.k, p.v));
        }}
        className={`w-full rounded-md border bg-white px-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 ${destacado ? "h-10 text-base font-semibold" : "h-9"} ${def.mono ? "font-mono tabular-nums" : ""} ${
          nivel === "error"
            ? "border-red-400 bg-red-50/40 focus-visible:ring-red-500/20"
            : nivel === "aviso"
              ? "border-amber-400 bg-amber-50/40 focus-visible:ring-amber-500/20"
              : "border-zinc-300 focus-visible:border-zinc-900 focus-visible:ring-zinc-900/10"
        }`}
      />
      {(advertencias.length > 0 || invalido) && (
        <span id={`${id}-adv`} className={`mt-1 block text-[11px] leading-snug ${nivel === "error" ? "text-red-700" : "text-amber-800"}`}>
          {invalido ? "Número inválido" : advertencias[0].mensaje}
        </span>
      )}
    </label>
  );
}

function ControlExtraccion({ modelos, valor, onChange, onExtraer, plantilla, plantillaAuto, texto, primario, deshabilitado }: {
  modelos: ModeloConfig[];
  plantilla: ControlPlantilla;
  plantillaAuto: boolean;
  valor: string;
  onChange: (id: string) => void;
  onExtraer: () => void;
  texto: string;
  primario: boolean;
  deshabilitado: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {plantilla.plantillas.length > 0 && (
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-xs font-medium text-zinc-600">
            Plantilla
            {plantillaAuto && <span className="font-normal text-sky-700">elegida por el CUIT</span>}
          </span>
          <select
            value={plantilla.elegida ?? ""}
            onChange={(e) => plantilla.onElegir(e.target.value || null)}
            className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-[13px] text-zinc-900 focus-visible:border-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10"
          >
            <option value="">Sin plantilla (Configuración)</option>
            {plantilla.plantillas.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-600">Modelo</span>
        <SelectorModelo modelos={modelos} valor={valor} onChange={onChange} className="h-9 w-full" />
      </label>
      <button
        onClick={onExtraer}
        disabled={deshabilitado}
        className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50 ${
          primario ? "bg-zinc-900 text-white hover:bg-zinc-700" : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"
        }`}
      >
        {primario ? <Play className="size-3.5" /> : <RotateCcw className="size-3.5" />}
        {texto}
      </button>
    </div>
  );
}
