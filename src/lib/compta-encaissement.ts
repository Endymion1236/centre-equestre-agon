/**
 * Helper centralisé pour la création d'encaissements conformes (loi anti-fraude
 * TVA 2018 / NF525).
 *
 * Chaque encaissement est horodaté, signé par un hash SHA-256 des champs
 * comptables, et chaîné au hash de l'encaissement précédent (mécanisme
 * type blockchain léger).
 *
 * Usage :
 *   import { createEncaissement } from "@/lib/compta-encaissement";
 *   await createEncaissement({
 *     paymentId: "...",
 *     familyId: "...",
 *     familyName: "...",
 *     montant: 45.00,
 *     mode: "especes",
 *     modeLabel: "Espèces",
 *     activityTitle: "Stage Pâques",
 *     // autres champs optionnels : ref, raison, correctionDe
 *   });
 *
 * Le helper s'occupe de :
 * 1. Récupérer le hash du dernier encaissement (pour chaînage)
 * 2. Calculer le hash de ce nouvel encaissement
 * 3. Créer le document avec serverTimestamp + hash + previousHash
 *
 * En cas d'erreur de calcul du hash (ex: crypto non dispo), on log mais on
 * n'empêche pas l'écriture — l'intégrité comptable prime sur le hash (qui
 * est une sécurité supplémentaire, pas la seule).
 */

import {
  addDoc, collection, getDocs, query, orderBy, limit, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { hashEncaissement } from "@/lib/compta-hash";

export interface NewEncaissement {
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
  /**
   * Date explicite (pour les déclarations rétroactives où la date n'est pas
   * celle de la saisie). Si omis, serverTimestamp() est utilisé.
   */
  explicitDate?: Date;
  // Champs métier additionnels transmis tel quel
  [k: string]: any;
}

/**
 * Retourne le hash du dernier encaissement enregistré (tout mode confondu).
 * Utilisé comme previousHash pour chaîner les signatures.
 * Retourne null si aucun encaissement en base (cas du tout premier).
 */
async function getLastEncaissementHash(): Promise<string | null> {
  try {
    const q = query(
      collection(db, "encaissements"),
      orderBy("date", "desc"),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0].data() as any;
    return d.hash || null; // peut être absent pour les encaissements antérieurs à la mise en place du hashing
  } catch (e) {
    console.warn("[compta-encaissement] Impossible de récupérer le hash précédent:", e);
    return null;
  }
}

/**
 * Crée un encaissement signé + chaîné en base.
 * Retourne l'ID Firestore du document créé.
 */
export async function createEncaissement(data: NewEncaissement): Promise<string> {
  const previousHash = await getLastEncaissementHash();

  // Date utilisée pour le hash : explicite si fournie, sinon now (approximation
  // de serverTimestamp qui sera résolu côté serveur — on accepte un léger écart
  // de quelques ms pour bénéficier de la commodité du hash).
  const dateForHash = data.explicitDate || new Date();
  const dateIso = dateForHash.toISOString();

  let hash: string | null = null;
  try {
    hash = await hashEncaissement({
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
    console.warn("[compta-encaissement] Calcul hash échoué, encaissement créé sans hash:", e);
  }

  const { explicitDate, ...rest } = data;
  const payload: any = {
    ...rest,
    date: explicitDate ? Timestamp.fromDate(explicitDate) : serverTimestamp(),
    dateIso,
  };
  if (hash) {
    payload.hash = hash;
    payload.previousHash = previousHash;
  }

  const ref = await addDoc(collection(db, "encaissements"), payload);
  return ref.id;
}
