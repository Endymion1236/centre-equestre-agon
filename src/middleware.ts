import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware Next.js — première ligne de défense.
 *
 * Protège :
 * 1. /api/cron/* → CRON_SECRET obligatoire (header Authorization: Bearer)
 * 2. /api/admin/* → Soit Bearer token Firebase, soit CRON_SECRET en query
 *    string (?secret=xxx) pour les routes de maintenance one-shot
 *
 * Les routes admin accessibles via CRON_SECRET sont listées explicitement
 * dans ADMIN_MAINTENANCE_ROUTES. Elles correspondent à des outils one-shot
 * (migrations, nettoyages, diagnostics) qui sont plus simples à invoquer
 * depuis un navigateur/curl qu'avec un token Firebase valide.
 *
 * La vérification complète du token Firebase (verifyIdToken + custom claims)
 * pour les routes admin classiques est faite dans chaque route via
 * `verifyAuth()` de `@/lib/api-auth.ts`. La vérification du CRON_SECRET
 * côté route est faite dans chaque route de maintenance.
 *
 * Note sur les pages /admin/* : la protection se fait côté React dans
 * src/app/admin/layout.tsx (vérification isAdmin via custom claim Firebase).
 * Le middleware ne peut pas vérifier Firebase Auth car le SDK Web stocke
 * la session en IndexedDB (non accessible en edge). Pour une vraie
 * protection middleware des pages, il faudrait implémenter un cookie de
 * session côté serveur — chantier plus lourd, à faire si besoin futur.
 */

// Routes admin accessibles via CRON_SECRET en query string.
// Ces routes vérifient elles-mêmes le secret — le middleware passe juste
// la main si le paramètre `secret` est présent (la valeur est ensuite
// validée par la route elle-même contre process.env.CRON_SECRET).
const ADMIN_MAINTENANCE_ROUTES = [
  "/api/admin/fix-pending-reservations",
  "/api/admin/migrate-paiements-collection",
  "/api/admin/delete-family",
  "/api/admin/list-claims",
  "/api/admin/set-claims",
  "/api/admin/push-test",
  "/api/admin/import-equides",
];

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

  // ── 2. Routes /api/admin/* — Bearer token OU CRON_SECRET en query ─────
  if (pathname.startsWith("/api/admin/")) {
    // Route de maintenance : si un paramètre `secret` est présent en query
    // string, on laisse la route valider elle-même contre CRON_SECRET
    const isMaintenanceRoute = ADMIN_MAINTENANCE_ROUTES.some((r) =>
      pathname === r || pathname.startsWith(r + "/")
    );
    if (isMaintenanceRoute && req.nextUrl.searchParams.has("secret")) {
      return NextResponse.next();
    }

    // Autres routes admin : Bearer token Firebase obligatoire
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
