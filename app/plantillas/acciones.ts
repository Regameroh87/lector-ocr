"use server";

import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { usuarioConAcceso } from "@/lib/auth/acceso";
import { getDb } from "@/lib/db";
import { creadorDe } from "@/lib/db/plantillas";
import { plantillas } from "@/lib/db/schema";
import { EntradaPlantilla } from "@/lib/plantillas";

export type ResultadoGuardar = { ok: true; id: string } | { ok: false; error: string };

export async function guardarPlantilla(entrada: EntradaPlantilla): Promise<ResultadoGuardar> {
  try {
    const { userId, admin } = await usuarioConAcceso();
    const p = EntradaPlantilla.safeParse(entrada);
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos" };
    const d = p.data;
    const valores = {
      nombre: d.nombre,
      tipoDocumento: d.tipoDocumento,
      descripcion: d.descripcion,
      fiscal: d.fiscal,
      campos: d.campos,
      columnas: d.columnas,
      reglas: { cuitsEmisor: d.cuitsEmisor },
      compartida: d.compartida,
      actualizadaEn: new Date(),
    };
    const db = getDb();

    if (d.id) {
      const creador = await creadorDe(d.id);
      if (!creador) return { ok: false, error: "La plantilla ya no existe" };
      if (creador !== userId && !admin) return { ok: false, error: "Solo quien creó la plantilla (o un admin) puede cambiarla" };
      await db.update(plantillas).set(valores).where(eq(plantillas.id, d.id));
      refresh();
      return { ok: true, id: d.id };
    }

    const [nueva] = await db.insert(plantillas).values({ ...valores, creadaPor: userId }).returning({ id: plantillas.id });
    refresh();
    return { ok: true, id: nueva.id };
  } catch (e) {
    console.error("[plantillas] guardar", e);
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar" };
  }
}

export async function borrarPlantilla(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { userId, admin } = await usuarioConAcceso();
    if (!z.uuid().safeParse(id).success) return { ok: false, error: "Plantilla inválida" };
    const creador = await creadorDe(id);
    if (!creador) return { ok: true };
    if (creador !== userId && !admin) return { ok: false, error: "Solo quien creó la plantilla (o un admin) puede borrarla" };
    await getDb().delete(plantillas).where(eq(plantillas.id, id));
    refresh();
    return { ok: true };
  } catch (e) {
    console.error("[plantillas] borrar", e);
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo borrar" };
  }
}
