"use client";

/**
 * src/app/espace-cavalier/inscription-annuelle/EtapeCreneaux.tsx
 *
 * Étape 4 (parcours annuel) : choix du ou des créneaux hebdomadaires.
 *
 * Sortie de `page.tsx` : c'est la plus longue étape du parcours, et celle où
 * une famille peut se tromper sur ce qu'elle paie. D'où le bandeau ambre, qui
 * répète le prix AVANT le choix : le tarif dépend du nombre de cours par
 * semaine, PAS du créneau retenu. Sans ce rappel, les familles cherchaient le
 * créneau « le moins cher ». Le bandeau change de texte quand il s'agit
 * d'heures ajoutées à un forfait existant (facturées au différentiel).
 *
 * La liste affichée est déjà filtrée par l'appelant (`filtrerSlots`) : saison
 * ouverte au self-service, et slots que l'enfant n'a pas déjà pris.
 */

import { Card } from "@/components/ui";
import { Calculator, Check, ChevronRight, Search } from "lucide-react";
import type { CalculForfaitResult } from "@/lib/forfait-pricing";
import type { WeeklySlotAvecSaison } from "./types";

export default function EtapeCreneaux({
  requiredSlots, selectedSlots, toggleSlot, slotsComplete, forfaitType,
  frequence, frequenceDejaInscrite, calcul,
  slotSearch, setSlotSearch, weeklySlots, filteredSlots, setStep,
}: {
  requiredSlots: number;
  selectedSlots: string[];
  toggleSlot: (key: string) => void;
  slotsComplete: boolean;
  forfaitType: "1x" | "2x" | "3x";
  frequence: 1 | 2 | 3;
  frequenceDejaInscrite: number;
  calcul: CalculForfaitResult;
  slotSearch: string;
  setSlotSearch: (v: string) => void;
  weeklySlots: WeeklySlotAvecSaison[];
  filteredSlots: WeeklySlotAvecSaison[];
  setStep: (n: number) => void;
}) {
  return (
    <Card padding="md">
      <h2 className="font-body text-base font-semibold text-blue-800 mb-2">
        {requiredSlots > 1 ? `Choisir vos ${requiredSlots} créneaux hebdomadaires` : "Choisir votre créneau hebdomadaire"}
      </h2>
      <p className="font-body text-xs text-gray-400 mb-4">
        {requiredSlots > 1
          ? `Sélectionnez ${requiredSlots} créneaux. Ils se répètent chaque semaine.`
          : "Ce cours se répète chaque semaine pendant la saison (hors vacances)."}
      </p>

      {/* Selection counter for 2x/3x */}
      {requiredSlots > 1 && (
        <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 rounded-xl">
          <Calculator size={16} className="text-blue-500" />
          <span className="font-body text-sm text-blue-800">
            {selectedSlots.length}/{requiredSlots} créneaux sélectionnés
          </span>
          {selectedSlots.length === requiredSlots && <Check size={16} className="text-green-500 ml-auto" />}
        </div>
      )}

      {/* Rappel du tarif forfait (prix global, pas par créneau) */}
      <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
        <span className="font-body text-sm text-amber-800">
          {frequenceDejaInscrite > 0 ? (
            <>💡 Heure(s) supplémentaire(s) (passage {frequenceDejaInscrite}×→{Math.min(3, frequenceDejaInscrite + frequence)}×/sem) : <strong>{calcul.prixForfaitAnnuelPlein}€/an</strong>{calcul.familyDiscountAmount > 0 && ` (− ${calcul.familyDiscountAmount.toFixed(0)}€ réduction famille)`}. Tarif dégressif : seule la différence vers le forfait supérieur est facturée.</>
          ) : (
            <>💡 Forfait {frequence}×/semaine : <strong>{calcul.prixForfaitAnnuelPlein}€/an</strong>{calcul.familyDiscountAmount > 0 && ` (− ${calcul.familyDiscountAmount.toFixed(0)}€ réduction famille)`}. Le prix ne dépend pas du créneau choisi mais du nombre de cours par semaine.</>
          )}
        </span>
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={slotSearch}
          onChange={e => setSlotSearch(e.target.value)}
          placeholder="Rechercher un cours, un jour, un horaire..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 font-body text-sm bg-white focus:border-blue-500 focus:outline-none"
        />
      </div>

      {weeklySlots.length === 0 ? (
        <div className="text-center py-8">
          <span className="text-4xl block mb-3">📅</span>
          <p className="font-body text-sm text-gray-500 mb-2">Aucun cours régulier programmé pour l&apos;instant.</p>
          <p className="font-body text-xs text-gray-400">L&apos;admin doit d&apos;abord créer des cours via le générateur de périodes dans le back-office.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-5">
          {filteredSlots.length === 0 && slotSearch && (
            <p className="font-body text-sm text-gray-400 text-center py-4">Aucun créneau ne correspond à « {slotSearch} »</p>
          )}
          {filteredSlots.map(slot => {
            const isSelected = selectedSlots.includes(slot.key);
            const isFull = slot.spotsAvailable <= 0;
            const isDisabled = isFull || (!isSelected && selectedSlots.length >= requiredSlots && forfaitType === "2x");

            return (
              <button key={slot.key} onClick={() => !isDisabled && toggleSlot(slot.key)}
                className={`flex items-center justify-between px-5 py-4 rounded-xl border text-left transition-all
                  ${isSelected ? "border-blue-500 bg-blue-50 cursor-pointer" :
                    isDisabled ? "border-gray-100 bg-gray-50 cursor-not-allowed opacity-50" :
                    "border-gray-200 bg-white hover:border-gray-300 cursor-pointer"}`}>
                <div>
                  <div className="font-body text-sm font-semibold text-blue-800">{slot.activityTitle}</div>
                  <div className="font-body text-xs text-gray-400 mt-0.5">{slot.dayLabel} · {slot.startTime}–{slot.endTime} · {slot.monitor}</div>
                  <div className="font-body text-xs mt-1">
                    <span className={slot.spotsAvailable > 2 ? "text-green-600" : slot.spotsAvailable > 0 ? "text-orange-500" : "text-red-500"}>
                      {slot.spotsAvailable > 0 ? `${slot.spotsAvailable} place${slot.spotsAvailable > 1 ? "s" : ""}` : "COMPLET"}
                    </span>
                    <span className="text-gray-400 ml-2">{slot.totalSessions} séances</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                      <Check size={14} className="text-white" />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={() => setStep(3)} className="px-6 py-3 rounded-xl font-body text-sm text-gray-500 bg-white border border-gray-200 cursor-pointer">Retour</button>
        <button onClick={() => setStep(5)} disabled={!slotsComplete}
          className={`flex-1 py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer
            ${slotsComplete ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"}`}>
          Continuer <ChevronRight size={16} className="inline ml-1" />
        </button>
      </div>
    </Card>
  );
}
