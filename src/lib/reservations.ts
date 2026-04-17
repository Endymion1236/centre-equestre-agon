import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Après confirmation d'un paiement (CAWL, avoir, etc.), passe en "confirmed"
 * toutes les réservations associées qui étaient encore en "pending_payment".
 *
 * Stratégie de matching (la résa ne référence pas le paymentId directement) :
 *   - Query Firestore sur (creneauId, childId) — index composite déjà défini
 *     dans firestore.indexes.json
 *   - Filtrage en mémoire sur familyId (pour tolérer sourceFamilyId sur les
 *     réservations liées) ET status == "pending_payment"
 *
 * Pourquoi pas un where(...).where(...).where(...).where(...) ?
 * Firestore exige un index composite pour chaque combinaison de where, et
 * rejette la query sinon. L'approche query+filter garantit que ça marche
 * sans déploiement d'index supplémentaire.
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

    if (pairs.length === 0) {
      console.log(
        `confirmReservationsForPayment: aucun pair à traiter pour family ${familyId} (items sans creneauId ?)`
      );
      return 0;
    }

    // Pour chaque pair : query sur l'index (creneauId, childId) existant,
    // puis filtrage en mémoire sur familyId + status
    for (const pair of pairs) {
      try {
        const snap = await adminDb
          .collection("reservations")
          .where("creneauId", "==", pair.creneauId)
          .where("childId", "==", pair.childId)
          .get();

        for (const doc of snap.docs) {
          const data = doc.data();
          // On tolère familyId direct ou sourceFamilyId (résa liée)
          const matchesFamily =
            data.familyId === familyId || data.sourceFamilyId === familyId;
          const isPending = data.status === "pending_payment";

          if (matchesFamily && isPending) {
            await doc.ref.update({
              status: "confirmed",
              confirmedAt: FieldValue.serverTimestamp(),
            });
            updated++;
          }
        }
      } catch (innerErr) {
        console.error(
          `confirmReservationsForPayment: erreur query pour pair ${JSON.stringify(pair)}:`,
          innerErr
        );
        // On continue avec les autres pairs — un échec isolé ne doit pas
        // bloquer la confirmation des autres réservations
      }
    }

    console.log(
      `confirmReservationsForPayment: ${updated}/${pairs.length} résa(s) confirmée(s) pour family ${familyId}`
    );
  } catch (e) {
    console.error("confirmReservationsForPayment error:", e);
  }

  return updated;
}

