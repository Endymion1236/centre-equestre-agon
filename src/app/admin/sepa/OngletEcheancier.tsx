"use client";

/**
 * src/app/admin/sepa/OngletEcheancier.tsx
 *
 * Onglet « Échéancier » : création d'un échéancier, liste des échéances en
 * attente avec leur sélection pour la remise, et rappel des échéances déjà
 * traitées.
 *
 * Pourquoi séparé : c'est l'onglet de travail quotidien, et le plus dense —
 * un formulaire avec un mode « réparti sur 2 mandats », une liste cochable qui
 * alimente la remise, et des dates modifiables en place. Le sortir de la page
 * évite que ces trois choses se mélangent au reste de l'écran.
 *
 * Le composant ne fait aucune écriture directe sauf la correction de date en
 * place (déléguée à `mettreAJourDateEcheance`) : tout le reste passe par les
 * handlers fournis par la page.
 */

import { Card, Badge } from "@/components/ui";
import {
  Plus, Save, Loader2, Download, Check, Calendar, Trash2, CheckSquare, Square,
} from "lucide-react";
import { mettreAJourDateEcheance } from "./echeances-firestore";
import type { EcheanceSepa, MandatSepa, SaisieEcheancier, ToastFn } from "./types";

interface OngletEcheancierProps {
  echeances: EcheanceSepa[];
  setEcheances: (echeances: EcheanceSepa[]) => void;
  filteredEcheances: EcheanceSepa[];
  mandats: MandatSepa[];
  showNewEcheancier: boolean;
  setShowNewEcheancier: (v: boolean) => void;
  newEcheancier: SaisieEcheancier;
  setNewEcheancier: (v: SaisieEcheancier) => void;
  repartir: boolean;
  setRepartir: (v: boolean) => void;
  saving: boolean;
  selectedEcheances: Set<string>;
  selectedTotal: number;
  selectCurrentMonth: () => void;
  selectAll: () => void;
  toggleEcheance: (id: string) => void;
  handleCreateEcheancier: () => void;
  handleCreateRemise: () => void;
  handleShiftSeries: (ech: EcheanceSepa) => void;
  handleDeleteEcheance: (id: string) => void;
  toast: ToastFn;
}

export function OngletEcheancier({
  echeances, setEcheances, filteredEcheances, mandats,
  showNewEcheancier, setShowNewEcheancier, newEcheancier, setNewEcheancier,
  repartir, setRepartir, saving,
  selectedEcheances, selectedTotal, selectCurrentMonth, selectAll, toggleEcheance,
  handleCreateEcheancier, handleCreateRemise, handleShiftSeries, handleDeleteEcheance,
  toast,
}: OngletEcheancierProps) {
  return (
    <div>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div className="font-body text-sm text-gray-400">Échéances en attente de prélèvement</div>
        <div className="flex gap-2">
          <button onClick={selectCurrentMonth}
            className="flex items-center gap-1 font-body text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-100">
            <Calendar size={14} /> Sélectionner ce mois
          </button>
          <button onClick={() => setShowNewEcheancier(!showNewEcheancier)}
            className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2 rounded-xl border-none cursor-pointer hover:bg-blue-400">
            <Plus size={16} /> Nouvel échéancier
          </button>
        </div>
      </div>

      {/* Formulaire nouvel échéancier */}
      {showNewEcheancier && (
        <Card padding="md" className="mb-5 border-2 border-blue-500/20">
          <h3 className="font-body text-sm font-semibold text-blue-800 mb-4">Créer un échéancier</h3>
          <label className="flex items-center gap-2 mb-4 cursor-pointer font-body text-sm text-slate-700">
            <input type="checkbox" checked={repartir} onChange={e => setRepartir(e.target.checked)} />
            Répartir sur 2 mandats (ex. parents séparés)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Mandat SEPA</label>
              <select value={newEcheancier.mandatId} onChange={e => setNewEcheancier({ ...newEcheancier, mandatId: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white">
                <option value="">Choisir...</option>
                {mandats.filter(m => m.status === "active").map(m => (
                  <option key={m.id} value={m.id}>{m.familyName}{m.libelle ? ` — ${m.libelle}` : ` — ${m.titulaire}`} ({m.mandatId})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-gray-400 block mb-1">{repartir ? "Montant sur mandat 1" : "Montant total TTC"}</label>
              <input type="number" step="0.01" value={newEcheancier.montantTotal} onChange={e => setNewEcheancier({ ...newEcheancier, montantTotal: e.target.value })}
                placeholder="ex: 700"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm" />
            </div>
            {repartir && (
              <>
                <div>
                  <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Mandat SEPA n°2</label>
                  <select value={newEcheancier.mandatId2} onChange={e => setNewEcheancier({ ...newEcheancier, mandatId2: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white">
                    <option value="">Choisir...</option>
                    {mandats.filter(m => m.status === "active" && m.id !== newEcheancier.mandatId).map(m => (
                      <option key={m.id} value={m.id}>{m.familyName}{m.libelle ? ` — ${m.libelle}` : ` — ${m.titulaire}`} ({m.mandatId})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Montant sur mandat 2</label>
                  <input type="number" step="0.01" value={newEcheancier.montant2} onChange={e => setNewEcheancier({ ...newEcheancier, montant2: e.target.value })}
                    placeholder="ex: 300"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm" />
                </div>
              </>
            )}
            <div>
              <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Nombre d&apos;échéances</label>
              <select value={newEcheancier.nbEcheances} onChange={e => setNewEcheancier({ ...newEcheancier, nbEcheances: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                  <option key={n} value={n}>{n}×</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Date de la 1ère échéance</label>
              <input type="date" value={newEcheancier.dateDebut} onChange={e => setNewEcheancier({ ...newEcheancier, dateDebut: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="font-body text-xs font-semibold text-gray-400 block mb-1">Description</label>
              <input value={newEcheancier.description} onChange={e => setNewEcheancier({ ...newEcheancier, description: e.target.value })}
                placeholder="ex: Forfait annuel 2025-2026"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm" />
            </div>
          </div>
          {/* Preview */}
          {!repartir && newEcheancier.montantTotal && newEcheancier.nbEcheances && (
            <div className="bg-sand rounded-lg px-4 py-3 mb-4 font-body text-sm text-blue-800">
              💡 {newEcheancier.nbEcheances} × <strong>{(parseFloat(newEcheancier.montantTotal) / parseInt(newEcheancier.nbEcheances)).toFixed(2)}€</strong> = {parseFloat(newEcheancier.montantTotal).toFixed(2)}€
            </div>
          )}
          {repartir && newEcheancier.montantTotal && newEcheancier.montant2 && newEcheancier.nbEcheances && (
            <div className="bg-sand rounded-lg px-4 py-3 mb-4 font-body text-sm text-blue-800">
              💡 Mandat 1 : {newEcheancier.nbEcheances}× <strong>{(parseFloat(newEcheancier.montantTotal) / parseInt(newEcheancier.nbEcheances)).toFixed(2)}€</strong> · Mandat 2 : {newEcheancier.nbEcheances}× <strong>{(parseFloat(newEcheancier.montant2) / parseInt(newEcheancier.nbEcheances)).toFixed(2)}€</strong>
              <div className="text-xs text-blue-600 mt-0.5">Total : {(parseFloat(newEcheancier.montantTotal) + parseFloat(newEcheancier.montant2)).toFixed(2)}€</div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={handleCreateEcheancier} disabled={saving || !newEcheancier.mandatId || !newEcheancier.montantTotal || !newEcheancier.dateDebut || (repartir && (!newEcheancier.mandatId2 || !newEcheancier.montant2))}
              className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Créer {newEcheancier.nbEcheances} échéances
            </button>
            <button onClick={() => { setShowNewEcheancier(false); setRepartir(false); }} className="font-body text-sm text-gray-500 bg-gray-100 px-4 py-2 rounded-lg border-none cursor-pointer">Annuler</button>
          </div>
        </Card>
      )}

      {/* Barre d'action remise */}
      {selectedEcheances.size > 0 && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl px-5 py-4 mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Check size={20} className="text-green-600" />
            <div>
              <div className="font-body text-sm font-semibold text-green-800">
                {selectedEcheances.size} échéance{selectedEcheances.size > 1 ? "s" : ""} sélectionnée{selectedEcheances.size > 1 ? "s" : ""} · {selectedTotal.toFixed(2)}€
              </div>
              <div className="font-body text-xs text-green-600">Prêt à créer une remise bancaire</div>
            </div>
          </div>
          <button onClick={handleCreateRemise} disabled={saving}
            className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-green-600 hover:bg-green-700 px-5 py-2.5 rounded-xl border-none cursor-pointer disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Créer la remise XML
          </button>
        </div>
      )}

      {/* Liste des échéances */}
      {filteredEcheances.length === 0 ? (
        <Card padding="lg" className="text-center">
          <Calendar size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="font-body text-sm text-gray-500">Aucune échéance en attente.</p>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-sand border-b border-blue-500/8 flex items-center font-body text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            <button onClick={selectAll} className="w-8 flex-shrink-0 bg-transparent border-none cursor-pointer text-gray-400">
              {selectedEcheances.size === filteredEcheances.length ? <CheckSquare size={16} className="text-green-500" /> : <Square size={16} />}
            </button>
            <span className="flex-1">Famille</span>
            <span className="w-28">Date</span>
            <span className="w-24 text-right">Montant</span>
            <span className="w-36">Description</span>
            <span className="w-10" />
          </div>
          {filteredEcheances.map(ech => (
            <div key={ech.id} className={`px-4 py-3 border-b border-gray-100 flex items-center hover:bg-blue-50/30 ${selectedEcheances.has(ech.id) ? "bg-green-50/50" : ""}`}>
              <button onClick={() => toggleEcheance(ech.id)} className="w-8 flex-shrink-0 bg-transparent border-none cursor-pointer">
                {selectedEcheances.has(ech.id) ? <CheckSquare size={16} className="text-green-500" /> : <Square size={16} className="text-gray-300" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="font-body text-sm font-semibold text-blue-800 truncate">{ech.familyName}</div>
                <div className="font-body text-[10px] text-gray-400 font-mono">{ech.mandatId}</div>
              </div>
              <div className="w-28">
                <input
                  key={`ech-date-${ech.id}-${ech.dateEcheance}`}
                  type="date"
                  defaultValue={ech.dateEcheance}
                  onBlur={async (ev) => {
                    await mettreAJourDateEcheance({ ech, newDate: ev.target.value, toast, setEcheances });
                  }}
                  className="font-body text-xs text-gray-600 border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:border-blue-400 cursor-pointer w-full"
                />
              </div>
              <div className="w-24 text-right font-body text-sm font-semibold text-blue-800">{ech.montant.toFixed(2)}€</div>
              <div className="w-36 font-body text-xs text-gray-500 truncate pl-3">{ech.description}</div>
              {/* Bouton "Décaler la série" uniquement sur la 1ere échéance d'une série multi */}
              {ech.echeance === 1 && (ech.echeancesTotal || 0) > 1 && (
                <button
                  onClick={() => handleShiftSeries(ech)}
                  title={`Décaler les ${ech.echeancesTotal} échéances de cette série`}
                  className="w-8 flex justify-center text-blue-400 hover:text-blue-600 bg-transparent border-none cursor-pointer">
                  📅
                </button>
              )}
              <button onClick={() => handleDeleteEcheance(ech.id)} className="w-10 flex justify-end text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </Card>
      )}

      {/* Échéances traitées */}
      {echeances.filter(e => e.status !== "pending").length > 0 && (
        <div className="mt-6">
          <h3 className="font-body text-sm font-semibold text-gray-400 mb-3">Échéances traitées ({echeances.filter(e => e.status !== "pending").length})</h3>
          <div className="flex flex-col gap-1">
            {echeances.filter(e => e.status !== "pending").sort((a, b) => b.dateEcheance.localeCompare(a.dateEcheance)).slice(0, 20).map(ech => (
              <div key={ech.id} className="flex items-center gap-3 font-body text-xs text-gray-400 py-1.5 px-3 bg-gray-50 rounded-lg">
                <Badge color={ech.status === "preleve" ? "green" : ech.status === "remis" ? "blue" : "red"}>
                  {ech.status === "preleve" ? "Prélevé" : ech.status === "remis" ? "En remise" : "Rejeté"}
                </Badge>
                <span className="font-semibold text-gray-600">{ech.familyName}</span>
                <span>{new Date(ech.dateEcheance).toLocaleDateString("fr-FR")}</span>
                <span className="font-semibold">{ech.montant.toFixed(2)}€</span>
                <span className="text-gray-400">{ech.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
