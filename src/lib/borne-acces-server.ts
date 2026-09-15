/**
 * src/lib/borne-acces-server.ts
 *
 * Le garde des routes de la borne : lit les comptes déclarés
 * (`settings/borne`) et applique la règle de lib/borne-acces.
 *
 * Le réglage est mis en cache une minute par instance : ces routes sont
 * appelées à chaque phrase du visiteur, et le document ne change qu'au
 * moment où le club modifie ses réglages.
 */

import { NextRequest, NextResponse } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth, isAdminToken } from "@/lib/api-auth";
import { accesBorneAccorde, nettoyerComptes, DOC_REGLAGE_BORNE, MESSAGE_REFUS_BORNE } from "@/lib/borne-acces";

const CACHE_MS = 60_000;
let cache: { at: number; comptes: string[] } | null = null;

/** Comptes déclarés pour la borne. Jamais d'erreur remontée : à défaut, liste vide. */
export async function comptesBorneDeclares(force = false): Promise<string[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.comptes;
  try {
    const snap = await adminDb.collection("settings").doc(DOC_REGLAGE_BORNE).get();
    const comptes = nettoyerComptes(snap.exists ? (snap.data() as any)?.comptes : []);
    cache = { at: Date.now(), comptes };
    return comptes;
  } catch (e) {
    console.error("[borne-acces] lecture des comptes déclarés impossible :", e);
    return cache?.comptes || [];
  }
}

/**
 * Jeton du demandeur si la borne lui est ouverte, sinon la réponse d'erreur.
 * `strict` : refuser tant qu'aucun compte n'est déclaré (tableau du jour).
 */
export async function verifierAccesBorne(
  req: NextRequest,
  options?: { strict?: boolean },
): Promise<DecodedIdToken | NextResponse> {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const estStaff = isAdminToken(auth) || (auth as any).moniteur === true;
  const comptes = await comptesBorneDeclares();
  const decision = accesBorneAccorde({ estStaff, uid: auth.uid, email: auth.email, comptes, strict: options?.strict });
  if (!decision.ok) {
    console.warn(`[borne-acces] refus ${auth.email || auth.uid} (${comptes.length} compte(s) déclaré(s))`);
    return NextResponse.json({ error: MESSAGE_REFUS_BORNE, code: "borne_non_autorisee" }, { status: 403 });
  }
  return auth;
}
