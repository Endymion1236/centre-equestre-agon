/**
 * POST /api/famille/lier-compte
 *
 * Rattache le compte Firebase qui appelle à une fiche famille pré-créée par
 * l'admin (même adresse email), et copie cette fiche sous l'identifiant du
 * compte.
 *
 * ── Pourquoi côté serveur ────────────────────────────────────────────────
 *
 * Ce rattachement se faisait dans le navigateur, à la première connexion :
 * requête `families where parentEmail == mon email`, puis `setDoc` de la
 * fiche entière sous l'uid. Deux problèmes.
 *
 * 1. Sécurité. La copie emportait `linkedChildren` — le champ qui autorise à
 *    réserver pour l'enfant d'une AUTRE famille. Comme le navigateur
 *    composait le document, il suffisait de créer sa propre fiche à la
 *    première connexion avec les `linkedChildren` de son choix pour
 *    s'attribuer n'importe quel enfant du club. Les règles interdisent
 *    désormais à une famille d'écrire ces champs ; c'est cette route, en
 *    Admin SDK, qui les reporte — après avoir vérifié que l'adresse du jeton
 *    correspond bien à la fiche.
 *
 * 2. Fiabilité. La requête par email était souvent refusée par les règles
 *    (le code le documentait lui-même : « permission-denied … bascule en
 *    création »), et une famille pré-inscrite par l'admin repartait alors sur
 *    une fiche vierge, sans ses enfants. L'Admin SDK ignore les règles : la
 *    recherche aboutit toujours.
 *
 * Réponse :
 *   { lie: true,  family }  → fiche rattachée (ou déjà rattachée)
 *   { lie: false }          → aucune fiche à cette adresse, au client de créer
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const uid: string = auth.uid;
  const email: string = (auth.email || "").toLowerCase().trim();

  try {
    // Déjà rattaché : rien à faire.
    const propre = await adminDb.collection("families").doc(uid).get();
    if (propre.exists) {
      return NextResponse.json({ lie: true, family: { id: uid, ...propre.data() } });
    }

    // Fiche pré-créée par l'admin, retrouvée sur l'adresse DU JETON — jamais
    // sur une adresse fournie par l'appelant.
    const snap = email
      ? await adminDb.collection("families")
          .where("parentEmail", "==", email)
          .limit(1)
          .get()
      : null;

    if (!snap || snap.empty) {
      // Aucune fiche pré-existante → on crée la fiche vierge ICI plutôt que
      // dans le navigateur. Les règles n'autorisent plus une famille à écrire
      // `parentEmail`, `authUid` ni `authProvider` : ces champs identifient le
      // compte, ils ne peuvent pas être déclarés par lui.
      const nouvelle = {
        parentName: auth.name || "",
        parentEmail: email,
        parentPhone: "",
        authProvider: auth.firebase?.sign_in_provider === "google.com" ? "google" : "facebook",
        authUid: uid,
        children: [],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      await adminDb.collection("families").doc(uid).set(nouvelle);
      console.log(`[lier-compte] nouvelle fiche pour ${email || uid}`);
      return NextResponse.json({ lie: true, cree: true, family: { id: uid, ...nouvelle } });
    }

    const ancienne = snap.docs[0];
    const data = ancienne.data() as Record<string, unknown>;

    const fiche = {
      ...data,
      authUid: uid,
      authProvider: auth.firebase?.sign_in_provider === "google.com" ? "google" : "facebook",
      parentName: data.parentName || auth.name || "",
      updatedAt: FieldValue.serverTimestamp(),
    };

    await adminDb.collection("families").doc(uid).set(fiche);

    // L'ancienne fiche ferait doublon dans toutes les listes admin. On ne la
    // supprime que si elle portait bien un autre identifiant.
    if (ancienne.id !== uid) {
      try {
        await ancienne.ref.delete();
      } catch (e) {
        console.warn(`[lier-compte] ancienne fiche ${ancienne.id} non supprimée (sera ignorée)`, e);
      }
    }

    console.log(`[lier-compte] ${email} → uid ${uid}`);
    return NextResponse.json({ lie: true, family: { id: uid, ...fiche } });
  } catch (e) {
    console.error("[lier-compte]", e);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
