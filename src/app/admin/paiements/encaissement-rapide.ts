/**
 * src/app/admin/paiements/encaissement-rapide.ts
 *
 * Ce que fait le bouton « Confirmer » de la modale Encaisser, ouverte depuis
 * l'onglet Impayés.
 *
 * Un seul bouton, quatre issues très différentes selon le mode choisi :
 *  - chèques différés → AUCUN encaissement. On crée N documents
 *    `cheques-differes` et la commande reste `pending` : l'argent n'entre que
 *    le jour où chaque chèque est déposé, depuis l'onglet dédié.
 *  - prélèvement SEPA → aucun encaissement non plus. On crée les échéances
 *    et la commande attend le passage de la remise.
 *  - avoir → pas d'argent qui entre, on consomme le solde d'avoirs de la
 *    famille en FIFO (le plus ancien d'abord).
 *  - tout le reste (CB, chèque, espèces…) → encaissement réel, délégué à
 *    `enregistrerEncaissement` pour que fidélité et numéro de facture soient
 *    traités comme partout ailleurs.
 *
 * Sortie du composant parce que ces quatre branches sont de la comptabilité,
 * pas de l'affichage : elles ne dépendent de l'écran que par les champs
 * saisis et les setters de fermeture, tous passés ici en paramètres.
 */

import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber } from "@/lib/utils";
import { createEncaissement } from "@/lib/compta-encaissement";
import { paymentModes } from "./types";
import type { ChequeDiffereSaisi } from "./types-etat";
import { enregistrerEncaissement } from "./encaissement-central";

/** Tout ce que la modale doit fournir : sa saisie, ses setters, la page. */
export interface ParamsEncaissementRapide {
  quickEncaisser: { payment: any };
  quickMontant: string;
  quickMode: string;
  quickRef: string;
  quickDate: string;
  quickChequesDiffres: ChequeDiffereSaisi[];
  quickAvoirs: any[];
  setQuickSaving: (v: boolean) => void;
  setQuickEncaisser: (v: { payment: any } | null) => void;
  setQuickMontant: (v: string) => void;
  setQuickRef: (v: string) => void;
  setQuickDate: (v: string) => void;
  setQuickChequesDiffres: (v: ChequeDiffereSaisi[]) => void;
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
  refreshAll: (changedPaymentIds?: string[]) => Promise<void>;
}

export const executerEncaissementRapide = async ({
  quickEncaisser, quickMontant, quickMode, quickRef, quickDate,
  quickChequesDiffres, quickAvoirs,
  setQuickSaving, setQuickEncaisser, setQuickMontant, setQuickRef, setQuickDate,
  setQuickChequesDiffres, toast, refreshAll,
}: ParamsEncaissementRapide) => {
  if (!quickEncaisser) return;
  const p = quickEncaisser.payment;
  const montant = parseFloat(quickMontant) || ((p.totalTTC || 0) - (p.paidAmount || 0));
  if (montant <= 0) return;
  setQuickSaving(true);
  try {
    // ── Mode chèques différés : pas d'encaissement immédiat ──
    // On convertit l'impayé : on passe le payment en paymentMode "cheque_differe"
    // et on crée N documents cheques-differes. Chaque chèque sera encaissé
    // individuellement le jour venu via l'onglet "Chèques différés".
    if (quickMode === "cheque_differe") {
      const chqsValides = quickChequesDiffres.filter(
        c => safeNumber(c.montant) > 0 && c.dateEncaissementPrevue
      );
      if (chqsValides.length === 0) {
        toast("Ajoutez au moins un chèque avec un montant et une date", "warning");
        setQuickSaving(false);
        return;
      }
      const totalChq = chqsValides.reduce((s, c) => s + safeNumber(c.montant), 0);
      if (Math.abs(totalChq - montant) > 0.01) {
        if (!confirm(
          `Le total des chèques (${totalChq.toFixed(2)}€) ne correspond pas au montant à encaisser (${montant.toFixed(2)}€).\n\nÉcart : ${(totalChq - montant).toFixed(2)}€.\n\nContinuer quand même ?`
        )) {
          setQuickSaving(false);
          return;
        }
      }

      // Créer un document par chèque dans cheques-differes
      for (const chq of chqsValides) {
        await addDoc(collection(db, "cheques-differes"), {
          paymentId: p.id,
          familyId: p.familyId,
          familyName: p.familyName,
          numero: chq.numero.trim(),
          banque: chq.banque.trim(),
          montant: safeNumber(chq.montant),
          dateEncaissementPrevue: chq.dateEncaissementPrevue,
          status: "pending",
          createdAt: serverTimestamp(),
        });
      }

      // Mettre à jour le payment : mode cheque_differe, ref synthétique
      // Statut conservé en "pending" car aucun chèque n'a encore été déposé.
      // L'onglet "Chèques différés" marquera le payment "paid" quand tous
      // les chèques seront déposés.
      await updateDoc(doc(db, "payments", p.id), {
        paymentMode: "cheque_differe",
        paymentRef: `${chqsValides.length} chèque(s) différé(s)`,
        updatedAt: serverTimestamp(),
      });

      toast(
        `✅ ${chqsValides.length} chèque(s) différé(s) enregistré(s) pour ${p.familyName} — ${totalChq.toFixed(2)}€`,
        "success"
      );
      setQuickEncaisser(null);
      setQuickMontant(""); setQuickRef("");
      setQuickDate(new Date().toISOString().split("T")[0]);
      setQuickChequesDiffres([{ numero: "", banque: "", montant: "", dateEncaissementPrevue: new Date().toISOString().split("T")[0] }]);
      await refreshAll();
      setQuickSaving(false);
      return;
    }

    // ── Mode SEPA : créer les échéances au lieu d'encaisser directement ──
    if (quickMode === "prelevement_sepa") {
      const nbEch = parseInt(quickRef || "10");
      const startDate = new Date(quickDate || new Date().toISOString().split("T")[0]);

      // Trouver le mandat SEPA de cette famille
      const mandatSnap = await getDocs(collection(db, "mandats-sepa"));
      const mandat = mandatSnap.docs.find(d => d.data().familyId === p.familyId && d.data().status === "active");
      if (!mandat) {
        toast("⚠️ Aucun mandat SEPA actif pour cette famille. Créez-en un dans Prélèvements SEPA.", "error");
        setQuickSaving(false);
        return;
      }
      const mandatData = mandat.data();

      // Créer les échéances
      const montantEch = Math.floor(montant / nbEch * 100) / 100;
      const reste = Math.round((montant - montantEch * nbEch) * 100) / 100;
      const desc = (p.items || []).map((i: any) => i.activityTitle).join(", ") || "Forfait";

      for (let i = 0; i < nbEch; i++) {
        const d = new Date(startDate);
        d.setMonth(d.getMonth() + i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const m = i === nbEch - 1 ? montantEch + reste : montantEch;

        await addDoc(collection(db, "echeances-sepa"), {
          familyId: p.familyId,
          familyName: p.familyName,
          mandatId: mandatData.mandatId,
          montant: Math.round(m * 100) / 100,
          dateEcheance: dateStr,
          reference: `Paiement ${p.id}`,
          description: `${desc} — ${i + 1}/${nbEch}`,
          status: "pending",
          remiseId: null,
          paymentId: p.id,
          createdAt: serverTimestamp(),
        });
      }

      // Marquer le paiement comme SEPA (mais pas payé — il sera payé quand la remise passera)
      await updateDoc(doc(db, "payments", p.id), {
        paymentMode: "prelevement_sepa",
        paymentRef: `${nbEch}× SEPA · ${mandatData.mandatId}`,
        updatedAt: serverTimestamp(),
      });

      toast(`✅ ${nbEch} échéances SEPA créées pour ${p.familyName} (${montant.toFixed(2)}€)`, "success");
      setQuickEncaisser(null);
      setQuickMontant(""); setQuickRef("");
      setQuickDate(new Date().toISOString().split("T")[0]);
      await refreshAll([p.id]);
      setQuickSaving(false);
      return;
    }

    // ── Mode AVOIR : consommer l'avoir au lieu d'encaisser de l'argent ──
    // Deduit le montant des avoirs actifs de la famille (FIFO : le plus ancien
    // d'abord). Cree un encaissement de mode 'avoir' (montant positif, mais
    // mode='avoir' pour distinguer) puis decremente le remainingAmount sur
    // chaque avoir consomme.
    if (quickMode === "avoir") {
      const totalAvoirDispo = quickAvoirs.reduce((s, a) => s + (a.remainingAmount || 0), 0);
      if (montant > totalAvoirDispo + 0.005) {
        toast(`Avoir insuffisant : ${totalAvoirDispo.toFixed(2)}€ disponible, ${montant.toFixed(2)}€ demandé`, "warning");
        setQuickSaving(false);
        return;
      }
      let restant = montant;
      const sortedAvoirs = [...quickAvoirs].sort((a, b) => {
        // Plus ancien d'abord (FIFO)
        const da = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || 0;
        const db_ = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || 0;
        return da - db_;
      });
      const refsUsed: string[] = [];
      for (const a of sortedAvoirs) {
        if (restant <= 0.005) break;
        const dispo = a.remainingAmount || 0;
        const utilise = Math.min(dispo, restant);
        const newRemaining = Math.round((dispo - utilise) * 100) / 100;
        const newUsed = Math.round((a.usedAmount || 0) * 100) / 100 + utilise;
        const newStatus = newRemaining <= 0.005 ? "utilise" : "actif";
        await updateDoc(doc(db, "avoirs", a.id), {
          usedAmount: Math.round(newUsed * 100) / 100,
          remainingAmount: newRemaining,
          status: newStatus,
          usageHistory: [...(a.usageHistory || []), {
            date: new Date().toISOString(),
            paymentId: p.id,
            montant: utilise,
          }],
          updatedAt: serverTimestamp(),
        });
        refsUsed.push(a.reference || a.id.slice(-6));
        restant = Math.round((restant - utilise) * 100) / 100;
      }
      // Mettre a jour le payment (paidAmount + status)
      const newPaid = Math.round(((p.paidAmount || 0) + montant) * 100) / 100;
      const newStatus = newPaid >= (p.totalTTC || 0) ? "paid" : "partial";
      await updateDoc(doc(db, "payments", p.id), {
        paidAmount: newPaid,
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      // Trace dans le journal des encaissements
      await createEncaissement({
        paymentId: p.id,
        familyId: p.familyId,
        familyName: p.familyName,
        montant: montant,
        mode: "avoir",
        modeLabel: `Avoir (${refsUsed.join(", ")})`,
        ref: refsUsed.join(", "),
        activityTitle: (p.items || []).map((i: any) => i.activityTitle).join(", "),
        isAvoir: true,
      });
      toast(`✅ ${montant.toFixed(2)}€ payé par avoir (${refsUsed.join(", ")}) pour ${p.familyName}${newStatus === "paid" ? " — Tout réglé !" : ""}`, "success");
      setQuickEncaisser(null);
      setQuickMontant(""); setQuickRef("");
      setQuickDate(new Date().toISOString().split("T")[0]);
      await refreshAll([p.id]);
      setQuickSaving(false);
      return;
    }

    // ── Encaissement normal (CB, chèque, espèces, etc.) ──
    // Utiliser la fonction centralisée qui gère points fidélité + invoiceNumber
    await enregistrerEncaissement(
      p.id!, p, montant, quickMode, quickRef,
      (p.items || []).map((i: any) => i.activityTitle).join(", "),
      quickDate,
    );
    const encSnap2 = await getDocs(query(collection(db, "encaissements"), where("paymentId", "==", p.id)));
    const totalEncaisse2 = Math.round(encSnap2.docs.reduce((s, d) => s + safeNumber(d.data().montant), 0) * 100) / 100;
    const totalTTC2 = safeNumber(p.totalTTC);
    toast(`✅ ${montant.toFixed(2)}€ encaissé (${paymentModes.find(m => m.id === quickMode)?.label}) pour ${p.familyName}${totalEncaisse2 >= totalTTC2 ? " — Tout réglé !" : ` — Reste : ${(totalTTC2 - totalEncaisse2).toFixed(2)}€`}`, "success");
    setQuickEncaisser(null);
    setQuickMontant(""); setQuickRef("");
    setQuickDate(new Date().toISOString().split("T")[0]);
    await refreshAll([p.id]);
  } catch (e) { console.error(e); toast("Erreur encaissement", "error"); }
  setQuickSaving(false);
};
