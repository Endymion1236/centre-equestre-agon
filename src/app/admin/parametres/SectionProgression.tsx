"use client";
/**
 * src/app/admin/parametres/SectionProgression.tsx
 *
 * Onglet « Progression » : libellés de l'échelle 1-5 des compétences pratiques
 * et seuil à partir duquel une compétence compte comme « validée FFE ».
 * Document `settings/progression_labels`.
 *
 * Pourquoi séparé : ce réglage a deux lecteurs très différents — l'éditeur de
 * progression côté moniteur et l'espace cavalier côté famille — et le seuil
 * `validatedFfe` décide de ce qui apparaît comme acquis sur le bilan FFE.
 * L'aperçu en bas de l'écran est là exprès : il montre ce que la famille verra
 * avant d'enregistrer.
 *
 * Composant de présentation : état et sauvegarde restent dans page.tsx.
 */
import { Card } from "@/components/ui";
import { DEFAULT_ECHELLE_LABELS } from "@/lib/progression-helpers";

type Props = {
  progressionLabels: string[];
  setProgressionLabels: React.Dispatch<React.SetStateAction<string[]>>;
  progressionValidatedFfe: number;
  setProgressionValidatedFfe: React.Dispatch<React.SetStateAction<number>>;
  progressionSaved: boolean;
  saveProgressionLabels: () => void;
};

export default function SectionProgression({
  progressionLabels, setProgressionLabels, progressionValidatedFfe,
  setProgressionValidatedFfe, progressionSaved, saveProgressionLabels,
}: Props) {
  return (
        <div className="flex flex-col gap-5">
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-2">📈 Échelle de progression (pratiques)</h3>
            <p className="font-body text-xs text-slate-500 mb-4">
              Pour les compétences de pratique à cheval et à pied, on utilise une échelle de 1 à 5.
              Personnalise ici les libellés affichés dans l&apos;éditeur de progression et dans
              l&apos;espace cavalier des familles. Les compétences de connaissances et soins
              restent en case à cocher (binaire).
            </p>
            <div className="flex flex-col gap-3 mb-5">
              {progressionLabels.map((label, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg font-body text-sm font-bold text-white"
                    style={{ background: `linear-gradient(135deg, hsl(${(i * 30) + 0}, 75%, 50%), hsl(${(i * 30) + 0}, 70%, 45%))` }}>
                    {i + 1}
                  </div>
                  <input
                    value={label}
                    onChange={(e) => {
                      const next = [...progressionLabels];
                      next[i] = e.target.value;
                      setProgressionLabels(next);
                    }}
                    placeholder={DEFAULT_ECHELLE_LABELS[i]}
                    className="flex-1 px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-4 mb-4">
              <label className="font-body text-sm font-semibold text-blue-800 block mb-2">
                Seuil &laquo;&nbsp;Validé FFE&nbsp;&raquo;
              </label>
              <p className="font-body text-xs text-slate-500 mb-3">
                Niveau à partir duquel une compétence pratique compte comme validée pour le passage de Galop.
                Les niveaux inférieurs apparaissent en progression mais pas comme validés sur le bilan FFE.
              </p>
              <select
                value={progressionValidatedFfe}
                onChange={(e) => setProgressionValidatedFfe(parseInt(e.target.value, 10))}
                className="px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"
              >
                {[1, 2, 3, 4, 5].map(n => (
                  <option key={n} value={n}>
                    Niveau {n} ({progressionLabels[n - 1] || DEFAULT_ECHELLE_LABELS[n - 1]}) ou +
                  </option>
                ))}
              </select>
              <p className="font-body text-[11px] text-slate-400 mt-2 italic">
                Recommandé : niveau 5 (acquis). Tu peux baisser si tu veux marquer les Galops plus tôt
                dans la progression — par exemple niveau 4 = autonomie suffisante pour valider FFE.
              </p>
            </div>

            <button onClick={saveProgressionLabels}
              className="flex items-center justify-center gap-2 py-3 rounded-xl font-body text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 border-none cursor-pointer">
              {progressionSaved ? "✅ Sauvegardé !" : "Sauvegarder l'échelle"}
            </button>
          </Card>

          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-2">📋 Aperçu</h3>
            <p className="font-body text-xs text-slate-500 mb-4">
              Voici comment l&apos;échelle apparaîtra dans l&apos;éditeur de progression et chez les familles.
            </p>
            <div className="flex flex-wrap gap-2">
              {progressionLabels.map((label, i) => {
                const level = i + 1;
                const isValidatedFfe = level >= progressionValidatedFfe;
                return (
                  <div key={i}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${isValidatedFfe ? "bg-green-50 border-green-300" : "bg-slate-50 border-slate-200"}`}>
                    <div className="flex items-center justify-center w-7 h-7 rounded-md font-body text-xs font-bold text-white"
                      style={{ background: `linear-gradient(135deg, hsl(${(i * 30)}, 75%, 50%), hsl(${(i * 30)}, 70%, 45%))` }}>
                      {level}
                    </div>
                    <span className="font-body text-sm text-slate-700">{label || DEFAULT_ECHELLE_LABELS[i]}</span>
                    {isValidatedFfe && <span className="font-body text-[10px] text-green-700 font-semibold">✓ FFE</span>}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
  );
}
