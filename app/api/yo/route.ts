import { auth } from "@clerk/nextjs/server";
import { accesoDe } from "@/lib/auth/acceso";

// GET: { admin } — para mostrar el acceso al panel de usuarios en la interfaz.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ admin: false }, { status: 401 });
  return Response.json({ admin: (await accesoDe(userId)).admin });
}
