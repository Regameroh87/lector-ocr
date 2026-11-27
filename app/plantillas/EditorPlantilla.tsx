"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Plus, Trash2, X } from "lucide-react";
import { claveDe, type CampoPersonalizado } from "@/lib/campos";
import type { ConfigColumnas } from "@/lib/export";
import { TIPOS_DOCUMENTO, type PlantillaCliente } from "@/lib/plantillas";
import { cuitValido } from "@/lib/validate";
import EditorCampos from "../ui/EditorCampos";
import EditorColumnas from "../ui/EditorColumnas";
import EncabezadoPagina from "../ui/EncabezadoPagina";
import { Opcion, Seccion } from "../ui/Formulario";
import { borrarPlantilla, guardarPlantilla } from "./acciones";

const input =
  "h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:border-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10 disabled:bg-zinc-50 disabled:text-zinc-600";
const etiqueta = "mb-1 block text-[13px] font-medium text-zinc-800";

const VACIA: Omit<PlantillaCliente, "id" | "actualizadaEn"> = {
  nombre: "",
  tipoDocumento: "factura",
  descripcion: "",
  fiscal: true,
  campos: [],
  columnas: null,
  cuitsEmisor: [],
  compartida: true,
  editable: true,
};

const formatoCuit = (c: string) => (c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);

export default function EditorPlantilla({ inicial }: { inicial: PlantillaCliente | null }) {
  const router = useRouter();
  const base = inicial ?? VACIA;
  const [nombre, setNombre] = useState(base.nombre);
  const [tipo, setTipo] = useState(base.tipoDocumento);
  const [descripcion, setDescripcion] = useState(base.descripcion);
  const [fiscal, setFiscal] = useState(base.fiscal);
  const [campos, setCampos] = useState<CampoPersonalizado[]>(base.campos);
  const [columnas, setColumnas] = useState<ConfigColumnas | null>(base.columnas);
  const [cuits, setCuits] = useState<string[]>(base.cuitsEmisor);
  const [cuitNuevo, setCuitNuevo] = useState("");
  const [compartida, setCompartida] = useState(base.compartida);
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciarGuardado] = useTransition();
  const [borrando, iniciarBorrado] = useTransition();
  const soloLectura = !base.editable;

  const digitos = cuitNuevo.replace(/\D/g, "");
  const errorCuit = digitos.length === 11 && !cuitValido(digitos) ? "Ese CUIT no es válido (revisá el dígito verificador)." : null;
  const agregarCuit = () => {
    if (digitos.length !== 11 || errorCuit) return;
    if (!cuits.includes(digitos)) setCuits([...cuits, digitos]);
    setCuitNuevo("");
  };

  const guardar = () => {
    setError(null);
    if (!nombre.trim()) {
      setError("Poné un nombre a la plantilla.");
      document.getElementById("plantilla-nombre")?.focus();
      return;
    }
    iniciarGuardado(async () => {
      const r = await guardarPlantilla({
        id: inicial?.id,
        nombre,
        tipoDocumento: tipo,
        descripcion,
        fiscal,
        campos: campos.filter((c) => c.nombre.trim()).map(({ nombre, descripcion, tipo }) => ({ nombre, descripcion, tipo })),
        columnas,
        cuitsEmisor: cuits,
        compartida,
      });
      if (r.ok) router.push("/plantillas");
      else setError(r.error);
    });
  };

  const borrar = () => {
    if (!inicial || !window.confirm(`¿Borrar la plantilla «${inicial.nombre}»? No se puede deshacer.`)) return;
    iniciarBorrado(async () => {
      const r = await borrarPlantilla(inicial.id);
      if (r.ok) router.push("/plantillas");
      else setError(r.error ?? "No se pudo borrar");
    });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[#fbfbfa]">
      <EncabezadoPagina
        titulo={inicial ? inicial.nombre : "Nueva plantilla"}
        volverA="/plantillas"
        acciones={
          !soloLectura && (
            <button
              type="button"
              onClick={guardar}
              disabled={guardando || borrando}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-[13px] font-medium text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-60"
            >
              {guardando && <Loader2 className="size-3.5 animate-spin" />}
              Guardar
            </button>
          )
        }
      />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:py-10">
        {soloLectura && (
          <p className="mb-6 flex items-start gap-2 rounded-lg bg-zinc-100 p-3 text-sm text-zinc-700">
            <Lock className="mt-0.5 size-4 shrink-0" />
            La armó otra persona: podés usarla, pero solo quien la creó (o un admin) puede cambiarla.
          </p>
        )}
        {error && (
          <p role="alert" className="mb-6 rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-inset ring-red-600/20">
            {error}
          </p>
        )}

        <fieldset disabled={soloLectura} className="min-w-0 space-y-10">
          <Seccion id="datos" titulo="Qué documento es" descripcion="El nombre es el que vas a ver al elegirla. La descripción se le pasa al modelo: contale qué tiene de particular este documento.">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
              <div>
                <label htmlFor="plantilla-nombre" className={etiqueta}>Nombre</label>
                <input
                  id="plantilla-nombre"
                  value={nombre}
                  maxLength={80}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej.: Facturas de Distribuidora Norte"
                  className={input}
                  autoFocus={!inicial}
                />
              </div>
              <div>
                <label htmlFor="plantilla-tipo" className={etiqueta}>Tipo de documento</label>
                <select id="plantilla-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className={input}>
                  {TIPOS_DOCUMENTO.map((t) => (
                    <option key={t.v} value={t.v}>{t.txt}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="plantilla-descripcion" className={etiqueta}>
                  Indicaciones para el modelo <span className="font-normal text-zinc-500">(opcional)</span>
                </label>
                <textarea
                  id="plantilla-descripcion"
                  value={descripcion}
                  maxLength={500}
                  rows={3}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Ej.: El número de pedido está arriba a la derecha como «N/Ref.». Los importes vienen sin IVA."
                  className={`${input} h-auto py-2 leading-relaxed`}
                />
              </div>
            </div>
            <div className="mt-5 border-t border-zinc-100 pt-4">
              <Opcion
                id="plantilla-fiscal"
                titulo="Es un comprobante fiscal argentino"
                descripcion="Encendido: se lee el QR, se validan CUIT y CAE y se verifica en ARCA. Apagalo para remitos, presupuestos u otros documentos que no son facturas."
                activo={fiscal}
                onCambiar={setFiscal}
                bloqueado={soloLectura}
              />
            </div>
          </Seccion>

          <Seccion
            id="cuits"
            titulo="Usarla sola para estos proveedores"
            descripcion="Si el QR o el texto del PDF trae alguno de estos CUIT, la plantilla se aplica sin elegirla. Si no cargás ninguno, se usa solo cuando la elegís a mano."
          >
            {cuits.length > 0 && (
              <ul className="mb-3 flex flex-wrap gap-1.5">
                {cuits.map((c) => (
                  <li key={c} className="inline-flex h-7 items-center gap-1 rounded-full bg-zinc-100 pl-2.5 pr-1 font-mono text-xs text-zinc-800">
                    {formatoCuit(c)}
                    <button
                      type="button"
                      onClick={() => setCuits(cuits.filter((x) => x !== c))}
                      aria-label={`Quitar CUIT ${formatoCuit(c)}`}
                      className="inline-flex size-5 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-900"
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <label htmlFor="plantilla-cuit" className="sr-only">CUIT del proveedor</label>
              <input
                id="plantilla-cuit"
                value={cuitNuevo}
                inputMode="numeric"
                maxLength={13}
                onChange={(e) => setCuitNuevo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    agregarCuit();
                  }
                }}
                placeholder="CUIT, ej. 30-71234567-8"
                aria-invalid={!!errorCuit}
                aria-describedby={errorCuit ? "plantilla-cuit-error" : undefined}
                className={`${input} max-w-xs font-mono placeholder:font-sans`}
              />
              <button
                type="button"
                onClick={agregarCuit}
                disabled={digitos.length !== 11 || !!errorCuit}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-zinc-900 disabled:opacity-40"
              >
                <Plus className="size-4" />
                Agregar
              </button>
            </div>
            {errorCuit && <p id="plantilla-cuit-error" className="mt-1.5 text-xs text-red-700">{errorCuit}</p>}
          </Seccion>

          <Seccion
            id="campos"
            titulo="Datos a extraer"
            descripcion="Además de los fijos (CUIT, fecha, importes, CAE…). Escribí el nombre como lo dirías vos; en la descripción podés aclarar dónde está o qué formato tiene."
          >
            <EditorCampos campos={campos} onCambiar={setCampos} />
          </Seccion>

          <Seccion id="columnas" titulo="Columnas del Excel y CSV" descripcion="Qué columnas salen al exportar con esta plantilla y en qué orden.">
            <EditorColumnas
              config={columnas}
              onCambiar={setColumnas}
              extras={campos.filter((c) => c.nombre.trim()).map((c) => ({ clave: claveDe(c.nombre), nombre: c.nombre.trim() }))}
            />
          </Seccion>

          <Seccion id="visibilidad" titulo="Quién la usa" descripcion="Las plantillas compartidas las ven y usan todos los que tienen acceso a la app.">
            <Opcion
              id="plantilla-compartida"
              titulo="Compartida con todos"
              descripcion="Apagado: solo la ves vos."
              activo={compartida}
              onCambiar={setCompartida}
              bloqueado={soloLectura}
            />
          </Seccion>
        </fieldset>

        {!soloLectura && (
          <div className="mt-10 flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-6">
            <button
              type="button"
              onClick={guardar}
              disabled={guardando || borrando}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-60"
            >
              {guardando && <Loader2 className="size-4 animate-spin" />}
              {inicial ? "Guardar cambios" : "Crear plantilla"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/plantillas")}
              className="inline-flex h-9 items-center rounded-md px-3 text-sm text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-zinc-900"
            >
              Cancelar
            </button>
            {inicial && (
              <button
                type="button"
                onClick={borrar}
                disabled={guardando || borrando}
                className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-700 disabled:opacity-60"
              >
                {borrando ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Borrar plantilla
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
