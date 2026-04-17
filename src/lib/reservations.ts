import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Après confirmation d'un paiement (CAWL, avoir, etc.), passe en "confirmed"
 * toutes les réservations associées qui étaient encore en "pending_payment".
 *
 * Stratégie de matching (la résa ne référence pas le paymentId directement) :
 *   - familyId identique
 *   - childId identique
 *   - creneauId identique
 *   - status actuel == "pending_payment"
 *
 * Pour un stage multi-jours, chaque item.creneauIds est parcouru (un stage
 * crée une résa par jour).
 *
 * Non-bloquant : les erreurs sont loggées mais ne font pas échouer l'appelant.
 * Retourne le nombre de réservations mises à jour.
 */
export async function confirmReservationsForPayment(params: {
  familyId: string;
  items: any[];
}): Promise<number> {
  const { familyId, items } = params;
  if (!familyId || !Array.isArray(items) || items.length === 0) return 0;

  let updated = 0;

  try {
    // Collecter tous les (childId, creneauId) à confirmer
    const pairs: { childId: string; creneauId: string }[] = [];
    for (const item of items) {
      if (!item?.childId) continue;
      // Stage : liste de creneauIds
      if (Array.isArray(item.creneauIds) && item.creneauIds.length > 0) {
        for (const cid of item.creneauIds) {
          if (cid) pairs.push({ childId: item.childId, creneauId: cid });
        }
      } else if (item.creneauId) {
        pairs.push({ childId: item.childId, creneauId: item.creneauId });
      }
    }

    if (pairs.length === 0) return 0;

    // Pour chaque pair, chercher et mettre à jour les résas matchantes
    // (Firestore n'a pas de requête `IN` sur plusieurs champs combinés,
    //  donc on fait une requête par pair — acceptable pour quelques items)
    for (const pair of pairs) {
      const snap = await adminDb
        .collection("reservations")
        .where("familyId", "==", familyId)
        .where("childId", "==", pair.childId)
        .where("creneauId", "==", pair.creneauId)
        .where("status", "==", "pending_payment")
        .get();

      for (const doc of snap.docs) {
        await doc.ref.update({
          status: "confirmed",
          confirmedAt: FieldValue.serverTimestamp(),
        });
        updated++;
      }
    }

    if (updated > 0) {
      console.log(
        `✅ ${updated} réservation(s) confirmée(s) pour family ${familyId}`
      );
    }
  } catch (e) {
    console.error("confirmReservationsForPayment error:", e);
  }

  return updated;
}
