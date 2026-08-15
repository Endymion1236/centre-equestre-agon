/**
 * src/app/admin/paiements/commande-edition.ts
 *
 * Enregistrement d'une commande modifiée depuis la modale « Modifier la
 * commande » : recalcul des tarifs dégressifs, désinscription des lignes
 * retirées, écriture du nouveau total, et avoir automatique si la famille
 * avait déjà trop payé.
 *
 * Pourquoi ce n'est pas un simple updateDoc : modifier une commande touche
 * trois choses qui doivent rester d'accord entre elles.
 *  1. Le PRIX des autres lignes. Les tarifs stages sont dégressifs par rang
 *     dans la famille — retirer l'aîné fait remonter les suivants d'un rang,
 *     et leur remise doit être recalculée, sinon la famille paie le tarif
 *     d'un enfant qu'elle n'a plus.
 *  2. Le PLANNING. Une ligne retirée doit retirer le cavalier des créneaux
 *     et des réservations, sinon il reste inscrit au stage sans être facturé.
 *  3. L'ARGENT DÉJÀ VERSÉ. Si le nouveau total est inférieur à ce qui a été
 *     payé, on ne rogne pas `paidAmount` en douce : la différence sort en
 *     avoir, tracée au journal, avec retrait des points de fidélité gagnés
 *     sur la part remboursée.
 *
 * La fonction ne touche pas à l'écran : elle renvoie les valeurs à réafficher
 * (nouveau total, statut, messages) et laisse la modale faire le rendu.
 */

import { collection, getDocs, addDoc, deleteDoc, updateDoc, doc, getDoc, serverTimestamp, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createEncaissement } from "@/lib/compta-encaissement";
import { fetchDiscountSettings, calculateFamilyDiscount, calculateMultiStageDiscount } from "@/lib/discounts";
import { retraitPointsFidelite } from "./fidelite-retrait";

/** Signature du toast fourni par la page (cf. useToast). */
type Toast = (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;

/**
 * ⚠️ `editItems` est modifié EN PLACE par le recalcul des rangs (splice) :
 * c'est le tableau d'état de la modale, et l'appelant le réutilise ensuite
 * pour rafraîchir la liste locale. Ne pas le remplacer par une copie sans
 * revoir l'appelant.
 */
export const enregistrerModificationCommande = async (
  editPayment: any,
  editItems: any[],
  toast: Toast,
): Promise<{
  newTotal: number;
  newPaid: number;
  newStatus: "paid" | "partial" | "pending";
  avoirMsg: string;
  priceRecalcMsg: string;
}> => {
  // ─── Recalcul des prix selon nouveaux rangs ─────────
  // Quand on supprime un enfant d'une commande payée, les autres
  // enfants 'remontent' en rang. Exemple : Eliot 1er, Ambre 2e,
  // John 3e. Si Eliot est supprimé : Ambre passe 1er, John 2e.
  // Les tarifs dégressifs doivent être recalculés en conséquence.
  const oldItemsForRank = editPayment.items || [];
  const removedChildIds = new Set(
    oldItemsForRank
      .filter((oi: any) =>
        !editItems.some(ni =>
          ni.childId === oi.childId &&
          (ni.creneauId === oi.creneauId || (ni.stageKey && ni.stageKey === oi.stageKey))
        )
      )
      .map((oi: any) => oi.childId)
  );

  let priceRecalcMsg = "";
  // Seulement recalculer si au moins un item supprimé ET il s'agit d'un stage
  // (la dégressivité famille s'applique uniquement aux stages dans une période vacances)
  const isStageContext = oldItemsForRank.some((oi: any) =>
    oi.activityType === "stage" || oi.activityType === "stage_journee" || oi.stageKey
  );
  if (removedChildIds.size > 0 && isStageContext) {
    try {
      const settings = await fetchDiscountSettings();
      // Recompose les "existingStages" du point de vue du nouveau rang :
      // chaque enfant conservé apparaît UNE FOIS dans l'ordre d'origine
      const orderedChildIds: string[] = [];
      for (const oi of oldItemsForRank) {
        if (removedChildIds.has(oi.childId)) continue;
        if (!orderedChildIds.includes(oi.childId)) {
          orderedChildIds.push(oi.childId);
        }
      }
      // Pour chaque item conservé : recalcul son prix selon son nouveau rang famille
      const recalculated = editItems.map((it: any) => {
        if (!it.childId) return it; // ligne libre (remise/ajustement) -> on touche pas
        const isStage = (it.activityType === "stage" || it.activityType === "stage_journee" || it.stageKey);
        if (!isStage) return it; // cours et autres -> pas concerné par dégressivité famille stage
        // Reconstituer existingStages comme si on inscrivait cet enfant
        // dans l'ordre orderedChildIds (donc enfants qui le précèdent dans l'ordre)
        const childIdx = orderedChildIds.indexOf(it.childId);
        if (childIdx < 0) return it;
        const previousChildIds = orderedChildIds.slice(0, childIdx);
        const fakeExistingStages = previousChildIds.map(cid => ({
          childId: cid,
          childName: "fake",
          familyId: editPayment.familyId,
          stageDate: "2026-01-01",
          stageTitle: "fake",
          creneauId: "fake",
          activityType: "stage" as const,
          activityTitle: "fake",
          date: "2026-01-01",
        } as any));
        const fd = calculateFamilyDiscount(fakeExistingStages, it.childId, settings.familyDiscount);
        // Prix de base = priceTTC actuel / (1 - ancien %)
        // Mais c'est plus simple de retrouver le prix plein depuis stageBasePrice si présent,
        // sinon estimer en remontant le pourcentage actuel.
        // Pour simplicité : si l'item a originalPrice, on l'utilise. Sinon on garde tel quel.
        const originalPrice = it.originalPriceTTC || it.originalPrice || it.priceBase || null;
        if (!originalPrice) return it; // pas d'info -> on ne touche pas (risque trop élevé)
        // Multi-stages : recalculer aussi si même enfant a plusieurs stages dans la commande
        const sameChildStages = editItems.filter((x: any) =>
          x.childId === it.childId &&
          (x.activityType === "stage" || x.activityType === "stage_journee" || x.stageKey)
        );
        const md = sameChildStages.length > 1
          ? calculateMultiStageDiscount(fakeExistingStages.filter(s => s.childId === it.childId), it.childId, settings.multiStageDiscount)
          : { percent: 0, nth: 1 };
        const totalPct = Math.min(fd.percent + md.percent, 50);
        let newPrice = Math.round((originalPrice * (100 - totalPct)) / 100 * 100) / 100;
        // Plancher
        if (settings.prixPlancherStage && newPrice < settings.prixPlancherStage) {
          newPrice = settings.prixPlancherStage;
        }
        // Mise à jour titre pour refléter la nouvelle réduction
        const baseTitle = (it.activityTitle || "").replace(/\s*\(-[\d.]+€\)$/, "").replace(/\s*—\s*\d+\.?\d*€$/, "");
        const remise = Math.round((originalPrice - newPrice) * 100) / 100;
        const newTitle = remise > 0 ? `${baseTitle} (-${remise.toFixed(2)}€)` : baseTitle;
        return {
          ...it,
          priceTTC: newPrice,
          priceHT: Math.round((newPrice / (1 + (it.tva || 5.5) / 100)) * 100) / 100,
          activityTitle: newTitle,
        };
      });
      // Si au moins un item a changé : on remplace
      const changedCount = recalculated.filter((r: any, i: number) => r.priceTTC !== editItems[i].priceTTC).length;
      if (changedCount > 0) {
        editItems.splice(0, editItems.length, ...recalculated);
        priceRecalcMsg = ` (${changedCount} prix recalculé${changedCount > 1 ? 's' : ''} selon nouveaux rangs)`;
      }
    } catch (recalcErr) {
      console.warn("[edit-payment] Recalcul rang échoué (non bloquant):", recalcErr);
    }
  }

  const newTotal = Math.round(editItems.reduce((s, i) => s + (i.priceTTC || 0), 0) * 100) / 100;
  const previousPaid = editPayment.paidAmount || 0;
  const overpayment = Math.round((previousPaid - newTotal) * 100) / 100;
  // Si trop-perçu : on garde paidAmount au niveau de newTotal
  // et on crée un avoir pour la différence (pas d'écrasement silencieux)
  const newPaid = Math.min(previousPaid, newTotal);
  const newStatus = newPaid >= newTotal ? "paid" : newPaid > 0 ? "partial" : "pending";

  // ─── Désinscription des items SUPPRIMÉS ─────────────
  // Identifie les items qui étaient présents avant et ne le sont
  // plus après modification. Pour chacun :
  // - Retire l'enfant des creneaux.enrolled[] (créneau principal + creneauIds[] pour stages)
  // - Supprime les réservations liées (creneauId match + childId match)
  // Sans ça, Eliot resterait inscrit dans le stage du 6 juillet en "non payé"
  // alors que sa ligne facture a été supprimée.
  const oldItems = editPayment.items || [];
  const removedItems = oldItems.filter((oi: any) => {
    // Match strict sur childId + creneauId (ou stageKey si stage multi-jours)
    return !editItems.some(ni =>
      ni.childId === oi.childId &&
      (ni.creneauId === oi.creneauId || (ni.stageKey && ni.stageKey === oi.stageKey))
    );
  });

  let creneauxUpdated = 0;
  let reservationsDeleted = 0;
  for (const removed of removedItems) {
    // Liste des creneaux concernés (cours = 1, stage = N jours)
    const creneauIds: string[] = removed.creneauIds && Array.isArray(removed.creneauIds) && removed.creneauIds.length > 0
      ? removed.creneauIds
      : (removed.creneauId ? [removed.creneauId] : []);

    for (const cid of creneauIds) {
      try {
        const cSnap = await getDoc(doc(db, "creneaux", cid));
        if (!cSnap.exists()) continue;
        const cData = cSnap.data();
        const enrolled = cData.enrolled || [];
        // On retire uniquement les inscriptions de CET enfant pour CETTE famille
        const newEnrolled = enrolled.filter((e: any) =>
          !(e.childId === removed.childId && e.familyId === editPayment.familyId)
        );
        if (newEnrolled.length !== enrolled.length) {
          await updateDoc(doc(db, "creneaux", cid), {
            enrolled: newEnrolled,
            enrolledCount: newEnrolled.length,
          });
          creneauxUpdated++;
        }
      } catch (e) {
        console.error(`[edit-payment] Désinscription créneau ${cid} échouée:`, e);
      }

      // Supprimer les réservations correspondantes
      try {
        const resaSnap = await getDocs(query(
          collection(db, "reservations"),
          where("familyId", "==", editPayment.familyId),
          where("childId", "==", removed.childId),
          where("creneauId", "==", cid),
        ));
        for (const r of resaSnap.docs) {
          await deleteDoc(r.ref);
          reservationsDeleted++;
        }
      } catch (e) {
        console.error(`[edit-payment] Suppression réservation échouée:`, e);
      }
    }
  }
  if (removedItems.length > 0) {
    console.log(`[edit-payment] ${removedItems.length} item(s) retiré(s) → ${creneauxUpdated} créneau(x) mis à jour, ${reservationsDeleted} réservation(s) supprimée(s)`);
  }

  await updateDoc(doc(db, "payments", editPayment.id), {
    items: editItems,
    totalTTC: newTotal,
    paidAmount: newPaid,
    status: newStatus,
    updatedAt: serverTimestamp(),
  });

  // Création automatique d'un avoir si trop-perçu
  let avoirMsg = "";
  if (overpayment > 0) {
    try {
      // Reference + expiration cohérentes avec les autres créations d'avoir
      // (voir commande-annulation.ts pour le format de référence)
      const avoirRef_str = `AV-${Date.now().toString(36).toUpperCase()}`;
      const avoirExpiry = new Date();
      avoirExpiry.setFullYear(avoirExpiry.getFullYear() + 1);

      const avoirRef = await addDoc(collection(db, "avoirs"), {
        familyId: editPayment.familyId,
        familyName: editPayment.familyName,
        type: "avoir",
        amount: overpayment,
        usedAmount: 0,
        remainingAmount: overpayment,
        reason: `Trop-perçu suite modification commande ${editPayment.orderId || editPayment.id.slice(-6)} (total ${(editPayment.totalTTC || 0).toFixed(2)}€ → ${newTotal.toFixed(2)}€)`,
        reference: avoirRef_str,
        sourcePaymentId: editPayment.id,
        sourceType: "trop_percu",
        expiryDate: avoirExpiry,
        status: "actif", // IMPORTANT: 'actif' (fr) et non 'active' (en) — la page Avoirs filtre sur 'actif'
        usageHistory: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      avoirMsg = ` — Avoir de ${overpayment.toFixed(2)}€ créé (réf. ${avoirRef_str})`;

      // Trace dans le journal des encaissements (montant négatif = avoir)
      // Cohérent avec executerAnnulation (commande-annulation.ts) : permet à l'avoir
      // d'apparaître dans le Journal et de tracer le trop-perçu.
      try {
        await createEncaissement({
          paymentId: editPayment.id,
          familyId: editPayment.familyId,
          familyName: editPayment.familyName,
          montant: -overpayment,
          mode: "avoir",
          modeLabel: "Avoir (trop-perçu suite modification)",
          ref: avoirRef_str,
          activityTitle: (editItems || []).map((i: any) => i.activityTitle).join(", "),
          isAvoir: true,
          avoirRef: avoirRef_str,
        });
        // Retrait des points de fidelite proportionnel au trop-percu
        await retraitPointsFidelite(editPayment.familyId, overpayment, `Trop-perçu suite modification ${avoirRef_str}`);
      } catch (encErr) {
        console.error("[paiements] échec trace encaissement avoir:", encErr);
      }
    } catch (avoirErr) {
      console.error("[paiements] échec création avoir trop-perçu:", avoirErr);
      toast(`⚠️ Commande modifiée mais avoir non créé — à faire manuellement (${overpayment.toFixed(2)}€)`, "warning");
    }
  }

  return { newTotal, newPaid, newStatus, avoirMsg, priceRecalcMsg };
};
