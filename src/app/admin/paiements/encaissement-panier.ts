/**
 * src/app/admin/paiements/encaissement-panier.ts
 *
 * Ce que fait le bouton « Valider le paiement » du panier : créer la
 * commande et, sauf en chèques différés, encaisser dans la foulée.
 *
 * Trois choses s'y jouent, dans cet ordre, et l'ordre compte :
 *  1. Les prix des articles de STAGE sont revérifiés contre les réductions
 *     famille / multi-stages au moment de payer. Entre la mise au panier et
 *     l'encaissement, un frère a pu être inscrit : le tarif dû n'est plus
 *     celui affiché. L'admin est prévenu et peut refuser.
 *  2. Le mode « chèques différés » ne crée AUCUN encaissement : la commande
 *     reste `pending` et N documents `cheques-differes` sont créés. L'argent
 *     n'entre que le jour du dépôt de chaque chèque.
 *  3. Les bons cadeaux du panier ne sont générés qu'APRÈS l'encaissement,
 *     avec leur code : un bon ne doit pas exister si le paiement a échoué.
 *
 * Sorti du composant parce que rien ici n'est de l'affichage : ce sont des
 * écritures Firestore. Tout ce que la fonction sait de l'écran lui est
 * passé en paramètres — la saisie et les setters qui remettent à zéro.
 */

import { addDoc, doc, getDoc, collection, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber, generateOrderId } from "@/lib/utils";
import { applyDiscounts, type VacationPeriod, type DiscountSettings } from "@/lib/discounts";
import type { Family } from "@/types";
import type { BasketItem, PaymentMode } from "./types";
import type { ChequeDiffereSaisi } from "./types-etat";
import { calculerRemise, type PromoApplique } from "./calculs-encaisser";

/** Tout ce que le panier doit fournir : sa saisie, ses setters, la page. */
export interface ParamsValidationPanier {
  basket: BasketItem[];
  selectedFamily: string;
  selectedFam: (Family & { firestoreId: string }) | undefined;
  appliedPromo: PromoApplique | null;
  manualDiscount: string;
  paymentMode: PaymentMode;
  paymentRef: string;
  paidAmount: string;
  encaissementDate: string;
  chequesDiffres: ChequeDiffereSaisi[];
  discountSettings: DiscountSettings;
  vacationPeriods: VacationPeriod[];
  setSaving: (v: boolean) => void;
  setBasket: (v: BasketItem[]) => void;
  setPaymentRef: (v: string) => void;
  setPaidAmount: (v: string) => void;
  setEncaissementDate: (v: string) => void;
  setChequesDiffres: (v: ChequeDiffereSaisi[]) => void;
  setSuccess: (v: boolean) => void;
  enregistrerEncaissement: (
    paymentId: string, paymentData: any, montant: number,
    mode: string, ref?: string, activityTitle?: string, customDate?: string
  ) => Promise<any>;
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
  refreshAll: () => Promise<void>;
}

export const validerPaiementPanier = async ({
  basket, selectedFamily, selectedFam, appliedPromo, manualDiscount,
  paymentMode, paymentRef, paidAmount, encaissementDate, chequesDiffres,
  discountSettings, vacationPeriods,
  setSaving, setBasket, setPaymentRef, setPaidAmount, setEncaissementDate,
  setChequesDiffres, setSuccess,
  enregistrerEncaissement, toast, refreshAll,
}: ParamsValidationPanier) => {
  if (!selectedFamily) {
    toast("Veuillez sélectionner une famille avant de valider le paiement", "warning");
    return;
  }
  if (basket.length === 0) {
    toast("Le panier est vide", "warning");
    return;
  }
  setSaving(true);
  try {

  // ─── Revérification des réductions famille/multi-stages sur items "stage" ───
  const revisedBasket: BasketItem[] = [];
  const adjustments: string[] = [];
  for (const item of basket) {
    const creneauId = (item as any).creneauId;
    if (!creneauId) { revisedBasket.push(item); continue; }
    try {
      const cSnap = await getDoc(doc(db, "creneaux", creneauId));
      if (!cSnap.exists()) { revisedBasket.push(item); continue; }
      const c = cSnap.data() as any;
      if (!["stage", "stage_journee"].includes(c.activityType)) {
        revisedBasket.push(item); continue;
      }
      const childId = (item as any).childId;
      if (!childId) { revisedBasket.push(item); continue; }
      const original = (item as any).originalPriceTTC || item.priceTTC;
      const result = await applyDiscounts({
        familyId: selectedFamily,
        newChildId: childId,
        stageDate: c.date,
        stageType: c.activityType,
        originalPriceTTC: original,
        settings: discountSettings,
        periods: vacationPeriods,
        excludeCreneauId: creneauId, // la résa existe déjà pour ce créneau
      });
      if (Math.abs(result.finalPriceTTC - item.priceTTC) > 0.01) {
        adjustments.push(`${item.activityTitle} (${item.childName}) : ${item.priceTTC.toFixed(2)}€ → ${result.finalPriceTTC.toFixed(2)}€`);
        const newPriceHT = Math.round((result.finalPriceTTC / (1 + item.tva / 100)) * 100) / 100;
        const revised: any = { ...item, priceTTC: result.finalPriceTTC, priceHT: newPriceHT };
        if (result.discountPercent > 0) {
          revised.originalPriceTTC = result.originalPriceTTC;
          revised.discountPercent = result.discountPercent;
          revised.discountAmount = result.discountAmount;
          revised.discountReasons = result.reasons;
        }
        revisedBasket.push(revised);
      } else {
        revisedBasket.push(item);
      }
    } catch (e) {
      console.error("[paiements] revérif échouée pour item", item, e);
      revisedBasket.push(item);
    }
  }
  if (adjustments.length > 0) {
    const msg = "Prix ajustés automatiquement (réductions famille/multi-stages) :\n\n" +
      adjustments.join("\n") + "\n\nContinuer l'encaissement ?";
    if (!confirm(msg)) {
      setSaving(false);
      setBasket(revisedBasket); // mettre à jour le panier affiché
      return;
    }
  }
  // ─── Fin revérification ───

  // Recalculer le total après révision
  const revisedSubtotal = revisedBasket.reduce((s, i) => s + i.priceTTC, 0);
  const revisedPromoDiscount = calculerRemise(appliedPromo, revisedSubtotal, manualDiscount);
  const revisedTotal = Math.max(0, revisedSubtotal - revisedPromoDiscount);

  // ─── Mode chèques différés : pas d'encaissement immédiat ───
  // On crée le payment en pending, on crée N documents cheques-differes,
  // chaque chèque sera encaissé individuellement le jour venu.
  if (paymentMode === "cheque_differe") {
    const chqsValides = chequesDiffres.filter(c => safeNumber(c.montant) > 0 && c.dateEncaissementPrevue);
    if (chqsValides.length === 0) {
      toast("Ajoutez au moins un chèque avec un montant et une date", "warning");
      return;
    }
    const totalChq = chqsValides.reduce((s, c) => s + safeNumber(c.montant), 0);
    if (Math.abs(totalChq - revisedTotal) > 0.01) {
      if (!confirm(`Le total des chèques (${totalChq.toFixed(2)}€) ne correspond pas au total du panier (${revisedTotal.toFixed(2)}€).\n\nÉcart : ${(totalChq - revisedTotal).toFixed(2)}€.\n\nContinuer quand même ?`)) {
        return;
      }
    }

    // Créer le payment parent (pending, sera marqué paid quand TOUS les chèques seront déposés)
    const payRef = await addDoc(collection(db, "payments"), {
      orderId: generateOrderId(),
      familyId: selectedFamily,
      familyName: selectedFam?.parentName || "—",
      items: revisedBasket,
      totalTTC: revisedTotal,
      paymentMode: "cheque_differe",
      paymentRef: `${chqsValides.length} chèque(s) différé(s)`,
      status: "pending",
      paidAmount: 0,
      date: encaissementDate ? Timestamp.fromDate(new Date(encaissementDate + "T12:00:00")) : serverTimestamp(),
      createdAt: serverTimestamp(),
    });

    // Créer un document par chèque dans cheques-differes
    for (const chq of chqsValides) {
      await addDoc(collection(db, "cheques-differes"), {
        paymentId: payRef.id,
        familyId: selectedFamily,
        familyName: selectedFam?.parentName || "—",
        numero: chq.numero.trim(),
        banque: chq.banque.trim(),
        montant: safeNumber(chq.montant),
        dateEncaissementPrevue: chq.dateEncaissementPrevue,
        status: "pending",
        createdAt: serverTimestamp(),
      });
    }

    setBasket([]); setPaymentRef(""); setPaidAmount("");
    setEncaissementDate(new Date().toISOString().split("T")[0]);
    setChequesDiffres([{ numero: "", banque: "", montant: "", dateEncaissementPrevue: new Date().toISOString().split("T")[0] }]);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
    toast(`✅ ${chqsValides.length} chèque(s) différé(s) enregistré(s) — ${totalChq.toFixed(2)}€`, "success");
    await refreshAll();
    return;
  }

  const paid = paidAmount ? safeNumber(paidAmount) : revisedTotal;

  const payRef = await addDoc(collection(db, "payments"), {
    orderId: generateOrderId(),
    familyId: selectedFamily,
    familyName: selectedFam?.parentName || "—",
    items: revisedBasket,
    totalTTC: revisedTotal,
    paymentMode: "",
    paymentRef: "",
    status: "pending",
    paidAmount: 0,
    date: encaissementDate ? Timestamp.fromDate(new Date(encaissementDate + "T12:00:00")) : serverTimestamp(),
    createdAt: serverTimestamp(), // heure réelle de création (pour tri chronologique)
  });
  if (paid > 0) {
    await enregistrerEncaissement(payRef.id, {
      familyId: selectedFamily,
      familyName: selectedFam?.parentName || "—",
      items: revisedBasket,
      totalTTC: revisedTotal,
    }, paid, paymentMode, paymentRef, revisedBasket.map(i => i.activityTitle).join(", "), encaissementDate);
  }
  // Génération des bons cadeaux vendus (un bon par article "bon cadeau" du panier).
  const bonsGeneres: string[] = [];
  for (const item of revisedBasket) {
    if (!(item as any).isBonCadeau) continue;
    const code = "BON-" + (Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5)).toUpperCase();
    await addDoc(collection(db, "bons-cadeaux"), {
      code, montant: item.priceTTC, solde: item.priceTTC, statut: "actif",
      recipientName: (item as any).recipientName || "",
      fromName: selectedFam?.parentName || "",
      source: "vente", paymentId: payRef.id, acheteurFamilyId: selectedFamily,
      createdAt: serverTimestamp(),
    });
    bonsGeneres.push(code);
  }
  setBasket([]); setPaymentRef(""); setPaidAmount("");
  setEncaissementDate(new Date().toISOString().split("T")[0]);
  if (bonsGeneres.length > 0) toast(`🎁 Bon(s) créé(s) : ${bonsGeneres.join(", ")} — à remettre à l'acheteur.`, "success");
  setSuccess(true);
  setTimeout(() => setSuccess(false), 3000);
  await refreshAll();
  } catch (err) {
    console.error("[paiements] Erreur lors de l'encaissement:", err);
    toast(`Erreur lors de l'encaissement : ${(err as Error)?.message || "erreur inconnue"}`, "error");
  } finally {
    setSaving(false);
  }
};
