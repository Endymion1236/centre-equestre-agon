/**
 * Variante server-side de createEncaissement, utilisant le Firebase Admin SDK
 * (adminDb). À utiliser dans les routes API (webhooks CAWL, etc.).
 *
 * Fonctionne de la même façon que la version client :
 * 1. Récupère le hash du dernier encaissement
 * 2. Calcule le hash du nouvel encaissement (chaînage)
 * 3. Crée le document avec serverTimestamp + hash + previousHash
 *
 * IMPORTANT : ce helper bypasse les règles Firestore (admin SDK), il ne doit
 * être appelé que depuis des routes API server-side de confiance.
 */

import { createHash } from "crypto";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export interface ServerEncaissement {
  paymentId?: string;
  familyId?: string;
  familyName?: string;
  montant: number;
  mode: string;
  modeLabel?: string;
  ref?: string;
  activityTitle?: string;
  raison?: string;
  correctionDe?: string;
  explicitDate?: Date;
  [k: string]: any;
}

/**
 * Version Node.js du hash SHA-256 (même algorithme que côté client).
 * L'algorithme est identique : SHA-256 hex de la chaîne "field1|field2|...".
 */
function hashEncaissementServer(enc: {
  paymentId?: string;
  familyId?: string;
  familyName?: string;
  montant: number;
  mode: string;
  modeLabel?: string;
  ref?: string;
  activityTitle?: string;
  raison?: string;
  correctionDe?: string;
  dateIso: string;
  previousHash?: string;
}): string {
  const payload = [
    enc.paymentId || "",
    enc.familyId || "",
    enc.familyName || "",
    enc.montant.toFixed(2),
    enc.mode,
    enc.modeLabel || "",
    enc.ref || "",
    enc.activityTitle || "",
    enc.raison || "",
    enc.correctionDe || "",
    enc.dateIso,
    enc.previousHash || "",
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

async function getLastEncaissementHashServer(): Promise<string | null> {
  try {
    const snap = await adminDb
      .collection("encaissements")
      .orderBy("date", "desc")
      .limit(1)
      .get();
    if (snap.empty) return null;
    return (snap.docs[0].data() as any).hash || null;
  } catch (e) {
    console.warn("[compta-encaissement-server] getLastEncaissementHashServer failed:", e);
    return null;
  }
}

/**
 * Crée un encaissement signé + chaîné (server-side).
 * Retourne l'ID Firestore du document créé.
 */
export async function createEncaissementServer(data: ServerEncaissement): Promise<string> {
  const previousHash = await getLastEncaissementHashServer();

  const dateForHash = data.explicitDate || new Date();
  const dateIso = dateForHash.toISOString();

  let hash: string | null = null;
  try {
    hash = hashEncaissementServer({
      paymentId: data.paymentId,
      familyId: data.familyId,
      familyName: data.familyName,
      montant: data.montant,
      mode: data.mode,
      modeLabel: data.modeLabel,
      ref: data.ref,
      activityTitle: data.activityTitle,
      raison: data.raison,
      correctionDe: data.correctionDe,
      dateIso,
      previousHash: previousHash || undefined,
    });
  } catch (e) {
    console.warn("[compta-encaissement-server] hash failed:", e);
  }

  const { explicitDate, ...rest } = data;
  const payload: any = {
    ...rest,
    date: explicitDate ? Timestamp.fromDate(explicitDate) : FieldValue.serverTimestamp(),
    dateIso,
  };
  if (hash) {
    payload.hash = hash;
    payload.previousHash = previousHash;
  }

  const ref = await adminDb.collection("encaissements").add(payload);
  return ref.id;
}
