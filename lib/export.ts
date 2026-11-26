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

export type Columna = { id: string; titulo: string; grupo: Grupo; valor: (r: FilaExport) => string | number | null };
export type Grupo = "Comprobante" | "Emisor y receptor" | "Importes" | "ARCA y control" | "Campos personalizados";

const col = (id: string, titulo: string, grupo: Grupo, valor: Columna["valor"]): Columna => ({ id, titulo, grupo, valor });

export const COLUMNAS: Columna[] = [
  col("archivo", "Archivo", "Comprobante", (r) => r.archivo),
  col("paginas", "Páginas", "Comprobante", (r) => r.paginas ?? null),
  col("tipo", "Tipo", "Comprobante", (r) => r.factura.tipoDocumento),
  col("letra", "Letra", "Comprobante", (r) => r.factura.letra),
  col("codigoAfip", "Cód. AFIP", "Comprobante", (r) => r.factura.codigoTipoAfip),
  col("puntoVenta", "Punto de venta", "Comprobante", (r) => r.factura.puntoVenta),
  col("numero", "Número", "Comprobante", (r) => r.factura.numero),
  col("fecha", "Fecha", "Comprobante", (r) => r.factura.fechaEmision),
  col("pais", "País", "Comprobante", (r) => r.factura.pais),
  col("moneda", "Moneda", "Comprobante", (r) => r.factura.moneda),
  col("cotizacion", "Cotización", "Comprobante", (r) => r.factura.cotizacion),
  col("emisor", "Emisor", "Emisor y receptor", (r) => r.factura.emisor.razonSocial),
  col("cuitEmisor", "CUIT/ID emisor", "Emisor y receptor", (r) => r.factura.emisor.idFiscal),
  col("condIvaEmisor", "Cond. IVA emisor", "Emisor y receptor", (r) => r.factura.emisor.condicionIva),
  col("receptor", "Receptor", "Emisor y receptor", (r) => r.factura.receptor.razonSocial),
  col("cuitReceptor", "CUIT/ID receptor", "Emisor y receptor", (r) => r.factura.receptor.idFiscal),
  col("netoGravado", "Neto gravado", "Importes", (r) => r.factura.netoGravado),
  col("noGravado", "No gravado", "Importes", (r) => r.factura.noGravado),
  col("exento", "Exento", "Importes", (r) => r.factura.exento),
  col("iva21", "IVA 21%", "Importes", (r) => iva(r.factura, 21)),
  col("iva105", "IVA 10,5%", "Importes", (r) => iva(r.factura, 10.5)),
  col("iva27", "IVA 27%", "Importes", (r) => iva(r.factura, 27)),
  col("iva5", "IVA 5%", "Importes", (r) => iva(r.factura, 5)),
  col("iva25", "IVA 2,5%", "Importes", (r) => iva(r.factura, 2.5)),
  col("ivaTotal", "IVA total", "Importes", (r) => (r.factura.iva.length ? r.factura.iva.reduce((s, a) => s + a.importe, 0) : null)),
  col("percepciones", "Percepciones", "Importes", (r) => r.factura.percepciones),
  col("otrosTributos", "Otros tributos", "Importes", (r) => r.factura.otrosTributos),
  col("total", "Total", "Importes", (r) => r.factura.total),
  col("cae", "CAE", "ARCA y control", (r) => r.factura.cae),
  col("vtoCae", "Vto. CAE", "ARCA y control", (r) => r.factura.caeVencimiento),
  col("estadoArca", "Estado ARCA", "ARCA y control", (r) => (r.arca ? ESTADO_ARCA[r.arca.estado] : null)),
  col("detalleArca", "Detalle ARCA", "ARCA y control", (r) => r.arca?.detalle.join(" | ") ?? null),
  col("advertencias", "Advertencias", "ARCA y control", (r) => r.advertencias.map((a) => `${a.campo}: ${a.mensaje}`).join(" | ") || null),
  col("modelo", "Modelo", "ARCA y control", (r) => r.modelo),
  col("costo", "Costo USD", "ARCA y control", (r) => r.costoUsd),
];

/** Columnas que no salen por defecto (se pueden agregar desde Configuración). */
const OCULTAS_POR_DEFECTO = new Set(["ivaTotal"]);

/** Selección útil para la mayoría: identificación, partes, importes principales y CAE. */
export const COLUMNAS_BASICAS = ["fecha", "tipo", "letra", "puntoVenta", "numero", "emisor", "cuitEmisor", "netoGravado", "ivaTotal", "percepciones", "total", "cae"];

/** Configuración de columnas del export (se guarda en el navegador). */
export interface ConfigColumnas {
  /** ids visibles, en orden. */
  visibles: string[];
  /** ids que existían cuando se guardó: una columna que no esté acá es nueva (p. ej. un campo personalizado) y se agrega al final. */
  conocidas: string[];
  /** Incluir la hoja "Ítems" en el Excel. */
  hojaItems: boolean;
}

export const idExtra = (clave: string) => `extra:${clave}`;

/** Todas las columnas posibles: las fijas + una por cada campo personalizado (antes de "Estado ARCA"). */
export function catalogo(extras: { clave: string; nombre: string }[]): Columna[] {
  const nombres = new Set(COLUMNAS.map((c) => c.titulo));
  const vistas = new Set<string>();
  const nuevas: Columna[] = [];
  for (const { clave, nombre } of extras) {
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    nuevas.push(col(idExtra(clave), nombres.has(nombre) ? `${nombre} (personalizado)` : nombre, "Campos personalizados", (r) => r.factura.extras?.[clave] ?? null));
  }
  const i = COLUMNAS.findIndex((c) => c.id === "estadoArca");
  return [...COLUMNAS.slice(0, i), ...nuevas, ...COLUMNAS.slice(i)];
}

/** Columnas que salen, en orden, según la configuración (sin configuración: todas menos las ocultas por defecto). */
export function aplicarConfig(todas: Columna[], cfg?: ConfigColumnas | null): Columna[] {
  if (!cfg) return todas.filter((c) => !OCULTAS_POR_DEFECTO.has(c.id));
  const porId = new Map(todas.map((c) => [c.id, c]));
  const conocidas = new Set(cfg.conocidas);
  const elegidas = cfg.visibles.flatMap((id) => porId.get(id) ?? []);
  const nuevas = todas.filter((c) => !conocidas.has(c.id) && !OCULTAS_POR_DEFECTO.has(c.id) && !cfg.visibles.includes(c.id));
  return [...elegidas, ...nuevas];
}

/** Columnas del export para estas filas: las fijas + campos personalizados presentes, filtradas por la configuración. */
export function columnas(filas: FilaExport[], cfg?: ConfigColumnas | null): Columna[] {
  return aplicarConfig(catalogo(filas.flatMap((r) => r.campos)), cfg);
}

function celdaCsv(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  // CUIT/CAE: forzar texto para que Excel no los pase a notación científica.
  if (typeof v === "string" && /^\d{11,}$/.test(v)) return `="${v}"`;
  // Excel en español usa coma decimal y ";" como separador.
  const s = typeof v === "number" ? String(v).replace(".", ",") : v;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(filas: FilaExport[], cfg?: ConfigColumnas | null): string {
  const cols = columnas(filas, cfg);
  const lineas = [cols.map((c) => celdaCsv(c.titulo)).join(";")];
  for (const r of filas) lineas.push(cols.map((c) => celdaCsv(c.valor(r))).join(";"));
  return "﻿" + lineas.join("\r\n");
}

export async function toXLSX(filas: FilaExport[], cfg?: ConfigColumnas | null): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Comprobantes");
  const cols = columnas(filas, cfg);
  ws.columns = cols.map((c) => ({ header: c.titulo, key: c.id, width: Math.max(12, c.titulo.length + 2) }));
  for (const r of filas) ws.addRow(Object.fromEntries(cols.map((c) => [c.id, c.valor(r)])));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  if (cfg && !cfg.hojaItems) return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
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
