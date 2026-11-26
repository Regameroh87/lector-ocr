import type { Factura } from "./schema";
import type { EstadoArca } from "./arca/verificar";
import type { Advertencia } from "./validate";
import type { CampoExtraido } from "./campos";

export interface FilaExport {
  archivo: string;
  /** Páginas del PDF original si el archivo tenía varios comprobantes ("3-4"). */
  paginas?: string | null;
  modelo: string;
  factura: Factura;
  campos: CampoExtraido[];
  advertencias: Advertencia[];
  arca: EstadoArca | null;
  costoUsd: number | null;
}

const ESTADO_ARCA: Record<EstadoArca["estado"], string> = {
  valido: "Válido",
  rechazado: "Rechazado",
  no_verificable: "No verificable",
  pendiente: "Pendiente",
  error: "Error",
  desactivado: "Desactivada",
};

function iva(f: Factura, alic: number) {
  const x = f.iva.filter((a) => a.alicuota === alic).reduce((s, a) => s + a.importe, 0);
  return f.iva.some((a) => a.alicuota === alic) ? x : null;
}

type Columna = { titulo: string; valor: (r: FilaExport) => string | number | null };

export const COLUMNAS: Columna[] = [
  { titulo: "Archivo", valor: (r) => r.archivo },
  { titulo: "Páginas", valor: (r) => r.paginas ?? null },
  { titulo: "Tipo", valor: (r) => r.factura.tipoDocumento },
  { titulo: "Letra", valor: (r) => r.factura.letra },
  { titulo: "Cód. AFIP", valor: (r) => r.factura.codigoTipoAfip },
  { titulo: "Punto de venta", valor: (r) => r.factura.puntoVenta },
  { titulo: "Número", valor: (r) => r.factura.numero },
  { titulo: "Fecha", valor: (r) => r.factura.fechaEmision },
  { titulo: "País", valor: (r) => r.factura.pais },
  { titulo: "Moneda", valor: (r) => r.factura.moneda },
  { titulo: "Cotización", valor: (r) => r.factura.cotizacion },
  { titulo: "Emisor", valor: (r) => r.factura.emisor.razonSocial },
  { titulo: "CUIT/ID emisor", valor: (r) => r.factura.emisor.idFiscal },
  { titulo: "Cond. IVA emisor", valor: (r) => r.factura.emisor.condicionIva },
  { titulo: "Receptor", valor: (r) => r.factura.receptor.razonSocial },
  { titulo: "CUIT/ID receptor", valor: (r) => r.factura.receptor.idFiscal },
  { titulo: "Neto gravado", valor: (r) => r.factura.netoGravado },
  { titulo: "No gravado", valor: (r) => r.factura.noGravado },
  { titulo: "Exento", valor: (r) => r.factura.exento },
  { titulo: "IVA 21%", valor: (r) => iva(r.factura, 21) },
  { titulo: "IVA 10,5%", valor: (r) => iva(r.factura, 10.5) },
  { titulo: "IVA 27%", valor: (r) => iva(r.factura, 27) },
  { titulo: "IVA 5%", valor: (r) => iva(r.factura, 5) },
  { titulo: "IVA 2,5%", valor: (r) => iva(r.factura, 2.5) },
  { titulo: "Percepciones", valor: (r) => r.factura.percepciones },
  { titulo: "Otros tributos", valor: (r) => r.factura.otrosTributos },
  { titulo: "Total", valor: (r) => r.factura.total },
  { titulo: "CAE", valor: (r) => r.factura.cae },
  { titulo: "Vto. CAE", valor: (r) => r.factura.caeVencimiento },
  { titulo: "Estado ARCA", valor: (r) => (r.arca ? ESTADO_ARCA[r.arca.estado] : null) },
  { titulo: "Detalle ARCA", valor: (r) => r.arca?.detalle.join(" | ") ?? null },
  { titulo: "Advertencias", valor: (r) => r.advertencias.map((a) => `${a.campo}: ${a.mensaje}`).join(" | ") || null },
  { titulo: "Modelo", valor: (r) => r.modelo },
  { titulo: "Costo USD", valor: (r) => r.costoUsd },
];

/** Columnas fijas + una por cada campo personalizado presente en alguna fila (antes de "Estado ARCA"). */
export function columnas(filas: FilaExport[]): Columna[] {
  const extras = new Map<string, string>();
  for (const r of filas) for (const c of r.campos) if (!extras.has(c.clave)) extras.set(c.clave, c.nombre);
  const nombres = new Set(COLUMNAS.map((c) => c.titulo));
  const nuevas: Columna[] = [...extras].map(([clave, nombre]) => ({
    titulo: nombres.has(nombre) ? `${nombre} (personalizado)` : nombre,
    valor: (r) => r.factura.extras?.[clave] ?? null,
  }));
  const i = COLUMNAS.findIndex((c) => c.titulo === "Estado ARCA");
  return [...COLUMNAS.slice(0, i), ...nuevas, ...COLUMNAS.slice(i)];
}

function celdaCsv(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  // CUIT/CAE: forzar texto para que Excel no los pase a notación científica.
  if (typeof v === "string" && /^\d{11,}$/.test(v)) return `="${v}"`;
  // Excel en español usa coma decimal y ";" como separador.
  const s = typeof v === "number" ? String(v).replace(".", ",") : v;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(filas: FilaExport[]): string {
  const cols = columnas(filas);
  const lineas = [cols.map((c) => celdaCsv(c.titulo)).join(";")];
  for (const r of filas) lineas.push(cols.map((c) => celdaCsv(c.valor(r))).join(";"));
  return "﻿" + lineas.join("\r\n");
}

export async function toXLSX(filas: FilaExport[]): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Comprobantes");
  const cols = columnas(filas);
  ws.columns = cols.map((c) => ({ header: c.titulo, key: c.titulo, width: Math.max(12, c.titulo.length + 2) }));
  for (const r of filas) ws.addRow(Object.fromEntries(cols.map((c) => [c.titulo, c.valor(r)])));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const items = wb.addWorksheet("Ítems");
  items.columns = ["Archivo", "Páginas", "Número", "Descripción", "Cantidad", "Precio unitario", "Subtotal"].map((h) => ({ header: h, key: h, width: 16 }));
  for (const r of filas) {
    for (const it of r.factura.items) {
      items.addRow({ Archivo: r.archivo, Páginas: r.paginas ?? null, Número: r.factura.numero, Descripción: it.descripcion, Cantidad: it.cantidad, "Precio unitario": it.precioUnitario, Subtotal: it.subtotal });
    }
  }
  items.getRow(1).font = { bold: true };
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
