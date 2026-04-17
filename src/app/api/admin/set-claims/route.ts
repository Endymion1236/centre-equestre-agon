import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

const ADMIN_EMAILS = ["ceagon@orange.fr", "ceagon50@gmail.com", "emmelinelagy@gmail.com"];

/**
 * GET ?secret=xxx — initialiser les custom claims `admin: true` pour les comptes
 * listés dans ADMIN_EMAILS.
 *
 * Authentification : CRON_SECRET obligatoire (variable d'environnement Vercel).
 * Aucun fallback en dur — si le secret est absent de l'environnement,
 * la route retourne 500 plutôt que de passer.
 *
 * Cette route est idempotente : relancer ne cause pas de problème, elle
 * re-set le claim admin: true pour les comptes qui existent.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  // Refus strict si CRON_SECRET absent — pas de mode "on continue quand même"
  if (!cronSecret) {
    console.error("set-claims: CRON_SECRET non configuré — route désactivée");
    return NextResponse.json(
      { error: "Route non configurée" },
      { status: 500 }
    );
  }

  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== cronSecret) {
    return NextResponse.json({ error: "Secret invalide" }, { status: 401 });
  }

  const results = [];
  for (const email of ADMIN_EMAILS) {
    try {
      const u = await adminAuth.getUserByEmail(email);
      await adminAuth.setCustomUserClaims(u.uid, { admin: true });
      results.push({ email, uid: u.uid, status: "✅ claim admin=true défini" });
    } catch (e: any) {
      results.push({ email, status: "❌ " + e.message });
    }
  }
  return NextResponse.json({ results });
}

