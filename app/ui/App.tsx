"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, FileText, Play, Settings2, Trash2, Upload } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import type { ModeloConfig } from "@/lib/models";
import type { Factura } from "@/lib/schema";
import type { RespuestaExtraccion, EstadoServidorArca } from "@/lib/types";
import type { EstadoArca } from "@/lib/arca/verificar";
import { validarFactura } from "@/lib/validate";
import { esPdf, leerPdf, preprocesarImagen } from "@/lib/client/preprocess";
import { paginasParaExtraer, separarPdf } from "@/lib/client/separar";
import { rangoPaginas } from "@/lib/segmentar";
import { toCSV, toXLSX, type ConfigColumnas, type FilaExport } from "@/lib/export";
import { usePreferenciaBooleana, usePreferenciaJson } from "@/lib/client/preferencias";
import type { CampoPersonalizado } from "@/lib/campos";
import { validarCampos } from "./EditorCampos";
import { validarConfigColumnas } from "./EditorColumnas";
import { paginasTxt, type Fila } from "./comun";
import ListaDocumentos from "./ListaDocumentos";
import Visor from "./Visor";
import PanelDatos from "./PanelDatos";
import PanelConfiguracion from "./PanelConfiguracion";
import SelectorModelo from "./SelectorModelo";

const CONCURRENCIA = 3;
const SIN_CAMPOS: CampoPersonalizado[] = [];
const ACEPTA = /\.(pdf|jpe?g|png|webp|heic)$/i;

type Pre = NonNullable<Fila["pre"]>;

function descargar(nombre: string, data: BlobPart, tipo: string) {
  const url = URL.createObjectURL(new Blob([data], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App({ modelos, modeloInicial }: { modelos: ModeloConfig[]; modeloInicial: string }) {
  const [modeloGuardado, setModelo] = useState(modeloInicial);
  // Si un modelo sale de lib/models.ts, se ignora la elección vieja y se usa el de por defecto.
  const existe = (id?: string) => !!id && modelos.some((m) => m.id === id);
  const modelo = existe(modeloGuardado) ? modeloGuardado : modeloInicial;
  const modeloDe = (f: Fila) => (existe(f.modelo) ? f.modelo! : modelo);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [verPanel, setVerPanel] = useState(false);
  const [verificarArca, setVerificarArca] = usePreferenciaBooleana("verificarArca", true);
  const [extraerAuto, setExtraerAuto] = usePreferenciaBooleana("extraerAuto", false);
  const [campos, setCampos] = usePreferenciaJson<CampoPersonalizado[]>("camposPersonalizados", SIN_CAMPOS, validarCampos);
  const camposActivos = campos.filter((c) => c.nombre.trim());
  const [columnas, setColumnas] = usePreferenciaJson<ConfigColumnas | null>("columnasExport", null, validarConfigColumnas);
  const [servidorArca, setServidorArca] = useState<EstadoServidorArca | null>(null);
  const router = useRouter();

  const activos = useRef(0);
  const cola = useRef<{ id: string; modelo: string; arca: boolean }[]>([]);
  const preparados = useRef(new Map<string, Pre>());
  // Valores actuales para usar dentro de callbacks asíncronos
  const actuales = useRef({ modelo, extraerAuto, verificarArca, campos: camposActivos });
  useEffect(() => {
    actuales.current = { modelo, extraerAuto, verificarArca, campos: camposActivos };
  });

  useEffect(() => {
    fetch("/api/arca")
      .then((r) => r.json())
      .then(setServidorArca)
      .catch(() => setServidorArca(null));
  }, []);
  const arcaDisponible = servidorArca?.habilitada !== false;
  const cfg = modelos.find((m) => m.id === modelo);

  const actualizar = useCallback((id: string, cambio: Partial<Fila> | ((f: Fila) => Partial<Fila>)) => {
    setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, ...(typeof cambio === "function" ? cambio(f) : cambio) } : f)));
  }, []);

  // --- Extracción (cola con concurrencia limitada) ---
  const extraer = useCallback(
    async (id: string, modeloId: string, arca: boolean) => {
      const pre = preparados.current.get(id);
      if (!pre) return;
      actualizar(id, { estado: "extrayendo", modeloEnCurso: modeloId, error: undefined });
      try {
        const fd = new FormData();
        fd.set("modelo", modeloId);
        if (pre.qr) fd.set("qr", pre.qr);
        if (pre.texto) fd.set("texto", pre.texto);
        fd.set("arca", arca ? "1" : "0");
        const pedidos = actuales.current.campos;
        if (pedidos.length) fd.set("campos", JSON.stringify(pedidos.map(({ nombre, descripcion, tipo }) => ({ nombre, descripcion, tipo }))));
        pre.imagenes.forEach((b, i) => fd.append("imagenes", b, `pagina-${i + 1}.jpg`));
        const r = await fetch("/api/extract", { method: "POST", body: fd });
        if (r.status === 401) router.push("/sign-in"); // la sesión venció
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
        actualizar(id, { estado: "listo", res: json as RespuestaExtraccion, modeloEnCurso: undefined });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        // Si ya había datos, se conservan y se muestra el error aparte.
        actualizar(id, (f) => ({ estado: f.res ? "listo" : "error", error, modeloEnCurso: undefined }));
      }
    },
    [actualizar, router],
  );

  const arrancarTrabajadores = useCallback(() => {
    const trabajador = async () => {
      while (cola.current.length) {
        const item = cola.current.shift()!;
        await extraer(item.id, item.modelo, item.arca);
      }
    };
    while (activos.current < CONCURRENCIA && cola.current.length) {
      activos.current++;
      trabajador().finally(() => {
        activos.current--;
      });
    }
  }, [extraer]);

  /** Encola la extracción. `modeloPorId` permite un modelo distinto por comprobante. */
  const encolarExtraccion = useCallback(
    (items: { id: string; modelo: string }[]) => {
      const arca = actuales.current.verificarArca;
      const nuevos = items.filter((x) => preparados.current.has(x.id) && !cola.current.some((c) => c.id === x.id));
      if (!nuevos.length) return;
      setFilas((fs) =>
        fs.map((f) => {
          const it = nuevos.find((x) => x.id === f.id);
          return it ? { ...f, estado: "en_cola", modeloEnCurso: it.modelo, error: undefined } : f;
        }),
      );
      cola.current.push(...nuevos.map((x) => ({ ...x, arca })));
      arrancarTrabajadores();
    },
    [arrancarTrabajadores],
  );

  // --- Preparación: preview + QR (+ separación de PDFs con varios comprobantes) ---
  const preparar = useCallback(
    async (id: string, archivo: File, original: string) => {
      actualizar(id, { estado: "preparando", error: undefined, progreso: undefined });
      try {
        if (!esPdf(archivo)) {
          const pre = await preprocesarImagen(archivo);
          preparados.current.set(id, { imagenes: pre.imagenes, qr: pre.qr });
          actualizar(id, { estado: "esperando", paginas: pre.paginas, pre: { imagenes: pre.imagenes, qr: pre.qr } });
          if (actuales.current.extraerAuto) encolarExtraccion([{ id, modelo: actuales.current.modelo }]);
          return;
        }

        const paginas = await leerPdf(archivo, (h, t) => {
          if (t > 1) actualizar(id, { progreso: `Leyendo página ${Math.min(h + 1, t)} de ${t}` });
        });
        const sep = await separarPdf(paginas, actuales.current.modelo, (txt) => actualizar(id, { progreso: txt }));
        for (const i of sep.descartadas) URL.revokeObjectURL(paginas[i].url);
        if (!sep.grupos.length) throw new Error("No se encontraron comprobantes en el PDF");

        const varios = sep.grupos.length > 1;
        const nuevas: Fila[] = sep.grupos.map((g, k) => {
          const pags = g.map((i) => paginas[i]);
          const enviar = paginasParaExtraer(pags);
          const notas: string[] = [];
          if (k === 0 && sep.descartadas.length)
            notas.push(`Del PDF se descartaron ${sep.descartadas.length === 1 ? "la página" : "las páginas"} ${rangoPaginas(sep.descartadas)} (copias DUPLICADO/TRIPLICADO o en blanco).`);
          const dudosas = g.filter((i) => sep.dudosas.includes(i));
          if (varios && dudosas.length) notas.push(`No se pudo confirmar que ${dudosas.length === 1 ? "la página" : "las páginas"} ${rangoPaginas(dudosas)} sean de este comprobante.`);
          if (pags.length > enviar.length) notas.push(`El comprobante tiene ${pags.length} páginas; al modelo se envían las primeras ${enviar.length - 2} y las últimas 2.`);
          if (sep.aviso) notas.push(sep.aviso);
          return {
            id: k === 0 ? id : crypto.randomUUID(),
            archivo,
            original,
            estado: "esperando",
            paginas: pags.map((p) => p.url),
            pre: {
              imagenes: enviar.map((p) => p.imagen),
              qr: pags.find((p) => p.qr)?.qr ?? null,
              texto: pags.map((p) => p.texto.trim()).filter(Boolean).join("\n\n") || null,
            },
            paginasOrigen: varios ? g : undefined,
            nota: notas.join(" ") || undefined,
            costoSeparacion: k === 0 && sep.costoUsd ? sep.costoUsd : undefined,
          };
        });
        for (const n of nuevas) preparados.current.set(n.id, n.pre!);
        setFilas((fs) => fs.flatMap((f) => (f.id === id ? nuevas : [f])));
        if (actuales.current.extraerAuto) encolarExtraccion(nuevas.map((n) => ({ id: n.id, modelo: actuales.current.modelo })));
      } catch (e) {
        actualizar(id, { estado: "error", progreso: undefined, error: e instanceof Error ? e.message : String(e) });
      }
    },
    [actualizar, encolarExtraccion],
  );

  const agregar = (files: FileList | File[]) => {
    const nuevas: Fila[] = Array.from(files)
      .filter((f) => f.type === "application/pdf" || f.type.startsWith("image/") || ACEPTA.test(f.name))
      .map((f) => ({ id: crypto.randomUUID(), archivo: f, original: URL.createObjectURL(f), estado: "preparando" }));
    if (!nuevas.length) return;
    setFilas((fs) => [...fs, ...nuevas]);
    setSeleccionada((s) => s ?? nuevas[0].id);
    nuevas.forEach((n) => preparar(n.id, n.archivo, n.original));
  };

  /** Extraer (o volver a extraer) un comprobante con el modelo elegido para él. */
  const extraerUno = (fila: Fila) => {
    if (!preparados.current.has(fila.id)) return preparar(fila.id, fila.archivo, fila.original);
    encolarExtraccion([{ id: fila.id, modelo: modeloDe(fila) }]);
  };

  const pendientes = filas.filter((f) => f.estado === "esperando");
  const extraerPendientes = () => encolarExtraccion(pendientes.map((f) => ({ id: f.id, modelo: modeloDe(f) })));

  const limpiar = () => {
    for (const f of filas) {
      URL.revokeObjectURL(f.original);
      f.paginas?.forEach((p) => URL.revokeObjectURL(p));
    }
    cola.current = [];
    preparados.current.clear();
    setFilas([]);
    setSeleccionada(null);
  };

  const editar = (id: string, f: Factura) => {
    setFilas((fs) =>
      fs.map((x) => (x.id === id && x.res ? { ...x, res: { ...x.res, factura: f, advertencias: validarFactura(f, x.res.qr, "editado") } } : x)),
    );
  };

  const reverificar = async (id: string) => {
    const fila = filas.find((f) => f.id === id);
    if (!fila?.res) return;
    const r = await fetch("/api/arca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factura: fila.res.factura, qr: fila.res.qr }),
    });
    const arca = (await r.json()) as EstadoArca;
    setFilas((fs) => fs.map((x) => (x.id === id && x.res ? { ...x, res: { ...x.res, arca } } : x)));
  };

  // Navegación con teclado entre comprobantes (fuera de campos de texto)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const delta = e.key === "ArrowDown" || e.key === "j" ? 1 : e.key === "ArrowUp" || e.key === "k" ? -1 : 0;
      if (!delta || !filas.length) return;
      e.preventDefault();
      const i = filas.findIndex((f) => f.id === seleccionada);
      const sig = filas[Math.min(filas.length - 1, Math.max(0, i === -1 ? 0 : i + delta))];
      setSeleccionada(sig.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filas, seleccionada]);

  const conDatos = filas.filter((f) => f.res);
  const exportables: FilaExport[] = conDatos.map((f) => ({
    archivo: f.archivo.name,
    paginas: f.paginasOrigen ? paginasTxt(f.paginasOrigen) : null, // "págs. 3-4" (texto, para que Excel no lo tome como fecha)
    modelo: f.res!.uso.modelo,
    factura: f.res!.factura,
    campos: f.res!.campos ?? [],
    advertencias: f.res!.advertencias,
    arca: f.res!.arca,
    costoUsd: f.res!.uso.costoUsd,
  }));
  const costoTotal = filas.reduce((s, f) => s + (f.res?.uso.costoUsd ?? 0) + (f.costoSeparacion ?? 0), 0);
  const enCurso = filas.filter((f) => f.estado === "en_cola" || f.estado === "extrayendo" || f.estado === "preparando").length;
  const conError = filas.filter((f) => f.estado === "error").length;
  const hoy = () => new Date().toISOString().slice(0, 10);
  const actual = filas.find((f) => f.id === seleccionada) ?? null;

  return (
    <div
      className="flex min-h-dvh flex-col lg:h-dvh"
      onDragOver={(e) => {
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastrando(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setArrastrando(false);
        agregar(e.dataTransfer.files);
      }}
    >
      <header className="shrink-0 border-b border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
          <div className="mr-auto flex items-baseline gap-3">
            <h1 className="text-[15px] font-semibold tracking-tight text-zinc-900">Facturas OCR</h1>
            {filas.length > 0 && (
              <p className="hidden text-xs tabular-nums text-zinc-500 sm:block" aria-live="polite">
                {conDatos.length} con datos
                {pendientes.length > 0 && <> · {pendientes.length} sin extraer</>}
                {enCurso > 0 && <> · {enCurso} en curso</>}
                {conError > 0 && <span className="text-red-700"> · {conError} con error</span>}
                {costoTotal > 0 && <> · US$ {costoTotal.toFixed(4)}</>}
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-600">
            <span className="sr-only sm:not-sr-only">Modelo</span>
            <SelectorModelo modelos={modelos} valor={modelo} onChange={setModelo} className="max-w-[240px]" />
          </label>

          <div className="flex items-center gap-1.5">
            {pendientes.length > 0 && (
              <button
                onClick={extraerPendientes}
                className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md bg-zinc-900 px-2.5 text-[13px] font-medium text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
              >
                <Play className="size-3.5" />
                Extraer pendientes ({pendientes.length})
              </button>
            )}
            <button
              onClick={() => setVerPanel((v) => !v)}
              aria-expanded={verPanel}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] focus-visible:outline-2 focus-visible:outline-zinc-900 ${verPanel ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100"}`}
            >
              <Settings2 className="size-4" />
              Configuración
            </button>
            {filas.length > 0 && (
              <>
                <span className="mx-1 h-5 w-px bg-zinc-200" aria-hidden />
                <button
                  disabled={!conDatos.length}
                  onClick={() => descargar(`facturas-${hoy()}.csv`, toCSV(exportables, columnas), "text/csv;charset=utf-8")}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-[13px] text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-zinc-900 disabled:opacity-40"
                >
                  <FileText className="size-4" />
                  CSV
                </button>
                <button
                  disabled={!conDatos.length}
                  onClick={async () => descargar(`facturas-${hoy()}.xlsx`, await toXLSX(exportables, columnas), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
                  className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border border-zinc-300 bg-white px-2.5 text-[13px] text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-zinc-900 disabled:opacity-40"
                >
                  <FileSpreadsheet className="size-4" />
                  Excel
                </button>
                <button
                  onClick={limpiar}
                  aria-label="Quitar todos los comprobantes"
                  title="Quitar todos"
                  className="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-zinc-900"
                >
                  <Trash2 className="size-4" />
                </button>
              </>
            )}
            <span className="mx-1 h-5 w-px bg-zinc-200" aria-hidden />
            <UserButton />
          </div>
        </div>
        {cfg?.gratis && (
          <p className="border-t border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900 sm:px-6">
            Modelo gratis: tiene límites de uso y el proveedor puede retener los datos enviados. Evitalo con facturas de terceros.
          </p>
        )}
      </header>

      {verPanel && (
        <PanelConfiguracion
          verificarArca={verificarArca}
          setVerificarArca={setVerificarArca}
          extraerAuto={extraerAuto}
          setExtraerAuto={setExtraerAuto}
          servidor={servidorArca}
          campos={campos}
          setCampos={setCampos}
          columnas={columnas}
          setColumnas={setColumnas}
        />
      )}

      {filas.length === 0 ? (
        <EstadoVacio arrastrando={arrastrando} onAgregar={agregar} arcaActiva={arcaDisponible && verificarArca} extraerAuto={extraerAuto} />
      ) : (
        <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(340px,400px)]">
          <ListaDocumentos filas={filas} seleccionada={seleccionada} onSeleccionar={setSeleccionada} onAgregar={agregar} />
          {actual ? (
            <>
              <div className="flex min-h-0 flex-col max-lg:h-[75dvh]">
                <Visor key={actual.id} fila={actual} />
              </div>
              <PanelDatos
                key={actual.id}
                fila={actual}
                modelos={modelos}
                modeloElegido={modeloDe(actual)}
                onElegirModelo={(m) => actualizar(actual.id, { modelo: m })}
                onExtraer={() => extraerUno(actual)}
                arcaDisponible={arcaDisponible}
                camposPedidos={camposActivos}
                onEditar={(f) => editar(actual.id, f)}
                onReverificar={() => reverificar(actual.id)}
              />
            </>
          ) : (
            <p className="col-span-2 flex items-center justify-center p-8 text-sm text-zinc-500">Elegí un comprobante de la lista</p>
          )}
        </main>
      )}

      {arrastrando && filas.length > 0 && (
        <div className="pointer-events-none fixed inset-3 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-zinc-900/60 bg-white/85 backdrop-blur-sm">
          <p className="flex items-center gap-2 text-sm font-medium text-zinc-900">
            <Upload className="size-4" />
            Soltá para agregar
          </p>
        </div>
      )}
    </div>
  );
}

function EstadoVacio({ arrastrando, onAgregar, arcaActiva, extraerAuto }: {
  arrastrando: boolean;
  onAgregar: (f: FileList) => void;
  arcaActiva: boolean;
  extraerAuto: boolean;
}) {
  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
      <label
        className={`flex w-full max-w-2xl cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors duration-150 focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-zinc-900 ${
          arrastrando ? "border-zinc-900 bg-white" : "border-zinc-300 bg-white/50 hover:border-zinc-400 hover:bg-white"
        }`}
      >
        <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-zinc-900 text-white">
          <Upload className="size-5" />
        </span>
        <span className="text-base font-semibold text-zinc-900">Arrastrá facturas o elegí archivos</span>
        <span className="mt-1 text-sm text-zinc-600">PDF, JPG o PNG. Podés subir varios a la vez, o un PDF con muchas facturas: se separan solas.</span>
        <span className="mt-6 inline-flex h-9 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white">Elegir archivos</span>
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
        <span className="mt-8 max-w-md text-xs leading-relaxed text-zinc-500">
          {extraerAuto
            ? "Los datos se extraen apenas subís cada archivo, con el modelo elegido arriba."
            : "Primero vas a ver la vista previa; después elegís el modelo y extraés los datos."}{" "}
          Se lee el QR fiscal si lo tiene y se validan CUIT e importes{arcaActiva ? ", y se verifica en ARCA" : ""}. Los archivos no se guardan.
        </span>
      </label>
    </main>
  );
}
