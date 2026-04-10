import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware Next.js — première ligne de défense.
 *
 * Protège :
 * 1. /api/cron/* → CRON_SECRET obligatoire
 * 2. /api/admin/* → Header Authorization obligatoire (le token est vérifié
 *    ensuite par verifyAuth() dans chaque route, mais le middleware bloque
 *    les requêtes sans aucun token avant même d'exécuter le code de la route)
 *
 * La vérification complète du token Firebase (verifyIdToken + custom claims)
 * est faite dans chaque route API via `verifyAuth()` de `@/lib/api-auth.ts`.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── 1. Routes CRON — CRON_SECRET obligatoire ──────────────────────────
  if (pathname.startsWith("/api/cron/")) {
    const authHeader = req.headers.get("authorization");
    const secret = process.env.CRON_SECRET;
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── 2. Routes /api/admin/* — Bearer token obligatoire ─────────────────
  if (pathname.startsWith("/api/admin/")) {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    // Le token sera vérifié par verifyAuth() dans la route elle-même
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/cron/:path*", "/api/admin/:path*"],
};
