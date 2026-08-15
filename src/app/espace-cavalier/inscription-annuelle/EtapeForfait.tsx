"use client";

/**
 * src/app/espace-cavalier/inscription-annuelle/EtapeForfait.tsx
 *
 * Étape 3 (parcours annuel) : combien de cours par semaine, et à quel prix.
 *
 * Sortie de `page.tsx` parce que c'est l'écran où la famille lit le montant qui
 * la décide. Deux règles s'y affichent, portées par `prixAjoutAffiche` :
 *  - un enfant déjà inscrit cette saison AJOUTE des heures : les vignettes
 *    disent « +1 cours » et affichent le DIFFÉRENTIEL vers le forfait
 *    supérieur, jamais un second forfait plein ;
 *  - le cumul est plafonné à 3×/semaine : au-delà, plus aucune option n'est
 *    proposée et on l'explique au lieu d'afficher une grille vide.
 */

import { Card } from "@/components/ui";
import { ChevronRight } from "lucide-react";
import type { ForfaitTarifs } from "@/lib/forfait-pricing";
import { prixAjoutAffiche } from "./tarifs";

export default function EtapeForfait({
  frequenceDejaInscrite, freqMaxAjoutable, tarifs,
  forfaitType, setForfaitType, setSelectedSlots, setStep,
}: {
  frequenceDejaInscrite: number;
  freqMaxAjoutable: number;
  tarifs: ForfaitTarifs;
  forfaitType: "1x" | "2x" | "3x";
  setForfaitType: (t: "1x" | "2x" | "3x") => void;
  setSelectedSlots: (keys: string[]) => void;
  setStep: (n: number) => void;
}) {
  const ajout = frequenceDejaInscrite > 0;
  // Tarif différentiel affiché pour un ajout de n heure(s).
  const prixAffiche = (nNouveau: number) => prixAjoutAffiche({ tarifs, frequenceDejaInscrite, nNouveau });
  const options = ([
    { type: "1x", freq: 1, emoji: "🐴", label: ajout ? "+1 cours" : "1 cours" },
    { type: "2x", freq: 2, emoji: "🏇", label: ajout ? "+2 cours" : "2 cours" },
    { type: "3x", freq: 3, emoji: "🏆", label: ajout ? "+3 cours" : "3 cours" },
  ] as const).filter(o => o.freq <= freqMaxAjoutable);
  return (
    <Card padding="md">
      <h2 className="font-body text-base font-semibold text-blue-800 mb-2">Type de forfait</h2>
      <p className="font-body text-xs text-gray-400 mb-4">
        {ajout ? "Combien d'heures ajouter par semaine ?" : "Combien de cours par semaine ?"}
      </p>
      {ajout && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
          <p className="font-body text-xs text-blue-800">
            🏇 Cet enfant a déjà <strong>{frequenceDejaInscrite}×/semaine</strong> cette saison. Les heures ajoutées sont facturées au <strong>tarif dégressif</strong> (différence vers le forfait {Math.min(3, frequenceDejaInscrite + 1)}×), pas à plein tarif.
          </p>
        </div>
      )}
      {freqMaxAjoutable === 0 ? (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="font-body text-sm text-amber-800">Cet enfant est déjà inscrit au maximum (3×/semaine) cette saison.</p>
        </div>
      ) : (
        <div className={`grid gap-3 mb-6 ${options.length === 3 ? "grid-cols-3" : options.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {options.map(o => (
            <button key={o.type} onClick={() => { setForfaitType(o.type); setSelectedSlots([]); }}
              className={`py-5 rounded-xl border font-body text-sm font-semibold cursor-pointer transition-all text-center
                ${forfaitType === o.type ? "border-blue-500 bg-blue-50 text-blue-500" : "border-gray-200 bg-white text-gray-500"}`}>
              <span className="text-2xl block mb-1">{o.emoji}</span>
              {o.label}
              <div className="font-body text-xs font-normal text-gray-400 mt-1">{prixAffiche(o.freq)}€/an</div>
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-3">
        <button onClick={() => setStep(2)} className="px-6 py-3 rounded-xl font-body text-sm text-gray-500 bg-white border border-gray-200 cursor-pointer">Retour</button>
        <button onClick={() => setStep(4)} disabled={freqMaxAjoutable === 0}
          className={`flex-1 py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${freqMaxAjoutable === 0 ? "bg-gray-200 text-gray-400" : "bg-blue-500 text-white"}`}>
          Continuer <ChevronRight size={16} className="inline ml-1" />
        </button>
      </div>
    </Card>
  );
}
