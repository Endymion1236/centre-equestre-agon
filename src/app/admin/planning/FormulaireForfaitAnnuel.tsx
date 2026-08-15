"use client";
/**
 * src/app/admin/planning/FormulaireForfaitAnnuel.tsx
 *
 * Détail d'un forfait à l'année : rythme, fréquence hebdomadaire, créneaux
 * supplémentaires, adhésion, licence FFE, prorata, réduction famille, plan et
 * mode de paiement.
 *
 * C'est le formulaire le plus cher de l'application — un forfait, c'est
 * plusieurs centaines d'euros et jusqu'à dix prélèvements. Il n'effectue
 * AUCUN calcul lui-même : tous les montants affichés lui sont passés, déjà
 * calculés par enroll-tarifs.ts. C'est délibéré : le prix annoncé à l'écran
 * et le prix écrit sur la facture doivent venir de la même source, sinon on
 * finit par corriger l'un sans l'autre.
 *
 * Deux règles métier visibles ici, à ne pas confondre :
 *  - « une semaine sur deux » (garde alternée) divise le tarif par deux ET ne
 *    pose le cavalier que sur les séances de sa parité ;
 *  - au-delà de la 1re heure, on facture le DIFFÉRENTIEL vers la fréquence
 *    cumulée (dégressivité horaire), jamais le tarif plein.
 */

import { X, Check, Search } from "lucide-react";
import { payModes } from "./types";
import { JOURS_COURTS_DEPUIS_DIMANCHE } from "./enroll-constantes";
import SepaWarning from "./SepaWarning";
import type { StatutSepa } from "./enroll-types";

export default function FormulaireForfaitAnnuel({
  creneau, weekCreneaux, selFam,
  quinzaine, setQuinzaine, semainePaire, setSemainePaire,
  ajoutHeureAdmin, frequenceDejaInscrite, freqMaxAjoutable,
  frequenceCours, setFrequenceCours, prixForfaitPlein,
  extraSlots, setExtraSlots, extraSlotSearch, setExtraSlotSearch,
  adhesion, setAdhesion, prixAdhesionDegressif, rangEnfantFamille,
  licence, setLicence, licenceType, setLicenceType, prixLicence,
  prixForfait, prixForfaitAnnuel, prorata, sessionsRestantes, sessionsTotalSaison,
  familyDiscountAmount, familyDiscountPercent, totalAnnuel,
  payPlan, setPayPlan, annualPayMode, setAnnualPayMode, setSepaStatus,
}: {
  creneau: any;
  weekCreneaux: any[];
  selFam: string;
  quinzaine: boolean;
  setQuinzaine: (v: boolean) => void;
  semainePaire: boolean;
  setSemainePaire: (v: boolean) => void;
  ajoutHeureAdmin: boolean;
  frequenceDejaInscrite: number;
  freqMaxAjoutable: number;
  frequenceCours: 1 | 2 | 3;
  setFrequenceCours: (f: 1 | 2 | 3) => void;
  /** Tarif plein d'une fréquence, déjà lié aux paramètres du club. */
  prixForfaitPlein: (f: number) => number;
  extraSlots: string[];
  setExtraSlots: React.Dispatch<React.SetStateAction<string[]>>;
  extraSlotSearch: string;
  setExtraSlotSearch: (v: string) => void;
  adhesion: boolean;
  setAdhesion: (v: boolean) => void;
  prixAdhesionDegressif: number;
  rangEnfantFamille: number;
  licence: boolean;
  setLicence: (v: boolean) => void;
  licenceType: "moins18" | "plus18";
  setLicenceType: (t: "moins18" | "plus18") => void;
  prixLicence: number;
  prixForfait: number;
  prixForfaitAnnuel: number;
  prorata: number;
  sessionsRestantes: number;
  sessionsTotalSaison: number;
  familyDiscountAmount: number;
  familyDiscountPercent: number;
  totalAnnuel: number;
  payPlan: "1x" | "3x" | "10x";
  setPayPlan: (p: "1x" | "3x" | "10x") => void;
  annualPayMode: string;
  setAnnualPayMode: (m: string) => void;
  setSepaStatus: (s: StatutSepa) => void;
}) {
  return (
                  <div className="bg-white rounded-lg p-3 space-y-3">
                    <div className="font-body text-xs font-semibold text-green-600 uppercase tracking-wider">Détail du forfait</div>

                    {/* Une semaine sur deux — gardes alternées */}
                    <label className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer ${
                      quinzaine ? "bg-sky-50 border-sky-300" : "bg-white border-gray-200"}`}>
                      <input type="checkbox" checked={quinzaine}
                        onChange={e => setQuinzaine(e.target.checked)}
                        className="mt-0.5 cursor-pointer" />
                      <span className="font-body text-xs text-slate-700 leading-relaxed">
                        <strong>Une semaine sur deux</strong> — garde alternée. Moitié
                        des séances, donc moitié du tarif.
                      </span>
                    </label>
                    {quinzaine && (
                      <div className="flex gap-2">
                        {([[true, "Semaines paires"], [false, "Semaines impaires"]] as const).map(([v, label]) => (
                          <button key={label} onClick={() => setSemainePaire(v)}
                            className={`flex-1 py-2 rounded-lg font-body text-xs font-semibold border cursor-pointer ${
                              semainePaire === v ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-600 border-gray-200"}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Fréquence hebdomadaire */}
                    <div>
                      <div className="font-body text-xs text-slate-500 mb-2">
                        {ajoutHeureAdmin ? "Heures à ajouter par semaine" : "Fréquence hebdomadaire"}
                      </div>
                      {ajoutHeureAdmin && (
                        <div className="mb-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                          <p className="font-body text-[11px] text-green-700">
                            🏇 Déjà <strong>{frequenceDejaInscrite}×/sem</strong> cette saison — heures ajoutées au <strong>tarif dégressif</strong> (différentiel), pas à plein tarif.
                          </p>
                        </div>
                      )}
                      {freqMaxAjoutable === 0 ? (
                        <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg font-body text-xs text-amber-800">
                          Déjà au maximum (3×/sem) cette saison.
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          {([1, 2, 3] as const).filter(f => f <= freqMaxAjoutable).map(f => {
                            const prixF = ajoutHeureAdmin
                              ? Math.max(0, prixForfaitPlein(Math.min(3, frequenceDejaInscrite + f)) - prixForfaitPlein(frequenceDejaInscrite))
                              : prixForfaitPlein(f);
                            return (
                            <button key={f} onClick={() => { setFrequenceCours(f); setExtraSlots([]); setExtraSlotSearch(""); }}
                              className={`flex-1 py-2 rounded-lg border font-body text-sm font-semibold cursor-pointer transition-all ${frequenceCours === f ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 bg-white text-slate-500"}`}>
                              {ajoutHeureAdmin ? `+${f}×/sem` : `${f}×/sem`}
                              <div className="font-body text-[10px] font-normal mt-0.5">{prixF}€/an</div>
                            </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Créneaux supplémentaires si 2×/sem ou 3×/sem */}
                    {frequenceCours >= 2 && (() => {
                      const creneauDow = new Date(creneau.date + "T12:00:00").getDay();
                      const creneauKey = `${creneauDow}-${creneau.startTime}-${creneau.activityTitle}-${creneau.monitor || ""}`;
                      // Tous les créneaux de la semaine sauf stages et le créneau principal
                      // Utiliser weekCreneaux (toute la semaine) et non allCreneaux (vue courante seulement)
                      const autresSlots = weekCreneaux.filter(c =>
                        c.activityType !== "stage" &&
                        c.activityType !== "stage_journee" &&
                        c.id !== creneau.id
                      );
                      const uniqueSlots = [...new Map(autresSlots.map(c => {
                        const dow = new Date(c.date + "T12:00:00").getDay();
                        const key = `${dow}-${c.startTime}-${c.activityTitle}-${c.monitor || ""}`;
                        return [key, { key, dow, startTime: c.startTime, endTime: c.endTime, activityTitle: c.activityTitle, activityId: c.activityId, monitor: c.monitor || "", label: `${JOURS_COURTS_DEPUIS_DIMANCHE[dow]} ${c.startTime}` }];
                      })).values()].filter(s => s.key !== creneauKey); // Exclure le créneau principal

                      // Filtrer par recherche
                      const searchFiltered = extraSlotSearch.trim()
                        ? uniqueSlots.filter(s =>
                            s.activityTitle.toLowerCase().includes(extraSlotSearch.toLowerCase()) ||
                            s.label.toLowerCase().includes(extraSlotSearch.toLowerCase())
                          )
                        : uniqueSlots;

                      const maxExtra = frequenceCours - 1; // 1 extra pour 2×, 2 extras pour 3×

                      const toggleExtraSlot = (key: string) => {
                        setExtraSlots(prev => {
                          if (prev.includes(key)) return prev.filter(k => k !== key);
                          if (prev.length >= maxExtra) return prev;
                          return [...prev, key];
                        });
                      };

                      return (
                        <div>
                          <div className="font-body text-xs text-slate-500 mb-2">
                            {frequenceCours === 2 ? "2ème" : "2ème et 3ème"} créneau hebdomadaire <span className="text-red-500">*</span>
                            {extraSlots.length > 0 && <span className="text-green-600 ml-1">({extraSlots.length}/{maxExtra})</span>}
                          </div>

                          {/* Barre de recherche */}
                          <div className="relative mb-2">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
                            <input value={extraSlotSearch} onChange={e => setExtraSlotSearch(e.target.value)}
                              placeholder="Rechercher cours, jour, horaire..."
                              className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-gray-200 font-body text-xs bg-white focus:border-blue-400 focus:outline-none" />
                          </div>

                          {/* Badges des créneaux sélectionnés */}
                          {extraSlots.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {extraSlots.map((key, i) => {
                                const s = uniqueSlots.find(us => us.key === key);
                                return s ? (
                                  <span key={key} className="inline-flex items-center gap-1 bg-green-50 border border-green-200 text-green-700 px-2 py-0.5 rounded font-body text-[10px] font-semibold">
                                    {s.activityTitle} — {s.label}{s.monitor ? ` (${s.monitor})` : ""}
                                    <button onClick={() => setExtraSlots(prev => prev.filter(k => k !== key))} className="text-green-400 hover:text-red-500 bg-transparent border-none cursor-pointer"><X size={10} /></button>
                                  </span>
                                ) : null;
                              })}
                            </div>
                          )}

                          {/* Liste des slots */}
                          <div className="max-h-36 overflow-auto flex flex-wrap gap-1.5">
                            {searchFiltered.length === 0 ? (
                              <p className="font-body text-[10px] text-gray-400 py-2">
                                {extraSlotSearch ? `Aucun créneau pour « ${extraSlotSearch} »` : "Aucun autre créneau cours disponible"}
                              </p>
                            ) : searchFiltered.map(s => {
                              const isSelected = extraSlots.includes(s.key);
                              const maxReached = !isSelected && extraSlots.length >= maxExtra;
                              const isDisabled = maxReached;
                              return (
                                <button key={s.key} onClick={() => !isDisabled && toggleExtraSlot(s.key)}
                                  className={`px-3 py-1.5 rounded-lg border font-body text-xs cursor-pointer transition-all ${
                                    isSelected ? "border-green-500 bg-green-50 text-green-700 font-semibold" :
                                    isDisabled ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed" :
                                    "border-gray-200 bg-white text-slate-600 hover:border-green-300"
                                  }`} title={`${s.activityTitle} — ${s.monitor || "?"}`}>
                                  <span className="text-[10px] opacity-60 mr-1">{s.activityTitle}</span>
                                  {s.label}
                                  {s.monitor && <span className="text-[9px] opacity-50 ml-1">({s.monitor})</span>}
                                  {isSelected && <Check size={10} className="inline ml-1" />}
                                </button>
                              );
                            })}
                          </div>
                          {extraSlots.length < maxExtra && <p className="font-body text-[10px] text-red-500 mt-1">Sélectionnez {maxExtra - extraSlots.length} créneau(x) supplémentaire(s)</p>}
                        </div>
                      );
                    })()}

                    {/* Adhésion dégressive */}
                    <label className="flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={adhesion} onChange={e => setAdhesion(e.target.checked)} className="accent-green-500 w-4 h-4"/>
                        <div>
                          <span className="font-body text-sm text-blue-800">Adhésion annuelle</span>
                          {rangEnfantFamille > 1 && <span className="font-body text-[10px] text-orange-500 ml-2">{rangEnfantFamille === 2 ? "2ème" : rangEnfantFamille === 3 ? "3ème" : "4ème+"} enfant</span>}
                        </div>
                      </div>
                      <span className="font-body text-sm font-semibold text-blue-500">{prixAdhesionDegressif}€</span>
                    </label>
                    {/* Licence FFE */}
                    <div>
                      <label className="flex items-center justify-between cursor-pointer">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={licence} onChange={e => setLicence(e.target.checked)} className="accent-green-500 w-4 h-4"/>
                          <span className="font-body text-sm text-blue-800">Licence FFE</span>
                        </div>
                        <span className="font-body text-sm font-semibold text-blue-500">{prixLicence}€</span>
                      </label>
                      {licence && (
                        <div className="flex gap-2 mt-1.5 ml-6">
                          <button onClick={() => setLicenceType("moins18")} className={`px-3 py-1 rounded-lg font-body text-xs cursor-pointer border ${licenceType === "moins18" ? "bg-green-500 text-white border-green-500" : "bg-white text-slate-600 border-gray-200"}`}>-18 ans (25€)</button>
                          <button onClick={() => setLicenceType("plus18")} className={`px-3 py-1 rounded-lg font-body text-xs cursor-pointer border ${licenceType === "plus18" ? "bg-green-500 text-white border-green-500" : "bg-white text-slate-600 border-gray-200"}`}>+18 ans (36€)</button>
                        </div>
                      )}
                    </div>
                    {/* Forfait */}
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-body text-sm text-blue-800">Forfait {creneau.activityTitle}</span>
                        <span className="font-body text-sm font-semibold text-blue-500">{prixForfait}€</span>
                      </div>
                      <div className="font-body text-[10px] text-slate-500 mt-0.5">
                        {sessionsRestantes * frequenceCours} séances restantes / {sessionsTotalSaison * frequenceCours} sur la saison ({frequenceCours}×/sem) — prorata {Math.round(prorata*100)}%
                        {prorata < 1 && <> · {prixForfaitAnnuel}€ × {Math.round(prorata*100)}% = {prixForfait}€</>}
                        {prorata >= 1 && <> · Tarif plein (début de saison)</>}
                      </div>
                    </div>
                    {/* Réduction famille */}
                    {familyDiscountAmount > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="font-body text-sm text-green-700">👨‍👩‍👧‍👦 Réduction famille ({rangEnfantFamille}ème enfant, -{familyDiscountPercent}%)</span>
                        <span className="font-body text-sm font-semibold text-green-600">-{familyDiscountAmount.toFixed(2)}€</span>
                      </div>
                    )}
                    {/* Total */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                      <span className="font-body text-sm font-bold text-blue-800">Total</span>
                      <span className="font-body text-lg font-bold text-green-600">{totalAnnuel.toFixed(2)}€</span>
                    </div>
                    {/* Plan de paiement */}
                    <div>
                      <div className="font-body text-[10px] text-slate-500 mb-1">Plan de paiement</div>
                      <div className="flex gap-2">
                        {(["1x", "3x", "10x"] as const).map(p => (
                          <button key={p} onClick={() => setPayPlan(p)} className={`flex-1 py-2 rounded-lg font-body text-xs font-semibold cursor-pointer border ${payPlan === p ? "bg-green-500 text-white border-green-500" : "bg-white text-slate-600 border-gray-200"}`}>
                            {p === "1x" ? `1× ${totalAnnuel.toFixed(0)}€` : p === "3x" ? `3× ${(totalAnnuel / 3).toFixed(0)}€` : `10× ${(totalAnnuel / 10).toFixed(0)}€`}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Mode de paiement */}
                    <div>
                      <div className="font-body text-[10px] text-slate-500 mb-1">Mode de paiement</div>
                      <div className="flex flex-wrap gap-1.5">
                        {payModes.filter(m => m.id !== "carte").map(m => (
                          <button key={m.id} onClick={() => setAnnualPayMode(m.id)}
                            className={`px-3 py-1.5 rounded-lg border font-body text-[11px] font-medium cursor-pointer ${annualPayMode === m.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
                            {m.icon} {m.label}
                          </button>
                        ))}
                      </div>
                      {annualPayMode === "prelevement_sepa" && (
                        <SepaWarning familyId={selFam} onStatus={setSepaStatus} />
                      )}
                    </div>
                  </div>
  );
}
