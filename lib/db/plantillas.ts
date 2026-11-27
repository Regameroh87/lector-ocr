import "server-only";
import { and, desc, eq, or } from "drizzle-orm";
import { getDb } from ".";
import { plantillas, type Plantilla } from "./schema";
import type { PlantillaCliente } from "../plantillas";

/** Plantillas que ve este usuario: las compartidas y las suyas. */
export async function listarPlantillas(userId: string, admin: boolean): Promise<PlantillaCliente[]> {
  const filas = await getDb()
    .select()
    .from(plantillas)
    .where(or(eq(plantillas.compartida, true), eq(plantillas.creadaPor, userId)))
    .orderBy(desc(plantillas.actualizadaEn));
  return filas.map((p) => aCliente(p, userId, admin));
}

export async function obtenerPlantilla(id: string, userId: string, admin: boolean): Promise<PlantillaCliente | null> {
  const [p] = await getDb()
    .select()
    .from(plantillas)
    .where(and(eq(plantillas.id, id), or(eq(plantillas.compartida, true), eq(plantillas.creadaPor, userId))))
    .limit(1);
  return p ? aCliente(p, userId, admin) : null;
}

export async function creadorDe(id: string): Promise<string | null> {
  const [p] = await getDb().select({ creadaPor: plantillas.creadaPor }).from(plantillas).where(eq(plantillas.id, id)).limit(1);
  return p?.creadaPor ?? null;
}

function aCliente(p: Plantilla, userId: string, admin: boolean): PlantillaCliente {
  return {
    id: p.id,
    nombre: p.nombre,
    tipoDocumento: p.tipoDocumento,
    descripcion: p.descripcion,
    fiscal: p.fiscal,
    // El id de cada campo es solo para la interfaz: se deriva de la posición.
    campos: p.campos.map((c, i) => ({ id: `${p.id}-${i}`, nombre: c.nombre, descripcion: c.descripcion, tipo: c.tipo })),
    columnas: p.columnas,
    cuitsEmisor: p.reglas.cuitsEmisor ?? [],
    compartida: p.compartida,
    editable: admin || p.creadaPor === userId,
    actualizadaEn: p.actualizadaEn.toISOString(),
  };
}
