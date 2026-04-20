"use client";
import React, { useState, useEffect } from "react";
import { updateDoc, addDoc, doc, getDoc, collection, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { emailTemplates } from "@/lib/email-templates";
import { safeNumber, generateOrderId } from "@/lib/utils";
import {
  applyDiscounts,
  fetchVacationPeriods,
  fetchDiscountSettings,
  type VacationPeriod,
  type DiscountSettings,
} from "@/lib/discounts";
import { Card, Badge } from "@/components/ui";
import { Plus, Trash2, ShoppingCart, CreditCard, Check, Loader2, Search, X, Receipt, AlertTriangle, Copy, ChevronDown, Gift } from "lucide-react";
import type { Family, Activity } from "@/types";
import { BasketItem, PaymentMode, paymentModes } from "./types";
import { authFetch } from "@/lib/auth-fetch";

interface TabEncaisserProps {
  families: (Family & { firestoreId: string })[];
  activities: (Activity & { firestoreId: string })[];
  payments: any[];
  encaissements: any[];
  avoirs: any[];
  promos: any[];
  loading: boolean;
  enregistrerEncaissement: (
    paymentId: string, paymentData: any, montant: number,
    mode: string, ref?: string, activityTitle?: string, customDate?: string
  ) => Promise<any>;
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
  setTab: React.Dispatch<React.SetStateAction<"encaisser" | "journal" | "historique" | "echeances" | "impayes" | "offerts" | "declarations" | "cheques_differes">>;
  refreshAll: () => Promise<void>;
}

export function TabEncaisser({
  families, activities, payments, encaissements, avoirs, promos, loading,
  enregistrerEncaissement, toast, setTab, refreshAll,
}: TabEncaisserProps) {
  // Répartit un montant total en n parts égales avec ajustement du reliquat
  // sur la première part pour que la somme soit EXACTEMENT le total.
  const repartirEnParts = (total: number, n: number): number[] => {
    if (n <= 0) return [];
    const cents = Math.round(total * 100);
    const base = Math.floor(cents / n);
    const reste = cents - base * n;
    // reste est réparti sur les premières parts (+1 centime chacune)
    return Array.from({ length: n }, (_, i) => (base + (i < reste ? 1 : 0)) / 100);
  };

  const [familySearch, setFamilySearch] = useState("");
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [selectedActivity, setSelectedActivity] = useState("");
  const [selectedChild, setSelectedChild] = useState("");
  const [selectedFamily, setSelectedFamily] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customTva, setCustomTva] = useState("5.5");
  const [customCategory, setCustomCategory] = useState("enseignement");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cb_terminal");
  const [paymentRef, setPaymentRef] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [encaissementDate, setEncaissementDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ label: string; discountMode: string; discountValue: number } | null>(null);
  const [manualDiscount, setManualDiscount] = useState("");

  // ─── Chèques différés (mode "cheque_differe") ─────────────────────────────
  type ChequeDifferE = { numero: string; banque: string; montant: string; dateEncaissementPrevue: string };
  const [chequesDiffres, setChequesDiffres] = useState<ChequeDifferE[]>([
    { numero: "", banque: "", montant: "", dateEncaissementPrevue: new Date().toISOString().split("T")[0] },
  ]);

  // ─── Réductions famille/multi-stages (chargées au montage) ───
  const [vacationPeriods, setVacationPeriods] = useState<VacationPeriod[]>([]);
  const [discountSettings, setDiscountSettings] = useState<DiscountSettings>({
    familyDiscount: [],
    multiStageDiscount: [],
  });
  useEffect(() => {
    fetchVacationPeriods().then(setVacationPeriods).catch(console.error);
    fetchDiscountSettings().then(setDiscountSettings).catch(console.error);
  }, []);
  const inputCls = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  const selectedFam = families.find((f) => f.firestoreId === selectedFamily);
  const children = selectedFam?.children || [];

  const filteredFamilies = familySearch
    ? families.filter((f) => {
        const terms = familySearch.toLowerCase().trim().split(/\s+/);
        const childText = (f.children || []).map((c: any) => `${c.firstName || ""} ${(c as any).lastName || ""}`).join(" ");
        const searchable = `${f.parentName || ""} ${f.parentEmail || ""} ${childText}`.toLowerCase();
        return terms.every(t => searchable.includes(t));
      })
    : families;


  const CATEGORIES = [
    { id: "enseignement", label: "Enseignement", compte: "706100", tvaDefault: "5.5" },
    { id: "pension", label: "Pension / Hébergement", compte: "706200", tvaDefault: "10" },
    { id: "location", label: "Location (box, matériel)", compte: "706300", tvaDefault: "20" },
    { id: "vente", label: "Vente (équipement, produits)", compte: "707000", tvaDefault: "20" },
    { id: "licence", label: "Licence / Cotisation FFE", compte: "706400", tvaDefault: "0" },
    { id: "transport", label: "Transport", compte: "706500", tvaDefault: "10" },
    { id: "evenement", label: "Événement / Animation", compte: "706600", tvaDefault: "5.5" },
    { id: "autre", label: "Autre", compte: "708000", tvaDefault: "20" },
  ];

  const addToBasket = () => {
    if (!selectedFamily) {
      toast("Veuillez d'abord sélectionner une famille", "warning");
      return;
    }
    if (customLabel && customPrice) {
      const price = safeNumber(customPrice);
      const tvaRate = safeNumber(customTva);
      const cat = CATEGORIES.find(c => c.id === customCategory);
      // Résoudre le prénom de l'enfant à partir de son ID
      const selFam = families.find(f => f.firestoreId === selectedFamily);
      const selChild = (selFam?.children || []).find((c: any) => c.id === selectedChild);
      const childNameLabel = (selChild as any)?.firstName || "—";
      setBasket([...basket, {
        id: Date.now().toString(),
        activityTitle: customLabel,
        childId: selectedChild || "",
        childName: childNameLabel,
        description: "Saisie manuelle",
        priceHT: tvaRate > 0 ? Math.round(price / (1 + tvaRate / 100) * 100) / 100 : price,
        tva: tvaRate,
        priceTTC: price,
        category: customCategory,
        compteComptable: cat?.compte || "708000",
      }]);
      setCustomLabel(""); setCustomPrice(""); return;
    }
    if (!selectedActivity) return;
    const act = activities.find((a) => a.firestoreId === selectedActivity);
    if (!act) return;
    const priceTTC = (act as any).priceTTC || ((act.priceHT || 0) * (1 + ((act as any).tvaTaux || 5.5) / 100));
    const fam = families.find(f => f.firestoreId === selectedFamily);
    const child = (fam?.children || []).find((c: any) => c.id === selectedChild);
    const childName = (child as any)?.firstName || selectedChild || "—";
    setBasket([...basket, {
      id: Date.now().toString(),
      activityTitle: act.title,
      activityId: act.firestoreId,
      childId: selectedChild,
      childName,
      activityType: (act as any).type || "",
      description: act.title,
      priceHT: priceTTC / (1 + ((act as any).tvaTaux || 5.5) / 100),
      tva: (act as any).tvaTaux || 5.5,
      priceTTC,
    }]);
  };

  const basketSubtotal = basket.reduce((s, i) => s + i.priceTTC, 0);
  const promoDiscount = appliedPromo
    ? (appliedPromo.discountMode === "percent" ? basketSubtotal * appliedPromo.discountValue / 100 : appliedPromo.discountValue)
    : safeNumber(manualDiscount);
  const basketTotal = Math.max(0, basketSubtotal - promoDiscount);

  const applyPromoCode = () => {    const found = promos.find((p: any) => p.type === "code" && p.code === promoCode.toUpperCase() && p.active && (p.appliesTo === "paiement" || p.appliesTo === "tout"));
    if (found) {
      if (found.maxUses > 0 && found.usedCount >= found.maxUses) { toast("Ce code a atteint son nombre max d'utilisations."); return; }
      if (found.validUntil && new Date(found.validUntil) < new Date()) { toast("Ce code a expiré.", "warning"); return; }
      setAppliedPromo({ label: found.label, discountMode: found.discountMode, discountValue: found.discountValue });
      setManualDiscount("");
    } else {
      toast("Code promo invalide ou non applicable aux paiements.");
    }
  };

  const removeFromBasket = (id: string) => setBasket(basket.filter((i) => i.id !== id));

  const handlePayment = async () => {
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
    const revisedPromoDiscount = appliedPromo
      ? (appliedPromo.discountMode === "percent" ? revisedSubtotal * appliedPromo.discountValue / 100 : appliedPromo.discountValue)
      : (safeNumber(manualDiscount));
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
    setBasket([]); setPaymentRef(""); setPaidAmount("");
    setEncaissementDate(new Date().toISOString().split("T")[0]);
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

  return (
  <div className="flex gap-6 flex-wrap">
    {/* Left: basket builder */}
    <div className="flex-1 min-w-[400px]">
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg font-body text-sm text-green-700 flex items-center gap-2">
          <Check size={16} /> Paiement enregistré avec succès !
        </div>
      )}

      {/* Family selector */}
      <Card padding="md" className="mb-4">
        <h3 className="font-body text-sm font-semibold text-blue-800 mb-3">1. Sélectionner la famille</h3>
        <div className="relative mb-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input data-testid="selectedFam-search-input" value={familySearch} onChange={(e) => setFamilySearch(e.target.value)} placeholder="Rechercher..." className={`${inputCls} !pl-9`} />
        </div>
        <select value={selectedFamily} onChange={(e) => { setSelectedFamily(e.target.value); setSelectedChild(""); }} className={inputCls}>
          <option value="">Choisir une famille...</option>
          {filteredFamilies.map((f) => (
            <option key={f.firestoreId} value={f.firestoreId}>{f.parentName} ({f.parentEmail})</option>
          ))}
        </select>
        {selectedFam && children.length > 0 && (
          <div className="mt-3">
            <div className="font-body text-xs font-semibold text-slate-600 mb-1">Cavalier</div>
            <div className="flex flex-wrap gap-2">
              {children.map((c: any) => (
                <button key={c.id} onClick={() => setSelectedChild(c.id)}
                  className={`px-3 py-1.5 rounded-lg border font-body text-xs font-medium cursor-pointer transition-all
                    ${selectedChild === c.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
                  🧒 {c.firstName}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Impayés de cette famille */}
      {selectedFam && (() => {
        const familyPending = payments.filter(p =>
          p.familyId === selectedFamily &&
          (p.status === "pending" || (p.status === "partial" && (p.paidAmount || 0) < (p.totalTTC || 0)))
        );
        if (familyPending.length === 0) return null;
        const totalPending = familyPending.reduce((s, p) => s + (p.totalTTC || 0) - (p.paidAmount || 0), 0);
        const pendingDiscount = appliedPromo
          ? (appliedPromo.discountMode === "percent" ? totalPending * appliedPromo.discountValue / 100 : appliedPromo.discountValue)
          : safeNumber(manualDiscount);
        const totalPendingAfterDiscount = Math.max(0, totalPending - pendingDiscount);

        return (
          <Card padding="md" className="mb-4 border-orange-200 bg-orange-50/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-body text-sm font-semibold text-orange-700">
                <AlertTriangle size={14} className="inline mr-1" />
                Impayés — {selectedFam.parentName} ({familyPending.length})
              </h3>
              <span className="font-body text-lg font-bold text-red-500">{totalPending.toFixed(2)}€</span>
            </div>
            {/* Détail des lignes */}
            <div className="flex flex-col gap-1.5 mb-4">
              {familyPending.map(p => {
                const reste = (p.totalTTC || 0) - (p.paidAmount || 0);
                return (
                  <div key={p.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                    <div>
                      <div className="font-body text-sm text-blue-800">{(p.items || []).map((i: any) => i.activityTitle).join(", ") || "Prestation"}</div>
                      <div className="font-body text-xs text-slate-600">{reste.toFixed(2)}€ dû sur {(p.totalTTC || 0).toFixed(2)}€</div>
                      {(() => {
                        const payEnc = encaissements.filter((e: any) => e.paymentId === p.id);
                        if (payEnc.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {payEnc.map((enc: any, i: number) => {
                              const d = enc.date?.seconds ? new Date(enc.date.seconds * 1000) : null;
                              return (
                                <span key={i} className="font-body text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded">
                                  {(enc.montant || 0).toFixed(2)}€ {enc.modeLabel || enc.mode} {d ? d.toLocaleDateString("fr-FR") : ""}
                                </span>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                    <span className="font-body text-sm font-bold text-red-500">{reste.toFixed(2)}€</span>
                  </div>
                );
              })}
            </div>
            {/* Total + montant + mode + bouton */}
            <div className="bg-white rounded-lg p-3 border border-green-200">
              <div className="flex items-center justify-between mb-3">
                <span className="font-body text-sm font-semibold text-blue-800">Total dû</span>
                <span className="font-body text-xl font-bold text-red-500">{totalPending.toFixed(2)}€</span>
              </div>

              {/* Avoirs disponibles */}
              {(() => {
                const familyAvoirs = avoirs.filter(a => a.familyId === selectedFamily && a.status === "actif" && (a.remainingAmount || 0) > 0);
                const totalAvoir = familyAvoirs.reduce((s, a) => s + (a.remainingAmount || 0), 0);
                if (totalAvoir <= 0) return null;
                return (
                  <div className="mb-3 p-2 bg-purple-50 rounded-lg">
                    <div className="flex items-center justify-between font-body text-sm">
                      <span className="text-purple-700 font-semibold">Avoir disponible</span>
                      <span className="text-purple-700 font-bold">{totalAvoir.toFixed(2)}€</span>
                    </div>
                    <button onClick={async () => {
                      const toUse = Math.min(totalAvoir, totalPending);
                      if (!confirm(`Utiliser ${toUse.toFixed(2)}€ d'avoir pour cette famille ?`)) return;
                      try {
                        let resteAUtiliser = toUse;
                        // 1. Déduire des avoirs
                        for (const a of familyAvoirs) {
                          if (resteAUtiliser <= 0) break;
                          const used = Math.min(a.remainingAmount || 0, resteAUtiliser);
                          await updateDoc(doc(db, "avoirs", a.id), {
                            usedAmount: (a.usedAmount || 0) + used,
                            remainingAmount: (a.remainingAmount || 0) - used,
                            status: (a.remainingAmount || 0) - used <= 0 ? "utilise" : "actif",
                            updatedAt: serverTimestamp(),
                          });
                          resteAUtiliser -= used;
                        }
                        // 2. Encaisser en mode "avoir" sur les paiements
                        let resteAPayer = toUse;
                        for (const p of familyPending) {
                          if (resteAPayer <= 0) break;
                          const du = (p.totalTTC || 0) - (p.paidAmount || 0);
                          const paye = Math.min(du, resteAPayer);
                          await enregistrerEncaissement(p.id!, p, paye, "avoir", "", "Utilisation avoir");
                          resteAPayer -= paye;
                        }
                        toast(`${toUse.toFixed(2)}€ d'avoir utilisé !`);
                        await refreshAll();
                      } catch (e) { console.error(e); toast("Erreur.", "error"); }
                    }} className="w-full mt-2 py-1.5 rounded-lg font-body text-xs font-semibold text-purple-700 bg-purple-100 border-none cursor-pointer hover:bg-purple-200">
                      Utiliser {Math.min(totalAvoir, totalPending).toFixed(2)}€ d'avoir
                    </button>
                  </div>
                );
              })()}

              {/* Réduction / Code promo */}
              <div className="mb-3 border border-blue-500/8 rounded-lg p-2.5">
                <div className="font-body text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-2">Réduction</div>
                {appliedPromo && (
                  <div className="bg-green-50 rounded-lg px-3 py-2 mb-2 flex items-center justify-between">
                    <span className="font-body text-xs text-green-800">{appliedPromo.label} ({appliedPromo.discountMode === "percent" ? `-${appliedPromo.discountValue}%` : `-${appliedPromo.discountValue}€`})</span>
                    <button onClick={() => setAppliedPromo(null)} className="font-body text-[10px] text-red-500 bg-transparent border-none cursor-pointer">Retirer</button>
                  </div>
                )}
                <div className="flex gap-1.5 mb-1.5">
                  <input value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())} placeholder="Code promo"
                    className="flex-1 px-2 py-1.5 rounded border border-blue-500/8 font-body text-xs bg-cream font-mono uppercase focus:border-blue-500 focus:outline-none" />
                  <button onClick={applyPromoCode} disabled={!promoCode}
                    className={`px-3 py-1.5 rounded font-body text-xs font-semibold border-none cursor-pointer ${!promoCode ? "bg-gray-200 text-slate-600" : "bg-blue-500 text-white"}`}>
                    OK
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-body text-[10px] text-slate-600">ou remise :</span>
                  <input type="number" value={manualDiscount} onChange={e => { setManualDiscount(e.target.value); setAppliedPromo(null); }}
                    placeholder="0" className="w-16 px-2 py-1.5 rounded border border-blue-500/8 font-body text-xs bg-cream text-center focus:border-blue-500 focus:outline-none" />
                  <span className="font-body text-[10px] text-slate-600">€</span>
                </div>
              </div>

              {/* Montant à encaisser */}
              <div className="mb-3">
                <div className="font-body text-xs font-semibold text-slate-600 mb-1">Montant encaissé</div>
                <div className="flex gap-2 items-center">
                  <input type="number" step="0.01" value={paidAmount} onChange={e => setPaidAmount(e.target.value)}
                    placeholder={totalPendingAfterDiscount.toFixed(2)}
                    className={`${inputCls} w-32`} />
                  <span className="font-body text-xs text-slate-600">€</span>
                  {!paidAmount && <span className="font-body text-[10px] text-slate-600">(vide = tout encaisser)</span>}
                </div>
                {pendingDiscount > 0 && (
                  <div className="font-body text-xs text-green-600 mt-1">
                    Réduction : -{pendingDiscount.toFixed(2)}€ → {totalPendingAfterDiscount.toFixed(2)}€ à encaisser
                  </div>
                )}
                {paidAmount && safeNumber(paidAmount) < totalPendingAfterDiscount && safeNumber(paidAmount) > 0 && (
                  <div className="font-body text-xs text-orange-500 mt-1">
                    Paiement partiel — reste dû après : {(totalPendingAfterDiscount - safeNumber(paidAmount)).toFixed(2)}€
                  </div>
                )}
              </div>

              {/* Mode de paiement */}
              <div className="font-body text-xs font-semibold text-slate-600 mb-2">Mode de paiement</div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {paymentModes.map(m => (
                  <button key={m.id} onClick={() => setPaymentMode(m.id)}
                    className={`px-3 py-1.5 rounded-lg border font-body text-[11px] font-medium cursor-pointer transition-all ${
                      paymentMode === m.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"
                    }`}>
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Référence */}
              {["cheque", "cheque_vacances", "pass_sport", "ancv", "virement"].includes(paymentMode) && (
                <div className="mb-3">
                  <input value={paymentRef} onChange={e => setPaymentRef(e.target.value)}
                    placeholder="N° de chèque, référence..."
                    className={inputCls} />
                </div>
              )}

              <button onClick={async () => {
                const montant = paidAmount ? safeNumber(paidAmount) : totalPendingAfterDiscount;
                if (montant <= 0) return;
                try {
                  // Si réduction appliquée, d'abord réduire le totalTTC du premier impayé
                  if (pendingDiscount > 0) {
                    const firstP = familyPending[0];
                    const newTotal = Math.max(0, (firstP.totalTTC || 0) - pendingDiscount);
                    await updateDoc(doc(db, "payments", firstP.id), {
                      totalTTC: newTotal,
                      originalTotalTTC: firstP.totalTTC,
                      discountApplied: pendingDiscount,
                      discountLabel: appliedPromo?.label || `Remise ${pendingDiscount}€`,
                      updatedAt: serverTimestamp(),
                    });
                  }
                  let resteARegler = montant;
                  for (const p of familyPending) {
                    if (resteARegler <= 0) break;
                    const du = pendingDiscount > 0 && p.id === familyPending[0].id
                      ? Math.max(0, (p.totalTTC || 0) - pendingDiscount) - (p.paidAmount || 0)
                      : (p.totalTTC || 0) - (p.paidAmount || 0);
                    const paye = Math.min(du, resteARegler);
                    await enregistrerEncaissement(p.id!, p, paye, paymentMode, paymentRef);
                    resteARegler -= paye;
                  }
                  const resteFinal = totalPendingAfterDiscount - montant;
                  toast(`${montant.toFixed(2)}€ encaissé (${paymentModes.find(m => m.id === paymentMode)?.label || paymentMode}) pour ${selectedFam.parentName} !${resteFinal > 0 ? `\nReste dû : ${resteFinal.toFixed(2)}€` : "\nTout est réglé !"}`);
                  // Email confirmation paiement
                  if (selectedFam.parentEmail && montant > 0) {
                    try {
                      const emailData = emailTemplates.confirmationPaiement({
                        parentName: selectedFam.parentName || "",
                        montant,
                        mode: paymentModes.find(m => m.id === paymentMode)?.label || paymentMode,
                        prestations: familyPending.flatMap(p => (p.items || []).map((i: any) => i.activityTitle)).join(", "),
                      });
                      authFetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: selectedFam.parentEmail, ...emailData }) }).catch(e => console.warn("Email:", e));
                    } catch (e) { console.error("Email confirmation paiement:", e); }
                  }
                  setPaidAmount("");
                  setPaymentRef("");
                  await refreshAll();
                } catch (e) { console.error(e); toast("Erreur.", "error"); }
              }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-body text-base font-semibold text-white bg-green-600 border-none cursor-pointer hover:bg-green-500 transition-colors">
                <Check size={18} />
                Encaisser {(paidAmount ? safeNumber(paidAmount) : totalPending).toFixed(2)}€
                {paidAmount && safeNumber(paidAmount) < totalPending ? " (partiel)" : ` (${familyPending.length} prestation${familyPending.length > 1 ? "s" : ""})`}
              </button>
            </div>
          </Card>
        );
      })()}

      {/* Add items */}
      <Card padding="md" className="mb-4">
        <h3 className="font-body text-sm font-semibold text-blue-800 mb-3">2. Ajouter au panier</h3>
        
        {/* From activity catalog */}
        <div className="flex gap-2 mb-3">
          <select value={selectedActivity} onChange={(e) => setSelectedActivity(e.target.value)} className={`${inputCls} flex-1 min-w-0`}>
            <option value="">Choisir une activité...</option>
            {activities.filter((a) => a.active !== false).map((a, idx) => {
              const ttc = (a as any).priceTTC || (a.priceHT || 0) * (1 + (a.tvaTaux || 5.5) / 100);
              return <option key={`${a.firestoreId}-${idx}`} value={a.firestoreId}>{a.title} — {ttc.toFixed(2)}€</option>;
            })}
          </select>
          <button onClick={addToBasket} disabled={!selectedActivity}
            className={`px-3 py-2 rounded-lg font-body text-sm font-semibold border-none cursor-pointer flex-shrink-0
              ${selectedActivity ? "bg-blue-500 text-white" : "bg-gray-200 text-slate-600"}`}>
            <Plus size={16} />
          </button>
        </div>

        {/* Custom item */}
        <div className="font-body text-xs text-slate-600 mb-2">— ou saisie libre —</div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="Libellé (ex: Location box avril)" className={`${inputCls} flex-1 min-w-0`} />
            <input value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} placeholder="Prix TTC" type="number" step="0.01" className={`${inputCls} w-full sm:w-28 flex-shrink-0`} />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 items-end">
            <div className="flex-1">
              <div className="font-body text-[10px] text-slate-400 mb-1">Catégorie</div>
              <select value={customCategory} onChange={e => { setCustomCategory(e.target.value); const cat = CATEGORIES.find(c => c.id === e.target.value); if (cat) setCustomTva(cat.tvaDefault); }}
                className={`${inputCls} !py-2`}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label} (cpt {c.compte})</option>)}
              </select>
            </div>
            <div className="w-24">
              <div className="font-body text-[10px] text-slate-400 mb-1">TVA</div>
              <select value={customTva} onChange={e => setCustomTva(e.target.value)} className={`${inputCls} !py-2`}>
                <option value="0">0%</option>
                <option value="5.5">5,5%</option>
                <option value="10">10%</option>
                <option value="20">20%</option>
              </select>
            </div>
            <button onClick={addToBasket} disabled={!customLabel || !customPrice}
              className={`px-4 py-2 rounded-lg font-body text-sm font-semibold border-none cursor-pointer flex-shrink-0
                ${customLabel && customPrice ? "bg-gold-400 text-blue-800" : "bg-gray-200 text-slate-600"}`}>
              <Plus size={16} className="inline mr-1" /> Ajouter
            </button>
          </div>
        </div>
      </Card>

      {/* Payment mode */}
      {basket.length > 0 && (
        <Card padding="md">
          <h3 className="font-body text-sm font-semibold text-blue-800 mb-3">3. Mode de paiement</h3>
          <div className="flex flex-wrap gap-2 mb-4">
            {paymentModes.map((m) => (
              <button key={m.id} onClick={() => setPaymentMode(m.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border font-body text-xs font-medium cursor-pointer transition-all
                  ${paymentMode === m.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Reference for cheque/pass sport */}
          {["cheque", "cheque_vacances", "pass_sport", "ancv", "virement"].includes(paymentMode) && (
            <div className="mb-3">
              <label className="font-body text-xs font-semibold text-slate-600 block mb-1">
                Référence ({paymentModes.find((m) => m.id === paymentMode)?.label})
              </label>
              <input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="N° de chèque, référence Pass'Sport..."
                className={inputCls} />
            </div>
          )}

          {/* Chèques différés — saisie de plusieurs chèques à encaisser à des dates différentes */}
          {paymentMode === "cheque_differe" && (() => {
            const totalChq = chequesDiffres.reduce((s, c) => s + safeNumber(c.montant), 0);
            const ecart = Math.round((totalChq - basketTotal) * 100) / 100;
            const ecartAbs = Math.abs(ecart);
            return (
              <div className="mb-4 border border-orange-200 rounded-xl p-3 bg-orange-50">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-body text-xs font-semibold text-orange-800">
                    📅 Saisie des chèques différés ({chequesDiffres.length})
                  </div>
                  <div className="font-body text-xs text-orange-700">
                    Total saisi : <span className="font-bold">{totalChq.toFixed(2)}€</span> / {basketTotal.toFixed(2)}€
                    {ecartAbs > 0.01 && (
                      <span className="ml-2 text-red-600">
                        (écart : {ecart > 0 ? "+" : ""}{ecart.toFixed(2)}€)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {chequesDiffres.map((chq, idx) => (
                    <div key={idx} className="flex gap-2 items-center bg-white rounded-lg p-2">
                      <input
                        value={chq.numero}
                        onChange={e => {
                          const u = [...chequesDiffres]; u[idx].numero = e.target.value; setChequesDiffres(u);
                        }}
                        placeholder="N° chèque"
                        className="w-28 px-2 py-1.5 rounded border border-gray-200 font-body text-xs focus:outline-none focus:border-orange-400"
                      />
                      <input
                        value={chq.banque}
                        onChange={e => {
                          const u = [...chequesDiffres]; u[idx].banque = e.target.value; setChequesDiffres(u);
                        }}
                        placeholder="Banque"
                        className="flex-1 min-w-0 px-2 py-1.5 rounded border border-gray-200 font-body text-xs focus:outline-none focus:border-orange-400"
                      />
                      <input
                        value={chq.montant}
                        onChange={e => {
                          const u = [...chequesDiffres]; u[idx].montant = e.target.value; setChequesDiffres(u);
                        }}
                        type="number" step="0.01" placeholder="Montant"
                        className="w-24 px-2 py-1.5 rounded border border-gray-200 font-body text-xs text-right focus:outline-none focus:border-orange-400"
                      />
                      <input
                        value={chq.dateEncaissementPrevue}
                        onChange={e => {
                          const u = [...chequesDiffres]; u[idx].dateEncaissementPrevue = e.target.value; setChequesDiffres(u);
                        }}
                        type="date"
                        className="w-36 px-2 py-1.5 rounded border border-gray-200 font-body text-xs focus:outline-none focus:border-orange-400"
                      />
                      {chequesDiffres.length > 1 && (
                        <button
                          onClick={() => setChequesDiffres(chequesDiffres.filter((_, i) => i !== idx))}
                          className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-1">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => {
                      // Ajouter un chèque en pré-remplissant le montant avec le solde restant
                      const reste = Math.max(0, Math.round((basketTotal - totalChq) * 100) / 100);
                      // Prochaine date = +1 mois par rapport au dernier chèque saisi
                      const lastDate = chequesDiffres[chequesDiffres.length - 1]?.dateEncaissementPrevue;
                      let nextDate = new Date().toISOString().split("T")[0];
                      if (lastDate) {
                        const d = new Date(lastDate);
                        d.setMonth(d.getMonth() + 1);
                        nextDate = d.toISOString().split("T")[0];
                      }
                      setChequesDiffres([...chequesDiffres, { numero: "", banque: "", montant: reste > 0 ? reste.toFixed(2) : "", dateEncaissementPrevue: nextDate }]);
                    }}
                    className="font-body text-xs text-orange-700 bg-white border border-orange-300 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-orange-100">
                    + Ajouter un chèque
                  </button>
                  <button
                    onClick={() => {
                      // Répartir le total en N chèques égaux (prochain mois par mois)
                      const n = chequesDiffres.length;
                      if (n === 0) return;
                      const baseDate = chequesDiffres[0]?.dateEncaissementPrevue || new Date().toISOString().split("T")[0];
                      const parts = repartirEnParts(basketTotal, n);
                      const updated = chequesDiffres.map((c, i) => {
                        const d = new Date(baseDate);
                        d.setMonth(d.getMonth() + i);
                        return {
                          ...c,
                          montant: parts[i].toFixed(2),
                          dateEncaissementPrevue: d.toISOString().split("T")[0],
                        };
                      });
                      setChequesDiffres(updated);
                    }}
                    className="font-body text-xs text-orange-700 bg-white border border-orange-300 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-orange-100">
                    ⚖️ Répartir {basketTotal.toFixed(2)}€ en {chequesDiffres.length} chèque{chequesDiffres.length > 1 ? "s" : ""} égaux
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Date d'encaissement */}
          <div className="mb-3">
            <label className="font-body text-xs font-semibold text-slate-600 block mb-1">
              Date d&apos;encaissement
            </label>
            <input type="date" value={encaissementDate}
              onChange={(e) => setEncaissementDate(e.target.value)}
              className={`${inputCls} w-48`} />
          </div>

          {/* Partial payment */}
          <div className="mb-3">
            <label className="font-body text-xs font-semibold text-slate-600 block mb-1">
              Montant encaissé (laisser vide = total)
            </label>
            <input value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)}
              placeholder={`${basketTotal.toFixed(2)}€`}
              type="number" step="0.01" className={`${inputCls} w-40`} />
            {paidAmount && safeNumber(paidAmount) < basketTotal && (
              <div className="font-body text-xs text-orange-500 mt-1">
                Paiement partiel — reste dû : {(basketTotal - safeNumber(paidAmount)).toFixed(2)}€
              </div>
            )}
          </div>

          <button onClick={handlePayment} disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-body text-base font-semibold text-white bg-green-600 border-none cursor-pointer hover:bg-green-500 transition-colors">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {saving ? "Enregistrement..." : `Valider le paiement — ${basketTotal.toFixed(2)}€`}
          </button>
        </Card>
      )}
    </div>

    {/* Right: basket summary */}
    <div className="w-[300px] flex-shrink-0">
      <Card padding="md" className="sticky top-4">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart size={18} className="text-blue-500" />
          <h3 className="font-body text-sm font-semibold text-blue-800">
            Panier {selectedFam ? `— ${selectedFam.parentName}` : ""}
          </h3>
        </div>

        {basket.length === 0 ? (
          <div className="text-center py-8">
            <span className="text-3xl block mb-2 opacity-30">🛒</span>
            <p className="font-body text-xs text-slate-600">Panier vide</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 mb-4">
              {basket.map((item) => (
                <div key={item.id} className="flex items-start justify-between bg-sand rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-body text-sm font-semibold text-blue-800 truncate">{item.activityTitle}</div>
                    <div className="font-body text-xs text-slate-600">{item.childName}</div>
                    <div className="font-body text-xs text-slate-600">{item.description}</div>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <span className="font-body text-sm font-bold text-blue-500">{item.priceTTC.toFixed(2)}€</span>
                    <button onClick={() => removeFromBasket(item.id)}
                      className="text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Réductions */}
            {basket.length > 0 && (
              <div className="border-t border-blue-500/8 pt-3 mb-3">
                <div className="font-body text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-2">Réduction</div>
                {appliedPromo && (
                  <div className="bg-green-50 rounded-lg px-3 py-2 mb-2 flex items-center justify-between">
                    <span className="font-body text-xs text-green-800">{appliedPromo.label} ({appliedPromo.discountMode === "percent" ? `-${appliedPromo.discountValue}%` : `-${appliedPromo.discountValue}€`})</span>
                    <button onClick={() => setAppliedPromo(null)} className="font-body text-[10px] text-red-500 bg-transparent border-none cursor-pointer">Retirer</button>
                  </div>
                )}
                <div className="flex gap-1.5 mb-1.5">
                  <input value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())} placeholder="Code promo"
                    className="flex-1 px-2 py-1.5 rounded border border-blue-500/8 font-body text-xs bg-cream font-mono uppercase focus:border-blue-500 focus:outline-none" />
                  <button onClick={applyPromoCode} disabled={!promoCode}
                    className={`px-3 py-1.5 rounded font-body text-xs font-semibold border-none cursor-pointer ${!promoCode ? "bg-gray-200 text-slate-600" : "bg-blue-500 text-white"}`}>
                    OK
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-body text-[10px] text-slate-600">ou remise :</span>
                  <input type="number" value={manualDiscount} onChange={e => { setManualDiscount(e.target.value); setAppliedPromo(null); }}
                    placeholder="0" className="w-16 px-2 py-1.5 rounded border border-blue-500/8 font-body text-xs bg-cream text-center focus:border-blue-500 focus:outline-none" />
                  <span className="font-body text-[10px] text-slate-600">€</span>
                </div>
              </div>
            )}

            {/* Totals */}
            <div className="border-t border-blue-500/8 pt-3">
              <div className="flex justify-between mb-1">
                <span className="font-body text-xs text-slate-600">Sous-total HT</span>
                <span className="font-body text-xs text-slate-600">{basket.reduce((s, i) => s + i.priceHT, 0).toFixed(2)}€</span>
              </div>
              <div className="flex justify-between mb-1">
                <span className="font-body text-xs text-slate-600">TVA</span>
                <span className="font-body text-xs text-slate-600">{(basketSubtotal - basket.reduce((s, i) => s + i.priceHT, 0)).toFixed(2)}€</span>
              </div>
              {promoDiscount > 0 && (
                <div className="flex justify-between mb-1">
                  <span className="font-body text-xs text-green-600">Réduction</span>
                  <span className="font-body text-xs font-semibold text-green-600">-{promoDiscount.toFixed(2)}€</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-blue-500/8">
                <span className="font-body text-base font-bold text-blue-800">Total TTC</span>
                <div className="flex items-center gap-2">
                  {promoDiscount > 0 && <span className="font-body text-xs text-slate-600 line-through">{basketSubtotal.toFixed(2)}€</span>}
                  <span className="font-body text-xl font-bold text-blue-500">{basketTotal.toFixed(2)}€</span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button onClick={() => { setBasket([]); setAppliedPromo(null); setManualDiscount(""); setPromoCode(""); }}
                className="flex-1 py-2 rounded-lg font-body text-xs font-medium text-red-500 bg-red-50 border-none cursor-pointer hover:bg-red-100">
                Vider le panier
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  </div>
  );
}
