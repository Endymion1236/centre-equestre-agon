"use client";
/**
 * src/app/admin/paiements/TabEncaisser.tsx
 *
 * L'onglet « Encaisser » : la caisse du centre. On y choisit une famille,
 * on remplit un panier (activité du catalogue, saisie libre, bon cadeau),
 * on choisit un mode de règlement et on valide.
 *
 * Ce fichier n'est plus que le chef d'orchestre : il tient l'état de
 * l'écran et le distribue. Tout ce qui écrit en base ou calcule un montant
 * vit à côté — `encaissement-panier.ts` pour la validation du panier,
 * `reglement-famille.ts` pour les impayés d'une famille,
 * `calculs-encaisser.ts` pour les remises. Les morceaux d'écran autonomes
 * (sélection famille, impayés, catalogue, chèques différés, récapitulatif)
 * ont chacun leur fichier.
 */

import React, { useState, useEffect } from "react";
import { safeNumber } from "@/lib/utils";
import {
  fetchVacationPeriods,
  fetchDiscountSettings,
  type VacationPeriod,
  type DiscountSettings,
} from "@/lib/discounts";
import { Card } from "@/components/ui";
import { Plus, Check, Loader2 } from "lucide-react";
import type { Family, Activity } from "@/types";
import { BasketItem, PaymentMode, paymentModes, manualPaymentModes } from "./types";
import type { ChequeDiffereSaisi } from "./types-etat";
import { calculerRemise, type PromoApplique } from "./calculs-encaisser";
import { CATEGORIES, inputCls } from "./constantes-encaisser";
import { construireItemActivite, construireItemBonCadeau, construireItemLibre } from "./panier-encaisser";
import { validerPaiementPanier } from "./encaissement-panier";
import { SelecteurFamille } from "./SelecteurFamille";
import { CarteImpayesFamille } from "./CarteImpayesFamille";
import { SelecteurActivite } from "./SelecteurActivite";
import { SaisieChequesDiffres } from "./SaisieChequesDiffres";
import { RecapPanier } from "./RecapPanier";

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
  const [familySearch, setFamilySearch] = useState("");
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [selectedActivity, setSelectedActivity] = useState("");
  const [activitySearch, setActivitySearch] = useState("");
  const [activityDropdownOpen, setActivityDropdownOpen] = useState(false);
  const [selectedChild, setSelectedChild] = useState("");
  const [selectedFamily, setSelectedFamily] = useState("");
  const [codeBon, setCodeBon] = useState("");
  const [bonBusy, setBonBusy] = useState(false);
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
  const [appliedPromo, setAppliedPromo] = useState<PromoApplique | null>(null);
  const [manualDiscount, setManualDiscount] = useState("");

  // ─── Chèques différés (mode "cheque_differe") ─────────────────────────────
  const [chequesDiffres, setChequesDiffres] = useState<ChequeDiffereSaisi[]>([
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

  const selectedFam = families.find((f) => f.firestoreId === selectedFamily);

  const addToBasket = () => {
    if (!selectedFamily) {
      toast("Veuillez d'abord sélectionner une famille", "warning");
      return;
    }
    if (customLabel && customPrice) {
      // Résoudre le prénom de l'enfant à partir de son ID
      const selFam = families.find(f => f.firestoreId === selectedFamily);
      const selChild = (selFam?.children || []).find((c: any) => c.id === selectedChild);
      const childNameLabel = (selChild as any)?.firstName || "—";
      setBasket([...basket, construireItemLibre({
        customLabel, customPrice, customTva, customCategory,
        childId: selectedChild || "", childName: childNameLabel,
      })]);
      setCustomLabel(""); setCustomPrice(""); return;
    }
    if (!selectedActivity) return;
    const act = activities.find((a) => a.firestoreId === selectedActivity);
    if (!act) return;
    const fam = families.find(f => f.firestoreId === selectedFamily);
    const child = (fam?.children || []).find((c: any) => c.id === selectedChild);
    const childName = (child as any)?.firstName || selectedChild || "—";
    setBasket([...basket, construireItemActivite(act, selectedChild, childName)]);
  };

  const vendreBonCadeau = () => {
    if (!selectedFamily) { toast("Sélectionne d'abord la famille (l'acheteur)", "warning"); return; }
    const montantStr = prompt("Montant du bon cadeau (€) :");
    if (!montantStr) return;
    const montant = safeNumber(montantStr);
    if (!montant || montant <= 0) { toast("Montant invalide", "warning"); return; }
    const dest = (prompt("Nom du bénéficiaire (optionnel) :") || "").trim();
    setBasket([...basket, construireItemBonCadeau(montant, dest)]);
  };

  const basketSubtotal = basket.reduce((s, i) => s + i.priceTTC, 0);
  const promoDiscount = calculerRemise(appliedPromo, basketSubtotal, manualDiscount);
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

  const handlePayment = () => validerPaiementPanier({
    basket, selectedFamily, selectedFam, appliedPromo, manualDiscount,
    paymentMode, paymentRef, paidAmount, encaissementDate, chequesDiffres,
    discountSettings, vacationPeriods,
    setSaving, setBasket, setPaymentRef, setPaidAmount, setEncaissementDate,
    setChequesDiffres, setSuccess,
    enregistrerEncaissement, toast, refreshAll,
  });

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
      <SelecteurFamille
        families={families} familySearch={familySearch} setFamilySearch={setFamilySearch}
        selectedFamily={selectedFamily} setSelectedFamily={setSelectedFamily}
        selectedFam={selectedFam} selectedChild={selectedChild} setSelectedChild={setSelectedChild}
      />

      {/* Impayés de cette famille */}
      {selectedFam && (
        <CarteImpayesFamille
          payments={payments} encaissements={encaissements} avoirs={avoirs}
          selectedFamily={selectedFamily} selectedFam={selectedFam}
          appliedPromo={appliedPromo} setAppliedPromo={setAppliedPromo}
          manualDiscount={manualDiscount} setManualDiscount={setManualDiscount}
          promoCode={promoCode} setPromoCode={setPromoCode} applyPromoCode={applyPromoCode}
          codeBon={codeBon} setCodeBon={setCodeBon} bonBusy={bonBusy} setBonBusy={setBonBusy}
          paidAmount={paidAmount} setPaidAmount={setPaidAmount}
          paymentMode={paymentMode} setPaymentMode={setPaymentMode}
          paymentRef={paymentRef} setPaymentRef={setPaymentRef}
          encaissementDate={encaissementDate} setEncaissementDate={setEncaissementDate}
          enregistrerEncaissement={enregistrerEncaissement} toast={toast} refreshAll={refreshAll}
        />
      )}

      {/* Add items */}
      <Card padding="md" className="mb-4">
        <h3 className="font-body text-sm font-semibold text-blue-800 mb-3">2. Ajouter au panier</h3>

        {/* From activity catalog — recherche combobox */}
        <SelecteurActivite
          activities={activities}
          activitySearch={activitySearch} setActivitySearch={setActivitySearch}
          selectedActivity={selectedActivity} setSelectedActivity={setSelectedActivity}
          activityDropdownOpen={activityDropdownOpen} setActivityDropdownOpen={setActivityDropdownOpen}
          addToBasket={addToBasket}
        />

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
          <div className="mt-3 pt-3 border-t border-blue-500/8">
            <button onClick={vendreBonCadeau}
              className="px-4 py-2 rounded-lg font-body text-sm font-semibold border-none cursor-pointer bg-emerald-600 text-white hover:bg-emerald-500">
              🎁 Vendre un bon cadeau
            </button>
            <span className="ml-2 font-body text-xs text-gray-400">Ajoute un bon au panier. Le code est généré et la vente enregistrée en recette au paiement.</span>
          </div>
        </div>
      </Card>

      {/* Payment mode */}
      {basket.length > 0 && (
        <Card padding="md">
          <h3 className="font-body text-sm font-semibold text-blue-800 mb-3">3. Mode de paiement</h3>
          <div className="flex flex-wrap gap-2 mb-4">
            {manualPaymentModes.map((m) => (
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
          {paymentMode === "cheque_differe" && (
            <SaisieChequesDiffres
              chequesDiffres={chequesDiffres} setChequesDiffres={setChequesDiffres}
              basketTotal={basketTotal}
            />
          )}

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
            {(() => {
              if (saving) return "Enregistrement...";
              // Montant qu'on va REELLEMENT encaisser :
              //  - si l'admin a saisi un montant partiel valide > 0, c'est lui
              //  - sinon c'est le total du panier
              const saisi = safeNumber(paidAmount);
              const aEncaisser = (paidAmount && saisi > 0 && saisi < basketTotal) ? saisi : basketTotal;
              const partiel = aEncaisser < basketTotal;
              return `Valider le paiement — ${aEncaisser.toFixed(2)}€${partiel ? " (partiel)" : ""}`;
            })()}
          </button>
        </Card>
      )}
    </div>

    {/* Right: basket summary */}
    <RecapPanier
      basket={basket} setBasket={setBasket} selectedFam={selectedFam}
      basketSubtotal={basketSubtotal} basketTotal={basketTotal} promoDiscount={promoDiscount}
      removeFromBasket={removeFromBasket}
      appliedPromo={appliedPromo} setAppliedPromo={setAppliedPromo}
      promoCode={promoCode} setPromoCode={setPromoCode} applyPromoCode={applyPromoCode}
      manualDiscount={manualDiscount} setManualDiscount={setManualDiscount}
    />
  </div>
  );
}
