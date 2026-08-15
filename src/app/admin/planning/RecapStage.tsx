"use client";
/**
 * src/app/admin/planning/RecapStage.tsx
 *
 * Récapitulatif chiffré d'une inscription à un stage, avant validation :
 * semaine complète ou journée, prix par enfant, remises réellement appliquées,
 * total, et choix acompte / paiement intégral.
 *
 * C'est l'écran que l'admin lit à voix haute au parent qui a le chéquier à la
 * main. Il doit donc dire la VÉRITÉ sur la remise : le libellé est reconstruit
 * à partir des raisons remontées par le calcul (fratrie, multi-stages, tarif
 * plancher) plutôt qu'annoncé au jugé — une « remise fratrie » affichée alors
 * que c'était un plancher tarifaire crée une réclamation au stage suivant.
 *
 * Purement présentationnel : aucun calcul ici, tout vient de enroll-tarifs.ts
 * et de computeStageReductionsAsync.
 */

import { Badge } from "@/components/ui";
import { prixJourAffiche } from "./enroll-tarifs";

export default function RecapStage({
  creneau, priceTTC, nbJours, stageMode, setStageMode, existingStageCount,
  stageLines, stageTotalTTC, selectedChildren,
  acompteParEnfant, stagePayChoice, setStagePayChoice,
  showAcompte, stageAcompte, stageSolde,
}: {
  creneau: any;
  priceTTC: number;
  /** Nombre de jours réel du stage (chargé depuis Firestore). */
  nbJours: number;
  stageMode: "semaine" | "jour";
  setStageMode: (m: "semaine" | "jour") => void;
  existingStageCount: number;
  stageLines: any[];
  stageTotalTTC: number;
  selectedChildren: string[];
  acompteParEnfant: number;
  stagePayChoice: "acompte" | "total";
  setStagePayChoice: (c: "acompte" | "total") => void;
  showAcompte: boolean;
  stageAcompte: number;
  stageSolde: number;
}) {
  const ACOMPTE_PAR_ENFANT = acompteParEnfant;
  return (
                  <div className="bg-green-50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-body text-xs font-semibold text-green-700 uppercase tracking-wider">Récapitulatif stage</div>
                      <Badge color="blue">{stageMode === "semaine" ? `${nbJours} jour${nbJours > 1 ? "s" : ""}` : "1 jour"}</Badge>
                    </div>
                    {/* Choix semaine ou jour */}
                    {nbJours > 1 && (
                      <div className="flex gap-2">
                        <button onClick={() => setStageMode("semaine")}
                          className={`flex-1 py-2 rounded-lg font-body text-xs font-semibold border cursor-pointer ${stageMode === "semaine" ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
                          Semaine complète ({nbJours}j)
                        </button>
                        <button onClick={() => setStageMode("jour")}
                          className={`flex-1 py-2 rounded-lg font-body text-xs font-semibold border cursor-pointer ${stageMode === "jour" ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
                          Ce jour uniquement
                        </button>
                      </div>
                    )}
                    <div className="font-body text-[10px] text-blue-500 bg-blue-50 rounded px-2 py-1">
                      {(() => {
                        const prixJourAff = prixJourAffiche(creneau, priceTTC, nbJours);
                        return stageMode === "semaine"
                          ? `${nbJours} jour${nbJours > 1 ? "s" : ""} — ${priceTTC.toFixed(2)}€`
                          : `1 jour sur ${nbJours} — ${prixJourAff.toFixed(2)}€/jour (prorata)`;
                      })()}
                    </div>
                    {existingStageCount > 0 && (
                      <div className="font-body text-[10px] text-orange-500 bg-orange-50 rounded px-2 py-1">
                        {existingStageCount} inscription(s) stage déjà enregistrée(s) pour cette famille — réductions cumulées
                      </div>
                    )}
                    {stageLines.map(l => (
                      <div key={l.childId} className="flex items-center justify-between font-body text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-blue-800 font-semibold">{l.childName}</span>
                          {l.remiseEuros > 0 && (() => {
                            // Construire un libellé fidèle à la VRAIE cause de la remise.
                            // discountReasons (rempli par computeStageReductionsAsync) contient
                            // p.ex. "(plafond au prix plancher 152€)" ou "2ème enfant famille (-X%)".
                            const reasons: string[] = (l as any).discountReasons || [];
                            const isPlancher = reasons.some(r => r.includes("plancher"));
                            const hasFratrieOrMulti = reasons.some(r => r.includes("enfant famille") || r.includes("stage"));
                            let label: string;
                            if (isPlancher && !hasFratrieOrMulti) {
                              label = "tarif plancher";
                            } else if (hasFratrieOrMulti) {
                              // Reprend les raisons (sans le suffixe plancher éventuel)
                              label = reasons.filter(r => !r.includes("plancher")).join(" + ") || "remise";
                            } else {
                              label = "remise";
                            }
                            return <Badge color="green">-{l.remiseEuros}€ ({label})</Badge>;
                          })()}
                        </div>
                        <div className="text-right">
                          <span className="text-slate-500 line-through text-xs mr-1">{l.prixBase.toFixed(2)}€</span>
                          <span className="font-bold text-blue-500">{l.prixReduit.toFixed(2)}€</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-2 border-t border-green-200 font-body">
                      <span className="text-sm font-bold text-blue-800">Total à régler</span>
                      <span className="text-2xl font-bold text-green-600">{stageTotalTTC.toFixed(2)}€</span>
                    </div>
                    {stageMode === "semaine" && stageTotalTTC > ACOMPTE_PAR_ENFANT * stageLines.length && (
                      <div className="mt-1">
                        <div className="font-body text-xs font-semibold text-slate-600 mb-1.5">Mode de paiement :</div>
                        <div className="flex gap-2">
                          <button onClick={() => setStagePayChoice("total")}
                            className={`flex-1 py-2 rounded-lg font-body text-xs font-semibold border cursor-pointer ${stagePayChoice === "total" ? "bg-green-600 text-white border-green-600" : "bg-white text-slate-600 border-gray-200"}`}>
                            💶 Paiement total ({stageTotalTTC.toFixed(0)}€)
                          </button>
                          <button onClick={() => setStagePayChoice("acompte")}
                            className={`flex-1 py-2 rounded-lg font-body text-xs font-semibold border cursor-pointer ${stagePayChoice === "acompte" ? "bg-orange-500 text-white border-orange-500" : "bg-white text-slate-600 border-gray-200"}`}>
                            💳 Acompte ({stageAcompte}€ + solde J-7)
                          </button>
                        </div>
                      </div>
                    )}
                    {showAcompte && (
                      <div className="bg-blue-50 rounded-lg p-3 mt-1">
                        <div className="flex justify-between font-body text-xs text-blue-800 mb-1">
                          <span>💳 Acompte ({selectedChildren.length} × {ACOMPTE_PAR_ENFANT}€)</span>
                          <span className="font-bold">{stageAcompte.toFixed(2)}€</span>
                        </div>
                        <div className="flex justify-between font-body text-xs text-slate-500">
                          <span>Solde à régler J-7 avant le stage</span>
                          <span className="font-semibold">{stageSolde.toFixed(2)}€</span>
                        </div>
                      </div>
                    )}
                    <div className="bg-white rounded-lg p-3">
                      <div className="font-body text-xs text-slate-600 text-center">
                        {showAcompte
                          ? <>Un email avec le lien de paiement pour l'acompte sera envoyé à la famille.<br/>Le solde sera demandé automatiquement 7 jours avant le stage.</>
                          : <>La commande sera ajoutée aux impayés.<br/>Encaissement possible depuis <strong>Paiements → Encaisser</strong>.</>
                        }
                      </div>
                    </div>
                  </div>
  );
}
