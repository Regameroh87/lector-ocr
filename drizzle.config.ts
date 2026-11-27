import { defineConfig } from "drizzle-kit";

// drizzle-kit no lee .env.local solo: se carga acá (Node 22+).
try {
  process.loadEnvFile(".env.local");
} catch {
  /* en CI/Vercel las variables vienen del entorno */
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Las migraciones van por la conexión directa (sin pgbouncer); la app usa la agrupada (DATABASE_URL).
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "" },
});
