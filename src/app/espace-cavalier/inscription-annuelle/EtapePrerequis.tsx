"use client";

/**
 * src/app/espace-cavalier/inscription-annuelle/EtapePrerequis.tsx
 *
 * Étape 2 (parcours annuel) : licence FFE et adhésion au club, obligatoires
 * pour pratiquer — et facturées ici.
 *
 * Sortie de `page.tsx` comme les autres étapes. La règle qui se joue à l'écran
 * : licence et adhésion sont ANNUELLES. Si l'enfant les a déjà payées cette
 * saison, la case à cocher est remplacée par une ligne verte « Déjà prise cette
 * saison — non refacturée ». Il faut que ce soit visible, sinon une famille qui
 * ajoute un 2e cours croit payer une seconde fois. Le prérequis reste
 * néanmoins exigé pour continuer : déjà pris compte comme coché.
 */

import { Card } from "@/components/ui";
import { Check, ChevronRight } from "lucide-react";
import type { ForfaitTarifs } from "@/lib/forfait-pricing";

export default function EtapePrerequis({
  prereqDejaPris, licenceOK, setLicenceOK, adhesionOK, setAdhesionOK,
  licenceMoins18, tarifs, rangEnfant, prixAdhesion, setStep,
}: {
  prereqDejaPris: { licence: boolean; adhesion: boolean };
  licenceOK: boolean;
  setLicenceOK: (v: boolean) => void;
  adhesionOK: boolean;
  setAdhesionOK: (v: boolean) => void;
  licenceMoins18: boolean;
  tarifs: ForfaitTarifs;
  rangEnfant: number;
  prixAdhesion: number;
  setStep: (n: number) => void;
}) {
  return (
    <Card padding="md">
      <h2 className="font-body text-base font-semibold text-blue-800 mb-2">Prérequis obligatoires</h2>
      <p className="font-body text-xs text-gray-400 mb-4">Obligatoires pour pratiquer en club.</p>
      <div className="flex flex-col gap-3 mb-6">
        {prereqDejaPris.licence ? (
          <div className="flex items-center justify-between px-5 py-4 rounded-xl border border-green-200 bg-green-50">
            <div className="flex items-center gap-3">
              <Check size={20} className="text-green-600" />
              <div><div className="font-body text-sm font-semibold text-blue-800">Licence FFE</div><div className="font-body text-xs text-green-600">Déjà prise cette saison — non refacturée</div></div>
            </div>
            <span className="font-body text-xs font-semibold text-green-600">Incluse</span>
          </div>
        ) : (
          <label className={`flex items-center justify-between px-5 py-4 rounded-xl border cursor-pointer ${licenceOK ? "border-green-500 bg-green-50" : "border-gray-200"}`}>
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={licenceOK} onChange={e => setLicenceOK(e.target.checked)} className="accent-green-500 w-5 h-5" />
              <div><div className="font-body text-sm font-semibold text-blue-800">Licence FFE</div><div className="font-body text-xs text-gray-400">Obligatoire pour pratiquer en club ({licenceMoins18 ? "-18 ans" : "+18 ans"})</div></div>
            </div>
            <span className="font-body text-base font-bold text-blue-500">{licenceMoins18 ? tarifs.licenceMoins18 : tarifs.licencePlus18}€</span>
          </label>
        )}
        {prereqDejaPris.adhesion ? (
          <div className="flex items-center justify-between px-5 py-4 rounded-xl border border-green-200 bg-green-50">
            <div className="flex items-center gap-3">
              <Check size={20} className="text-green-600" />
              <div><div className="font-body text-sm font-semibold text-blue-800">Adhésion au club</div><div className="font-body text-xs text-green-600">Déjà prise cette saison — non refacturée</div></div>
            </div>
            <span className="font-body text-xs font-semibold text-green-600">Incluse</span>
          </div>
        ) : (
          <label className={`flex items-center justify-between px-5 py-4 rounded-xl border cursor-pointer ${adhesionOK ? "border-green-500 bg-green-50" : "border-gray-200"}`}>
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={adhesionOK} onChange={e => setAdhesionOK(e.target.checked)} className="accent-green-500 w-5 h-5" />
              <div><div className="font-body text-sm font-semibold text-blue-800">Adhésion au club</div><div className="font-body text-xs text-gray-400">Cotisation annuelle{rangEnfant > 1 ? ` (${rangEnfant}e enfant — tarif réduit)` : ""}</div></div>
            </div>
            <span className="font-body text-base font-bold text-blue-500">{prixAdhesion}€</span>
          </label>
        )}
        {(prereqDejaPris.licence || prereqDejaPris.adhesion) && (
          <p className="font-body text-xs text-blue-600">ℹ️ Cet enfant est déjà inscrit cette saison : la licence et/ou l&apos;adhésion ne sont pas refacturées sur ce 2e cours.</p>
        )}
      </div>
      <div className="flex gap-3">
        <button onClick={() => setStep(1)} className="px-6 py-3 rounded-xl font-body text-sm text-gray-500 bg-white border border-gray-200 cursor-pointer">Retour</button>
        {(() => {
          const licencePrereqOK = prereqDejaPris.licence || licenceOK;
          const adhesionPrereqOK = prereqDejaPris.adhesion || adhesionOK;
          const prereqOK = licencePrereqOK && adhesionPrereqOK;
          return (
            <button onClick={() => setStep(3)} disabled={!prereqOK}
              className={`flex-1 py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${prereqOK ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"}`}>
              Continuer <ChevronRight size={16} className="inline ml-1" />
            </button>
          );
        })()}
      </div>
    </Card>
  );
}
