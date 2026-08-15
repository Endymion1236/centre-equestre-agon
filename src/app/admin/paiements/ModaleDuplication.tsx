"use client";
import React from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber, round2, generateOrderId } from "@/lib/utils";
import { Plus, Search, Copy, ShoppingCart } from "lucide-react";
import type { Family } from "@/types";
import type { BroadcastRow, DuplicateTarget } from "./types-etat";

/**
 * src/app/admin/paiements/ModaleDuplication.tsx
 *
 * « Utiliser cette commande » : réemployer une commande existante plutôt que
 * de ressaisir dix lignes identiques. Trois usages, trois issues :
 *  1. même famille → on précharge le panier de l'onglet Encaisser, l'admin
 *     choisit les créneaux puis encaisse ;
 *  2. autre famille → on crée directement une commande `pending`, après
 *     avoir fait correspondre chaque prestation à un cavalier de la famille
 *     cible (une fratrie n'a ni le même nombre ni les mêmes prénoms) ;
 *  3. diffusion concours → on passe la main à la modale de broadcast.
 *
 * Composant à part parce que ce sont trois écrans successifs dans une même
 * fenêtre, avec leur propre navigation (retour, changement de famille), qui
 * n'ont rien à voir avec le reste de la page.
 */

interface ModaleDuplicationProps {
  duplicateTarget: DuplicateTarget;
  setDuplicateTarget: (val: DuplicateTarget | null) => void;
  families: (Family & { firestoreId: string })[];
  duplicateToBasket: (payment: any) => void;
  setBroadcastSource: (val: any) => void;
  setBroadcastRows: (val: BroadcastRow[]) => void;
  setBroadcastSearch: (val: string) => void;
  refreshAll: (changedPaymentIds?: string[]) => Promise<void>;
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
}

export function ModaleDuplication({
  duplicateTarget, setDuplicateTarget, families, duplicateToBasket,
  setBroadcastSource, setBroadcastRows, setBroadcastSearch, refreshAll, toast,
}: ModaleDuplicationProps) {
  const p = duplicateTarget.payment;
  const mode = duplicateTarget.mode;
  const searchLower = duplicateTarget.targetSearch.toLowerCase();
  const filteredFams = families.filter(f =>
    f.firestoreId !== p.familyId &&
    (f.parentName?.toLowerCase().includes(searchLower) ||
    (f.children || []).some((c: any) =>
      `${c.firstName || ""} ${c.lastName || ""}`.toLowerCase().includes(searchLower) ||
      `${c.lastName || ""} ${c.firstName || ""}`.toLowerCase().includes(searchLower)
    ))
  ).slice(0, 8);

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDuplicateTarget(null)}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* En-tête */}
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-display text-lg font-bold text-blue-800">Utiliser cette commande</h2>
          <div className="mt-2 p-3 bg-sand rounded-lg">
            <div className="font-body text-sm font-semibold text-blue-800">{p.familyName}</div>
            <div className="font-body text-xs text-slate-600 mt-0.5">{(p.items || []).map((i: any) => i.activityTitle).join(" · ")}</div>
            <div className="font-body text-sm font-bold text-blue-500 mt-1">{safeNumber(p.totalTTC).toFixed(2)}€</div>
          </div>
        </div>

        {/* Choix du mode */}
        {mode === "choose" && (
          <div className="p-5 flex flex-col gap-3">
            {/* Mode 1 : pré-remplir le panier */}
            <button onClick={() => duplicateToBasket(p)}
              className="w-full flex items-center gap-4 px-4 py-4 rounded-xl border-2 border-blue-200 bg-blue-50 cursor-pointer hover:bg-blue-100 hover:border-blue-400 text-left transition-all">
              <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                <ShoppingCart size={18} className="text-white" />
              </div>
              <div>
                <div className="font-body text-sm font-bold text-blue-800">Pré-remplir le panier</div>
                <div className="font-body text-xs text-slate-600 mt-0.5">Même famille · les prestations sont chargées dans le panier, vous choisissez les créneaux puis encaissez</div>
              </div>
            </button>
            {/* Mode 2 : commande à encaisser pour autre famille */}
            <button onClick={() => setDuplicateTarget({ ...duplicateTarget, mode: "other_family" })}
              className="w-full flex items-center gap-4 px-4 py-4 rounded-xl border-2 border-purple-200 bg-purple-50 cursor-pointer hover:bg-purple-100 hover:border-purple-400 text-left transition-all">
              <div className="w-10 h-10 rounded-lg bg-purple-500 flex items-center justify-center flex-shrink-0">
                <Plus size={18} className="text-white" />
              </div>
              <div>
                <div className="font-body text-sm font-bold text-purple-800">Commande pour une autre famille</div>
                <div className="font-body text-xs text-slate-600 mt-0.5">Crée une commande en attente pour une famille différente · apparaît dans Impayés</div>
              </div>
            </button>
            {/* Mode 3 : diffusion concours */}
            <button onClick={() => { setBroadcastSource(duplicateTarget.payment); setDuplicateTarget(null); setBroadcastRows([]); setBroadcastSearch(""); }}
              className="w-full flex items-center gap-4 px-4 py-4 rounded-xl border-2 border-orange-200 bg-orange-50 cursor-pointer hover:bg-orange-100 hover:border-orange-400 text-left transition-all">
              <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
                <Copy size={18} className="text-white" />
              </div>
              <div>
                <div className="font-body text-sm font-bold text-orange-800">Diffusion concours / coaching</div>
                <div className="font-body text-xs text-slate-600 mt-0.5">Cochez plusieurs familles · ajustez les montants · créez toutes les commandes d'un coup</div>
              </div>
            </button>
          </div>
        )}
        {/* Mode 2 : sélection autre famille + mapping enfants */}
        {mode === "other_family" && (() => {
          const targetFam = duplicateTarget.targetFamilyId
            ? families.find(f => f.firestoreId === duplicateTarget.targetFamilyId)
            : null;
          const targetChildren = targetFam?.children || [];
          const sourceItems = p.items || [];

          // Phase A : chercher la famille
          if (!targetFam) return (
            <div className="p-5 flex flex-col gap-3">
              <button onClick={() => setDuplicateTarget({ ...duplicateTarget, mode: "choose" })}
                className="flex items-center gap-1 font-body text-xs text-slate-600 hover:text-gray-600 bg-transparent border-none cursor-pointer p-0 mb-1">
                ← Retour
              </button>
              <p className="font-body text-sm text-gray-600">Chercher la famille destinataire :</p>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input autoFocus value={duplicateTarget.targetSearch}
                  onChange={e => setDuplicateTarget({ ...duplicateTarget, targetSearch: e.target.value })}
                  placeholder="Nom de famille ou prénom enfant..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:border-blue-500 focus:outline-none" />
              </div>
              {duplicateTarget.targetSearch.length > 0 && (
                <div className="flex flex-col gap-1 max-h-[260px] overflow-y-auto">
                  {filteredFams.length === 0 ? (
                    <p className="font-body text-xs text-slate-600 text-center py-3">Aucune famille trouvée</p>
                  ) : filteredFams.map(f => (
                    <button key={f.firestoreId}
                      onClick={() => setDuplicateTarget({ ...duplicateTarget, targetFamilyId: f.firestoreId, targetSearch: "" })}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 bg-white cursor-pointer hover:bg-purple-50 hover:border-purple-200 text-left transition-all">
                      <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center font-body text-xs font-bold text-purple-600 flex-shrink-0">
                        {(f.parentName || "?")[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-body text-sm font-semibold text-blue-800">{f.parentName}</div>
                        <div className="font-body text-xs text-slate-600 truncate">{(f.children || []).map((c: any) => c.firstName).join(", ") || "Aucun enfant enregistré"}</div>
                      </div>
                      <div className="font-body text-xs text-purple-500 flex-shrink-0">Choisir →</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );

          // Phase B : mapper les enfants
          return (
            <div className="p-5 flex flex-col gap-4 overflow-y-auto">
              <button onClick={() => setDuplicateTarget({ ...duplicateTarget, targetFamilyId: "", targetSearch: "" })}
                className="flex items-center gap-1 font-body text-xs text-slate-600 hover:text-gray-600 bg-transparent border-none cursor-pointer p-0">
                ← Changer de famille
              </button>
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                <div className="font-body text-sm font-bold text-purple-800">{targetFam.parentName}</div>
                <div className="font-body text-xs text-slate-600 mt-0.5">{targetChildren.map((c: any) => c.firstName).join(", ") || "Aucun enfant"}</div>
              </div>
              <p className="font-body text-xs text-slate-600">Pour chaque prestation, indiquer quel cavalier de la famille cible :</p>
              <div className="flex flex-col gap-3">
                {sourceItems.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-sand">
                    <div className="flex-1 min-w-0">
                      <div className="font-body text-xs font-semibold text-blue-800 truncate">{item.activityTitle}</div>
                      <div className="font-body text-[10px] text-slate-600">Original : {item.childName || "—"} · {(item.priceTTC || 0).toFixed(2)}€</div>
                    </div>
                    <select
                      defaultValue={targetChildren[idx]?.id || targetChildren[0]?.id || ""}
                      id={`child-map-${idx}`}
                      className="border border-purple-200 rounded-lg px-2 py-1.5 font-body text-xs bg-white focus:border-purple-500 focus:outline-none flex-shrink-0">
                      {targetChildren.length === 0
                        ? <option value="">Aucun enfant</option>
                        : targetChildren.map((c: any) => (
                          <option key={c.id} value={c.id}>{c.firstName}</option>
                        ))
                      }
                    </select>
                  </div>
                ))}
              </div>
              <button onClick={async () => {
                // Lire le mapping depuis les selects
                const mappedItems = sourceItems.map((item: any, idx: number) => {
                  const sel = document.getElementById(`child-map-${idx}`) as HTMLSelectElement;
                  const childId = sel?.value || "";
                  const child = targetChildren.find((c: any) => c.id === childId);
                  return {
                    ...item,
                    childId,
                    childName: child?.firstName || "",
                    creneauId: "",
                    reservationId: "",
                  };
                });
                const totalTTC = round2(mappedItems.reduce((s: number, i: any) => s + safeNumber(i.priceTTC), 0));
                await addDoc(collection(db, "payments"), {
                  orderId: generateOrderId(),
                  familyId: targetFam.firestoreId,
                  familyName: targetFam.parentName || "",
                  items: mappedItems,
                  totalTTC,
                  status: "pending",
                  paidAmount: 0,
                  paymentMode: "",
                  paymentRef: "",
                  source: "duplicate",
                  sourcePaymentId: p.id,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
                setDuplicateTarget(null);
                await refreshAll();
                toast(`Commande créée pour ${targetFam.parentName} — ${totalTTC.toFixed(2)}€ dans Impayés.`);
              }}
                className="w-full py-3 rounded-xl font-body text-sm font-bold text-white bg-purple-500 border-none cursor-pointer hover:bg-purple-600 transition-all">
                Créer la commande — {round2(sourceItems.reduce((s: number, i: any) => s + safeNumber(i.priceTTC), 0)).toFixed(2)}€
              </button>
            </div>
          );
        })()}

        {/* Footer */}
        <div className="p-5 border-t border-gray-100">
          <button onClick={() => setDuplicateTarget(null)}
            className="w-full py-2.5 rounded-lg font-body text-sm text-slate-600 bg-gray-100 border-none cursor-pointer hover:bg-gray-200">Annuler</button>
        </div>
      </div>
    </div>
  );
}
