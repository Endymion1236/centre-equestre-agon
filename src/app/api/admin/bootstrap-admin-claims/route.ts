import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

/**
 * GET /api/admin/bootstrap-admin-claims
 *
 * Pose le custom claim `admin: true` sur les 3 comptes admin officiels.
 *
 * Cette route existe parce qu'on peut tomber dans un cercle vicieux : si
 * un admin n'a PAS encore le claim `admin: true` côté Firebase Auth, il
 * ne peut pas appeler les autres endpoints admin (qui vérifient le claim).
 *
 * Cette route ne demande aucune authentification car elle est strictement
 * limitée à 3 emails hardcodés. Elle est idempotente : si le claim est
 * déjà posé, elle reste sans effet.
 *
 * À appeler une fois depuis le navigateur d'un des comptes admin :
 *   https://centre-equestre-agon.vercel.app/api/admin/bootstrap-admin-claims
 *
 * Puis l'utilisateur doit se déconnecter et se reconnecter pour que le
 * token client embarque le nouveau claim.
 */

const ADMIN_EMAILS = [
  "ceagon@orange.fr",
  "ceagon50@gmail.com",
  "emmelinelagy@gmail.com",
];

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const results: Array<{ email: string; status: string; uid?: string; alreadyHadClaim?: boolean }> = [];

  for (const email of ADMIN_EMAILS) {
    try {
      const u = await adminAuth.getUserByEmail(email);
      const alreadyAdmin = u.customClaims?.admin === true;

      // Préserver les autres claims existants (ex: moniteur=true) si présents
      const newClaims = { ...(u.customClaims || {}), admin: true };
      await adminAuth.setCustomUserClaims(u.uid, newClaims);

      results.push({
        email,
        uid: u.uid,
        alreadyHadClaim: alreadyAdmin,
        status: alreadyAdmin ? "✅ déjà admin" : "✅ claim admin=true posé",
      });
    } catch (e: any) {
      if (e?.code === "auth/user-not-found") {
        results.push({ email, status: "⚠️ Compte Firebase Auth inexistant pour cet email" });
      } else {
        results.push({ email, status: `❌ ${e?.message || e}` });
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: "Claims admin posés. Les comptes concernés doivent se déconnecter/reconnecter pour que leur token client embarque le claim.",
    results,
  });
}
