"use client";
/**
 * src/app/admin/parametres/SectionVacances.tsx
 *
 * Onglet « Vacances scolaires » : périodes de la collection `vacationPeriods`.
 *
 * Pourquoi séparé : ces dates ne sont pas décoratives, elles définissent QUAND
 * les réductions famille et multi-stages s'appliquent. Une inscription stage
 * posée en dehors de ces périodes n'aura aucune réduction automatique.
 *
 * Composant de présentation : le chargement (avec le semis automatique des
 * périodes par défaut au premier lancement) et les écritures restent dans
 * page.tsx, pour continuer à s'exécuter à l'ouverture de la page et non à
 * l'affichage de l'onglet.
 */
import { Card } from "@/components/ui";
import { Plus, Trash2, Loader2, Calendar } from "lucide-react";
import type { VacationPeriod } from "./types";

type Props = {
  vacations: VacationPeriod[];
  loadingVacations: boolean;
  savingVacation: boolean;
  newVacName: string;
  setNewVacName: React.Dispatch<React.SetStateAction<string>>;
  newVacStart: string;
  setNewVacStart: React.Dispatch<React.SetStateAction<string>>;
  newVacEnd: string;
  setNewVacEnd: React.Dispatch<React.SetStateAction<string>>;
  handleAddVacation: () => void;
  handleUpdateVacation: (id: string, field: string, value: string) => void;
  handleDeleteVacation: (id: string) => void;
};

export default function SectionVacances({
  vacations, loadingVacations, savingVacation,
  newVacName, setNewVacName, newVacStart, setNewVacStart, newVacEnd, setNewVacEnd,
  handleAddVacation, handleUpdateVacation, handleDeleteVacation,
}: Props) {
  return (
        <div className="flex flex-col gap-5">
          <Card padding="sm" className="bg-blue-50 border-blue-500/8">
            <div className="font-body text-sm text-blue-800">
              <Calendar className="inline w-4 h-4 mr-1" />
              Ces périodes définissent quand les réductions famille et multi-stages s&apos;appliquent. Une inscription stage en dehors de ces périodes n&apos;aura pas de réduction automatique.
            </div>
          </Card>
          {loadingVacations ? (
            <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
          ) : (
            <>
              <Card padding="md">
                <h3 className="font-body text-base font-semibold text-blue-800 mb-4">
                  Périodes définies ({vacations.length})
                </h3>
                <div className="flex flex-col gap-3">
                  {[...vacations].sort((a, b) => a.startDate.localeCompare(b.startDate)).map((v) => (
                    <div key={v.id} className="flex items-center gap-3 flex-wrap border border-blue-500/8 rounded-lg p-3">
                      <input type="text" value={v.name}
                        onChange={(e) => handleUpdateVacation(v.id, "name", e.target.value)}
                        className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
                      <input type="date" value={v.startDate}
                        onChange={(e) => handleUpdateVacation(v.id, "startDate", e.target.value)}
                        className="w-40 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
                      <span className="font-body text-xs text-gray-400">→</span>
                      <input type="date" value={v.endDate}
                        onChange={(e) => handleUpdateVacation(v.id, "endDate", e.target.value)}
                        className="w-40 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
                      <button onClick={() => handleDeleteVacation(v.id)}
                        className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {vacations.length === 0 && (
                    <p className="font-body text-sm text-gray-400 italic text-center py-4">Aucune période définie.</p>
                  )}
                </div>
              </Card>
              <Card padding="md">
                <h3 className="font-body text-base font-semibold text-blue-800 mb-4">Ajouter une période</h3>
                <div className="flex gap-3 flex-wrap items-end">
                  <div className="flex-1 min-w-[200px]">
                    <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Nom</label>
                    <input type="text" value={newVacName} onChange={(e) => setNewVacName(e.target.value)}
                      placeholder="Ex : Vacances de la Toussaint 2026"
                      className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Début</label>
                    <input type="date" value={newVacStart} onChange={(e) => setNewVacStart(e.target.value)}
                      className="w-40 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Fin</label>
                    <input type="date" value={newVacEnd} onChange={(e) => setNewVacEnd(e.target.value)}
                      className="w-40 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
                  </div>
                  <button onClick={handleAddVacation} disabled={savingVacation}
                    className={`px-4 py-2 rounded-lg font-body text-sm font-semibold border-none cursor-pointer
                      ${savingVacation ? "bg-gray-200 text-gray-400" : "bg-blue-500 text-white hover:bg-blue-400"}`}>
                    {savingVacation ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus size={14} className="inline mr-1" />Ajouter</>}
                  </button>
                </div>
              </Card>
            </>
          )}
        </div>
  );
}
