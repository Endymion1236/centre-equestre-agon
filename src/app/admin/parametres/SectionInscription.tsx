"use client";
/**
 * src/app/admin/parametres/SectionInscription.tsx
 *
 * Onglet « Inscription annuelle » : forfaits, adhésion dégressive par famille,
 * licence FFE (avec sa TVA et son code comptable), fin de saison, assurance
 * occasionnelle et lignes optionnelles libres.
 *
 * Pourquoi séparé : c'est la section la plus sensible de l'écran. Elle écrit
 * `settings/inscription`, qui est la SOURCE DE VÉRITÉ des tarifs annuels pour
 * la facturation et le calcul du prorata. Un champ écrit sous une mauvaise clé
 * ne se voit pas ici, il se voit sur une facture.
 *
 * NB (repris de page.tsx) : la collection settings/tarifs (legacy de l'ancien
 * onglet « Tarifs annuels ») n'est plus lue ; seul settings/inscription compte.
 *
 * Composant de présentation : état et sauvegarde restent dans page.tsx.
 */
import { Card } from "@/components/ui";
import { Plus, Trash2 } from "lucide-react";
import type { CustomInscriptionLine, InscriptionParams } from "./types";

type Props = {
  inscriptionParams: InscriptionParams;
  setInscriptionParams: React.Dispatch<React.SetStateAction<InscriptionParams>>;
  inscriptionSaved: boolean;
  saveInscription: () => void;
};

export default function SectionInscription({ inscriptionParams, setInscriptionParams, inscriptionSaved, saveInscription }: Props) {
  return (
        <div className="flex flex-col gap-5">
          {/* Forfaits par fréquence */}
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-1">📋 Forfaits annuels</h3>
            <p className="font-body text-xs text-slate-500 mb-4">Prix plein tarif — le prorata est calculé automatiquement selon la date d'inscription</p>
            <div className="flex flex-col gap-3">
              {[
                { key: "forfait1x", label: "1 cours / semaine", icon: "1×" },
                { key: "forfait2x", label: "2 cours / semaine", icon: "2×" },
                { key: "forfait3x", label: "3 cours / semaine", icon: "3×" },
              ].map(({ key, label, icon }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center font-body text-sm font-bold text-blue-600">{icon}</span>
                    <span className="font-body text-sm text-blue-800">{label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" value={(inscriptionParams as any)[key]}
                      onChange={e => setInscriptionParams(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                      className="w-24 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm text-right bg-cream focus:border-blue-500 focus:outline-none" />
                    <span className="font-body text-sm text-slate-400">€/an</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Adhésion dégressive */}
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-1">👨‍👩‍👧‍👦 Adhésion dégressive par famille</h3>
            <p className="font-body text-xs text-slate-500 mb-4">Le rang est calculé automatiquement selon le nombre d'enfants déjà inscrits en forfait annuel cette saison</p>
            <div className="flex flex-col gap-3">
              {[
                { key: "adhesion1", label: "1er enfant" },
                { key: "adhesion2", label: "2ème enfant" },
                { key: "adhesion3", label: "3ème enfant" },
                { key: "adhesion4plus", label: "4ème enfant et +" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <span className="font-body text-sm text-blue-800">{label}</span>
                  <div className="flex items-center gap-2">
                    <input type="number" value={(inscriptionParams as any)[key]}
                      onChange={e => setInscriptionParams(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                      className="w-24 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm text-right bg-cream focus:border-blue-500 focus:outline-none" />
                    <span className="font-body text-sm text-slate-400">€</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Licence FFE + Saison */}
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-4">📄 Licence FFE & Saison</h3>
            <div className="flex flex-col gap-3">
              {[
                { key: "licenceMoins18", label: "Licence FFE -18 ans" },
                { key: "licencePlus18", label: "Licence FFE +18 ans" },
                { key: "totalSessionsSaison", label: "Nombre de séances / saison" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <span className="font-body text-sm text-blue-800">{label}</span>
                  <div className="flex items-center gap-2">
                    <input type="number" value={(inscriptionParams as any)[key]}
                      onChange={e => setInscriptionParams(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                      className="w-24 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm text-right bg-cream focus:border-blue-500 focus:outline-none" />
                    <span className="font-body text-sm text-slate-400">{key === "totalSessionsSaison" ? "séances" : "€"}</span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4">
                <span className="font-body text-sm text-blue-800">Fin de saison</span>
                <input type="date" value={inscriptionParams.dateFinSaison}
                  onChange={e => setInscriptionParams(prev => ({ ...prev, dateFinSaison: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
              </div>

              {/* TVA + code compta de la licence FFE (utilisés pour la facturation) */}
              <div className="mt-2 pt-3 border-t border-blue-500/8">
                <div className="font-body text-xs text-slate-400 mb-2">Paramètres comptables — appliqués aux deux licences</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-body text-xs text-slate-500 block mb-1">Taux de TVA</label>
                    <select value={inscriptionParams.licenceTvaRate}
                      onChange={e => setInscriptionParams(prev => ({ ...prev, licenceTvaRate: parseFloat(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none">
                      <option value={0}>0 %</option>
                      <option value={5.5}>5,5 %</option>
                      <option value={10}>10 %</option>
                      <option value={20}>20 %</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-body text-xs text-slate-500 block mb-1">Code comptable</label>
                    <input value={inscriptionParams.licenceAccountCode}
                      onChange={e => setInscriptionParams(prev => ({ ...prev, licenceAccountCode: e.target.value }))}
                      placeholder="ex. 70100000"
                      className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Stages */}
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-4">🏕️ Stages — Assurance occasionnelle</h3>
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="font-body text-sm text-blue-800">Assurance occasionnelle 1 mois</span>
                <div className="font-body text-xs text-slate-400 mt-0.5">Proposée aux cavaliers non licenciés lors des stages</div>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" value={inscriptionParams.assuranceOccasionnelle}
                  onChange={e => setInscriptionParams(prev => ({ ...prev, assuranceOccasionnelle: parseFloat(e.target.value) || 0 }))}
                  className="w-24 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm text-right bg-cream focus:border-blue-500 focus:outline-none" />
                <span className="font-body text-sm text-slate-400">€</span>
              </div>
            </div>
          </Card>

          {/* Lignes optionnelles libres (forfait compétition, suppléments, options...) */}
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-1">➕ Lignes optionnelles</h3>
            <p className="font-body text-xs text-slate-500 mb-4">
              Ajoutez ici des forfaits ou options proposés en plus à l&apos;inscription (forfait compétition, tenue club, etc.).
              Ces lignes apparaîtront comme options cochables dans le formulaire d&apos;inscription annuelle.
            </p>
            <div className="flex flex-col gap-2 mb-3">
              {(inscriptionParams.customLines || []).length === 0 && (
                <div className="font-body text-xs text-slate-400 italic py-2">Aucune ligne optionnelle — cliquez sur « Ajouter une ligne » pour en créer une.</div>
              )}
              {(inscriptionParams.customLines || []).map((line, idx) => (
                <div key={line.id} className="grid grid-cols-12 gap-2 items-center bg-blue-50/30 border border-blue-100 rounded-lg p-3">
                  <input
                    value={line.label}
                    onChange={e => {
                      const next = [...(inscriptionParams.customLines || [])];
                      next[idx] = { ...line, label: e.target.value };
                      setInscriptionParams(prev => ({ ...prev, customLines: next }));
                    }}
                    placeholder="Nom de la ligne"
                    className="col-span-5 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none" />
                  <div className="col-span-2 flex items-center gap-1">
                    <input
                      type="number"
                      value={line.priceTTC}
                      onChange={e => {
                        const next = [...(inscriptionParams.customLines || [])];
                        next[idx] = { ...line, priceTTC: parseFloat(e.target.value) || 0 };
                        setInscriptionParams(prev => ({ ...prev, customLines: next }));
                      }}
                      className="w-full px-2 py-2 rounded-lg border border-blue-500/8 font-body text-sm text-right bg-white focus:border-blue-500 focus:outline-none" />
                    <span className="font-body text-xs text-slate-400">€</span>
                  </div>
                  <select
                    value={line.tvaRate}
                    onChange={e => {
                      const next = [...(inscriptionParams.customLines || [])];
                      next[idx] = { ...line, tvaRate: parseFloat(e.target.value) };
                      setInscriptionParams(prev => ({ ...prev, customLines: next }));
                    }}
                    className="col-span-2 px-2 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none">
                    <option value={0}>0%</option>
                    <option value={5.5}>5,5%</option>
                    <option value={10}>10%</option>
                    <option value={20}>20%</option>
                  </select>
                  <input
                    value={line.accountCode}
                    onChange={e => {
                      const next = [...(inscriptionParams.customLines || [])];
                      next[idx] = { ...line, accountCode: e.target.value };
                      setInscriptionParams(prev => ({ ...prev, customLines: next }));
                    }}
                    placeholder="Code compta"
                    className="col-span-2 px-2 py-2 rounded-lg border border-blue-500/8 font-body text-xs bg-white focus:border-blue-500 focus:outline-none" />
                  <button
                    onClick={() => {
                      const next = (inscriptionParams.customLines || []).filter(l => l.id !== line.id);
                      setInscriptionParams(prev => ({ ...prev, customLines: next }));
                    }}
                    className="col-span-1 text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer flex items-center justify-center"
                    title="Supprimer">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                const newLine: CustomInscriptionLine = {
                  id: `line_${Date.now()}`,
                  label: "",
                  priceTTC: 0,
                  tvaRate: 5.5,
                  accountCode: "70611000",
                };
                setInscriptionParams(prev => ({
                  ...prev,
                  customLines: [...(prev.customLines || []), newLine],
                }));
              }}
              className="self-start flex items-center gap-2 font-body text-sm font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 px-4 py-2 rounded-lg border-none cursor-pointer">
              <Plus size={14} /> Ajouter une ligne
            </button>
          </Card>

          <button onClick={saveInscription}
            className="flex items-center justify-center gap-2 py-3 rounded-xl font-body text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 border-none cursor-pointer">
            {inscriptionSaved ? "✅ Sauvegardé !" : "Sauvegarder les paramètres"}
          </button>
        </div>
  );
}
