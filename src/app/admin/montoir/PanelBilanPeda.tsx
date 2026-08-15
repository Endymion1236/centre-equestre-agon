/**
 * src/app/admin/montoir/PanelBilanPeda.tsx
 *
 * Le panneau qui s'ouvre juste apres la cloture d'une reprise : pour chaque
 * cavalier present, la monitrice dicte son observation (Whisper transcrit,
 * l'IA structure), ou saisit une note rapide sans IA. C'est le moment ou la
 * seance se transforme en trace pedagogique, pendant qu'elle a encore les
 * cavaliers en tete.
 *
 * Pourquoi ce fichier : 150 lignes de panneau qui s'intercalaient entre la
 * feuille d'appel et la modale de chute. L'etat (enregistrement, transcripts,
 * bilans) reste au niveau de la page via le hook useDicteeBilan — il doit
 * survivre a la fermeture du panneau, une transcription pouvant etre encore
 * en vol.
 *
 * JSX DEPLACE tel quel : libelles, placeholders et classes inchanges.
 */

"use client";

import { Badge } from "@/components/ui";
import { Loader2, Mic, MicOff, Sparkles } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { Creneau, QuickNoteChild } from "./types";

export default function PanelBilanPeda({
  quickNoteChild, creneaux, recording, transcripts, setTranscripts,
  iaLoading, iaBilans, setIaBilans, quickNotes, setQuickNotes,
  displayFromHorseName, startRecording, stopRecording, analyserBilanIA,
  saveBilanIA, saveQuickNotes, setQuickNoteChild,
}: {
  quickNoteChild: QuickNoteChild;
  creneaux: Creneau[];
  recording: string | null;
  transcripts: Record<string, string>;
  setTranscripts: Dispatch<SetStateAction<Record<string, string>>>;
  iaLoading: Record<string, boolean>;
  iaBilans: Record<string, any>;
  setIaBilans: Dispatch<SetStateAction<Record<string, any>>>;
  quickNotes: Record<string, string>;
  setQuickNotes: (v: Record<string, string>) => void;
  displayFromHorseName: (horseName: string) => string;
  startRecording: (childId: string) => void;
  stopRecording: () => void;
  analyserBilanIA: (child: any, creneauInfo: any) => void;
  saveBilanIA: (child: any, bilan: any) => void;
  saveQuickNotes: () => void;
  setQuickNoteChild: (v: QuickNoteChild | null) => void;
}) {
  return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center" onClick={() => { stopRecording(); setQuickNoteChild(null); setQuickNotes({}); setTranscripts({}); setIaBilans({}); }}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xl max-h-[92vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7c3aed,#2050A0)" }}>
                  <Sparkles size={16} className="text-white" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-blue-800">Bilan pédagogique</h2>
                  <p className="font-body text-xs text-slate-600">Dictez votre observation — l'IA structure la fiche cavalier</p>
                </div>
              </div>
            </div>

            <div className="p-4 flex flex-col gap-4">
              {quickNoteChild.children.map(child => {
                const isRec = recording === child.childId;
                const transcript = transcripts[child.childId] || "";
                const loading = iaLoading[child.childId] || false;
                const bilan = iaBilans[child.childId];
                // Trouver la reprise
                const creneau = creneaux.find(c => c.id === quickNoteChild.cid);

                return (
                  <div key={child.childId} className="border border-gray-100 rounded-2xl p-4">
                    {/* En-tête enfant */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-body text-sm font-semibold text-blue-800">{child.childName}</span>
                        {child.horseName && <Badge color="blue">🐴 {displayFromHorseName(child.horseName)}</Badge>}
                      </div>
                      {bilan && <Badge color="green">✓ Analysé</Badge>}
                    </div>

                    {/* Bouton dictée + transcription */}
                    {!bilan && (
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => isRec ? stopRecording() : startRecording(child.childId)}
                            disabled={loading}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-body text-sm font-semibold border-none cursor-pointer transition-all disabled:opacity-50 ${isRec ? "bg-red-500 text-white" : "bg-purple-50 text-purple-700 hover:bg-purple-100"}`}>
                            {isRec ? <><MicOff size={16} /> Arrêter la dictée</> : <><Mic size={16} /> Dicter</>}
                          </button>
                          {loading && !transcript && (
                            <div className="flex items-center gap-2 px-4 py-2.5 text-purple-600 font-body text-sm">
                              <Loader2 size={14} className="animate-spin" /> Transcription Whisper...
                            </div>
                          )}
                          {transcript && !loading && !isRec && (
                            <button onClick={() => analyserBilanIA(child, creneau)}
                              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-white border-none cursor-pointer"
                              style={{ background: "linear-gradient(135deg,#7c3aed,#2050A0)" }}>
                              <Sparkles size={14} /> Analyser avec l'IA
                            </button>
                          )}
                          {loading && transcript && (
                            <div className="flex items-center gap-2 px-4 py-2.5 text-purple-600 font-body text-sm">
                              <Loader2 size={14} className="animate-spin" /> Analyse IA...
                            </div>
                          )}
                        </div>

                        {/* Indicateur enregistrement */}
                        {isRec && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-xl">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                            <span className="font-body text-xs text-red-600">Enregistrement en cours — parlez naturellement, appuyez Arrêter quand terminé</span>
                          </div>
                        )}

                        {/* Zone transcript */}
                        <textarea
                          value={transcript}
                          onChange={e => setTranscripts(prev => ({ ...prev, [child.childId]: e.target.value }))}
                          placeholder={isRec ? "🎙️ Enregistrement..." : "Le transcript apparaîtra ici après dictée, ou tapez directement..."}
                          rows={3}
                          className={`w-full px-3 py-2.5 rounded-xl border font-body text-sm bg-white focus:outline-none resize-none transition-all ${isRec ? "border-red-200 bg-red-50/20" : "border-gray-200 focus:border-purple-400"}`}
                        />
                      </div>
                    )}

                    {/* Résultat bilan IA */}
                    {bilan && (
                      <div className="flex flex-col gap-3">
                        <div className="bg-purple-50 rounded-xl p-3 flex flex-col gap-2">
                          {bilan.note.pointsForts && (
                            <div>
                              <div className="font-body text-[10px] font-semibold text-green-600 uppercase tracking-wider mb-0.5">✅ Points forts</div>
                              <div className="font-body text-xs text-blue-800">{bilan.note.pointsForts}</div>
                            </div>
                          )}
                          {bilan.note.aTravailler && (
                            <div>
                              <div className="font-body text-[10px] font-semibold text-orange-500 uppercase tracking-wider mb-0.5">🔧 À travailler</div>
                              <div className="font-body text-xs text-blue-800">{bilan.note.aTravailler}</div>
                            </div>
                          )}
                          {bilan.note.objectifSuivant && (
                            <div>
                              <div className="font-body text-[10px] font-semibold text-purple-600 uppercase tracking-wider mb-0.5">🎯 Prochain objectif</div>
                              <div className="font-body text-xs text-blue-800">{bilan.note.objectifSuivant}</div>
                            </div>
                          )}
                        </div>
                        {/* Mises à jour détectées */}
                        <div className="flex flex-wrap gap-1.5">
                          {bilan.galopUpdate && <Badge color="blue">📈 Niveau → {bilan.galopUpdate}</Badge>}
                          {bilan.objectifsAValider?.length > 0 && <Badge color="green">✓ {bilan.objectifsAValider.length} objectif(s) validé(s)</Badge>}
                          {bilan.nouvelObjectif && <Badge color="purple">+ Nouvel objectif</Badge>}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => saveBilanIA(child, bilan)}
                            className="flex-1 py-2 rounded-xl font-body text-sm font-semibold text-white bg-green-500 border-none cursor-pointer hover:bg-green-600">
                            ✓ Enregistrer
                          </button>
                          <button onClick={() => { setIaBilans(prev => { const n={...prev}; delete n[child.childId]; return n; }); }}
                            className="px-4 py-2 rounded-xl font-body text-sm text-slate-600 bg-gray-100 border-none cursor-pointer">
                            Modifier
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Note manuelle si pas de dictée */}
                    {!transcript && !bilan && (
                      <div className="mt-2">
                        <input
                          value={quickNotes[child.childId] || ""}
                          onChange={e => setQuickNotes({ ...quickNotes, [child.childId]: e.target.value })}
                          placeholder="Ou saisir une note rapide sans IA..."
                          className="w-full px-3 py-2 rounded-lg border border-gray-100 font-body text-xs bg-gray-50 focus:border-blue-300 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => { stopRecording(); setQuickNoteChild(null); setQuickNotes({}); setTranscripts({}); setIaBilans({}); }}
                className="flex-1 py-2.5 rounded-xl font-body text-sm text-slate-600 bg-gray-100 border-none cursor-pointer">Fermer</button>
              <button onClick={saveQuickNotes}
                className="flex-1 py-2.5 rounded-xl font-body text-sm font-semibold text-blue-500 bg-blue-50 border-none cursor-pointer hover:bg-blue-100">
                Enregistrer les notes manuelles
              </button>
            </div>
          </div>
        </div>
  );
}
