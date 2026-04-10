import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

// GET — lister tous les utilisateurs avec custom claim moniteur:true
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

    // Lister tous les users (Firebase n'a pas de filtre par claims, on pagine)
    const moniteurs: { uid: string; email: string; displayName: string; disabled: boolean; createdAt: string }[] = [];
    let nextPageToken: string | undefined;

    do {
      const listResult = await adminAuth.listUsers(1000, nextPageToken);
      for (const user of listResult.users) {
        if (user.customClaims?.moniteur === true) {
          moniteurs.push({
            uid: user.uid,
            email: user.email || "",
            displayName: user.displayName || "",
            disabled: user.disabled,
            createdAt: user.metadata.creationTime || "",
          });
        }
      }
      nextPageToken = listResult.pageToken;
    } while (nextPageToken);

    return NextResponse.json({ moniteurs });
  } catch (error: any) {
    console.error("Erreur listage moniteurs:", error);
    return NextResponse.json({ error: error.message || "Erreur serveur" }, { status: 500 });
  }
}
