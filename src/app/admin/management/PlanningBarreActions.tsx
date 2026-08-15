"use client";
import { LayoutTemplate, Printer, Save, Undo2 } from "lucide-react";
import { Card } from "@/components/ui";
import type { ModelePlanning, TachePlanifiee } from "./types";

/**
 * Barre d'actions admin du semainier : choix de la vue, et deux panneaux
 * dépliants — « Planning » (importer les cours, appliquer/enregistrer un
 * modèle, annuler un import) et « Partager » (imprimer, envoyer par mail).
 *
 * Réservée à l'admin : TabPlanning ne la monte pas pour une monitrice.
 * Les moniteurs n'ont pas besoin de ces actions :
 * - Le switcher de vues est inutile (on leur impose la vue Fiche)
 * - 'Planning' (Importer/Modèles) est une action de configuration
 * - 'Partager' est une action de coordination d'équipe
 * Ils ne voient donc que leur fiche, directement lisible.
 *
 * Extraite car ces deux panneaux sont de longs blocs décoratifs qui ne
 * portent aucune logique : ils se contentent d'appeler les actions de
 * TabPlanning.
 */

interface Props {
  view: "tableau" | "horaire" | "fiche";
  setView: (v: "tableau" | "horaire" | "fiche") => void;
  openPanel: "planning" | "partager" | null;
  setOpenPanel: (p: "planning" | "partager" | null) => void;
  taches: TachePlanifiee[];
  modeles: ModelePlanning[];
  importing: boolean;
  notifying: boolean;
  applyingModele: boolean;
  saveModeleName: string;
  setSaveModeleName: (n: string) => void;
  saveModeleType: "scolaire" | "vacances" | "autre";
  setSaveModeleType: (t: "scolaire" | "vacances" | "autre") => void;
  importsDeLaSemaine: { batchId: string; nom: string; count: number; date: Date | null }[];
  handleImportCreneaux: () => void;
  handleApplyModele: (m: ModelePlanning) => void;
  handleSaveAsModele: () => void;
  handleUndoImport: (importBatchId: string, nomModele?: string) => void;
  handleNotifyEquipe: () => void;
}

export default function PlanningBarreActions({
  view, setView, openPanel, setOpenPanel, taches, modeles,
  importing, notifying, applyingModele,
  saveModeleName, setSaveModeleName, saveModeleType, setSaveModeleType,
  importsDeLaSemaine, handleImportCreneaux, handleApplyModele,
  handleSaveAsModele, handleUndoImport, handleNotifyEquipe,
}: Props) {
  return (
    <>
        <div className="flex gap-3 items-stretch">

          {/* ① Switcher de vue — toujours visible */}
          <div className="flex bg-gray-100 rounded-2xl p-1.5 gap-1 flex-shrink-0">
            {(["tableau","horaire","fiche"] as const).map(v => (
              <button key={v} onClick={()=>setView(v)}
                className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl font-body text-xs font-semibold border-none cursor-pointer transition-all min-w-[72px]
                  ${view===v ? "bg-white text-blue-700 shadow-sm" : "bg-transparent text-gray-400 hover:text-blue-700 hover:bg-white/60"}`}>
                <span className="text-lg">{v === "tableau" ? "📊" : v === "horaire" ? "🕐" : "📋"}</span>
                <span>{v === "tableau" ? "Tableau" : v === "horaire" ? "Horaire" : "Fiche"}</span>
              </button>
            ))}
          </div>

          {/* ② Bouton Planning */}
          <button
            onClick={() => setOpenPanel(openPanel === "planning" ? null : "planning")}
            className={`flex-1 flex items-center gap-4 px-5 py-4 rounded-2xl border-2 cursor-pointer transition-all text-left
              ${openPanel === "planning"
                ? "bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/25"
                : "bg-white border-gray-200 text-blue-800 hover:border-blue-300 hover:bg-blue-50 shadow-sm"}`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl
              ${openPanel === "planning" ? "bg-white/20" : "bg-blue-50"}`}>
              📅
            </div>
            <div className="min-w-0">
              <div className="font-display text-sm font-bold">Planning</div>
              <div className={`font-body text-xs mt-0.5 ${openPanel === "planning" ? "text-white/70" : "text-gray-400"}`}>
                Importer, modèles, organisation
              </div>
            </div>
            <div className={`ml-auto text-lg transition-transform ${openPanel === "planning" ? "rotate-180" : ""}`}>⌄</div>
          </button>

          {/* ③ Bouton Partager */}
          <button
            onClick={() => setOpenPanel(openPanel === "partager" ? null : "partager")}
            className={`flex-1 flex items-center gap-4 px-5 py-4 rounded-2xl border-2 cursor-pointer transition-all text-left
              ${openPanel === "partager"
                ? "bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/25"
                : "bg-white border-gray-200 text-blue-800 hover:border-blue-300 hover:bg-blue-50 shadow-sm"}`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl
              ${openPanel === "partager" ? "bg-white/20" : "bg-blue-50"}`}>
              📤
            </div>
            <div className="min-w-0">
              <div className="font-display text-sm font-bold">Partager</div>
              <div className={`font-body text-xs mt-0.5 ${openPanel === "partager" ? "text-white/70" : "text-gray-400"}`}>
                Imprimer, envoyer par email
              </div>
            </div>
            <div className={`ml-auto text-lg transition-transform ${openPanel === "partager" ? "rotate-180" : ""}`}>⌄</div>
          </button>
        </div>

        {/* ── PANEL PLANNING ── */}
        {openPanel === "planning" && (
          <Card padding="md">
            <div className="grid grid-cols-3 gap-4">

              {/* Importer cours/stages */}
              <button onClick={() => { handleImportCreneaux(); setOpenPanel(null); }} disabled={importing}
                className="flex flex-col gap-3 p-4 rounded-2xl border-2 border-purple-100 bg-purple-50 hover:border-purple-300 hover:bg-purple-100 cursor-pointer text-left transition-all disabled:opacity-50 group">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm group-hover:shadow">
                  {importing ? <div className="w-5 h-5 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" /> : "📅"}
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-purple-800">{importing ? "Import en cours…" : "Importer cours/stages"}</div>
                  <div className="font-body text-xs text-purple-500 mt-0.5">Récupère automatiquement les créneaux du planning de la semaine</div>
                </div>
              </button>

              {/* Appliquer un modèle */}
              <div className="flex flex-col gap-3 p-4 rounded-2xl border-2 border-green-100 bg-green-50 hover:border-green-300 hover:bg-green-100 transition-all">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm">
                  <LayoutTemplate size={20} className="text-green-600" />
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-green-800">Appliquer un modèle</div>
                  <div className="font-body text-xs text-green-600 mt-0.5">Charge une semaine type enregistrée</div>
                </div>
                {modeles.length === 0 ? (
                  <p className="font-body text-xs text-green-500 italic">Aucun modèle. Créez-en ci-dessous.</p>
                ) : (
                  <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto">
                    {modeles.map(m => (
                      <button key={m.id} onClick={() => { handleApplyModele(m); }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white hover:bg-green-50 cursor-pointer border border-green-200 hover:border-green-400 text-left transition-colors">
                        <span className="text-sm">{m.type === "scolaire" ? "📚" : m.type === "vacances" ? "☀️" : "📌"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-body text-xs font-semibold text-green-800 truncate">{m.nom}</div>
                          <div className="font-body text-[9px] text-gray-400">{m.taches.length} tâches</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Sauvegarder comme modèle */}
              <div className="flex flex-col gap-3 p-4 rounded-2xl border-2 border-blue-100 bg-blue-50 hover:border-blue-200 transition-all">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                  <Save size={20} className="text-blue-500" />
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-blue-800">Sauvegarder modèle</div>
                  <div className="font-body text-xs text-blue-500 mt-0.5">Enregistre la semaine actuelle comme template</div>
                </div>
                {taches.length === 0 ? (
                  <p className="font-body text-xs text-blue-400 italic">Aucune tâche cette semaine.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <input value={saveModeleName} onChange={e => setSaveModeleName(e.target.value)}
                      placeholder="Nom du modèle…"
                      className="w-full px-3 py-2 rounded-xl border border-blue-200 font-body text-xs focus:outline-none focus:ring-2 focus:ring-blue-400/30 text-blue-800 bg-white" />
                    <div className="flex gap-1">
                      {([["scolaire","📚","Scolaire"],["vacances","☀️","Vacances"],["autre","📌","Autre"]] as const).map(([id, emoji, label]) => (
                        <button key={id} onClick={() => setSaveModeleType(id)}
                          className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl border font-body text-[10px] font-semibold cursor-pointer transition-all
                            ${saveModeleType === id ? "bg-blue-500 text-white border-blue-500 shadow-sm" : "bg-white text-blue-800 border-blue-200 hover:border-blue-400"}`}>
                          {emoji} {label}
                        </button>
                      ))}
                    </div>
                    <button onClick={handleSaveAsModele}
                      className="w-full py-2 rounded-xl bg-blue-500 text-white font-body text-xs font-semibold cursor-pointer border-none hover:bg-blue-400 shadow-md shadow-blue-500/20 transition-colors">
                      Créer le modèle ({taches.length} tâches)
                    </button>
                  </div>
                )}
              </div>

              {/* ── Annuler un import (rollback ciblé) ─────────────────────
                  Affiche la liste des modèles appliqués sur cette semaine et
                  permet de tout effacer en bloc. Utile si on a appliqué le
                  mauvais modèle ou importé 2 fois la même semaine. */}
              {importsDeLaSemaine.length > 0 && (
                <div className="flex flex-col gap-3 p-4 rounded-2xl border-2 border-orange-100 bg-orange-50 hover:border-orange-200 transition-all">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                    <Undo2 size={20} className="text-orange-500" />
                  </div>
                  <div>
                    <div className="font-display text-sm font-bold text-orange-800">Annuler un import</div>
                    <div className="font-body text-xs text-orange-600 mt-0.5">
                      {importsDeLaSemaine.length} import{importsDeLaSemaine.length > 1 ? "s" : ""} sur cette semaine
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto">
                    {importsDeLaSemaine.map(imp => (
                      <button
                        key={imp.batchId}
                        onClick={() => handleUndoImport(imp.batchId, imp.nom)}
                        disabled={applyingModele}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white hover:bg-orange-50 cursor-pointer border border-orange-200 hover:border-orange-400 text-left transition-colors disabled:opacity-40"
                      >
                        <Undo2 size={12} className="text-orange-500" />
                        <div className="flex-1 min-w-0">
                          <div className="font-body text-xs font-semibold text-orange-800 truncate">{imp.nom}</div>
                          <div className="font-body text-[9px] text-gray-400">
                            {imp.count} tâche{imp.count > 1 ? "s" : ""}
                            {imp.date && ` · ${imp.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </Card>
        )}

        {/* ── PANEL PARTAGER ── */}
        {openPanel === "partager" && (
          <Card padding="md">
            <div className="grid grid-cols-2 gap-4">

              {/* Imprimer */}
              <button onClick={() => { window.print(); setOpenPanel(null); }} disabled={taches.length === 0}
                className="flex flex-col gap-3 p-4 rounded-2xl border-2 border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50 cursor-pointer text-left transition-all disabled:opacity-40 group">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm group-hover:shadow">
                  <Printer size={20} className="text-blue-800" />
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-blue-800">Imprimer</div>
                  <div className="font-body text-xs text-gray-400 mt-0.5">Format A4 paysage, optimisé pour l'impression</div>
                </div>
              </button>

              {/* Email équipe */}
              <button onClick={() => { handleNotifyEquipe(); setOpenPanel(null); }} disabled={notifying || taches.length === 0}
                className="flex flex-col gap-3 p-4 rounded-2xl border-2 border-blue-100 bg-blue-50 hover:border-blue-400 hover:bg-blue-100 cursor-pointer text-left transition-all disabled:opacity-40 group">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm group-hover:shadow">
                  {notifying ? <div className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" /> : "📧"}
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-blue-800">{notifying ? "Envoi en cours…" : "Email à l'équipe"}</div>
                  <div className="font-body text-xs text-blue-500 mt-0.5">Envoie le planning personnalisé à chaque moniteur</div>
                </div>
              </button>

            </div>
          </Card>
        )}
    </>
  );
}
