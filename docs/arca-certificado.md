# Certificado de ARCA para verificar comprobantes

La verificación usa el web service oficial **WSCDC (Constatación de Comprobantes)**. Para usarlo necesitás un certificado digital asociado a tu CUIT. Conviene empezar por **homologación** (entorno de prueba) y después pasar a producción.

## 1. Generar la clave privada y el pedido (CSR)

```bash
mkdir -p certs && cd certs
openssl genrsa -out arca.key 2048
openssl req -new -key arca.key -out arca.csr \
  -subj "/C=AR/O=TU NOMBRE O RAZON SOCIAL/CN=facturas-ocr/serialNumber=CUIT 20123456789"
```

Reemplazá el nombre y el CUIT. **`arca.key` es secreta**: no la compartas ni la subas a git (la carpeta `certs/` ya está en `.gitignore`).

## 2a. Homologación (prueba)

1. Entrá a ARCA con clave fiscal y adherí el servicio **"WSASS - Autogestión Certificados Homologación"**.
2. En WSASS: *Nuevo certificado* → pegá el contenido de `arca.csr` → copiá el certificado que te devuelve en `certs/arca.crt`.
3. En WSASS: *Crear autorización a servicio* → elegí el certificado, tu CUIT y el servicio **`wscdc`**.

## 2b. Producción

1. Con clave fiscal (nivel 3), adherí **"Administración de Certificados Digitales"**.
2. Agregá un alias, subí `arca.csr` y descargá el certificado como `certs/arca.crt`.
3. En **"Administrador de Relaciones de Clave Fiscal"** → *Nueva relación* → buscá el servicio **"Constatación de Comprobantes" (wscdc)** y asignalo al certificado (alias) que creaste.

## 3. Configurar la app

En `.env.local`:

```
ARCA_ENV=homologacion
ARCA_CUIT=20123456789
ARCA_CERT_PATH=./certs/arca.crt
ARCA_KEY_PATH=./certs/arca.key
```

Probá con:

```bash
npm run arca:test
# o constatando un comprobante real a partir de la URL de su QR:
npm run arca:test -- 'https://www.afip.gob.ar/fe/qr/?p=...'
```

Si funciona, reiniciá `npm run dev` y las facturas argentinas con CAE se verifican solas. En homologación los comprobantes reales suelen dar "Rechazado" porque esa base es de prueba; para verificar facturas reales pasá a `ARCA_ENV=produccion` con el certificado de producción.

## Qué se verifica

ARCA confirma que existe un comprobante con ese CUIT emisor, tipo, punto de venta, número, fecha, importe total y CAE/CAEA (y receptor, si se informa). Si algún dato no coincide, responde "Rechazado" con el motivo, que aparece en la tabla y en el Excel.

No verificables: tickets de controlador fiscal, comprobantes sin CAE y facturas del exterior.
