"use client";
/**
 * src/app/admin/paiements/ChampsReduction.tsx
 *
 * Les champs « Réduction » de l'onglet Encaisser : un code promo à valider,
 * ou une remise en euros saisie à la main.
 *
 * Un seul fichier parce que ce bloc apparaît DEUX fois à l'écran — sur le
 * panier en cours et sur les impayés de la famille — et qu'il pilote le
 * même état dans les deux cas. Les deux copies devaient rester identiques
 * au pixel et surtout se comporter pareil : saisir une remise annule le
 * code promo appliqué, et inversement, on ne cumule jamais les deux.
 *
 * L'encadrement (bordure, titre) reste chez l'appelant : le panier et les
 * impayés ne l'habillent pas de la même façon.
 */

import React from "react";
import type { PromoApplique } from "./calculs-encaisser";

interface ChampsReductionProps {
  appliedPromo: PromoApplique | null;
  setAppliedPromo: (v: PromoApplique | null) => void;
  promoCode: string;
  setPromoCode: (v: string) => void;
  applyPromoCode: () => void;
  manualDiscount: string;
  setManualDiscount: (v: string) => void;
}

export function ChampsReduction({
  appliedPromo, setAppliedPromo, promoCode, setPromoCode,
  applyPromoCode, manualDiscount, setManualDiscount,
}: ChampsReductionProps) {
  return (
    <>
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
    </>
  );
}
