import type { Metadata } from "next";
import EditorPlantilla from "../EditorPlantilla";

export const metadata: Metadata = { title: "Nueva plantilla · Lector OCR" };

export default function NuevaPlantilla() {
  return <EditorPlantilla inicial={null} />;
}
