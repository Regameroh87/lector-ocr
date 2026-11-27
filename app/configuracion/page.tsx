import type { Metadata } from "next";
import EncabezadoPagina from "../ui/EncabezadoPagina";
import Configuracion from "./Configuracion";

export const metadata: Metadata = { title: "Configuración · Lector OCR" };

export default function PaginaConfiguracion() {
  return (
    <div className="flex min-h-dvh flex-col bg-[#fbfbfa]">
      <EncabezadoPagina titulo="Configuración" />
      <Configuracion />
    </div>
  );
}
