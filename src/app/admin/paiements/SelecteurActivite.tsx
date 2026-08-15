"use client";
/**
 * src/app/admin/paiements/SelecteurActivite.tsx
 *
 * La recherche d'activité du catalogue (combobox) et le bouton qui pose
 * l'activité choisie dans le panier.
 *
 * Pourquoi une combobox plutôt qu'un simple menu déroulant : le catalogue
 * dépasse la centaine de lignes (cours, stages, licences, pensions), et
 * l'admin encaisse en ayant quelqu'un devant lui. Seules les activités
 * actives sont proposées — une activité archivée ne doit plus pouvoir être
 * vendue par mégarde.
 *
 * Sorti de TabEncaisser parce que la gestion du focus, du survol et de la
 * fermeture différée de la liste occupait autant de lignes que le reste de
 * l'étape « Ajouter au panier ».
 */

import React from "react";
import { Plus, Search, X } from "lucide-react";
import type { Activity } from "@/types";
import { inputCls } from "./constantes-encaisser";

interface SelecteurActiviteProps {
  activities: (Activity & { firestoreId: string })[];
  activitySearch: string;
  setActivitySearch: (v: string) => void;
  selectedActivity: string;
  setSelectedActivity: (v: string) => void;
  activityDropdownOpen: boolean;
  setActivityDropdownOpen: (v: boolean) => void;
  addToBasket: () => void;
}

export function SelecteurActivite({
  activities, activitySearch, setActivitySearch, selectedActivity, setSelectedActivity,
  activityDropdownOpen, setActivityDropdownOpen, addToBasket,
}: SelecteurActiviteProps) {
  const activeActivities = activities.filter((a) => a.active !== false);
  const q = activitySearch.trim().toLowerCase();
  const filtered = q
    ? activeActivities.filter(a =>
        (a.title || "").toLowerCase().includes(q) ||
        ((a as any).category || "").toLowerCase().includes(q)
      )
    : activeActivities;
  const selected = activeActivities.find(a => a.firestoreId === selectedActivity);
  return (
    <div className="flex gap-2 mb-3 relative">
      <div className="flex-1 min-w-0 relative">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={activitySearch}
            onChange={(e) => { setActivitySearch(e.target.value); setActivityDropdownOpen(true); if (selectedActivity) setSelectedActivity(""); }}
            onFocus={() => setActivityDropdownOpen(true)}
            onBlur={() => setTimeout(() => setActivityDropdownOpen(false), 200)}
            placeholder={selected ? `${selected.title}` : "Rechercher une activité..."}
            className={`${inputCls} pl-9`}
          />
          {selectedActivity && (
            <button
              onClick={() => { setSelectedActivity(""); setActivitySearch(""); }}
              title="Effacer la sélection"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer p-1">
              <X size={14} />
            </button>
          )}
        </div>
        {/* Pastille sélection active */}
        {selected && !activityDropdownOpen && (
          <div className="mt-1.5 inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-800 font-body text-xs px-2.5 py-1 rounded-lg">
            ✓ {selected.title} — <span className="font-semibold">{(((selected as any).priceTTC) || (selected.priceHT || 0) * (1 + (selected.tvaTaux || 5.5) / 100)).toFixed(2)}€</span>
          </div>
        )}
        {/* Liste déroulante filtrée */}
        {activityDropdownOpen && (
          <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[280px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center font-body text-xs text-slate-400">Aucune activité ne correspond à "{activitySearch}"</div>
            ) : (
              filtered.map((a, idx) => {
                const ttc = (a as any).priceTTC || (a.priceHT || 0) * (1 + (a.tvaTaux || 5.5) / 100);
                const isSelected = selectedActivity === a.firestoreId;
                return (
                  <button
                    key={`${a.firestoreId}-${idx}`}
                    onMouseDown={(e) => { e.preventDefault(); setSelectedActivity(a.firestoreId); setActivitySearch(""); setActivityDropdownOpen(false); }}
                    className={`w-full text-left px-3 py-2 border-none cursor-pointer flex items-center justify-between gap-2 font-body text-sm ${isSelected ? "bg-blue-50 text-blue-800" : "bg-white text-slate-700 hover:bg-slate-50"}`}>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{a.title}</div>
                      {(a as any).category && <div className="text-[11px] text-slate-400">{(a as any).category}</div>}
                    </div>
                    <div className="font-semibold text-blue-500 flex-shrink-0">{ttc.toFixed(2)}€</div>
                  </button>
                );
              })
            )}
            <div className="px-3 py-1.5 border-t border-gray-100 bg-slate-50 font-body text-[10px] text-slate-400 sticky bottom-0">
              {filtered.length} activité{filtered.length > 1 ? "s" : ""}
              {q && filtered.length !== activeActivities.length && ` (sur ${activeActivities.length})`}
            </div>
          </div>
        )}
      </div>
      <button onClick={addToBasket} disabled={!selectedActivity}
        className={`px-3 py-2 rounded-lg font-body text-sm font-semibold border-none cursor-pointer flex-shrink-0 self-start
                  ${selectedActivity ? "bg-blue-500 text-white" : "bg-gray-200 text-slate-600"}`}>
        <Plus size={16} />
      </button>
    </div>
  );
}
