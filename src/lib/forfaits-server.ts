import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Crée les forfaits annuels rattachés à un paiement CB confirmé.
 *
 * Contexte : les règles Firestore réservent l'écriture de la collection
 * `forfaits` au staff (`write: if isAdmin()`). Une famille ne peut donc pas
 * créer son forfait elle-même. Lors d'une inscription annuelle réglée en CB,
 * le client stocke les payloads des forfaits sur le doc `payments`
 * (champ `forfaitPayloads`). La création effective se fait ici, côté serveur
 * (admin SDK, bypass des règles), au moment où le paiement est confirmé par
 * le webhook ou la route status CAWL.
 *
 * Anti-doublon : un `paymentId` est posé sur chaque forfait créé. Si des
 * forfaits existent déjà pour ce paiement, on n'en recrée pas (idempotent vis
 * à vis des éventuels appels multiples webhook + status).
 *
 * Non-bloquant : les erreurs sont loggées mais ne font pas échouer l'appelant.
 * Retourne le nombre de forfaits créés.
 */
export async function createForfaitsForPayment(params: {
  paymentId: string;
  forfaitPayloads: any[];
}): Promise<number> {
  const { paymentId, forfaitPayloads } = params;
  if (!paymentId || !Array.isArray(forfaitPayloads) || forfaitPayloads.length === 0) return 0;

  let created = 0;
  try {
    // Anti-doublon : forfaits déjà rattachés à ce paiement ?
    const existing = await adminDb
      .collection("forfaits")
      .where("paymentId", "==", paymentId)
      .limit(1)
      .get();
    if (!existing.empty) {
      console.log(`createForfaitsForPayment: forfaits déjà créés pour ${paymentId}, skip`);
      return 0;
    }

    for (const fp of forfaitPayloads) {
      if (!fp || typeof fp !== "object") continue;
      try {
        await adminDb.collection("forfaits").add({
          ...fp,
          paymentId,
          createdAt: FieldValue.serverTimestamp(),
        });
        created++;
      } catch (e) {
        console.error("createForfaitsForPayment add:", e);
      }
    }
    if (created > 0) {
      console.log(`✅ ${created} forfait(s) créé(s) pour le paiement ${paymentId}`);
    }
  } catch (e) {
    console.error("createForfaitsForPayment:", e);
  }
  return created;
}
