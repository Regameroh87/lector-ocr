import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { arcaTickets } from "../db/schema";
import type { AlmacenTickets } from "./wsaa";

/** Tickets de WSAA guardados en Neon: así todas las instancias del servidor usan el mismo. */
export const almacenNeon: AlmacenTickets = {
  async leer(clave) {
    const [t] = await getDb().select().from(arcaTickets).where(eq(arcaTickets.clave, clave)).limit(1);
    return t ? { token: t.token, sign: t.sign, expira: t.expira.toISOString() } : null;
  },
  async guardar(clave, ta) {
    const valores = { token: ta.token, sign: ta.sign, expira: new Date(ta.expira), actualizadoEn: new Date() };
    await getDb()
      .insert(arcaTickets)
      .values({ clave, ...valores })
      .onConflictDoUpdate({ target: arcaTickets.clave, set: valores });
  },
};
