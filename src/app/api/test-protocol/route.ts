/**
 * GET  /api/test-protocol — résultats du protocole de recette de l'appelant.
 * POST /api/test-protocol — les enregistre. Body : { results: {...} }
 *
 * Pourquoi une route serveur pour si peu : les résultats vivaient dans
 * settings/testProtocol_<uid>, or les règles Firestore ne laissent écrire dans
 * settings/ qu'un administrateur. La recette se faisant depuis un compte
 * FAMILLE, chaque case cochée partait dans le vide — sans message, puisque
 * l'échec n'était pas rattrapé : l'écran affichait « Sauvegarde… », et tout
 * était perdu au rechargement.
 *
 * Ici l'écriture passe par adminDb, dans une collection dédiée et cloisonnée
 * par identifiant de compte. Aucune règle Firestore à publier pour que ça
 * fonctionne — c'est le même parti pris que les messages du site.
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Un document par compte : personne ne lit ni n'écrase la recette d'un autre. */
const doc = (uid: string) => adminDb.collection("testProtocols").doc(uid);

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const snap = await doc(String((auth as any).uid)).get();
    return NextResponse.json({ results: snap.exists ? (snap.data() as any)?.results || {} : {} });
  } catch (e) {
    console.error("[test-protocol] lecture", e);
    return NextResponse.json({ error: "Erreur de lecture des résultats" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { results } = await req.json();
    if (!results || typeof results !== "object" || Array.isArray(results)) {
      return NextResponse.json({ error: "Résultats invalides" }, { status: 400 });
    }
    await doc(String((auth as any).uid)).set(
      {
        results,
        email: (auth as any).email || "",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[test-protocol] écriture", e);
    return NextResponse.json({ error: "Erreur d'enregistrement" }, { status: 500 });
  }
}
