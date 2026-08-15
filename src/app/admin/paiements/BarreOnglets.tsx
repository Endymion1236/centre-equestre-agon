"use client";
import React from "react";
import { ShoppingCart, Receipt, Gift, Calendar } from "lucide-react";
import { compterImpayes } from "./calculs-paiement";
import type { TabId } from "./types-etat";

/**
 * src/app/admin/paiements/BarreOnglets.tsx
 *
 * La barre d'onglets de la page Paiements, avec ses trois pastilles
 * d'alerte : impayés à relancer, chèques différés en retard de dépôt,
 * déclarations de paiement à confirmer.
 *
 * Pourquoi c'est un composant : ces pastilles sont le seul endroit de
 * l'application qui dit à l'admin « il y a quelque chose à faire ici »
 * sans qu'il ait ouvert l'onglet. Leur calcul mérite de ne pas être noyé
 * au milieu du montage de la page.
 */

interface BarreOngletsProps {
  tab: TabId;
  setTab: React.Dispatch<React.SetStateAction<TabId>>;
  payments: any[];
  chequesDiffresCount: { total: number; overdue: number };
  declarations: any[];
}

export function BarreOnglets({ tab, setTab, payments, chequesDiffresCount, declarations }: BarreOngletsProps) {
  return (
  <div className="flex gap-1 mb-6 overflow-x-auto pb-1 -mx-1 px-1 hide-scrollbar">
    {([["encaisser", "Encaisser", ShoppingCart], ["journal", "Journal", Receipt], ["historique", "Historique", Receipt], ["echeances", "Échéances", Receipt], ["impayes", "Impayés", Receipt], ["cheques_differes", "Chèques diff.", Calendar], ["offerts", "Offerts", Gift], ["declarations", "Déclar.", Receipt]] as const).map(([id, label, Icon]) => (
      <button key={id} onClick={() => setTab(id as any)}
        className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg border font-body text-[11px] sm:text-xs font-medium cursor-pointer transition-all whitespace-nowrap flex-shrink-0
              ${tab === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
        <Icon size={13} /> {label}
        {id === "impayes" && (() => {
          const todayBadge = new Date().toISOString().split("T")[0];
          const count = compterImpayes(payments, todayBadge);
          return count > 0 ? <span className="bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">{count}</span> : null;
        })()}
        {id === "cheques_differes" && chequesDiffresCount.overdue > 0 && (
          <span className="bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center" title={`${chequesDiffresCount.overdue} chèque(s) en retard`}>
            {chequesDiffresCount.overdue}
          </span>
        )}
        {id === "declarations" && declarations.length > 0 && (
          <span className="bg-orange-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">{declarations.length}</span>
        )}
      </button>
    ))}
  </div>
  );
}
