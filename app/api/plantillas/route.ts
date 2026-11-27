import { usuarioConAcceso } from "@/lib/auth/acceso";
import { listarPlantillas } from "@/lib/db/plantillas";

// GET: plantillas que puede usar quien está conectado (para el selector de la pantalla principal).
export async function GET() {
  let yo;
  try {
    yo = await usuarioConAcceso();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 401 });
  }
  try {
    return Response.json(await listarPlantillas(yo.userId, yo.admin));
  } catch (e) {
    console.error("[plantillas]", e);
    return Response.json({ error: "No se pudieron leer las plantillas" }, { status: 500 });
  }
}
