<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Lector OCR

App web para extraer datos de facturas y otros documentos (PDF o imagen) y exportarlos a Excel/CSV. Pensada para comprobantes argentinos (AFIP/ARCA), pero con plantillas sirve para remitos, recibos, etc. Toda la interfaz, los mensajes y los comentarios van en **español rioplatense** (vos, "subí", "elegí").

## Stack

- Next.js 16 (App Router, Turbopack) con `cacheComponents` y `partialPrefetching`. El middleware se llama `proxy.ts`.
- AI SDK 7 (`generateText` + `Output.object` / `Output.json`) vía OpenRouter; modelos en `lib/models.ts`.
- Zod 4. Tailwind 4. lucide-react.
- Clerk (`@clerk/nextjs` 7, en español) para login; Neon Postgres con Drizzle para datos.
- En el navegador: pdfjs-dist, jsQR y `BarcodeDetector`; exceljs para exportar.
- Deploy en Vercel (proyecto `lector-ocr`). Node >= 22.

## Comandos

- `npm run dev`: servidor local en :3000
- `npm test`: Vitest (`tests/`)
- `npx tsc --noEmit -p .` y `npm run lint`: correr ambos antes de dar algo por terminado
- `npm run build`: build de producción (con `cacheComponents` encuentra errores de Suspense que el dev no muestra)
- `npm run db:generate` y luego `npm run db:migrate`: migraciones de Drizzle (`drizzle/`); usan `DATABASE_URL_UNPOOLED` de `.env.local`

## Mapa del código

- `app/ui/App.tsx`: pantalla principal (subir, cola de extracción, selector de modelo y plantilla, exportar). `PanelDatos.tsx` es el panel de la derecha y `comun.ts` define el tipo `Fila`.
- `lib/client/preprocess.ts`: render de páginas, capa de texto y lectura de QR (detector nativo → jsQR en grilla → re-render en alta resolución). Solo acepta QR de ARCA.
- `lib/segmentar.ts` + `lib/client/separar.ts` + `app/api/segmentar`: separar un PDF con varios comprobantes (firma pto. vta.-número/CAE, ORIGINAL/DUPLICADO, "pág. n de m").
- `app/api/extract/route.ts` + `lib/extract.ts`: extracción con el modelo. Orden: QR → corrección de CUIT con el texto del PDF → validación → ARCA.
- `lib/validate.ts`: validación de CUIT/importes y `corregirCuitsConTexto`. `lib/qr.ts`: parseo del QR fiscal.
- `lib/campos.ts`: campos personalizados (van en `factura.extras`). `lib/export.ts`: catálogo de columnas y `ConfigColumnas`.
- `lib/plantillas.ts` (validación y textos, cliente y servidor), `lib/db/plantillas.ts` (consultas), `app/plantillas/` (pantallas y acciones).
- `lib/arca/`: WSAA + WSCDC (constatación). Ver `docs/arca-certificado.md`.
- `lib/auth/`: acceso. Orden: admin (`APP_ADMINS`) > bloqueado > habilitado (metadata de Clerk) > lista (`APP_EMAILS_PERMITIDOS`) > mail habilitado (invitación sin mail). `proxy.ts` filtra todo; `exigirAcceso()`, `exigirAdmin()` y `usuarioConAcceso()` son la segunda barrera.
- `app/admin/`: panel de usuarios. `app/configuracion/`: preferencias guardadas en localStorage (`lib/client/preferencias.ts`).

## Reglas

- Antes de escribir código de Next, leer la guía correspondiente en `node_modules/next/dist/docs/`.
- Con `cacheComponents`, todo lo que lee la sesión, `params`, cookies o la base va dentro de `<Suspense>`. Las pantallas siguen el patrón de `app/admin/page.tsx`.
- En las acciones de servidor, llamar a `refresh()` de `next/cache` después de escribir.
- La base se abre recién cuando se usa (`getDb()`), nunca al importar. Para cambiar el esquema, editar `lib/db/schema.ts` y generar una migración; nunca escribir SQL a mano contra la base.
- Los archivos que suben los usuarios no se guardan en ningún lado; se procesan en el navegador y en la request.
- No subir nunca `.env.local`, `certs/` ni claves. No mostrar valores de variables de entorno.
- Las pantallas siguen el estilo existente: zinc, `bg-[#fbfbfa]`, tarjetas `rounded-xl ring-1 ring-zinc-200`, `EncabezadoPagina`, `Seccion` y `Opcion` de `app/ui/Formulario.tsx`.
- En los tests, usar imports relativos (Vitest no resuelve `@/` en algunos módulos de `lib/client`).

## Pendientes conocidos

- Rotar la contraseña de Neon (quedó expuesta) y actualizar `.env.local` y Vercel.
- Clerk sigue en instancia de desarrollo: producción necesita dominio propio (`clerk deploy`) y cambiar las claves en Vercel.
