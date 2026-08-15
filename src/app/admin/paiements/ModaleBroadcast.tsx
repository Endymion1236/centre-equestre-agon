"use client";
import React from "react";
import { safeNumber, round2 } from "@/lib/utils";
import { Check, Loader2, Search, X } from "lucide-react";
import type { Family } from "@/types";
import type { BroadcastRow } from "./types-etat";

/**
 * src/app/admin/paiements/ModaleBroadcast.tsx
 *
 * Écran de diffusion d'une commande type (concours, coaching) vers plusieurs
 * familles : on coche les familles, on ajuste le montant ligne par ligne, on
 * crée toutes les commandes d'un coup.
 *
 * Deux règles métier portées par cet écran, et par lui seul :
 *  - UN SEUL cavalier par famille. Un concours, c'est un engagement + un
 *    coaching pour le MÊME enfant. Le sélecteur réaffecte donc toutes les
 *    lignes d'un coup, on ne peut pas engager Ambre et faire coacher Eliot.
 *  - le prix n'est pas le même pour tout le monde (épreuve, licence,
 *    partage du van), d'où les montants réécrivables par famille, mémorisés
 *    dans `overrides` sans toucher la commande source.
 */

interface ModaleBroadcastProps {
  broadcastSource: any;
  setBroadcastSource: (val: any) => void;
  broadcastRows: BroadcastRow[];
  setBroadcastRows: React.Dispatch<React.SetStateAction<BroadcastRow[]>>;
  broadcastSearch: string;
  setBroadcastSearch: (val: string) => void;
  broadcastSending: boolean;
  broadcastToFamilies: () => Promise<void>;
  families: (Family & { firestoreId: string })[];
}

export function ModaleBroadcast({
  broadcastSource, setBroadcastSource, broadcastRows, setBroadcastRows,
  broadcastSearch, setBroadcastSearch, broadcastSending, broadcastToFamilies, families,
}: ModaleBroadcastProps) {
  // Toggle une famille dans la sélection broadcast
  const toggleBroadcastFamily = (family: Family & { firestoreId: string }) => {
    const already = broadcastRows.find(r => r.familyId === family.firestoreId);
    if (already) {
      setBroadcastRows(broadcastRows.filter(r => r.familyId !== family.firestoreId));
      return;
    }
    if (!broadcastSource) return;
    const children = family.children || [];
    // Pour une compétition broadcastée, TOUS les items (engagement + coaching)
    // concernent le MÊME enfant (= une seule inscription au concours).
    // Par défaut on prend le premier enfant. L'admin peut le changer ensuite
    // via le sélecteur dans la modale.
    const defaultChild = children[0];
    const items = (broadcastSource.items || []).map((item: any) => ({
      ...item,
      childId: defaultChild?.id || "",
      childName: defaultChild?.firstName || "",
      creneauId: "",
      reservationId: "",
    }));
    const totalTTC = round2(items.reduce((s: number, i: any) => s + safeNumber(i.priceTTC), 0));
    setBroadcastRows([...broadcastRows, { familyId: family.firestoreId, familyName: family.parentName || "", childId: defaultChild?.id || "", childName: defaultChild?.firstName || "", items, totalTTC, overrides: {} }]);
  };

  /**
   * Change l'enfant sélectionné pour une famille du broadcast.
   * Tous les items de la commande sont réaffectés à ce même enfant
   * (cohérent : 1 compétition = 1 enfant qui fait engagement + coaching).
   */
  const setBroadcastChild = (familyId: string, childId: string, childName: string) => {
    setBroadcastRows(prev => prev.map(r => {
      if (r.familyId !== familyId) return r;
      return {
        ...r,
        childId,
        childName,
        items: r.items.map((it: any) => ({ ...it, childId, childName })),
      };
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-orange-700">Diffusion concours / coaching</h2>
              <p className="font-body text-xs text-slate-600 mt-0.5">Basé sur : <span className="font-semibold">{(broadcastSource.items || []).map((i: any) => i.activityTitle).join(" · ")}</span></p>
            </div>
            <button onClick={() => setBroadcastSource(null)} className="text-slate-600 hover:text-gray-600 bg-transparent border-none cursor-pointer"><X size={20} /></button>
          </div>
          {/* Barre de recherche */}
          <div className="relative mt-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input autoFocus value={broadcastSearch} onChange={e => setBroadcastSearch(e.target.value)}
              placeholder="Filtrer les familles par nom ou prénom cavalier..."
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:border-orange-400 focus:outline-none" />
          </div>
        </div>

        {/* Liste familles cochables */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {families
            .filter(f => {
              if (!broadcastSearch) return true;
              const q = broadcastSearch.toLowerCase();
              return f.parentName?.toLowerCase().includes(q) ||
                (f.children || []).some((c: any) =>
                  `${c.firstName || ""} ${c.lastName || ""}`.toLowerCase().includes(q) ||
                  `${c.lastName || ""} ${c.firstName || ""}`.toLowerCase().includes(q)
                );
            })
            .map(f => {
              const row = broadcastRows.find(r => r.familyId === f.firestoreId);
              const checked = !!row;
              return (
                <div key={f.firestoreId}
                  className={`rounded-xl border-2 transition-all ${checked ? "border-orange-400 bg-orange-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                  {/* Ligne principale — clic pour cocher */}
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => toggleBroadcastFamily(f)}>
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all ${checked ? "bg-orange-500" : "bg-gray-200"}`}>
                      {checked && <Check size={12} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-body text-sm font-semibold text-blue-800">{f.parentName}</div>
                      <div className="font-body text-xs text-slate-600">{(f.children || []).map((c: any) => c.firstName).join(", ") || "Aucun cavalier"}</div>
                    </div>
                    {checked && (
                      <div className="font-body text-sm font-bold text-orange-600 flex-shrink-0">
                        {row!.totalTTC.toFixed(2)}€
                      </div>
                    )}
                  </div>
                  {/* Détail ajustable si coché */}
                  {checked && (
                    <div className="px-4 pb-3 pt-0 border-t border-orange-200 mt-0">
                      {/* Sélecteur d'enfant pour la compétition (1 enfant = engagement + coaching) */}
                      {(f.children || []).length > 1 ? (
                        <div className="flex items-center gap-2 mt-3">
                          <span className="font-body text-xs text-slate-600 flex-shrink-0">Cavalier participant :</span>
                          <select
                            value={row!.childId}
                            onChange={(e) => {
                              const c = (f.children || []).find((ch: any) => ch.id === e.target.value);
                              if (c) setBroadcastChild(f.firestoreId, c.id, c.firstName);
                            }}
                            className="flex-1 px-2 py-1 rounded border border-orange-300 font-body text-xs font-semibold text-blue-700 bg-white focus:outline-none focus:border-orange-500 cursor-pointer">
                            {(f.children || []).map((c: any) => (
                              <option key={c.id} value={c.id}>{c.firstName}</option>
                            ))}
                          </select>
                        </div>
                      ) : (f.children || []).length === 1 ? (
                        <div className="flex items-center gap-2 mt-3">
                          <span className="font-body text-xs text-slate-600">Cavalier :</span>
                          <span className="font-body text-xs font-semibold text-blue-700">{(f.children || [])[0]?.firstName}</span>
                        </div>
                      ) : null}
                      {row!.items.map((item: any, idx: number) => {
                        const currentPrice = row!.overrides[idx] !== undefined ? row!.overrides[idx] : safeNumber(item.priceTTC);
                        return (
                          <div key={idx} className="flex items-center gap-3 mt-2">
                            <span className="font-body text-xs text-gray-600 flex-1 truncate">
                              {item.activityTitle}
                            </span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <input
                                type="number" step="0.01" min="0"
                                value={currentPrice}
                                onChange={e => {
                                  const val = safeNumber(e.target.value);
                                  setBroadcastRows(prev => prev.map(r => {
                                    if (r.familyId !== f.firestoreId) return r;
                                    const newOverrides = { ...r.overrides, [idx]: val };
                                    const newTotal = round2(r.items.reduce((s: number, it: any, i: number) =>
                                      s + (newOverrides[i] !== undefined ? newOverrides[i] : safeNumber(it.priceTTC)), 0));
                                    return { ...r, overrides: newOverrides, totalTTC: newTotal };
                                  }));
                                }}
                                className="w-20 text-right border border-orange-300 rounded px-2 py-1 font-body text-sm font-bold text-orange-700 bg-white focus:outline-none focus:border-orange-500"
                              />
                              <span className="font-body text-xs text-slate-600">€</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              {broadcastRows.length > 0 ? (
                <div>
                  <span className="font-body text-sm font-bold text-orange-700">{broadcastRows.length} famille{broadcastRows.length > 1 ? "s" : ""} sélectionnée{broadcastRows.length > 1 ? "s" : ""}</span>
                  <span className="font-body text-xs text-slate-600 ml-2">· {broadcastRows.reduce((s, r) => s + r.totalTTC, 0).toFixed(2)}€ total à encaisser</span>
                </div>
              ) : (
                <span className="font-body text-xs text-slate-600">Cochez les familles concernées</span>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setBroadcastSource(null)}
                className="font-body text-sm text-slate-600 bg-gray-100 px-4 py-2.5 rounded-lg border-none cursor-pointer hover:bg-gray-200">
                Annuler
              </button>
              <button onClick={broadcastToFamilies}
                disabled={broadcastRows.length === 0 || broadcastSending}
                className={`font-body text-sm font-bold text-white px-5 py-2.5 rounded-lg border-none cursor-pointer transition-all flex items-center gap-2 ${broadcastRows.length === 0 || broadcastSending ? "bg-gray-300 cursor-not-allowed" : "bg-orange-500 hover:bg-orange-600"}`}>
                {broadcastSending ? <><Loader2 size={14} className="animate-spin" /> Envoi...</> : <>Créer {broadcastRows.length > 0 ? broadcastRows.length : ""} commande{broadcastRows.length > 1 ? "s" : ""}</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
