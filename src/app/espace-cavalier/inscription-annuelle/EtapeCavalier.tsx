"use client";

/**
 * src/app/espace-cavalier/inscription-annuelle/EtapeCavalier.tsx
 *
 * Étape 1 : choix du cavalier à inscrire, parmi les enfants de la famille.
 *
 * Sortie de `page.tsx` comme les autres étapes du parcours. Deux détails qui
 * ne sont pas décoratifs :
 *  - le bandeau « première inscription » n'apparaît QUE si la famille n'a
 *    aucun forfait, sinon il promet une réduction à des familles qui n'y ont
 *    pas droit ;
 *  - un enfant déjà inscrit cette saison n'est pas bloqué : il est marqué
 *    « Déjà inscrit · 2e cours possible ». Ajouter un 2e cours est un cas
 *    normal, facturé au différentiel — pas une erreur à interdire.
 */

import { Card } from "@/components/ui";
import { Check, ChevronRight } from "lucide-react";
import { ageFromBirthDate } from "./tarifs";

export default function EtapeCavalier({
  allForfaits, enfants, selectedChild, setSelectedChild,
  childDejaInscrit, mode, setStep,
}: {
  allForfaits: any[];
  /** Enfants de la famille (nommé `enfants` et non `children` : ce n'est pas du contenu JSX). */
  enfants: any[];
  selectedChild: string;
  setSelectedChild: (id: string) => void;
  childDejaInscrit: (id: string) => boolean;
  mode: "annuel" | "ponctuel";
  setStep: (n: number) => void;
}) {
  return (
    <Card padding="md">
      <h2 className="font-body text-base font-semibold text-blue-800 mb-2">Quel cavalier inscrivez-vous ?</h2>
      {/* Bandeau réduction 1ère inscription : visible UNIQUEMENT si la
          famille n'a aucun forfait existant (vraie première inscription).
          Réduction non automatique : invite à contacter le club. */}
      {allForfaits.length === 0 && (
        <div className="mb-4 p-4 rounded-xl bg-green-50 border border-green-200">
          <div className="font-body text-sm font-semibold text-green-800 mb-1">🎁 Première inscription ?</div>
          <p className="font-body text-xs text-green-700">
            Une réduction est prévue pour votre première inscription au club.
            Contactez-nous pour en savoir plus : <a href="mailto:ceagon@orange.fr" className="underline font-semibold">ceagon@orange.fr</a>.
          </p>
        </div>
      )}
      {enfants.length === 0 ? (
        <div className="text-center py-8">
          <span className="text-4xl block mb-3">👨‍👩‍👧‍👦</span>
          <p className="font-body text-sm text-gray-500 mb-2">Aucun enfant dans votre famille.</p>
          <a href="/espace-cavalier/profil" className="font-body text-sm text-blue-500 underline">Ajouter un cavalier</a>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {enfants.map((c: any) => {
            const deja = childDejaInscrit(c.id);
            return (
            <button key={c.id} onClick={() => setSelectedChild(c.id)}
              className={`flex items-center justify-between px-5 py-4 rounded-xl border text-left transition-all cursor-pointer
                ${selectedChild === c.id ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">🧒</span>
                <div>
                  <div className="font-body text-sm font-semibold text-blue-800">{c.firstName}</div>
                  <div className="font-body text-xs text-gray-400">
                    {(() => {
                      const a = ageFromBirthDate(c.birthDate);
                      return a !== null ? `${a} ans · ` : "";
                    })()}
                    {c.galopLevel ? `Galop ${c.galopLevel}` : "Débutant"}
                  </div>
                </div>
              </div>
              {deja ? (
                <span className="font-body text-[11px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1 rounded-full">Déjà inscrit · 2e cours possible</span>
              ) : selectedChild === c.id && <Check size={20} className="text-blue-500" />}
            </button>
            );
          })}
          <button onClick={() => selectedChild && setStep(mode === "annuel" ? 2 : 2)} disabled={!selectedChild}
            className={`mt-3 w-full py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer
              ${selectedChild ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"}`}>
            Continuer <ChevronRight size={16} className="inline ml-1" />
          </button>
        </div>
      )}
    </Card>
  );
}
