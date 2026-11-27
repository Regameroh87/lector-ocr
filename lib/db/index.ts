import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Conexión perezosa: se crea en el primer uso, no al importar el módulo.
// Así `next build` no falla si DATABASE_URL todavía no está configurada.
function crearDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL: conectá la base Neon al proyecto (Vercel → Storage) y copiala a .env.local");
  return drizzle(neon(url), { schema });
}

let db: ReturnType<typeof crearDb> | null = null;

export function getDb() {
  if (!db) db = crearDb();
  return db;
}

export { schema };
