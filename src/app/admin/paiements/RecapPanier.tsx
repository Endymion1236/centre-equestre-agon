"use client";
/**
 * src/app/admin/paiements/RecapPanier.tsx
 *
 * La colonne de droite : le panier en cours, sa remise éventuelle et sa
 * ventilation HT / TVA / TTC.
 *
 * C'est le récapitulatif que l'admin lit à voix haute avant d'encaisser,
 * d'où le total TTC en gros et le sous-total barré quand une remise
 * s'applique. Le HT et la TVA affichés sont ceux qui partiront en
 * comptabilité : ils sont recalculés depuis les articles, jamais saisis.
 *
 * Séparé de TabEncaisser : cette colonne ne fait que LIRE le panier (plus
 * les deux boutons qui le vident ou en retirent une ligne), elle n'a aucune
 * part dans sa construction ni dans l'encaissement.
 */

import React from "react";
import { ShoppingCart, X } from "lucide-react";
import { Card } from "@/components/ui";
import type { Family } from "@/types";
import type { BasketItem } from "./types";
import type { PromoApplique } from "./calculs-encaisser";
import { ChampsReduction } from "./ChampsReduction";

interface RecapPanierProps {
  basket: BasketItem[];
  setBasket: (v: BasketItem[]) => void;
  selectedFam: (Family & { firestoreId: string }) | undefined;
  basketSubtotal: number;
  basketTotal: number;
  promoDiscount: number;
  removeFromBasket: (id: string) => void;
  appliedPromo: PromoApplique | null;
  setAppliedPromo: (v: PromoApplique | null) => void;
  promoCode: string;
  setPromoCode: (v: string) => void;
  applyPromoCode: () => void;
  manualDiscount: string;
  setManualDiscount: (v: string) => void;
}

export function RecapPanier({
  basket, setBasket, selectedFam, basketSubtotal, basketTotal, promoDiscount, removeFromBasket,
  appliedPromo, setAppliedPromo, promoCode, setPromoCode, applyPromoCode,
  manualDiscount, setManualDiscount,
}: RecapPanierProps) {
  return (
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
                <ChampsReduction
                  appliedPromo={appliedPromo} setAppliedPromo={setAppliedPromo}
                  promoCode={promoCode} setPromoCode={setPromoCode} applyPromoCode={applyPromoCode}
                  manualDiscount={manualDiscount} setManualDiscount={setManualDiscount}
                />
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
  );
}
