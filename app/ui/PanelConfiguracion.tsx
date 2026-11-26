"use client";

import type { EstadoServidorArca } from "@/lib/types";
import type { CampoPersonalizado } from "@/lib/campos";
import EditorCampos from "./EditorCampos";

export default function PanelConfiguracion({ verificarArca, setVerificarArca, extraerAuto, setExtraerAuto, servidor, campos, setCampos }: {
  verificarArca: boolean;
  setVerificarArca: (v: boolean) => void;
  extraerAuto: boolean;
  setExtraerAuto: (v: boolean) => void;
  servidor: EstadoServidorArca | null;
  campos: CampoPersonalizado[];
  setCampos: (c: CampoPersonalizado[]) => void;
}) {
  const bloqueado = servidor?.habilitada === false;
  let estado: { txt: string; cls: string };
  if (!servidor) estado = { txt: "Consultando estado…", cls: "text-zinc-500" };
  else if (bloqueado) estado = { txt: "Desactivada en el servidor (ARCA_ENABLED=false en .env.local).", cls: "text-zinc-600" };
  else if (servidor.error) estado = { txt: servidor.error, cls: "text-red-700" };
  else if (servidor.configurada)
    estado = { txt: `Certificado cargado · entorno de ${servidor.entorno === "produccion" ? "producción" : "homologación (prueba)"}.`, cls: "text-emerald-700" };
  else estado = { txt: "Sin certificado: las facturas quedarán como “Pendiente”. Ver docs/arca-certificado.md.", cls: "text-amber-800" };

  return (
    <section aria-label="Configuración" className="border-b border-zinc-200 bg-white px-4 py-4 sm:px-6">
      <div className="mx-auto max-w-3xl divide-y divide-zinc-100">
        <Opcion
          id="extraer-auto"
          titulo="Extraer automáticamente al subir"
          descripcion="Si está apagado, primero ves la vista previa y elegís el modelo antes de extraer. Si está encendido, se extrae apenas subís cada archivo con el modelo elegido arriba."
          activo={extraerAuto}
          onCambiar={setExtraerAuto}
        />
        <Opcion
          id="arca"
          titulo="Verificar en ARCA automáticamente"
          descripcion="Consulta cada factura electrónica argentina en el servicio de Constatación de Comprobantes. Si está apagado, podés verificar una puntual desde su detalle."
          activo={verificarArca && !bloqueado}
          onCambiar={setVerificarArca}
          bloqueado={bloqueado}
          nota={estado}
        />
        <EditorCampos campos={campos} onCambiar={setCampos} />
        <p className="pt-3 text-xs text-zinc-500">Se aplica a lo que proceses a partir de ahora y se guarda en este navegador.</p>
      </div>
    </section>
  );
}

function Opcion({ id, titulo, descripcion, activo, onCambiar, bloqueado, nota }: {
  id: string;
  titulo: string;
  descripcion: string;
  activo: boolean;
  onCambiar: (v: boolean) => void;
  bloqueado?: boolean;
  nota?: { txt: string; cls: string };
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-3 first:pt-0">
      <div className="text-sm">
        <p id={`${id}-label`} className="font-medium text-zinc-900">{titulo}</p>
        <p className="mt-0.5 text-zinc-600">{descripcion}</p>
        {nota && <p className={`mt-1.5 text-xs ${nota.cls}`}>{nota.txt}</p>}
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
