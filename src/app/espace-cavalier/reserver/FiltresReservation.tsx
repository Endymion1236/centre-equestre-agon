"use client";

/**
 * src/app/espace-cavalier/reserver/FiltresReservation.tsx
 *
 * La barre de tri de la vue liste : catégories d'activité, sous-catégories
 * (niveaux / types de promenade) et navigation de mois en mois.
 *
 * Regroupée dans un composant parce que ces trois rangées forment un seul
 * geste pour la famille — « qu'est-ce que je cherche, et quand ? » — et
 * qu'elles n'ont besoin d'aucune donnée métier : elles ne font que lire et
 * repositionner des filtres.
 *
 * Le piège historique conservé ici : la rangée de catégories se masque en
 * fonction du filtre INITIAL (celui imposé par l'URL, ex. ?filter=stage), pas
 * du filtre courant.
 */

import type { Dispatch, SetStateAction } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function FiltresReservation({
  initialFilter, filter, setFilterAndReset,
  availableSubcats, subfilter, setSubfilter,
  monthOffset, setMonthOffset, monthLabel,
}: {
  initialFilter: string;
  filter: string;
  setFilterAndReset: (f: string) => void;
  availableSubcats: string[];
  subfilter: string;
  setSubfilter: (s: string) => void;
  monthOffset: number;
  setMonthOffset: Dispatch<SetStateAction<number>>;
  monthLabel: string;
}) {
  return (
    <>
      {/* Filtres catégorie — masqués uniquement si le filtre est imposé par
          l'URL (?filter=stage). Tester l'état courant (filter) au lieu du
          filtre initial faisait disparaître la rangée dès le premier clic :
          impossible de revenir à "Tout". */}
      {initialFilter === "all" && (
        <div className="flex flex-wrap gap-2 mb-2">
          {[
            ["all", "Tout"],
            ["stage", "Stages semaine"],
            ["stage_journee", "Stages journée"],
            ["cours", "Cours"],
            ["competition", "Compétitions"],
            ["anniversaire", "Anniversaires"],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setFilterAndReset(id)}
              className={`px-3 py-1.5 rounded-lg border font-body text-xs font-semibold cursor-pointer transition-all ${filter === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Filtres sous-catégorie */}
      {availableSubcats.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4 pl-1">
          <button onClick={() => setSubfilter("all")}
            className={`px-3 py-1 rounded-full border font-body text-xs cursor-pointer transition-all ${subfilter === "all" ? "bg-gold-400 text-blue-800 border-gold-400 font-semibold" : "bg-white text-slate-600 border-gray-200"}`}>
            {filter === "balade" ? "Toutes les promenades" : "Tous niveaux"}
          </button>
          {availableSubcats.map(s => (
            <button key={s} onClick={() => setSubfilter(s)}
              className={`px-3 py-1 rounded-full border font-body text-xs cursor-pointer transition-all ${subfilter === s ? "bg-gold-400 text-blue-800 border-gold-400 font-semibold" : "bg-white text-slate-600 border-gray-200"}`}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Navigation par mois */}
      <div className="flex flex-col gap-2 mb-5">
        <div className="flex items-center justify-between">
          <button onClick={() => setMonthOffset(m => Math.max(0, m - 1))}
            className="flex items-center gap-1 font-body text-sm text-gray-600 bg-white px-3 py-2 rounded-lg border border-gray-200 cursor-pointer">
            <ChevronLeft size={16}/>
          </button>
          <div className="font-body text-base font-semibold text-blue-800 capitalize">{monthLabel}</div>
          <button onClick={() => setMonthOffset(m => m + 1)}
            className="flex items-center gap-1 font-body text-sm text-gray-600 bg-white px-3 py-2 rounded-lg border border-gray-200 cursor-pointer">
            <ChevronRight size={16}/>
          </button>
        </div>
        {/* Raccourcis mois rapides */}
        <div className="flex gap-1.5 flex-wrap">
          {[0, 1, 2, 3, 4, 5].map(offset => {
            const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset);
            const label = d.toLocaleDateString("fr-FR", { month: "short" });
            return (
              <button key={offset} onClick={() => setMonthOffset(offset)}
                className={`font-body text-xs px-3 py-1.5 rounded-full border cursor-pointer capitalize transition-all
                  ${monthOffset === offset ? "bg-blue-500 text-white border-blue-500 font-semibold" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
