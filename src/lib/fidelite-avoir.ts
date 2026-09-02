/**
 * src/lib/fidelite-avoir.ts
 *
 * Le retrait de points de fidélité quand un avoir est émis.
 *
 * Cette fonction vivait dans l'écran des paiements, alors que la modale de
 * modification d'une commande en a besoin elle aussi : deux endroits où l'on
 * rembourse, une seule règle de reprise des points.
 */

import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Retire des points de fidelite d'une famille lors d'un avoir/remboursement.
 *
 * Regle metier : un avoir cree pour trop-percu ou annulation doit retirer les
 * points qui avaient ete gagnes sur la portion remboursee. Math.floor du montant
 * comme pour le gain (1 point = 1 euro).
 *
 * Garde-fou : le solde de points ne descend jamais en dessous de 0 (si l'avoir
 * couvre plus de points que ce que la famille a, on cap a 0).
 *
 * Non-bloquant : erreur silencieuse, ne fait pas planter le flow d'avoir.
 */
export async function retraitPointsFidelite(familyId: string, montantAvoir: number, label: string) {
  if (!familyId || !montantAvoir || montantAvoir <= 0) return;
  try {
    const settingsSnap = await getDoc(doc(db, "settings", "fidelite"));
    const enabled = settingsSnap.exists() ? (settingsSnap.data()?.enabled !== false) : false;
    if (!enabled) return;
    const pointsRetires = Math.floor(montantAvoir);
    if (pointsRetires <= 0) return;
    const fidRef = doc(db, "fidelite", familyId);
    const fidSnap = await getDoc(fidRef);
    if (!fidSnap.exists()) return; // pas de solde fidelite -> rien a retirer
    const current = fidSnap.data() || {};
    const currentPoints = (current.points as number) || 0;
    // Cap a 0 : on ne va jamais en negatif (cas ou la famille a deja consomme)
    const newPoints = Math.max(0, currentPoints - pointsRetires);
    const reellementRetires = currentPoints - newPoints;
    await updateDoc(fidRef, {
      points: newPoints,
      history: [...((current.history as any[]) || []), {
        date: new Date().toISOString(),
        points: -reellementRetires,
        type: "retrait_avoir",
        label,
        montant: -montantAvoir,
      }],
      updatedAt: serverTimestamp(),
    });
    console.log(`[fidelite] -${reellementRetires} pts pour famille ${familyId} (avoir ${montantAvoir}€ — ${label})`);
  } catch (e) {
    console.error("[fidelite] retrait avoir échoué (non-bloquant):", e);
  }
}
