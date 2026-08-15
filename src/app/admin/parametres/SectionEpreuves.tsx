"use client";
/**
 * src/app/admin/parametres/SectionEpreuves.tsx
 *
 * Onglet « Épreuves » : liste des épreuves proposées par discipline
 * (pony games, CSO, équifun, endurance), document `settings/competitions`.
 *
 * Pourquoi séparé : chaque discipline est stockée sous SA PROPRE CLÉ à la
 * racine du document (`pony_games`, `cso`, …) et non dans un sous-objet — le
 * document est enregistré par `{ ...epreuves, updatedAt }`. Ces clés sont
 * relues par le module compétitions : elles ne doivent pas bouger.
 *
 * Composant de présentation : état et sauvegarde restent dans page.tsx.
 */
import { Card } from "@/components/ui";
import { Trash2 } from "lucide-react";
import { DISCIPLINES } from "./constantes";

type Props = {
  epreuves: Record<string, string[]>;
  setEpreuves: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  newEpreuve: Record<string, string>;
  setNewEpreuve: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  epreuvesSaved: boolean;
  saveEpreuves: () => void;
};

export default function SectionEpreuves({ epreuves, setEpreuves, newEpreuve, setNewEpreuve, epreuvesSaved, saveEpreuves }: Props) {
  return (
        <div className="flex flex-col gap-5">
          {DISCIPLINES.map(disc => (
            <Card key={disc.key} padding="md">
              <h3 className="font-body text-base font-semibold text-blue-800 mb-4">🏆 {disc.label}</h3>
              <div className="flex flex-col gap-2 mb-3">
                {(epreuves[disc.key] || []).map((ep, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={ep}
                      onChange={e => setEpreuves(prev => ({
                        ...prev,
                        [disc.key]: prev[disc.key].map((x, j) => j === i ? e.target.value : x)
                      }))}
                      className="flex-1 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
                    <button onClick={() => setEpreuves(prev => ({
                      ...prev,
                      [disc.key]: prev[disc.key].filter((_, j) => j !== i)
                    }))} className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-1">
                      <Trash2 size={14}/>
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={newEpreuve[disc.key] || ""}
                  onChange={e => setNewEpreuve(prev => ({ ...prev, [disc.key]: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === "Enter" && (newEpreuve[disc.key] || "").trim()) {
                      setEpreuves(prev => ({ ...prev, [disc.key]: [...(prev[disc.key] || []), newEpreuve[disc.key].trim()] }));
                      setNewEpreuve(prev => ({ ...prev, [disc.key]: "" }));
                    }
                  }}
                  placeholder="Nouvelle épreuve..."
                  className="flex-1 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
                <button onClick={() => {
                  if (!(newEpreuve[disc.key] || "").trim()) return;
                  setEpreuves(prev => ({ ...prev, [disc.key]: [...(prev[disc.key] || []), newEpreuve[disc.key].trim()] }));
                  setNewEpreuve(prev => ({ ...prev, [disc.key]: "" }));
                }} className="px-4 py-2 rounded-lg font-body text-sm font-semibold text-white bg-blue-500 hover:bg-blue-400 border-none cursor-pointer">
                  + Ajouter
                </button>
              </div>
              <button onClick={() => setEpreuves(prev => ({ ...prev, [disc.key]: disc.default }))}
                className="mt-2 font-body text-[10px] text-slate-400 bg-transparent border-none cursor-pointer hover:text-blue-500">
                Réinitialiser aux épreuves par défaut
              </button>
            </Card>
          ))}
          <button onClick={saveEpreuves}
            className="flex items-center justify-center gap-2 py-3 rounded-xl font-body text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 border-none cursor-pointer">
            {epreuvesSaved ? "✅ Sauvegardé !" : "Sauvegarder les épreuves"}
          </button>
        </div>
  );
}
