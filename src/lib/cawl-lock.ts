import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Verrou anti-doublon pour les confirmations de paiement CAWL.
 *
 * Problème résolu : webhook CAWL et route /api/cawl/status peuvent être
 * déclenchés simultanément pour le même paiement (le webhook arrive
 * serveur-à-serveur pendant que le cavalier est redirigé vers le site).
 * Sans verrou, les deux peuvent passer un garde-fou basé sur
 * `status !== "paid"` et procéder en parallèle → double encaissement,
 * doubles points fidélité, email de confirmation en double, etc.
 *
 * Solution : une transaction Firestore sur la collection cawl_confirmations.
 * La première des deux routes qui écrit le document "gagne" et procède.
 * La seconde voit le doc déjà présent et s'abstient.
 *
 * La clé du lock est construite à partir de :
 *   - hostedCheckoutId (toujours présent, identifiant stable de la session)
 *   - stage : "full" pour un paiement complet, "deposit" pour un acompte,
 *             "balance" pour le solde d'un acompte précédent
 *
 * Note : cette collection ne remplace pas cawl_sessions (qui stocke le
 * RETURNMAC pour la vérification d'authenticité). C'est une collection
 * séparée dédiée au contrôle de concurrence.
 *
 * @returns true si le lock a été acquis (on peut procéder), false si une
 *          autre exécution a déjà traité cette confirmation (on s'abstient)
 */
export async function acquireCawlConfirmationLock(params: {
  hostedCheckoutId: string;
  stage: "full" | "deposit" | "balance";
  source: "webhook" | "status";
  paymentId?: string;
  amountCents?: number;
}): Promise<boolean> {
  const { hostedCheckoutId, stage, source, paymentId, amountCents } = params;

  if (!hostedCheckoutId) {
    console.warn("acquireCawlConfirmationLock: hostedCheckoutId manquant");
    return false;
  }

  const lockId = `${hostedCheckoutId}_${stage}`;
  const lockRef = adminDb.collection("cawl_confirmations").doc(lockId);

  try {
    const acquired = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(lockRef);
      if (snap.exists) {
        // Quelqu'un d'autre a déjà traité cette confirmation
        return false;
      }
      tx.set(lockRef, {
        hostedCheckoutId,
        stage,
        source,
        paymentId: paymentId || null,
        amountCents: amountCents ?? null,
        createdAt: FieldValue.serverTimestamp(),
      });
      return true;
    });

    if (acquired) {
      console.log(
        `🔒 CAWL lock acquis: ${lockId} (source=${source})`
      );
    } else {
      console.log(
        `⏸️  CAWL lock déjà détenu: ${lockId} — source=${source} s'abstient`
      );
    }
    return acquired;
  } catch (e) {
    console.error("acquireCawlConfirmationLock error:", e);
    // En cas d'erreur de transaction : par sécurité, on laisse passer
    // (pour ne pas bloquer un paiement légitime). Le garde-fou status
    // existant reste en place comme seconde barrière.
    return true;
  }
}
