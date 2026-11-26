// Comparativa de modelos contra facturas etiquetadas a mano.
//
// Uso:
//   npm run bench -- --models openai/gpt-6-luna,qwen/qwen3.8-flash
//   npm run bench                     (usa todos los modelos de lib/models.ts)
//
// Preparación: poné en bench/ pares de archivos
//   factura1.jpg  +  factura1.expected.json
// donde el .json tiene los campos correctos (mismo formato que lib/schema.ts; podés
// cargar solo los campos que quieras evaluar). Para PDFs, exportá la página como JPG/PNG.
import { readdir, readFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { extraerFactura } from "../lib/extract";
import { MODELOS } from "../lib/models";
import type { Factura } from "../lib/schema";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* sin .env.local */
}

const DIR = "bench";
const CAMPOS: { nombre: string; get: (f: Partial<Factura>) => unknown }[] = [
  { nombre: "cuitEmisor", get: (f) => f.emisor?.idFiscal?.replace(/\D/g, "") },
  { nombre: "letra", get: (f) => f.letra },
  { nombre: "puntoVenta", get: (f) => f.puntoVenta },
  { nombre: "numero", get: (f) => f.numero },
  { nombre: "fecha", get: (f) => f.fechaEmision },
  { nombre: "neto", get: (f) => f.netoGravado },
  { nombre: "iva", get: (f) => (f.iva?.length ? f.iva.reduce((s, a) => s + a.importe, 0) : undefined) },
  { nombre: "total", get: (f) => f.total },
  { nombre: "cae", get: (f) => f.cae },
];

function igual(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.011;
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--models"));
  const ids = arg ? (arg.includes("=") ? arg.split("=")[1] : process.argv[process.argv.indexOf(arg) + 1]).split(",") : MODELOS.map((m) => m.id);

  const archivos = (await readdir(DIR).catch(() => [])).filter((f) => MIME[extname(f).toLowerCase()]);
  const casos = [];
  for (const a of archivos) {
    const esperado = join(DIR, basename(a, extname(a)) + ".expected.json");
    try {
      casos.push({ archivo: a, esperado: JSON.parse(await readFile(esperado, "utf8")) as Partial<Factura> });
    } catch {
      console.warn(`(salteo ${a}: falta ${esperado})`);
    }
  }
  if (!casos.length) {
    console.error(`No hay casos en ${DIR}/. Mirá el comentario al principio de scripts/bench.ts.`);
    process.exit(1);
  }

  console.log(`\n${casos.length} facturas × ${ids.length} modelos\n`);
  const resumen: Record<string, unknown>[] = [];

  for (const id of ids) {
    let aciertos = 0, evaluados = 0, fallas = 0, ms = 0, costo = 0, costoConocido = true;
    const porCampo: Record<string, [number, number]> = {};
    for (const c of casos) {
      const data = new Uint8Array(await readFile(join(DIR, c.archivo)));
      try {
        const r = await extraerFactura([{ data, mediaType: MIME[extname(c.archivo).toLowerCase()] }], id);
        ms += r.ms;
        if (r.costoUsd === null) costoConocido = false; else costo += r.costoUsd;
        for (const campo of CAMPOS) {
          const esp = campo.get(c.esperado);
          if (esp === undefined) continue;
          const ok = igual(campo.get(r.factura), esp);
          porCampo[campo.nombre] ??= [0, 0];
          porCampo[campo.nombre][1]++;
          evaluados++;
          if (ok) { aciertos++; porCampo[campo.nombre][0]++; }
          else console.log(`  ✗ ${id} · ${c.archivo} · ${campo.nombre}: esperado ${JSON.stringify(esp)}, obtuvo ${JSON.stringify(campo.get(r.factura))}`);
        }
      } catch (e) {
        fallas++;
        console.log(`  ✗ ${id} · ${c.archivo}: ${(e as Error).message.slice(0, 160)}`);
      }
    }
    const fila: Record<string, unknown> = {
      modelo: id,
      "precisión": evaluados ? `${((aciertos / evaluados) * 100).toFixed(1)}%` : "—",
      fallas,
      "seg/factura": casos.length - fallas ? (ms / (casos.length - fallas) / 1000).toFixed(1) : "—",
      "US$/1000": costoConocido && casos.length - fallas ? ((costo / (casos.length - fallas)) * 1000).toFixed(2) : "?",
    };
    for (const [k, [ok, n]] of Object.entries(porCampo)) fila[k] = `${ok}/${n}`;
    resumen.push(fila);
  }

  console.log("");
  console.table(resumen);
}

main();
