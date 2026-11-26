import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { usuarioPermitido } from "@/lib/auth/acceso";

// Toda la app requiere sesión de Clerk y que el mail esté en la whitelist (APP_EMAILS_PERMITIDOS).
// Registro e ingreso son públicos; /sin-acceso es para quien inició sesión pero no está habilitado.
const esPublica = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);
const esSinAcceso = createRouteMatcher(["/sin-acceso"]);

export default clerkMiddleware(async (auth, req) => {
  if (esPublica(req)) return;
  const esApi = req.nextUrl.pathname.startsWith("/api/");
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return esApi ? NextResponse.json({ error: "Sesión vencida: volvé a iniciar sesión" }, { status: 401 }) : redirectToSignIn();
  }
  if (esSinAcceso(req)) return;
  if (!(await usuarioPermitido(userId))) {
    return esApi
      ? NextResponse.json({ error: "Tu cuenta no tiene acceso a esta app" }, { status: 403 })
      : NextResponse.redirect(new URL("/sin-acceso", req.url));
  }
}, { signInUrl: "/sign-in", signUpUrl: "/sign-up" });

export const config = {
  matcher: [
    // Todo menos los internos de Next y archivos estáticos
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|mjs|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // La API siempre
    "/(api|trpc)(.*)",
  ],
};
