import type { Factura } from "./schema";
import type { QrFiscal } from "./qr";
import type { Advertencia } from "./validate";
import type { EstadoArca } from "./arca/verificar";
import type { CampoExtraido } from "./campos";

export interface Uso {
  modelo: string;
  ms: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costoUsd: number | null;
  intentos: number;
  modo?: "estricto" | "json";
}

export interface RespuestaExtraccion {
  /** Factura final (con datos del QR aplicados si había QR). */
  factura: Factura;
  /** Lo que leyó el modelo, sin correcciones. */
  facturaModelo: Factura;
  qr: QrFiscal | null;
  /** Campos personalizados pedidos en esta extracción (valores en factura.extras). */
  campos: CampoExtraido[];
  advertencias: Advertencia[];
  arca: EstadoArca;
  uso: Uso;
}

/** Estado de la integración con ARCA en el servidor (GET /api/arca). */
export interface EstadoServidorArca {
  habilitada: boolean; // ARCA_ENABLED != false
  configurada: boolean; // hay certificado, clave y CUIT
  entorno: "homologacion" | "produccion" | null;
  error?: string;
}
