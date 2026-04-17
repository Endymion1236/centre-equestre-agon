import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Attribue des points de fidélité à une famille après un encaissement.
 *
 * Règle métier (identique à celle de src/app/admin/paiements/page.tsx) :
 *   - 1 point par euro encaissé (Math.floor)
 *   - points expirent 1 an après leur attribution
 *   - feature-flag désactivable via settings/fidelite { enabled: false }
 *   - ne jamais attribuer sur un avoir/remboursement (filtrer côté appelant via le mode)
 *
 * À utiliser côté serveur (API routes, webhooks) avec firebase-admin.
 * Côté client admin, la logique inline de paiements/page.tsx reste la source de vérité.
 *
 * @param params
 * @returns true si points attribués, false si désactivé ou erreur non-bloquante
 */
export async function awardLoyaltyPointsServer(params: {
  familyId: string;
  familyName?: string;
  montant: number;       // montant encaissé en euros (positif)
  label?: string;        // ex: "Stage Pony Games" — affiché dans l'historique
}): Promise<boolean> {
  const { familyId, familyName, montant, label } = params;

  // Garde-fous : montant strictement positif et familyId présent
  if (!familyId || !montant || montant <= 0) {
    return false;
  }

  try {
    // Feature-flag : settings/fidelite { enabled: boolean }
    // Par défaut DÉSACTIVÉ si le doc n'existe pas (cohérent avec paiements/page.tsx)
    const settingsSnap = await adminDb.collection("settings").doc("fidelite").get();
    const fideliteEnabled = settingsSnap.exists
      ? (settingsSnap.data()?.enabled !== false)
      : false;

    if (!fideliteEnabled) {
      console.log(`Fidélité désactivée — pas de points attribués pour famille ${familyId}`);
      return false;
    }

    const pointsGagnes = Math.floor(montant);
    if (pointsGagnes <= 0) return false;

    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);

    const fidRef = adminDb.collection("fidelite").doc(familyId);
    const fidSnap = await fidRef.get();

    const historyEntry = {
      date: new Date().toISOString(),
      points: pointsGagnes,
      type: "gain",
      label: label || "Encaissement en ligne",
      expiry: expiry.toISOString(),
      montant,
    };

    if (fidSnap.exists) {
      const current = fidSnap.data() || {};
      await fidRef.update({
        points: ((current.points as number) || 0) + pointsGagnes,
        history: [...((current.history as any[]) || []), historyEntry],
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      await fidRef.set({
        familyId,
        familyName: familyName || "",
        points: pointsGagnes,
        history: [historyEntry],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    console.log(`✅ Fidélité : +${pointsGagnes} pts pour famille ${familyId} (${montant}€ — ${label || "—"})`);
    return true;
  } catch (e) {
    // Non-bloquant : un échec fidélité ne doit JAMAIS faire échouer la confirmation de paiement
    console.error("Erreur attribution points fidélité (serveur):", e);
    return false;
  }
}
