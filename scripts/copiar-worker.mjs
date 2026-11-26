// postinstall: copia el worker de pdf.js a public/ (se sirve como /pdf.worker.min.mjs).
// Crea public/ si no existe: en un clon limpio puede no estar, porque git no guarda carpetas vacías.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });
copyFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs");
