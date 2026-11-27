import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { TipoCampoPersonalizado } from "../campos";
import type { ConfigColumnas } from "../export";

/** Un dato a extraer de una plantilla (mismo formato que los campos personalizados). */
export interface CampoPlantilla {
  nombre: string;
  descripcion: string;
  tipo: TipoCampoPersonalizado;
}

/** Cuándo usar la plantilla sola, sin elegirla a mano. */
export interface ReglasPlantilla {
  /** CUITs de emisores (solo dígitos) para los que aplica, ej. un proveedor puntual. */
  cuitsEmisor?: string[];
}

/**
 * Plantillas de extracción: "para este tipo de documento, extraé estos datos y exportá estas columnas".
 * Ej.: "Facturas de Proveedor X", "Remitos", "Tickets de combustible".
 */
export const plantillas = pgTable(
  "plantillas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre").notNull(),
    /** factura, remito, recibo, orden_compra, extracto, otro… (texto libre para no atarse a una lista). */
    tipoDocumento: text("tipo_documento").notNull().default("factura"),
    descripcion: text("descripcion").notNull().default(""),
    /** true = aplica QR, validación de CUIT/CAE y verificación en ARCA (comprobantes fiscales argentinos). */
    fiscal: boolean("fiscal").notNull().default(true),
    campos: jsonb("campos").$type<CampoPlantilla[]>().notNull().default([]),
    columnas: jsonb("columnas").$type<ConfigColumnas | null>(),
    reglas: jsonb("reglas").$type<ReglasPlantilla>().notNull().default({}),
    /** userId de Clerk de quien la creó. */
    creadaPor: text("creada_por").notNull(),
    /** true = la ven y usan todos los usuarios; false = solo quien la creó. */
    compartida: boolean("compartida").notNull().default(true),
    creadaEn: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
    actualizadaEn: timestamp("actualizada_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("plantillas_creada_por_idx").on(t.creadaPor)],
);

export type Plantilla = typeof plantillas.$inferSelect;
export type NuevaPlantilla = typeof plantillas.$inferInsert;

/**
 * Ticket de acceso de ARCA (WSAA), compartido entre todas las instancias del servidor.
 * ARCA entrega un solo ticket vigente (~12 h) por certificado y servicio: si cada instancia
 * pidiera el suyo, la segunda recibiría "El CEE ya posee un TA válido".
 */
export const arcaTickets = pgTable("arca_tickets", {
  /** "<entorno>:<cuit>:<servicio>", ej. "produccion:20123456789:wscdc" */
  clave: text("clave").primaryKey(),
  token: text("token").notNull(),
  sign: text("sign").notNull(),
  expira: timestamp("expira", { withTimezone: true }).notNull(),
  actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
});
