import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

/**
 * GET ?secret=xxx
 *
 * Affiche l'état des custom claims pour les comptes staff (admin + moniteur).
 * Utile pour vérifier avant de durcir les règles Firestore que les claims
 * attendus sont bien en place.
 *
 * Nécessite le CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Route non configurée" }, { status: 500 });
  }

  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== cronSecret) {
    return NextResponse.json({ error: "Secret invalide" }, { status: 401 });
  }

  const results: {
    email: string;
    uid: string;
    emailVerified: boolean;
    disabled: boolean;
    claims: Record<string, any>;
    provider: string;
  }[] = [];

  try {
    // Scanner tous les comptes et ne garder que ceux avec des claims staff
    let nextPageToken: string | undefined;
    do {
      const page = await adminAuth.listUsers(1000, nextPageToken);
      for (const u of page.users) {
        const claims = u.customClaims || {};
        const hasStaffClaim = claims.admin === true || claims.moniteur === true;
        if (hasStaffClaim) {
          results.push({
            email: u.email || "(sans email)",
            uid: u.uid,
            emailVerified: u.emailVerified,
            disabled: u.disabled,
            claims,
            provider: (u.providerData?.[0]?.providerId) || "unknown",
          });
        }
      }
      nextPageToken = page.pageToken;
    } while (nextPageToken);

    return NextResponse.json({
      count: results.length,
      admins: results.filter((r) => r.claims.admin === true),
      moniteurs: results.filter(
        (r) => r.claims.moniteur === true && r.claims.admin !== true
      ),
      all: results,
    });
  } catch (e: any) {
    console.error("list-claims error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
