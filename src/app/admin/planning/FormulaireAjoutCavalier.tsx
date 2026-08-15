"use client";
/**
 * src/app/admin/planning/FormulaireAjoutCavalier.tsx
 *
 * Ajout d'un cavalier à une famille DÉJÀ existante, sans quitter la modale
 * d'inscription. Auparavant il fallait sortir du planning, passer par la fiche
 * famille, puis revenir — et souvent reprendre la recherche du créneau.
 *
 * Volontairement PUREMENT présentationnel : l'enregistrement du cavalier
 * touche à l'état du panneau (sélection courante, liste des enfants
 * surchargée, mode d'inscription) et reste donc chez l'orchestrateur, passé
 * ici sous forme de `onAjouter`.
 */

import { Check, Loader2 } from "lucide-react";
import { NIVEAUX_GALOP_RAPIDE } from "./enroll-constantes";

export default function FormulaireAjoutCavalier({ fam, childDraft, setChildDraft, addingChild, onAjouter, onAnnuler }: {
  fam: any;
  childDraft: { firstName: string; lastName: string; birthDate: string; galopLevel: string };
  setChildDraft: (d: { firstName: string; lastName: string; birthDate: string; galopLevel: string }) => void;
  addingChild: boolean;
  onAjouter: () => void;
  onAnnuler: () => void;
}) {
  return (
                  <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                    <div className="font-body text-xs font-semibold text-blue-800 mb-2">
                      Nouveau cavalier chez {fam.parentName}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input value={childDraft.firstName} autoFocus
                        onChange={e => setChildDraft({ ...childDraft, firstName: e.target.value })}
                        placeholder="Prénom *"
                        className="px-3 py-2 rounded-lg border border-gray-200 font-body text-sm" />
                      <input value={childDraft.lastName}
                        onChange={e => setChildDraft({ ...childDraft, lastName: e.target.value })}
                        placeholder="Nom"
                        className="px-3 py-2 rounded-lg border border-gray-200 font-body text-sm" />
                      <input type="date" value={childDraft.birthDate}
                        onChange={e => setChildDraft({ ...childDraft, birthDate: e.target.value })}
                        className="px-3 py-2 rounded-lg border border-gray-200 font-body text-sm" />
                      <select value={childDraft.galopLevel}
                        onChange={e => setChildDraft({ ...childDraft, galopLevel: e.target.value })}
                        className="px-3 py-2 rounded-lg border border-gray-200 font-body text-sm">
                        {NIVEAUX_GALOP_RAPIDE.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button disabled={addingChild || !childDraft.firstName.trim()}
                        onClick={onAjouter}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-body text-xs font-semibold border-none cursor-pointer disabled:opacity-50">
                        {addingChild ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        Ajouter
                      </button>
                      <button onClick={onAnnuler}
                        className="px-3 py-2 rounded-lg bg-white border border-gray-200 font-body text-xs cursor-pointer">
                        Annuler
                      </button>
                    </div>
                  </div>
  );
}
