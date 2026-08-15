"use client";
import React from "react";
import { safeNumber } from "@/lib/utils";
import { Loader2, X } from "lucide-react";
import { MODES_ENCAISSEMENT_RAPIDE } from "./constants";
import { repartirEnParts } from "./calculs-paiement";
import type { ChequeDiffereSaisi } from "./types-etat";

/**
 * src/app/admin/paiements/ModaleEncaisserRapide.tsx
 *
 * La modale « Encaisser » d'une commande, ouverte depuis l'onglet Impayés.
 *
 * Elle affiche un formulaire qui change complètement de nature selon le mode
 * choisi — d'où sa taille : un chèque demande une référence, un SEPA un
 * échéancier, des chèques différés une grille entière (numéro, banque,
 * montant, date par chèque) avec répartition automatique.
 *
 * Deux garde-fous visuels qui protègent la comptabilité :
 *  - le mode SEPA est GRISÉ tant qu'aucun mandat actif n'a été trouvé pour
 *    la famille : sans mandat, les échéances créées ne seraient jamais
 *    prélevées et la commande resterait éternellement en attente ;
 *  - l'avoir n'apparaît que si la famille a un solde disponible, avec le
 *    montant restant affiché, pour éviter de « payer par avoir » à découvert.
 *
 * Le composant ne fait que saisir : l'enregistrement est dans
 * encaissement-rapide.ts, appelé par la page via `handleQuickEncaisser`.
 */

interface ModaleEncaisserRapideProps {
  quickEncaisser: { payment: any };
  setQuickEncaisser: (val: { payment: any } | null) => void;
  quickMontant: string;
  setQuickMontant: (val: string) => void;
  quickMode: string;
  setQuickMode: (val: string) => void;
  quickRef: string;
  setQuickRef: (val: string) => void;
  quickDate: string;
  setQuickDate: (val: string) => void;
  quickAvoirs: any[];
  /** null = vérification du mandat SEPA en cours, false = aucun mandat actif. */
  quickMandatActif: boolean | null;
  quickChequesDiffres: ChequeDiffereSaisi[];
  setQuickChequesDiffres: (val: ChequeDiffereSaisi[]) => void;
  quickSaving: boolean;
  handleQuickEncaisser: () => Promise<void>;
}

export function ModaleEncaisserRapide({
  quickEncaisser, setQuickEncaisser, quickMontant, setQuickMontant,
  quickMode, setQuickMode, quickRef, setQuickRef, quickDate, setQuickDate,
  quickAvoirs, quickMandatActif, quickChequesDiffres, setQuickChequesDiffres,
  quickSaving, handleQuickEncaisser,
}: ModaleEncaisserRapideProps) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setQuickEncaisser(null)}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-display text-lg font-bold text-blue-800">Encaisser</h2>
            <p className="font-body text-xs text-slate-500 mt-0.5">{quickEncaisser.payment.familyName}</p>
          </div>
          <button onClick={() => setQuickEncaisser(null)} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20}/></button>
        </div>
        <div className="p-5 flex flex-col gap-4 overflow-y-auto flex-1 min-h-0">
          {/* Montant */}
          <div>
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Montant (€)</label>
            <input type="number" min="0" step="0.01" value={quickMontant}
              onChange={e => setQuickMontant(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none text-right text-lg font-semibold"/>
            <p className="font-body text-[10px] text-slate-400 mt-1">Dû : {((quickEncaisser.payment.totalTTC||0)-(quickEncaisser.payment.paidAmount||0)).toFixed(2)}€</p>
          </div>
          {/* Mode */}
          <div>
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Mode de paiement</label>
            {quickAvoirs.length > 0 && (() => {
              const totalAvoir = quickAvoirs.reduce((s, a) => s + (a.remainingAmount || 0), 0);
              return (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-2.5 mb-2">
                  <button
                    onClick={() => setQuickMode("avoir")}
                    className={`w-full text-left font-body text-sm font-semibold cursor-pointer border-none bg-transparent ${
                      quickMode === "avoir" ? "text-purple-700" : "text-purple-600"
                    }`}>
                    💜 Utiliser l'avoir ({totalAvoir.toFixed(2)}€ disponible) {quickMode === "avoir" && "✓"}
                  </button>
                </div>
              );
            })()}
            <div className="grid grid-cols-2 gap-2">
              {MODES_ENCAISSEMENT_RAPIDE.map(m => {
                const isSepa = m.id === "prelevement_sepa";
                const sepaBlocked = isSepa && quickMandatActif === false;
                return (
                  <button key={m.id}
                    onClick={() => !sepaBlocked && setQuickMode(m.id)}
                    disabled={sepaBlocked}
                    title={sepaBlocked ? "Aucun mandat SEPA actif pour cette famille" : undefined}
                    className={`py-2.5 rounded-xl font-body text-sm font-semibold border transition-all
                          ${sepaBlocked ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60" :
                        quickMode === m.id ? "bg-blue-500 text-white border-blue-500 cursor-pointer" :
                        "bg-white text-slate-600 border-gray-200 hover:border-blue-300 cursor-pointer"}`}>
                    {m.icon} {m.label}
                    {sepaBlocked && <span className="block text-[9px] text-red-400 mt-0.5">Pas de mandat</span>}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Échéancier SEPA */}
          {quickMandatActif === false && quickMode === "prelevement_sepa" && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <span className="text-red-500 text-base">⚠️</span>
              <div>
                <p className="font-body text-xs font-semibold text-red-600">Aucun mandat SEPA actif pour cette famille</p>
                <p className="font-body text-[10px] text-red-400 mt-0.5">Créez un mandat dans <strong>Prélèvements SEPA</strong> avant d'utiliser ce mode.</p>
              </div>
            </div>
          )}
          {quickMandatActif === null && quickMode === "prelevement_sepa" && (
            <div className="font-body text-xs text-slate-400 flex items-center gap-2">
              <span className="animate-spin inline-block">⏳</span> Vérification du mandat...
            </div>
          )}
          {quickMode === "prelevement_sepa" && (
            <div className="bg-blue-50 rounded-xl p-4 flex flex-col gap-3">
              <div className="font-body text-xs font-semibold text-blue-800">Échéancier SEPA</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-body text-[10px] text-gray-400 block mb-1">Nb échéances</label>
                  <select value={quickRef || "10"} onChange={e => setQuickRef(e.target.value)}
                    className="w-full px-2 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white">
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={n}>{n}×</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-body text-[10px] text-gray-400 block mb-1">1ère échéance</label>
                  <input type="date" value={quickDate} onChange={e => setQuickDate(e.target.value)}
                    className="w-full px-2 py-2 rounded-lg border border-gray-200 font-body text-sm"/>
                </div>
              </div>
              {quickMontant && (
                <div className="font-body text-xs text-blue-600">
                  💡 {quickRef || "10"} × {(parseFloat(quickMontant) / parseInt(quickRef || "10")).toFixed(2)}€ = {parseFloat(quickMontant).toFixed(2)}€
                </div>
              )}
              <div className="font-body text-[10px] text-gray-400">
                Un mandat SEPA doit exister pour cette famille. Les échéances seront créées dans le module Prélèvements SEPA.
              </div>
            </div>
          )}
          {/* Saisie multi-chèques (mode cheque_differe) */}
          {quickMode === "cheque_differe" && (() => {
            const totalChq = quickChequesDiffres.reduce((s, c) => s + safeNumber(c.montant), 0);
            const montantCible = parseFloat(quickMontant) || ((quickEncaisser.payment.totalTTC || 0) - (quickEncaisser.payment.paidAmount || 0));
            const ecart = Math.round((totalChq - montantCible) * 100) / 100;
            const ecartAbs = Math.abs(ecart);
            return (
              <div className="border border-orange-200 rounded-xl p-3 bg-orange-50 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="font-body text-xs font-semibold text-orange-800">
                    📅 Chèques ({quickChequesDiffres.length})
                  </div>
                  <div className="font-body text-xs text-orange-700">
                    <span className="font-bold">{totalChq.toFixed(2)}€</span> / {montantCible.toFixed(2)}€
                    {ecartAbs > 0.01 && (
                      <span className="ml-1 text-red-600">
                        ({ecart > 0 ? "+" : ""}{ecart.toFixed(2)}€)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  {quickChequesDiffres.map((chq, idx) => (
                    <div key={idx} className="flex flex-col gap-1 bg-white rounded-lg p-2 border border-orange-100">
                      <div className="flex gap-1.5 items-center">
                        <input
                          value={chq.numero}
                          onChange={e => {
                            const u = [...quickChequesDiffres]; u[idx].numero = e.target.value; setQuickChequesDiffres(u);
                          }}
                          placeholder="N°"
                          className="w-20 px-2 py-1 rounded border border-gray-200 font-body text-xs focus:outline-none focus:border-orange-400"
                        />
                        <input
                          value={chq.banque}
                          onChange={e => {
                            const u = [...quickChequesDiffres]; u[idx].banque = e.target.value; setQuickChequesDiffres(u);
                          }}
                          placeholder="Banque"
                          className="flex-1 min-w-0 px-2 py-1 rounded border border-gray-200 font-body text-xs focus:outline-none focus:border-orange-400"
                        />
                        {quickChequesDiffres.length > 1 && (
                          <button
                            onClick={() => setQuickChequesDiffres(quickChequesDiffres.filter((_, i) => i !== idx))}
                            className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-1"
                            title="Supprimer ce chèque">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      <div className="flex gap-1.5 items-center">
                        <input
                          value={chq.montant}
                          onChange={e => {
                            const u = [...quickChequesDiffres]; u[idx].montant = e.target.value; setQuickChequesDiffres(u);
                          }}
                          type="number" step="0.01" placeholder="Montant"
                          className="w-24 px-2 py-1 rounded border border-gray-200 font-body text-xs text-right focus:outline-none focus:border-orange-400"
                        />
                        <input
                          value={chq.dateEncaissementPrevue}
                          onChange={e => {
                            const u = [...quickChequesDiffres]; u[idx].dateEncaissementPrevue = e.target.value; setQuickChequesDiffres(u);
                          }}
                          type="date"
                          className="flex-1 min-w-0 px-2 py-1 rounded border border-gray-200 font-body text-xs focus:outline-none focus:border-orange-400"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => {
                      const reste = Math.max(0, Math.round((montantCible - totalChq) * 100) / 100);
                      const lastDate = quickChequesDiffres[quickChequesDiffres.length - 1]?.dateEncaissementPrevue;
                      let nextDate = new Date().toISOString().split("T")[0];
                      if (lastDate) {
                        const d = new Date(lastDate);
                        d.setMonth(d.getMonth() + 1);
                        nextDate = d.toISOString().split("T")[0];
                      }
                      setQuickChequesDiffres([...quickChequesDiffres, { numero: "", banque: "", montant: reste > 0 ? reste.toFixed(2) : "", dateEncaissementPrevue: nextDate }]);
                    }}
                    className="font-body text-xs text-orange-700 bg-white border border-orange-300 px-2.5 py-1 rounded-lg cursor-pointer hover:bg-orange-100">
                    + Ajouter
                  </button>
                  {quickChequesDiffres.length > 0 && (
                    <button
                      onClick={() => {
                        const n = quickChequesDiffres.length;
                        if (n === 0) return;
                        const baseDate = quickChequesDiffres[0]?.dateEncaissementPrevue || new Date().toISOString().split("T")[0];
                        const parts = repartirEnParts(montantCible, n);
                        const updated = quickChequesDiffres.map((c, i) => {
                          const d = new Date(baseDate);
                          d.setMonth(d.getMonth() + i);
                          return {
                            ...c,
                            montant: parts[i].toFixed(2),
                            dateEncaissementPrevue: d.toISOString().split("T")[0],
                          };
                        });
                        setQuickChequesDiffres(updated);
                      }}
                      className="font-body text-xs text-orange-700 bg-white border border-orange-300 px-2.5 py-1 rounded-lg cursor-pointer hover:bg-orange-100">
                      ⚖️ Répartir en {quickChequesDiffres.length}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
          {/* Date (masquée en mode cheque_differe : chaque chèque a sa propre date) */}
          {quickMode !== "cheque_differe" && (
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Date d'encaissement</label>
              <input type="date" value={quickDate} onChange={e => setQuickDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"/>
              <p className="font-body text-[10px] text-slate-400 mt-1">Modifiable si encaissement différé</p>
            </div>
          )}
          {/* Référence (masquée en mode cheque_differe : le N° se saisit par chèque) */}
          {quickMode !== "cheque_differe" && (
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Référence (optionnel)</label>
              <input value={quickRef} onChange={e => setQuickRef(e.target.value)}
                placeholder="N° chèque, virement..."
                className="w-full px-3 py-2.5 rounded-xl border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"/>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={() => setQuickEncaisser(null)} className="px-5 py-3 rounded-xl font-body text-sm text-slate-500 bg-gray-100 border-none cursor-pointer">Annuler</button>
            <button onClick={handleQuickEncaisser} disabled={quickSaving || !quickMontant || (quickMode === "prelevement_sepa" && quickMandatActif !== true)}
              className="flex-1 py-3 rounded-xl font-body text-sm font-semibold text-white bg-green-600 hover:bg-green-700 border-none cursor-pointer disabled:opacity-50">
              {quickSaving ? <Loader2 size={16} className="animate-spin inline mr-2"/> : (quickMode === "cheque_differe" ? "📅 " : "💶 ")}
              {quickMode === "cheque_differe"
                ? `Enregistrer ${quickChequesDiffres.length} chèque${quickChequesDiffres.length > 1 ? "s" : ""}`
                : `Confirmer ${quickMontant ? `${parseFloat(quickMontant).toFixed(2)}€` : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
