"use client";
/**
 * src/app/admin/paiements/CarteImpayesFamille.tsx
 *
 * Le bloc orange « Impayés » qui apparaît dès qu'une famille est
 * sélectionnée : ce qu'elle doit encore, et les trois façons de solder —
 * son avoir, un bon cadeau, ou un vrai encaissement.
 *
 * Pourquoi ce bloc existe : au comptoir, un parent vient rarement payer une
 * seule chose. Sans ce rappel, l'admin encaisse le stage du jour et laisse
 * filer trois mois d'arriérés qu'il ne voit pas. Les commandes dont le
 * règlement est déjà en route (SEPA, chèques différés, acompte encaissé)
 * sont volontairement écartées du total à encaisser : les inclure ferait
 * payer deux fois.
 *
 * Séparé de TabEncaisser parce que c'est un écran complet à lui seul —
 * il n'a rien à voir avec la construction du panier qui l'entoure.
 */

import React from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Card } from "@/components/ui";
import { safeNumber } from "@/lib/utils";
import type { Family } from "@/types";
import { manualPaymentModes, paymentModes, type PaymentMode } from "./types";
import { aReglementEnCours, calculerRemise, type PromoApplique } from "./calculs-encaisser";
import { inputCls } from "./constantes-encaisser";
import { ChampsReduction } from "./ChampsReduction";
import { appliquerBonCadeau, encaisserImpayesFamille, utiliserAvoirFamille } from "./reglement-famille";

interface CarteImpayesFamilleProps {
  payments: any[];
  encaissements: any[];
  avoirs: any[];
  selectedFamily: string;
  selectedFam: Family & { firestoreId: string };
  appliedPromo: PromoApplique | null;
  setAppliedPromo: (v: PromoApplique | null) => void;
  manualDiscount: string;
  setManualDiscount: (v: string) => void;
  promoCode: string;
  setPromoCode: (v: string) => void;
  applyPromoCode: () => void;
  codeBon: string;
  setCodeBon: (v: string) => void;
  bonBusy: boolean;
  setBonBusy: (v: boolean) => void;
  paidAmount: string;
  setPaidAmount: (v: string) => void;
  paymentMode: PaymentMode;
  setPaymentMode: (v: PaymentMode) => void;
  paymentRef: string;
  setPaymentRef: (v: string) => void;
  encaissementDate: string;
  setEncaissementDate: (v: string) => void;
  enregistrerEncaissement: (
    paymentId: string, paymentData: any, montant: number,
    mode: string, ref?: string, activityTitle?: string, customDate?: string
  ) => Promise<any>;
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
  refreshAll: () => Promise<void>;
}

export function CarteImpayesFamille({
  payments, encaissements, avoirs, selectedFamily, selectedFam,
  appliedPromo, setAppliedPromo, manualDiscount, setManualDiscount,
  promoCode, setPromoCode, applyPromoCode,
  codeBon, setCodeBon, bonBusy, setBonBusy,
  paidAmount, setPaidAmount, paymentMode, setPaymentMode,
  paymentRef, setPaymentRef, encaissementDate, setEncaissementDate,
  enregistrerEncaissement, toast, refreshAll,
}: CarteImpayesFamilleProps) {
  // Toutes les commandes non soldées de la famille
  const allUnpaid = payments.filter(p =>
    p.familyId === selectedFamily &&
    (p.status === "pending" || (p.status === "partial" && (p.paidAmount || 0) < (p.totalTTC || 0)))
  );
  const familyPending = allUnpaid.filter(p => !aReglementEnCours(p, encaissements));
  const enCours = allUnpaid.filter(p => aReglementEnCours(p, encaissements));
  if (allUnpaid.length === 0) return null;
  const totalPending = familyPending.reduce((s, p) => s + (p.totalTTC || 0) - (p.paidAmount || 0), 0);
  const pendingDiscount = calculerRemise(appliedPromo, totalPending, manualDiscount);
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
              <button onClick={() => utiliserAvoirFamille({
                familyAvoirs, totalAvoir, totalPending, familyPending,
                enregistrerEncaissement, toast, refreshAll,
              })} className="w-full mt-2 py-1.5 rounded-lg font-body text-xs font-semibold text-purple-700 bg-purple-100 border-none cursor-pointer hover:bg-purple-200">
                Utiliser {Math.min(totalAvoir, totalPending).toFixed(2)}€ d'avoir
              </button>
            </div>
          );
        })()}

        {/* Appliquer un bon cadeau (par code) */}
        {totalPending > 0 && (
          <div className="mb-3 p-2 bg-emerald-50 rounded-lg">
            <div className="font-body text-xs font-semibold text-emerald-700 mb-1">🎁 Bon cadeau</div>
            <div className="flex gap-2">
              <input value={codeBon} onChange={e => setCodeBon(e.target.value.toUpperCase())} placeholder="Code (ex. BON-XXXX)"
                className="flex-1 px-2 py-1.5 rounded-lg border border-emerald-200 font-mono text-xs bg-white focus:outline-none focus:border-emerald-500" />
              <button disabled={bonBusy || !codeBon.trim()} onClick={() => appliquerBonCadeau({
                codeBon, totalPending, familyPending, selectedFamily,
                setBonBusy, setCodeBon, enregistrerEncaissement, toast, refreshAll,
              })} className="px-3 py-1.5 rounded-lg font-body text-xs font-semibold text-white bg-emerald-600 border-none cursor-pointer hover:bg-emerald-500 disabled:opacity-50">
                {bonBusy ? "..." : "Appliquer"}
              </button>
            </div>
          </div>
        )}

        {/* Réduction / Code promo */}
        <div className="mb-3 border border-blue-500/8 rounded-lg p-2.5">
          <div className="font-body text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-2">Réduction</div>
          <ChampsReduction
            appliedPromo={appliedPromo} setAppliedPromo={setAppliedPromo}
            promoCode={promoCode} setPromoCode={setPromoCode} applyPromoCode={applyPromoCode}
            manualDiscount={manualDiscount} setManualDiscount={setManualDiscount}
          />
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
          {manualPaymentModes.map(m => (
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

        {/* Date d'encaissement (modifiable pour saisie en différé) */}
        <div className="mb-3">
          <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Date d&apos;encaissement</label>
          <input type="date" value={encaissementDate}
            onChange={(e) => setEncaissementDate(e.target.value)}
            className={`${inputCls} w-48`} />
          <p className="font-body text-[10px] text-slate-400 mt-1">Modifiable si encaissement différé</p>
        </div>

        <button onClick={() => encaisserImpayesFamille({
          paidAmount, totalPendingAfterDiscount, pendingDiscount, familyPending, appliedPromo,
          paymentMode, paymentRef, encaissementDate, selectedFam,
          setPaidAmount, setPaymentRef, enregistrerEncaissement, toast, refreshAll,
        })}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-body text-base font-semibold text-white bg-green-600 border-none cursor-pointer hover:bg-green-500 transition-colors">
          <Check size={18} />
          Encaisser {(paidAmount ? safeNumber(paidAmount) : totalPending).toFixed(2)}€
          {paidAmount && safeNumber(paidAmount) < totalPending ? " (partiel)" : ` (${familyPending.length} prestation${familyPending.length > 1 ? "s" : ""})`}
        </button>
      </div>
    </Card>
  );
}
