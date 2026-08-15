"use client";

/**
 * src/app/espace-cavalier/inscription-annuelle/EtapeSeancePonctuelle.tsx
 *
 * Étape 2 du parcours « ponctuel » : choix d'une séance à l'unité, payée à son
 * prix de créneau et non au forfait.
 *
 * ⚠️ Ce parcours n'est pas atteignable aujourd'hui : le mode est fixé à
 * "annuel" et rien ne le change dans `page.tsx`. L'écran est extrait tel quel,
 * sans la moindre modification, pour ne pas perdre une variante qui a existé et
 * peut être rebranchée. Noter la différence de tarification : ici le montant
 * vient de `priceTTC` du créneau, pas du calcul de forfait annuel.
 */

import { Card } from "@/components/ui";
import { ChevronRight } from "lucide-react";
import type { WeeklySlotAvecSaison } from "./types";

export default function EtapeSeancePonctuelle({
  weeklySlots, selectedSlots, setSelectedSlots, setStep,
}: {
  weeklySlots: WeeklySlotAvecSaison[];
  selectedSlots: string[];
  setSelectedSlots: (keys: string[]) => void;
  setStep: (n: number) => void;
}) {
  return (
    <Card padding="md">
      <h2 className="font-body text-base font-semibold text-blue-800 mb-2">Choisir une séance</h2>
      <p className="font-body text-xs text-gray-400 mb-4">Choisissez un créneau pour une séance ponctuelle.</p>
      {weeklySlots.length === 0 ? (
        <div className="text-center py-8">
          <span className="text-4xl block mb-3">📅</span>
          <p className="font-body text-sm text-gray-500">Aucun cours programmé.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-5">
          {weeklySlots.map(slot => (
            <button key={slot.key} onClick={() => setSelectedSlots([slot.key])}
              className={`flex items-center justify-between px-5 py-4 rounded-xl border text-left cursor-pointer transition-all
                ${selectedSlots[0] === slot.key ? "border-blue-500 bg-blue-50" :
                  slot.spotsAvailable > 0 ? "border-gray-200 bg-white hover:border-gray-300" : "border-gray-100 bg-gray-50 opacity-50"}`}>
              <div>
                <div className="font-body text-sm font-semibold text-blue-800">{slot.activityTitle}</div>
                <div className="font-body text-xs text-gray-400">{slot.dayLabel} · {slot.startTime}–{slot.endTime}</div>
              </div>
              <span className="font-body text-sm font-semibold text-blue-500">{(slot.priceTTC || 0).toFixed(2)}€</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-3">
        <button onClick={() => setStep(1)} className="px-6 py-3 rounded-xl font-body text-sm text-gray-500 bg-white border border-gray-200 cursor-pointer">Retour</button>
        <button onClick={() => setStep(3)} disabled={selectedSlots.length === 0}
          className={`flex-1 py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer
            ${selectedSlots.length > 0 ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"}`}>
          Continuer <ChevronRight size={16} className="inline ml-1" />
        </button>
      </div>
    </Card>
  );
}
