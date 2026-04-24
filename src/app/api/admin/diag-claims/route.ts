import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

// GET /api/admin/diag-claims?email=xxx@yyy.com
// Diagnostic : renvoie l'état exact des custom claims Firebase Auth pour
// un email donné. Utile pour comprendre pourquoi un moniteur voit "Accès
// restreint" alors qu'il est dans la liste des moniteurs.
//
// Réservé aux admins. Aucun effet de bord (read-only).
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const idToken = authHeader.split("Bearer ")[1];
    const caller = await adminAuth.verifyIdToken(idToken);
    if (!caller.admin) {
      return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
    }

    const email = req.nextUrl.searchParams.get("email");
    if (!email) {
      return NextResponse.json({ error: "Paramètre email manquant" }, { status: 400 });
    }

    const userRecord = await adminAuth.getUserByEmail(email);

    return NextResponse.json({
      success: true,
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      disabled: userRecord.disabled,
      emailVerified: userRecord.emailVerified,
      customClaims: userRecord.customClaims || {},
      hasMoniteurClaim: userRecord.customClaims?.moniteur === true,
      hasAdminClaim: userRecord.customClaims?.admin === true,
      tokensValidAfter: userRecord.tokensValidAfterTime,
      lastSignIn: userRecord.metadata.lastSignInTime,
      createdAt: userRecord.metadata.creationTime,
    });
  } catch (error: any) {
    if (error.code === "auth/user-not-found") {
      return NextResponse.json({ error: "Aucun compte Firebase Auth avec cet email" }, { status: 404 });
    }
    console.error("diag-claims error:", error);
    return NextResponse.json({ error: error?.message || "Erreur interne" }, { status: 500 });
  }
}
