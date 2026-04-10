import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

// POST — créer un compte moniteur (email/mdp) + custom claim moniteur:true
export async function POST(req: NextRequest) {
  try {
    // Vérifier que l'appelant est admin via son token Firebase
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const idToken = authHeader.split("Bearer ")[1];
    const caller = await adminAuth.verifyIdToken(idToken);
    if (!caller.admin) {
      return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
    }

    const { email, password, displayName } = await req.json();

    if (!email || !password || !displayName) {
      return NextResponse.json({ error: "Email, mot de passe et nom requis" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Le mot de passe doit faire au moins 6 caractères" }, { status: 400 });
    }

    // Créer l'utilisateur Firebase Auth
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName,
    });

    // Définir le custom claim moniteur:true
    await adminAuth.setCustomUserClaims(userRecord.uid, { moniteur: true });

    return NextResponse.json({
      success: true,
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
    });
  } catch (error: any) {
    if (error.code === "auth/email-already-exists") {
      return NextResponse.json({ error: "Cet email est déjà utilisé" }, { status: 409 });
    }
    console.error("Erreur création moniteur:", error);
    console.error("API error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

// DELETE — supprimer un compte moniteur
export async function DELETE(req: NextRequest) {
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

    await adminAuth.deleteUser(uid);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Erreur suppression moniteur:", error);
    console.error("API error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
