/**
 * src/app/admin/paiements/commande-annulation.ts
 *
 * Les trois façons de défaire une commande : la supprimer, l'annuler avec
 * répartition avoir / remboursement, ou n'en retirer qu'une ligne.
 *
 * La règle qui gouverne tout le fichier : NON ENCAISSÉ = supprimable,
 * ENCAISSÉ = jamais supprimé. Dès qu'un euro est entré, la commande reste en
 * base marquée `cancelled` et l'argent ressort par un avoir et/ou un
 * remboursement tracé au journal. Une facture numérotée n'est jamais
 * supprimée non plus, même à zéro euro : la séquence de numéros doit rester
 * continue (obligation légale).
 *
 * Ces fonctions ne connaissent pas React : tout ce qui touche à l'écran
 * (toast, rafraîchissement, ouverture de la modale de répartition) leur est
 * passé en paramètre explicite. C'est ce qui permet de les sortir de la page
 * sans changer un seul de leurs enchaînements Firestore.
 */

import { collection, getDocs, addDoc, deleteDoc, updateDoc, doc, serverTimestamp, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createEncaissement } from "@/lib/compta-encaissement";
import { authFetch } from "@/lib/auth-fetch";
import { MODE_REMB_LABEL, MOTIF_LABEL } from "./constants";
import { retraitPointsFidelite } from "./fidelite-retrait";
import { unenrollPaymentItem } from "./desinscription";

/** Signature du toast fourni par la page (cf. useToast). */
type Toast = (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;

/** Rafraîchissement des données de la page, ciblé si des ids sont fournis. */
type RefreshAll = (changedPaymentIds?: string[]) => Promise<void>;

// ═══ SUPPRESSION / MODIFICATION DE COMMANDE ═══
// Règle : non encaissé = supprimable, encaissé = avoir automatique

/**
 * Supprime (ou annule) une commande entière.
 *
 * `totalEnc` est le montant déjà encaissé, calculé par l'appelant depuis le
 * journal. S'il est non nul, la fonction n'écrit rien : elle passe la main à
 * la modale de répartition avoir / remboursement (`ouvrirModaleAnnulation`),
 * qui appellera ensuite `executerAnnulation`.
 */
export const supprimerCommande = async (
  payment: any,
  totalEnc: number,
  toast: Toast,
  refreshAll: RefreshAll,
  ouvrirModaleAnnulation: (etat: { payment: any; encaisse: number; lignes: string[] }) => void,
) => {
  const hasInscriptions = (payment.items || []).some((i: any) => i.childId && (i.creneauId || i.activityType));
  const isForfait = (payment as any).forfaitType || (payment.items || []).some((i: any) => i.activityTitle?.includes("Forfait"));
  const inscriptionMsg = hasInscriptions || isForfait ? "\n\n⚠️ Les cavaliers seront aussi désinscrits des créneaux associés." : "";

  if (totalEnc === 0) {
    // Si c'est une facture définitive (invoiceNumber), on ne peut pas supprimer → annuler avec avoir à 0
    if ((payment as any).invoiceNumber) {
      if (!confirm(`Annuler la facture ${(payment as any).invoiceNumber} de ${payment.familyName} ?\n\n${(payment.items || []).map((i: any) => `• ${i.childName || ""} — ${i.activityTitle}`).join("\n")}\n\nLa facture sera marquée annulée (non supprimée — obligation légale).${inscriptionMsg}`)) return;

      // Désinscrire
      if (isForfait) {
        const childIds = [...new Set((payment.items || []).filter((i: any) => i.childId).map((i: any) => i.childId))];
        for (const childId of childIds) {
          const childName = (payment.items || []).find((i: any) => i.childId === childId)?.childName || "";
          try { await authFetch("/api/admin/unenroll-annual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ childId, childName, familyId: payment.familyId }) }); } catch (e) { console.error(e); }
        }
      } else {
        for (const item of payment.items || []) await unenrollPaymentItem(payment, item);
      }

      await updateDoc(doc(db, "payments", payment.id), {
        status: "cancelled", cancelledAt: serverTimestamp(),
        cancelReason: "Annulation facture (non encaissée)",
        originalTotalTTC: payment.totalTTC || 0,
        updatedAt: serverTimestamp(),
      });
      toast(`Facture ${(payment as any).invoiceNumber} annulée`, "success");
      await refreshAll([payment.id]);
      return;
    }

    if (!confirm(`Annuler l'inscription de ${payment.familyName} ?\n\n${(payment.items || []).map((i: any) => `• ${i.childName || ""} — ${i.activityTitle}`).join("\n")}\n\nTotal : ${(payment.totalTTC || 0).toFixed(2)}€ (non encaissé)${inscriptionMsg}`)) return;

    // Pour les forfaits annuels : désinscription en masse via API
    if (isForfait) {
      const childIds = [...new Set((payment.items || []).filter((i: any) => i.childId).map((i: any) => i.childId))];
      for (const childId of childIds) {
        const childName = (payment.items || []).find((i: any) => i.childId === childId)?.childName || "";
        try {
          await authFetch("/api/admin/unenroll-annual", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ childId, childName, familyId: payment.familyId }),
          });
        } catch (e) { console.error("Erreur désinscription annuelle:", e); }
      }
    } else {
      // Désinscrire avant suppression (ponctuel/stage)
      for (const item of payment.items || []) await unenrollPaymentItem(payment, item);
    }

    await deleteDoc(doc(db, "payments", payment.id));

    // Annuler les autres échéances liées si c'est un paiement échelonné
    if ((payment as any).echeancesTotal > 1) {
      try {
        const echeancesSnap = await getDocs(query(
          collection(db, "payments"),
          where("familyId", "==", payment.familyId),
          where("forfaitRef", "==", (payment as any).forfaitRef)
        ));
        for (const d of echeancesSnap.docs) {
          if (d.id !== payment.id && d.data().status !== "paid") {
            await deleteDoc(doc(db, "payments", d.id));
          }
        }
      } catch (e) { console.error("Erreur suppression échéances:", e); }
    }

    toast(`${payment.familyName} — inscription annulée et cavaliers désinscrits`, "success");
  } else {
    // Encaissé → la répartition avoir / remboursement se choisit dans la
    // modale : les CGV prévoient trois issues, un avoir systématique n'en
    // couvrait qu'une.
    ouvrirModaleAnnulation({
      payment,
      encaisse: totalEnc,
      lignes: (payment.items || []).map((i: any) => `${i.childName || ""} — ${i.activityTitle}`.trim()),
    });
    return;
  }
};

/**
 * Applique l'annulation une fois la répartition validée.
 *
 * `data` vient d'AnnulationModal : combien part en avoir, combien est
 * réellement remboursé, par quel moyen et pour quel motif. Le reste — ce qui
 * n'est ni rendu ni transformé en avoir — est conservé par le club, et
 * apparaît tel quel dans le toast de fin.
 */
export const executerAnnulation = async (
  payment: any,
  totalEnc: number,
  data: { avoir: number; rembourse: number; modeRemboursement: string; motif: string; commentaire: string },
  toast: Toast,
  refreshAll: RefreshAll,
) => {
  {
    const isForfait = (payment as any).forfaitType
      || (payment.items || []).some((i: any) => i.activityTitle?.includes("Forfait"));

    // Marquer cancelled d'abord pour éviter double-traitement
    await updateDoc(doc(db, "payments", payment.id), {
      status: "cancelled",
      cancelledAt: serverTimestamp(),
      cancelReason: "Annulation manuelle",
      originalTotalTTC: payment.totalTTC || 0,
      updatedAt: serverTimestamp(),
    });

    // Désinscrire chaque cavalier (erreurs silencieuses pour ne pas bloquer l'avoir)
    let unenrollErrors = 0;
    if (isForfait) {
      // Forfait annuel : désinscription en masse
      const childIds = [...new Set((payment.items || []).filter((i: any) => i.childId).map((i: any) => i.childId))];
      for (const childId of childIds) {
        const childName = (payment.items || []).find((i: any) => i.childId === childId)?.childName || "";
        try {
          await authFetch("/api/admin/unenroll-annual", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ childId, childName, familyId: payment.familyId }),
          });
        } catch (e) { console.error("Erreur désinscription annuelle:", e); unenrollErrors++; }
      }
    } else {
      for (const item of payment.items || []) {
        try { await unenrollPaymentItem(payment, item); }
        catch (e) { console.error("Erreur désinscription item:", item.activityTitle, e); unenrollErrors++; }
      }
    }

    const ref = `AV-${Date.now().toString(36).toUpperCase()}`;
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);

    const avoirAmount = Math.round(data.avoir * 100) / 100;
    const avoirReason = `Annulation (${MOTIF_LABEL[data.motif] || data.motif}) — ` +
      `${(payment.items || []).map((i: any) => i.activityTitle).join(", ").slice(0, 50)}` +
      `${data.commentaire ? ` · ${data.commentaire}` : ""}`;

    if (avoirAmount > 0) await addDoc(collection(db, "avoirs"), {
      familyId: payment.familyId,
      familyName: payment.familyName,
      type: "avoir",
      amount: avoirAmount,
      usedAmount: 0,
      remainingAmount: avoirAmount,
      reason: avoirReason,
      reference: ref,
      sourcePaymentId: payment.id,
      sourceType: "annulation",
      expiryDate: expiry,
      status: "actif",
      usageHistory: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Remboursement réellement rendu à la famille. Enregistré en négatif
    // avec son mode réel : sans cette écriture, le rapprochement bancaire
    // verrait un débit qu'il ne saurait rattacher à rien.
    if (data.rembourse > 0) {
      const refRemb = `RB-${Date.now().toString(36).toUpperCase()}`;
      await createEncaissement({
        paymentId: payment.id,
        familyId: payment.familyId,
        familyName: payment.familyName,
        montant: -Math.round(data.rembourse * 100) / 100,
        mode: `remboursement_${data.modeRemboursement}`,
        modeLabel: `Remboursement ${MODE_REMB_LABEL[data.modeRemboursement] || data.modeRemboursement}`,
        ref: refRemb,
        activityTitle: (payment.items || []).map((i: any) => i.activityTitle).join(", "),
        raison: avoirReason,
      });
      await retraitPointsFidelite(payment.familyId, data.rembourse, `Remboursement ${refRemb}`);
    }

    // Trace dans le journal des encaissements (montant négatif = avoir)
    if (avoirAmount > 0) await createEncaissement({
      paymentId: payment.id,
      familyId: payment.familyId,
      familyName: payment.familyName,
      montant: -avoirAmount,
      mode: "avoir",
      modeLabel: "Avoir (annulation)",
      ref: ref,
      activityTitle: (payment.items || []).map((i: any) => i.activityTitle).join(", "),
      isAvoir: true,
      avoirRef: ref,
    });

    // Retrait des points de fidelite (1 pt par euro de l'avoir)
    if (avoirAmount > 0) await retraitPointsFidelite(payment.familyId, avoirAmount, `Annulation ${ref}`);

    // Places liberees : proposer automatiquement chacune a la premiere
    // famille en attente (24h de priorite). Meilleur effort — un echec
    // ici ne doit pas faire echouer l'annulation elle-meme.
    try {
      const creneauxLiberes = [...new Set((payment.items || [])
        .flatMap((i: any) => i.creneauIds || (i.creneauId ? [i.creneauId] : [])))];
      for (const cid of creneauxLiberes) {
        authFetch("/api/waitlist/propose", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creneauId: cid }),
        }).catch(() => {});
      }
    } catch {}

    const warnMsg = unenrollErrors > 0 ? ` — ⚠️ ${unenrollErrors} désinscription(s) à vérifier` : "";
    const parts: string[] = [];
    if (avoirAmount > 0) parts.push(`avoir ${avoirAmount.toFixed(2)}€ (${ref})`);
    if (data.rembourse > 0) parts.push(`remboursement ${data.rembourse.toFixed(2)}€ à effectuer`);
    const conserve = Math.round((totalEnc - avoirAmount - data.rembourse) * 100) / 100;
    if (conserve > 0.01) parts.push(`${conserve.toFixed(2)}€ conservés`);
    toast(`Commande annulée — ${parts.join(" · ") || "aucun mouvement"}${warnMsg}`);
  }
  await refreshAll([payment.id]);
};

/**
 * Retire UNE ligne d'une commande (une prestation, un cavalier).
 *
 * Même règle que pour la commande entière : si rien n'a été encaissé la
 * ligne disparaît (et la commande avec, s'il ne reste rien) ; si de l'argent
 * est déjà entré, la différence devient un avoir de trop-perçu plutôt qu'un
 * `paidAmount` rogné en silence.
 */
export const retirerLigneCommande = async (
  payment: any,
  itemIndex: number,
  totalEnc: number,
  refreshAll: RefreshAll,
) => {
  const items = payment.items || [];
  const itemToRemove = items[itemIndex];
  if (!itemToRemove) return;

  const newItems = items.filter((_: any, i: number) => i !== itemIndex);
  const newTotal = newItems.reduce((s: number, i: any) => s + (i.priceTTC || 0), 0);

  if (totalEnc === 0) {
    const hasInscription = itemToRemove.childId && (itemToRemove.creneauId || itemToRemove.activityType);
    if (!confirm(`Désinscrire${itemToRemove.childName ? ` ${itemToRemove.childName} de` : ""} "${itemToRemove.activityTitle}" (${(itemToRemove.priceTTC || 0).toFixed(2)}€) ?${hasInscription ? "\n\n⚠️ Le cavalier sera désinscrit du créneau." : ""}`)) return;

    // Désinscrire l'enfant du créneau
    await unenrollPaymentItem(payment, itemToRemove);

    if (newItems.length === 0) {
      await deleteDoc(doc(db, "payments", payment.id));
    } else {
      await updateDoc(doc(db, "payments", payment.id), {
        items: newItems,
        totalTTC: Math.round(newTotal * 100) / 100,
        updatedAt: serverTimestamp(),
      });
    }
  } else {
    // Encaissé → avoir du trop-perçu si nécessaire
    const tropPercu = totalEnc - newTotal;
    const hasInscription = itemToRemove.childId && (itemToRemove.creneauId || itemToRemove.activityType);
    const msg = tropPercu > 0
      ? `Retirer "${itemToRemove.activityTitle}" ?\n\n${tropPercu.toFixed(2)}€ de trop-perçu → un avoir sera créé.${hasInscription ? "\n\n⚠️ Le cavalier sera aussi désinscrit." : ""}`
      : `Retirer "${itemToRemove.activityTitle}" ?${hasInscription ? "\n\n⚠️ Le cavalier sera aussi désinscrit." : ""}`;
    if (!confirm(msg)) return;

    // Désinscrire l'enfant du créneau
    await unenrollPaymentItem(payment, itemToRemove);

    if (tropPercu > 0) {
      const ref = `AV-${Date.now().toString(36).toUpperCase()}`;
      const expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 1);
      const tropPercuAmount = Math.round(tropPercu * 100) / 100;

      await addDoc(collection(db, "avoirs"), {
        familyId: payment.familyId,
        familyName: payment.familyName,
        type: "avoir",
        amount: tropPercuAmount,
        usedAmount: 0,
        remainingAmount: tropPercuAmount,
        reason: `Retrait prestation — ${itemToRemove.activityTitle}`,
        reference: ref,
        sourcePaymentId: payment.id,
        sourceType: "retrait_prestation",
        expiryDate: expiry,
        status: "actif",
        usageHistory: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Trace dans le journal des encaissements (montant négatif = avoir)
      await createEncaissement({
        paymentId: payment.id,
        familyId: payment.familyId,
        familyName: payment.familyName,
        montant: -tropPercuAmount,
        mode: "avoir",
        modeLabel: "Avoir (trop-perçu)",
        ref: ref,
        activityTitle: itemToRemove.activityTitle,
        isAvoir: true,
        avoirRef: ref,
      });
      // Retrait des points de fidelite proportionnel au trop-percu
      await retraitPointsFidelite(payment.familyId, tropPercuAmount, `Trop-perçu ${ref}`);
    }

    if (newItems.length === 0) {
      await updateDoc(doc(db, "payments", payment.id), {
        status: "cancelled", cancelledAt: serverTimestamp(),
        cancelReason: "Dernière prestation retirée",
        originalTotalTTC: payment.originalTotalTTC || payment.totalTTC || 0,
        updatedAt: serverTimestamp(),
      });
    } else {
      const newPaid = Math.min(totalEnc, newTotal);
      await updateDoc(doc(db, "payments", payment.id), {
        items: newItems,
        totalTTC: Math.round(newTotal * 100) / 100,
        paidAmount: Math.round(newPaid * 100) / 100,
        status: newPaid >= newTotal ? "paid" : newPaid > 0 ? "partial" : "pending",
        updatedAt: serverTimestamp(),
      });
    }
  }
  await refreshAll([payment.id]);
};
