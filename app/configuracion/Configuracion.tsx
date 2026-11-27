"use client";

import { useEffect, useState } from "react";
import { claveDe, type CampoPersonalizado } from "@/lib/campos";
import type { ConfigColumnas } from "@/lib/export";
import type { EstadoServidorArca } from "@/lib/types";
import { usePreferenciaBooleana, usePreferenciaJson } from "@/lib/client/preferencias";
import EditorCampos, { validarCampos } from "../ui/EditorCampos";
import EditorColumnas, { validarConfigColumnas } from "../ui/EditorColumnas";

const SIN_CAMPOS: CampoPersonalizado[] = [];

const SECCIONES = [
  { id: "extraccion", titulo: "Extracción" },
  { id: "arca", titulo: "Verificación en ARCA" },
  { id: "campos", titulo: "Campos personalizados" },
  { id: "columnas", titulo: "Columnas del Excel y CSV" },
] as const;

export default function Configuracion() {
  // Mismas claves que usa la pantalla principal: los cambios se ven al volver.
  const [verificarArca, setVerificarArca] = usePreferenciaBooleana("verificarArca", true);
  const [extraerAuto, setExtraerAuto] = usePreferenciaBooleana("extraerAuto", false);
  const [campos, setCampos] = usePreferenciaJson<CampoPersonalizado[]>("camposPersonalizados", SIN_CAMPOS, validarCampos);
  const [columnas, setColumnas] = usePreferenciaJson<ConfigColumnas | null>("columnasExport", null, validarConfigColumnas);
  const [servidor, setServidor] = useState<EstadoServidorArca | null>(null);
  const [activa, setActiva] = useState<string>(SECCIONES[0].id);

  useEffect(() => {
    fetch("/api/arca")
      .then((r) => r.json())
      .then(setServidor)
      .catch(() => setServidor(null));
  }, []);

  // Resalta en el índice la sección que se está leyendo.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entradas) => {
        // Al final de la página la última sección no llega arriba: marcarla igual.
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
          setActiva(SECCIONES[SECCIONES.length - 1].id);
          return;
        }
        const visible = entradas.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiva(visible.target.id);
      },
      { rootMargin: "-72px 0px -60% 0px" },
    );
    SECCIONES.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  const bloqueada = servidor?.habilitada === false;
  let estadoArca: { txt: string; cls: string };
  if (!servidor) estadoArca = { txt: "Consultando estado…", cls: "text-zinc-500" };
  else if (bloqueada) estadoArca = { txt: "Desactivada en el servidor (ARCA_ENABLED=false).", cls: "text-zinc-600" };
  else if (servidor.error) estadoArca = { txt: servidor.error, cls: "text-red-700" };
  else if (servidor.configurada)
    estadoArca = { txt: `Certificado cargado · entorno de ${servidor.entorno === "produccion" ? "producción" : "homologación (prueba)"}.`, cls: "text-emerald-700" };
  else estadoArca = { txt: "Sin certificado: las facturas quedan como “Pendiente”. Ver docs/arca-certificado.md.", cls: "text-amber-800" };

  return (
    <div className="mx-auto grid w-full max-w-5xl flex-1 gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[180px_minmax(0,1fr)] lg:py-10">
      <nav aria-label="Secciones" className="hidden lg:block">
        <ul className="sticky top-20 space-y-0.5 text-[13px]">
          {SECCIONES.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                onClick={() => setActiva(s.id)}
                aria-current={activa === s.id ? "true" : undefined}
                className={`block rounded-md px-2.5 py-1.5 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-zinc-900 ${
                  activa === s.id ? "bg-zinc-200/70 font-medium text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                {s.titulo}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 space-y-10">
        <Seccion id="extraccion" titulo="Extracción" descripcion="Qué pasa cuando subís un archivo.">
          <Opcion
            id="extraer-auto"
            titulo="Extraer automáticamente al subir"
            descripcion="Apagado: primero ves la vista previa y elegís el modelo. Encendido: se extrae apenas subís cada archivo, con el modelo elegido arriba."
            activo={extraerAuto}
            onCambiar={setExtraerAuto}
          />
        </Seccion>

        <Seccion id="arca" titulo="Verificación en ARCA" descripcion="Consulta cada factura electrónica argentina en el servicio de Constatación de Comprobantes.">
          <Opcion
            id="arca-auto"
            titulo="Verificar automáticamente"
            descripcion="Si está apagado, podés verificar una factura puntual desde su detalle."
            activo={verificarArca && !bloqueada}
            onCambiar={setVerificarArca}
            bloqueado={bloqueada}
            nota={estadoArca}
          />
        </Seccion>

        <Seccion
          id="campos"
          titulo="Campos personalizados"
          descripcion="Datos que querés además de los fijos (CUIT, importes, CAE…). Escribí el nombre como lo dirías vos; la descripción es opcional y sirve para indicar formato o valores posibles."
        >
          <EditorCampos campos={campos} onCambiar={setCampos} />
        </Seccion>

        <Seccion
          id="columnas"
          titulo="Columnas del Excel y CSV"
          descripcion="Qué columnas salen al exportar y en qué orden. Los campos personalizados nuevos se suman al final."
        >
          <EditorColumnas
            config={columnas}
            onCambiar={setColumnas}
            extras={campos.filter((c) => c.nombre.trim()).map((c) => ({ clave: claveDe(c.nombre), nombre: c.nombre.trim() }))}
          />
        </Seccion>

        <p className="text-xs text-zinc-500">Los cambios se guardan solos en este navegador y se aplican a lo que proceses a partir de ahora.</p>
      </div>
    </div>
  );
}

function Seccion({ id, titulo, descripcion, children }: { id: string; titulo: string; descripcion: string; children: React.ReactNode }) {
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
