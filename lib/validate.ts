import type { Factura } from "./schema";
import { type QrFiscal, monedaQrAIso } from "./qr";
import { codigoTipoAfip } from "./afip-codigos";

export type Nivel = "error" | "aviso";
export interface Advertencia {
  campo: string;
  nivel: Nivel;
  mensaje: string;
}

export function cuitValido(cuit: string | number | null | undefined): boolean {
  const s = String(cuit ?? "").replace(/\D/g, "");
  if (s.length !== 11) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(s[i]), 0);
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;
  return dv === Number(s[10]);
}

function fechaValida(f: string | null): boolean {
  if (!f || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const d = new Date(f + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
}

export function esArgentina(f: Factura): boolean {
  return (f.pais ?? "AR").toUpperCase() === "AR" && f.tipoDocumento !== "factura_exterior";
}

export function validarFactura(f: Factura, qr?: QrFiscal | null, origen: "modelo" | "editado" = "modelo"): Advertencia[] {
  const adv: Advertencia[] = [];
  const add = (campo: string, nivel: Nivel, mensaje: string) => adv.push({ campo, nivel, mensaje });

  if (!fechaValida(f.fechaEmision)) add("fechaEmision", "error", "Fecha de emisión faltante o inválida");
  if (f.total === null) add("total", "error", "No se encontró el total");

  if (esArgentina(f)) {
    const cuitEmisor = f.emisor.idFiscal;
    if (!cuitEmisor) add("emisor.idFiscal", "error", "Falta el CUIT del emisor");
    else if (!cuitValido(cuitEmisor)) add("emisor.idFiscal", "error", `CUIT del emisor inválido (${cuitEmisor})`);

    const cuitRec = f.receptor.idFiscal?.replace(/\D/g, "");
    if (cuitRec && cuitRec.length === 11 && !cuitValido(cuitRec)) add("receptor.idFiscal", "error", `CUIT del receptor inválido (${cuitRec})`);

    if (f.tipoDocumento !== "ticket") {
      if (!f.cae) add("cae", "aviso", "No se encontró CAE/CAEA");
      else if (!/^\d{14}$/.test(f.cae)) add("cae", "error", `CAE con formato inválido (${f.cae}); debe tener 14 dígitos`);
      if (f.puntoVenta === null) add("puntoVenta", "error", "Falta el punto de venta");
      if (f.numero === null) add("numero", "error", "Falta el número de comprobante");
    }
  }

  // Cuadre de importes (solo si hay desglose)
  const componentes = [f.netoGravado, f.noGravado, f.exento, f.percepciones, f.otrosTributos];
  const ivaTotal = f.iva.reduce((a, x) => a + (x.importe ?? 0), 0);
  if (f.total !== null && f.netoGravado !== null) {
    const suma = componentes.reduce<number>((a, x) => a + (x ?? 0), 0) + ivaTotal;
    const tolerancia = Math.max(1, Math.abs(f.total) * 0.001);
    if (Math.abs(suma - f.total) > tolerancia) {
      add("total", "aviso", `Los importes no cierran: componentes suman ${suma.toFixed(2)} y el total es ${f.total.toFixed(2)}`);
    }
  }
  for (const a of f.iva) {
    if (a.baseImponible !== null && a.alicuota > 0) {
      const esperado = (a.baseImponible * a.alicuota) / 100;
      if (Math.abs(esperado - a.importe) > Math.max(1, esperado * 0.01)) {
        add("iva", "aviso", `IVA ${a.alicuota}%: ${a.importe} no coincide con ${esperado.toFixed(2)} sobre la base ${a.baseImponible}`);
      }
    }
  }

  for (const campo of f.camposDudosos) {
    // Los campos personalizados viven en extras.<clave>; el modelo puede nombrarlos con o sin prefijo.
    const real = f.extras && campo in f.extras ? `extras.${campo}` : campo;
    add(real, "aviso", "El modelo marcó este campo como dudoso");
  }

  if (qr) adv.push(...compararConQr(f, qr, origen));
  return adv;
}

/** Diferencias entre lo que leyó el modelo y el QR fiscal (que es exacto). */
export function compararConQr(f: Factura, qr: QrFiscal, origen: "modelo" | "editado" = "modelo"): Advertencia[] {
  const adv: Advertencia[] = [];
  const dif = (campo: string, modelo: unknown, qrVal: unknown) =>
    adv.push({
      campo,
      nivel: "aviso",
      mensaje:
        origen === "modelo"
          ? `El modelo leyó "${modelo ?? "—"}" pero el QR dice "${qrVal}" (se usa el del QR)`
          : `"${modelo ?? "—"}" no coincide con el QR fiscal ("${qrVal}")`,
    });

  if (f.emisor.idFiscal?.replace(/\D/g, "") !== String(qr.cuit)) dif("emisor.idFiscal", f.emisor.idFiscal, qr.cuit);
  if (f.puntoVenta !== qr.ptoVta) dif("puntoVenta", f.puntoVenta, qr.ptoVta);
  if (f.numero !== qr.nroCmp) dif("numero", f.numero, qr.nroCmp);
  if (f.fechaEmision !== qr.fecha) dif("fechaEmision", f.fechaEmision, qr.fecha);
  if (f.total === null || Math.abs(f.total - qr.importe) > 0.01) dif("total", f.total, qr.importe);
  if (f.cae !== String(qr.codAut)) dif("cae", f.cae, qr.codAut);
  const tipo = f.codigoTipoAfip ?? codigoTipoAfip(f);
  if (tipo !== null && tipo !== qr.tipoCmp) dif("codigoTipoAfip", tipo, qr.tipoCmp);
  return adv;
}

/** Aplica los datos del QR sobre la factura extraída (el QR tiene prioridad). */
export function aplicarQr(f: Factura, qr: QrFiscal): Factura {
  return {
    ...f,
    pais: "AR",
    emisor: { ...f.emisor, idFiscal: String(qr.cuit) },
    puntoVenta: qr.ptoVta,
    numero: qr.nroCmp,
    fechaEmision: qr.fecha,
    total: qr.importe,
    cae: String(qr.codAut),
    codigoTipoAfip: qr.tipoCmp,
    moneda: monedaQrAIso(qr.moneda),
    cotizacion: qr.ctz !== 1 ? qr.ctz : f.cotizacion,
  };
}
