"use client";
import React from "react";
import { paymentModes } from "./types";
import { MODES_ENCAISSEMENT_GROUPE } from "./constants";
import type { MultiEncaisserState } from "./types-etat";

/**
 * src/app/admin/paiements/ModaleEncaissementGroupe.tsx
 *
 * « Encaisser ensemble » : une famille tend UN chèque qui couvre plusieurs
 * factures (le stage de l'aîné, la licence du cadet, un forfait en retard).
 *
 * Ce que l'écran ne fait PAS, volontairement : fusionner les commandes.
 * Chaque facture reste un document distinct avec son propre numéro et sa
 * propre écriture au journal — sinon la piste d'audit NF525 serait rompue.
 * Le geste est unique côté famille, la comptabilité reste ligne à ligne.
 */

interface ModaleEncaissementGroupeProps {
  multiEncaisser: MultiEncaisserState;
  setMultiEncaisser: (val: MultiEncaisserState | null) => void;
  multiMode: string;
  setMultiMode: (val: string) => void;
  multiRef: string;
  setMultiRef: (val: string) => void;
  multiDate: string;
  setMultiDate: (val: string) => void;
  multiSaving: boolean;
  handleMultiEncaisser: () => Promise<void>;
}

export function ModaleEncaissementGroupe({
  multiEncaisser, setMultiEncaisser, multiMode, setMultiMode,
  multiRef, setMultiRef, multiDate, setMultiDate, multiSaving, handleMultiEncaisser,
}: ModaleEncaissementGroupeProps) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !multiSaving && setMultiEncaisser(null)}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-display text-lg font-bold text-blue-800">Encaisser ensemble</h2>
          <p className="font-body text-xs text-slate-500 mt-0.5">{multiEncaisser.familyName} · {multiEncaisser.payments.length} factures</p>
        </div>
        <div className="p-5 overflow-y-auto flex-1">
          {/* Liste des factures réglées en un coup */}
          <div className="flex flex-col gap-1.5 mb-4">
            {multiEncaisser.payments.map((p: any) => {
              const du = Math.max(0, (p.totalTTC || 0) - (p.paidAmount || 0));
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 bg-cream rounded-lg px-3 py-2">
                  <span className="font-body text-xs text-slate-600 min-w-0 truncate">{(p.items || []).map((i: any) => i.activityTitle).join(", ") || "Facture"}</span>
                  <span className="font-body text-xs font-semibold text-blue-800 shrink-0">{du.toFixed(2)}€</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2.5 mb-4">
            <span className="font-body text-sm font-semibold text-blue-800">Total à encaisser</span>
            <span className="font-body text-lg font-bold text-blue-800">
              {multiEncaisser.payments.reduce((s, p) => s + Math.max(0, (p.totalTTC || 0) - (p.paidAmount || 0)), 0).toFixed(2)}€
            </span>
          </div>

          {/* Mode de paiement — modes directs uniquement (pas de chèque
              différé / SEPA, qui sont des règlements échelonnés) */}
          <label className="font-body text-xs font-semibold text-slate-600 block mb-1.5">Mode de paiement</label>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {paymentModes.filter(m => MODES_ENCAISSEMENT_GROUPE.includes(m.id)).map(m => (
              <button key={m.id} onClick={() => setMultiMode(m.id)}
                className={`font-body text-sm py-2 rounded-lg border cursor-pointer ${multiMode === m.id ? "bg-blue-500 text-white border-blue-500 font-semibold" : "bg-white text-slate-600 border-gray-200 hover:border-gray-300"}`}>
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 mb-1">
            <div className="flex-1">
              <label className="font-body text-xs font-semibold text-slate-600 block mb-1.5">Date</label>
              <input type="date" value={multiDate} onChange={e => setMultiDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:border-blue-400 focus:outline-none" />
            </div>
            <div className="flex-1">
              <label className="font-body text-xs font-semibold text-slate-600 block mb-1.5">Référence (option.)</label>
              <input value={multiRef} onChange={e => setMultiRef(e.target.value)} placeholder="N° chèque…"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:border-blue-400 focus:outline-none" />
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-gray-100 flex gap-2 flex-shrink-0">
          <button onClick={() => setMultiEncaisser(null)} disabled={multiSaving}
            className="flex-1 font-body text-sm text-slate-500 bg-gray-100 py-2.5 rounded-lg border-none cursor-pointer disabled:opacity-50">Annuler</button>
          <button onClick={handleMultiEncaisser} disabled={multiSaving}
            className="flex-1 font-body text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 py-2.5 rounded-lg border-none cursor-pointer disabled:opacity-50">
            {multiSaving ? "Encaissement…" : "💳 Tout encaisser"}
          </button>
        </div>
      </div>
    </div>
  );
}
