import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

// POST — réappliquer le custom claim moniteur:true sur un user existant.
// Utile quand un moniteur ne voit pas le claim dans son token local (cache),
// ou pour corriger un compte créé avant la mise en place des claims.
// L'utilisateur devra ensuite se déconnecter/reconnecter pour que son
// token local soit rafraîchi côté navigateur.
export async function POST(req: NextRequest) {
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

    const { uid } = await req.json();
    if (!uid) {
      return NextResponse.json({ error: "UID requis" }, { status: 400 });
    }

    // Récupérer les claims existants pour ne pas écraser d'éventuelles autres valeurs
    const userRecord = await adminAuth.getUser(uid);
    const existing = userRecord.customClaims || {};

    await adminAuth.setCustomUserClaims(uid, {
      ...existing,
      moniteur: true,
    });

    // Révoquer les tokens existants pour forcer un nouveau login.
    // Cela invalide le cache de token côté navigateur : au prochain refresh,
    // le moniteur devra se reconnecter et récupérera le token avec le claim à jour.
    await adminAuth.revokeRefreshTokens(uid);

    return NextResponse.json({
      success: true,
      message: "Claim moniteur réappliqué. Le moniteur doit se reconnecter pour que le changement prenne effet.",
    });
  } catch (error: any) {
    console.error("Erreur réapplication claim moniteur:", error);
    return NextResponse.json({ error: error?.message || "Erreur interne" }, { status: 500 });
  }
}
