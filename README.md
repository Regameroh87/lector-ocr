# Lector OCR

Web app para extraer datos de facturas y comprobantes con modelos de visión **intercambiables**, verificarlos en **ARCA** y exportarlos a **CSV/Excel**.

- Facturas AFIP/ARCA (A, B, C, M, E), tickets y fotos de papel, facturas del exterior.
- Lee el **QR fiscal** de la factura (datos exactos) y lo compara con lo que leyó el modelo.
- Verifica automáticamente en ARCA (web service de Constatación de Comprobantes) cuando hay certificado.
- Valida CUIT (dígito verificador), formato de CAE, fechas y que los importes cierren.
- Tabla editable con advertencias y export a CSV (Excel en español) o .xlsx (con hoja de ítems).
- Los archivos no se guardan en ningún lado.

## Empezar

```bash
cp .env.example .env.local   # completá OPENROUTER_API_KEY
npm install
npm run dev                  # http://localhost:3000
```

## Login y registro (Clerk)

El registro, el ingreso, la verificación por mail y la recuperación de contraseña los maneja [Clerk](https://clerk.com) (gratis hasta ~10.000 usuarios activos por mes).

1. Creá una app en https://dashboard.clerk.com y copiá `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY` a `.env.local`.
2. Definí quién puede usar la app en `APP_EMAILS_PERMITIDOS`: mails completos y/o dominios con `@` (ej. `ana@estudio.com,@miempresa.com.ar`). Cualquiera puede registrarse, pero quien no esté en la lista ve "Tu cuenta todavía no tiene acceso".
3. Solo cuentan los mails **verificados**. Los cambios en la lista tardan hasta 5 minutos en aplicarse a una sesión abierta.

**Panel de usuarios (`/admin`):** los mails de `APP_ADMINS` ven el botón "Usuarios" arriba a la derecha. Desde ahí se habilita un mail (si todavía no se registró, entra directo cuando lo haga; no se manda ningún mail), se da acceso a quien se registró y está esperando, o se le quita a alguien. Ese estado se guarda en Clerk (metadata pública del usuario), así que no hace falta base de datos ni reiniciar la app. Prioridad: admin > bloqueado en el panel > habilitado en el panel > `APP_EMAILS_PERMITIDOS` > mail habilitado antes de registrarse.

Para entrar con Google u otros proveedores, activalos en el dashboard de Clerk (User & authentication → SSO connections); no hace falta tocar el código.

## Base de datos (Neon)

Postgres en [Neon](https://neon.com) (plan gratis), conectado desde Vercel → *Storage*. El código usa [Drizzle](https://orm.drizzle.team): el esquema está en `lib/db/schema.ts` y las migraciones en `drizzle/`.

```bash
npm run db:generate   # después de cambiar lib/db/schema.ts: crea la migración
npm run db:migrate    # aplica las migraciones pendientes a la base de DATABASE_URL
npm run db:studio     # explorador visual de la base
```

Hoy guarda las **plantillas de extracción** (qué datos extraer y qué columnas exportar según el tipo de documento o el proveedor).

## Cambiar de modelo

Todos los modelos están en `lib/models.ts`. Se elige desde la interfaz, y el valor por defecto se define con `DEFAULT_MODEL`.

- **OpenRouter** (por defecto): con una sola key accedés a GPT, Claude, Gemini, Qwen, Mistral y modelos gratis (`:free`). Para sumar uno, agregá su id (de https://openrouter.ai/models) a la lista.
- **Otro proveedor**: agregá un `case` en `lib/providers.ts`.

Si un modelo no soporta JSON Schema estricto, poné `structuredOutputs: false`. En ese caso se le pide el JSON por prompt y se valida igual con Zod.

> Los modelos gratis tienen límites de uso y su proveedor puede retener los datos enviados.

## Elegir el modelo con datos: `npm run bench`

1. Poné en `bench/` pares `factura1.jpg` + `factura1.expected.json` con los valores correctos. Podés cargar solo los campos que quieras evaluar, por ejemplo `{"emisor":{"idFiscal":"30..."},"total":1210,"fechaEmision":"2026-10-15"}`.
2. `npm run bench -- --models openai/gpt-6-luna,qwen/qwen3.8-flash,nvidia/nemotron-3.5-super-vl:free`
3. Obtenés una tabla con la precisión por campo, las fallas, los segundos por factura y el costo cada 1000 facturas.

## Verificación en ARCA

La verificación es **opcional**:

- **Desde la app:** ⚙ Configuración → "Verificar en ARCA automáticamente". La preferencia se guarda en el navegador. Con la verificación apagada, igual podés verificar una factura puntual desde su detalle.
- **Para toda la instalación:** `ARCA_ENABLED=false` en `.env.local` la desactiva por completo, incluido el botón manual.

Sin certificado, las facturas argentinas quedan en estado **Pendiente** y el resto funciona igual. Para cargar uno, seguí [docs/arca-certificado.md](docs/arca-certificado.md) y probá con `npm run arca:test`.

| Estado | Significado |
|---|---|
| Válido | ARCA confirma el comprobante con esos datos |
| Rechazado | No existe o algún dato no coincide (se muestra el motivo) |
| No verificable | Ticket, factura del exterior o sin CAE |
| Pendiente | Falta configurar el certificado |
| Desactivada | La verificación está apagada (Configuración o `ARCA_ENABLED=false`) |

## Estructura

```
app/page.tsx, app/ui/App.tsx   interfaz
app/api/extract                imágenes + QR → extracción + validación + ARCA
app/api/arca                   re-verificación después de editar
lib/schema.ts                  campos de la factura (Zod)
lib/models.ts, lib/providers.ts registro de modelos y proveedores
lib/extract.ts                 prompt + llamada al modelo + reintento
lib/validate.ts, lib/qr.ts     validaciones y QR fiscal
lib/arca/                      WSAA (login) + WSCDC (constatación)
lib/client/preprocess.ts       PDF→imagen y lectura del QR en el navegador
lib/export.ts                  CSV y XLSX (columnas configurables)
lib/auth/, proxy.ts            login con Clerk + whitelist de mails
lib/db/, drizzle/              base de datos (Neon + Drizzle) y migraciones
scripts/bench.ts               comparativa de modelos
```

## Tests

```bash
npm test
```
