"use client";
import { useState } from "react";
import { estSurDemande, formuleDuCreneau, formulesProposees } from "@/lib/creneau-sur-demande";

/**
 * Créneau sur demande, dans le panneau d'inscription : le club choisit la
 * formule (anniversaire, cours particulier) au moment d'inscrire, comme la
 * famille le fait en ligne. Rien n'est affiché pour un créneau ordinaire.
 */
export function ChoixFormuleSurDemande({ creneau, onChoisir, onRendre }: {
  creneau: any;
  onChoisir: (formuleId: string) => Promise<void>;
  onRendre: () => Promise<void>;
}) {
  const [enCours, setEnCours] = useState(false);
  if (!estSurDemande(creneau)) return null;
  const fixee = formuleDuCreneau(creneau);
  const formules = formulesProposees(creneau);
  const agir = async (f: () => Promise<void>) => { setEnCours(true); try { await f(); } finally { setEnCours(false); } };
  const prix = (f: { priceTTC: number; forfait: boolean }) => `${f.priceTTC.toFixed(2)} €${f.forfait ? " le forfait" : " par cavalier"}`;

  if (fixee) {
    return (
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center justify-between gap-3">
        <div className="font-body text-sm text-purple-900">
          Créneau sur demande : <strong>{fixee.label}</strong> · {prix(fixee)}
        </div>
        {(creneau.enrolled || []).length === 0 && (
          <button type="button" disabled={enCours} onClick={() => agir(onRendre)}
            className="font-body text-xs text-purple-700 underline bg-transparent border-none cursor-pointer disabled:opacity-50">
            Changer de formule
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 space-y-2">
      <div className="font-body text-xs font-semibold text-purple-900 uppercase tracking-wider">Créneau sur demande : quelle formule ?</div>
      {formules.length === 0 ? (
        <div className="font-body text-xs text-purple-800">Aucune formule n'a de prix : renseigne-les dans les réglages du créneau ⚙️.</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {formules.map((f) => (
            <button key={f.id} type="button" disabled={enCours} onClick={() => agir(() => onChoisir(f.id))}
              className="p-3 rounded-lg border-2 border-purple-200 bg-white text-left cursor-pointer hover:border-purple-400 disabled:opacity-50">
              <div className="font-body text-sm font-semibold text-purple-900">{f.label}</div>
              <div className="font-body text-xs text-slate-500 mt-0.5">{prix(f)} · {f.places} cavalier{f.places > 1 ? "s" : ""} max</div>
              {f.descriptif && <div className="font-body text-[11px] text-slate-400 mt-0.5">{f.descriptif}</div>}
            </button>
          ))}
        </div>
      )}
      <div className="font-body text-[11px] text-purple-700">Le créneau prend le titre, le prix et les places de la formule, puis tu inscris comme d'habitude.</div>
    </div>
  );
}
