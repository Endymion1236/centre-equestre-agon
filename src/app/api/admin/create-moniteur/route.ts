import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

// POST — créer un compte moniteur (email/mdp) + custom claim moniteur:true
export async function POST(req: NextRequest) {
  // Hissés hors du try : le rattrapage « compte déjà existant » en a besoin.
  let email = ""; let displayName = "";
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

    const body = await req.json();
    email = body.email; displayName = body.displayName;
    const password = body.password;

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
    // ── Compte déjà existant : on le RATTACHE au lieu d'echouer ──────────
    // Sans ce rattrapage, la route ne savait que créer : un moniteur dont
    // l'email a déjà un compte Firebase (création antérieure, ou inscription
    // côté famille) restait bloqué sur « Aucun compte de connexion » à vie,
    // avec un 409 incompréhensible côté admin.
    if (error.code === "auth/email-already-exists") {
      try {
        const existant = await adminAuth.getUserByEmail(email);
        // IMPORTANT : fusionner les claims. setCustomUserClaims REMPLACE tout
        // l'objet : écrire { moniteur: true } seul retirerait un éventuel
        // claim admin au passage.
        const claims = existant.customClaims || {};
        await adminAuth.setCustomUserClaims(existant.uid, { ...claims, moniteur: true });
        return NextResponse.json({
          success: true,
          adopted: true,
          uid: existant.uid,
          email: existant.email,
          displayName: existant.displayName || displayName,
          message: "Un compte existait déjà pour cet email : il a été rattaché et reçoit l'accès moniteur. Le mot de passe reste celui du compte existant.",
        });
      } catch (e2: any) {
        console.error("Rattachement moniteur impossible:", e2);
        return NextResponse.json(
          { error: "Cet email a déjà un compte, mais le rattachement a échoué." },
          { status: 409 }
        );
      }
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
