/**
 * src/lib/cawl-inattendu.ts
 *
 * Un encaissement CAWL a abouti alors qu'il n'aurait pas dû : commande déjà
 * soldée (deux liens réglés), cumul au-delà du total, ou lien annulé par
 * l'administration. L'argent a été débité sur la carte de la famille — la
 * capture est immédiate — et le webhook se contentait d'un « déjà confirmé,
 * skip » dans les journaux serveur. Personne ne le voyait.
 *
 * Ici on l'écrit sur la commande, où l'onglet Paiements le montre avec le
 * montant à rembourser depuis le back-office CAWL.
 */

import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { COLLECTION_LIENS } from "@/lib/lien-paiement";
import { detecterEncaissementInattendu, type EncaissementInattendu } from "@/lib/lien-paiement-regles";

export interface EntreeInattendue extends EncaissementInattendu {
  /** Montant réellement encaissé par CAWL sur ce passage (euros). */
  montant: number;
  hostedCheckoutId: string;
  merchantRef?: string;
  source: "webhook" | "status";
  recuA: string;
  traite?: boolean;
}

/** Lecture de la session CAWL : le lien a-t-il été annulé par l'admin ? */
export async function sessionAnnulee(hostedCheckoutId: string): Promise<boolean> {
  if (!hostedCheckoutId) return false;
  try {
    const snap = await adminDb.collection("cawl_sessions").doc(hostedCheckoutId).get();
    return snap.exists && !!(snap.data() as any)?.annule;
  } catch {
    return false;
  }
}

/**
 * Examine l'encaissement et, s'il est inattendu, l'inscrit sur la commande.
 * Retourne la détection (null si tout est normal). Ne lève jamais : un échec
 * d'écriture ici ne doit pas faire échouer la confirmation elle-même.
 */
export async function signalerSiInattendu(args: {
  payRef: FirebaseFirestore.DocumentReference;
  statutCommande: string | undefined;
  totalTTC: number;
  dejaPaye: number;
  montant: number;
  hostedCheckoutId: string;
  merchantRef?: string;
  source: "webhook" | "status";
}): Promise<EncaissementInattendu | null> {
  const lienAnnule = await sessionAnnulee(args.hostedCheckoutId);
  const detection = detecterEncaissementInattendu({
    statutCommande: args.statutCommande,
    totalTTC: args.totalTTC,
    dejaPaye: args.dejaPaye,
    montant: args.montant,
    lienAnnule,
  });
  if (!detection) return null;

  const entree: EntreeInattendue = {
    ...detection,
    montant: Math.round((args.montant || 0) * 100) / 100,
    hostedCheckoutId: args.hostedCheckoutId,
    ...(args.merchantRef ? { merchantRef: args.merchantRef } : {}),
    source: args.source,
    recuA: new Date().toISOString(),
    traite: false,
  };
  try {
    await args.payRef.update({
      needsReview: true,
      encaissementsInattendus: FieldValue.arrayUnion(entree),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.warn(
      `⚠️ CAWL ${args.source}: encaissement inattendu (${entree.motif}) de ${entree.montant}€ ` +
      `sur ${args.payRef.id} — excédent ${entree.exces}€, hc=${args.hostedCheckoutId}`,
    );
  } catch (e) {
    console.error("cawl-inattendu: écriture impossible:", e);
  }
  return detection;
}

/** Le lien de cette session a été réglé : sa trace le dit. */
export async function marquerLienRegle(hostedCheckoutId: string): Promise<void> {
  if (!hostedCheckoutId) return;
  try {
    const sess = await adminDb.collection("cawl_sessions").doc(hostedCheckoutId).get();
    const lienId = sess.exists ? (sess.data() as any)?.lienId : "";
    const quand = new Date().toISOString();
    if (lienId) {
      await adminDb.collection(COLLECTION_LIENS).doc(lienId).update({ status: "paid", paidAt: quand });
      return;
    }
    // Trace antérieure à `lienId` : on la retrouve par la session.
    const snap = await adminDb.collection(COLLECTION_LIENS)
      .where("hostedCheckoutId", "==", hostedCheckoutId).limit(1).get();
    if (!snap.empty) await snap.docs[0].ref.update({ status: "paid", paidAt: quand });
  } catch (e) {
    console.warn("cawl-inattendu: lien non marqué réglé:", e);
  }
}
