/**
 * POST /api/admin/change-family-email
 *
 * Change l'email de connexion d'une famille de facon SYNCHRONISEE :
 *   1. L'email du compte Firebase Auth (l'identite de connexion)
 *   2. Le champ parentEmail dans Firestore (la fiche famille)
 *
 * Sans cette synchro, modifier juste parentEmail cote Firestore creerait
 * une desynchro : la famille recevrait ses liens sur le nouveau mail mais
 * le compte Firebase resterait sur l'ancien (ou un nouveau compte vide
 * serait cree), avec perte de l'historique.
 *
 * Auth admin obligatoire.
 *
 * Body : { familyId: string, newEmail: string }
 *
 * Cas geres :
 *   - Famille sans compte Firebase encore (jamais connectee) -> on met juste
 *     a jour Firestore, le compte sera cree au 1er lien magique sur le
 *     nouvel email. OK.
 *   - Nouvel email deja utilise par un AUTRE compte Firebase -> refus
 *     (collision, on ne veut pas fusionner deux familles par erreur).
 *   - Ancien et nouveau identiques -> no-op.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const { familyId, newEmail } = await req.json();

    const email = (newEmail || "").trim().toLowerCase();
    if (!familyId || !email || !email.includes("@") || email.length > 254) {
      return NextResponse.json({ error: "Parametres invalides" }, { status: 400 });
    }

    // ── 1. Recuperer la famille ──
    const famRef = adminDb.collection("families").doc(familyId);
    const famSnap = await famRef.get();
    if (!famSnap.exists) {
      return NextResponse.json({ error: "Famille introuvable" }, { status: 404 });
    }
    const fam = famSnap.data() as any;
    const oldEmail = (fam.parentEmail || "").trim().toLowerCase();

    // No-op si identique
    if (oldEmail === email) {
      return NextResponse.json({ ok: true, message: "Aucun changement (email identique)" });
    }

    // ── 2. Verifier que le nouvel email n'est pas pris par un AUTRE compte ──
    try {
      const existingUser = await adminAuth.getUserByEmail(email);
      // Un compte existe deja avec ce mail. On verifie si c'est le meme que
      // celui de l'ancien email (cas peu probable mais possible si la famille
      // a deja plusieurs providers). Si c'est un compte different, on refuse.
      let oldUid: string | null = null;
      if (oldEmail) {
        try {
          const oldUser = await adminAuth.getUserByEmail(oldEmail);
          oldUid = oldUser.uid;
        } catch { /* ancien compte inexistant, pas grave */ }
      }
      if (existingUser.uid !== oldUid) {
        return NextResponse.json({
          error: `L'adresse ${email} est deja utilisee par un autre compte. Impossible de l'attribuer a cette famille (risque de fusion de comptes).`,
        }, { status: 409 });
      }
    } catch (e: any) {
      // auth/user-not-found = le nouvel email est libre -> parfait, on continue
      if (e.code !== "auth/user-not-found") {
        console.error("change-family-email getUserByEmail(new):", e);
        return NextResponse.json({ error: "Erreur verification email" }, { status: 500 });
      }
    }

    // ── 3. Mettre a jour le compte Firebase Auth (si existant) ──
    let authUpdated = false;
    if (oldEmail) {
      try {
        const oldUser = await adminAuth.getUserByEmail(oldEmail);
        await adminAuth.updateUser(oldUser.uid, { email, emailVerified: true });
        authUpdated = true;
      } catch (e: any) {
        if (e.code === "auth/user-not-found") {
          // La famille n'a jamais active son compte -> pas de compte Firebase
          // a mettre a jour. On met juste Firestore a jour, le compte sera
          // cree au 1er lien magique sur le nouvel email.
          authUpdated = false;
        } else {
          console.error("change-family-email updateUser:", e);
          return NextResponse.json({ error: `Erreur mise a jour compte : ${e.message}` }, { status: 500 });
        }
      }
    }

    // ── 4. Mettre a jour Firestore ──
    await famRef.update({
      parentEmail: email,
      updatedAt: new Date().toISOString(),
    });

    // ── 5. Trace pour audit ──
    await adminDb.collection("email-changes").add({
      familyId,
      oldEmail: oldEmail || null,
      newEmail: email,
      authUpdated,
      changedBy: (auth as any)?.uid || "admin",
      changedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      authUpdated,
      message: authUpdated
        ? "Email de connexion et fiche mis a jour. La famille se connecte desormais avec le nouvel email."
        : "Fiche mise a jour. La famille n'avait pas encore de compte : il sera cree au 1er lien magique sur le nouvel email.",
    });
  } catch (e: any) {
    console.error("change-family-email fatal:", e);
    return NextResponse.json({ error: e?.message || "Erreur interne" }, { status: 500 });
  }
}
