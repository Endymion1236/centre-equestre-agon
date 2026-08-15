"use client";
/**
 * src/app/admin/planning/FormulaireInscriptionCours.tsx
 *
 * Le choix qui engage l'argent, pour un cours ou une activité ponctuelle :
 * séance à l'unité ou forfait à l'année, débit sur une carte, inscription
 * offerte, rattrapage, avoir de la famille, pré-inscription, ou inscription
 * pour un établissement.
 *
 * Ce que ce composant tient à dire clairement, et qu'il ne faut pas alléger :
 *  - une carte de séances utilisable est annoncée AVANT le choix du mode,
 *    avec ce qu'il en reste et jusqu'à quand : c'est de l'argent déjà payé
 *    par la famille, l'oublier revient à facturer deux fois ;
 *  - un avoir disponible est proposé en évidence, sans qu'il faille d'abord
 *    cocher « encaisser maintenant » — sinon il reste invisible ;
 *  - la pré-inscription est présentée AVANT le bloc paiement, qu'elle
 *    escamote : proposer d'encaisser une somme qui n'existe pas est le
 *    meilleur moyen de créer une facture fantôme ;
 *  - l'inscription « établissement » (collège, hôpital) ne facture RIEN aux
 *    parents ; l'établissement est facturé à part, au forfait.
 *
 * Le détail du forfait annuel est passé en `blocForfaitAnnuel` plutôt que
 * calculé ici : il a ses propres vingt paramètres, et les faire transiter par
 * ce composant n'aurait servi qu'à les rendre plus difficiles à suivre.
 */

import { payModes } from "./types";
import { MOTIFS_OFFERT } from "@/lib/offerts";
import { estTypeCours, aUnForfaitPourCeCreneau, trouveCarteActive } from "./enroll-helpers";

export default function FormulaireInscriptionCours({
  creneau, allForfaits, allCartes, fam, families, selChild, selFam, priceTTC,
  inscriptionMode, setInscriptionMode, selectedChildren, setSelectedChildren, setSelChild,
  loadingSessions, sessionsRestantes, frequenceCours, totalAnnuel, prorata,
  freeEnroll, setFreeEnroll, freeReason, setFreeReason,
  showPay, setShowPay, payMode, setPayMode, avoirSolde,
  useRattrapage, setUseRattrapage, childRattrapages,
  preinscription, setPreinscription,
  enrollingSaison, inscrireSaisonEtablissement,
  blocForfaitAnnuel,
}: {
  creneau: any;
  allForfaits: any[];
  allCartes: any[];
  fam: any;
  families: any[];
  selChild: string;
  selFam: string;
  priceTTC: number;
  inscriptionMode: "ponctuel" | "annuel";
  setInscriptionMode: (m: "ponctuel" | "annuel") => void;
  selectedChildren: string[];
  setSelectedChildren: (v: string[]) => void;
  setSelChild: (v: string) => void;
  loadingSessions: boolean;
  sessionsRestantes: number;
  frequenceCours: 1 | 2 | 3;
  totalAnnuel: number;
  prorata: number;
  freeEnroll: boolean;
  setFreeEnroll: (v: boolean) => void;
  freeReason: string;
  setFreeReason: (v: string) => void;
  showPay: boolean;
  setShowPay: (v: boolean) => void;
  payMode: string;
  setPayMode: (v: string) => void;
  avoirSolde: Record<string, number>;
  useRattrapage: string | null;
  setUseRattrapage: (v: string | null) => void;
  childRattrapages: any[];
  preinscription: boolean;
  setPreinscription: (v: boolean) => void;
  enrollingSaison: boolean;
  inscrireSaisonEtablissement: (childId: string, childName: string, familyId: string, familyName: string) => Promise<void>;
  blocForfaitAnnuel: React.ReactNode;
}) {
  const isCours = estTypeCours(creneau.activityType);
  // Forfait actif pour CE créneau précis ?
  const hasForfaitPourCeCreneau = aUnForfaitPourCeCreneau(allForfaits, selChild, creneau);
  // Détecter une carte active compatible pour cet enfant (seulement si pas de forfait actif)
  const carteActive = hasForfaitPourCeCreneau ? null : trouveCarteActive(allCartes, selChild, fam?.firestoreId, creneau);
                return isCours ? (
              <div className="bg-sand rounded-xl p-4 space-y-3">
                <div className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider">Type d'inscription</div>

                {/* Bannière carte active */}
                {carteActive && (
                  <div className="bg-gold-50 border border-gold-300 rounded-xl p-3 flex items-center gap-3">
                    <span className="text-2xl">🎟️</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-body text-sm font-bold text-gold-700">Carte de séances disponible</div>
                      <div className="font-body text-xs text-gold-600">
                        {carteActive.remainingSessions} séance{carteActive.remainingSessions > 1 ? "s" : ""} restante{carteActive.remainingSessions > 1 ? "s" : ""} · {carteActive.activityType === "balade" ? "Balades" : "Cours"}
                        {carteActive.dateFin ? ` · valide jusqu'au ${new Date(carteActive.dateFin).toLocaleDateString("fr-FR", { day:"numeric", month:"short", year:"numeric" })}` : ""}
                      </div>
                      <div className="font-body text-[10px] text-gold-500 mt-0.5">La séance sera débitée à la confirmation de présence au montoir.</div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setInscriptionMode("ponctuel")}
                    className={`p-3 rounded-lg border-2 text-left cursor-pointer transition-all ${inscriptionMode === "ponctuel" ? "border-gold-400 bg-gold-50" : "border-gray-200 bg-white"}`}>
                    <div className="font-body text-sm font-semibold text-blue-800">Séance ponctuelle</div>
                    {carteActive ? (
                      <>
                        <div className="font-body text-xs text-gold-600 mt-0.5">Débit sur la carte 🎟️</div>
                        <div className="font-body text-lg font-bold text-gold-500 mt-1">0€</div>
                      </>
                    ) : (
                      <>
                        <div className="font-body text-xs text-slate-500 mt-0.5">Paiement à l'unité</div>
                        {priceTTC > 0 && <div className="font-body text-lg font-bold text-blue-500 mt-1">{priceTTC.toFixed(2)}€</div>}
                      </>
                    )}
                  </button>
                  <button onClick={() => {
                    setInscriptionMode("annuel");
                    // Le mode annuel ne supporte qu'un enfant à la fois : on garde le premier sélectionné
                    if (selectedChildren.length > 1) {
                      const first = selectedChildren[0];
                      setSelectedChildren([first]);
                      setSelChild(first);
                    }
                  }}
                    className={`p-3 rounded-lg border-2 text-left cursor-pointer transition-all ${inscriptionMode === "annuel" ? "border-green-500 bg-green-50" : "border-gray-200 bg-white"}`}>
                    <div className="font-body text-sm font-semibold text-green-700">Forfait à l'année</div>
                    {loadingSessions ? (
                      <div className="font-body text-xs text-slate-400 mt-0.5 italic">Calcul des séances restantes…</div>
                    ) : (
                      <>
                        <div className="font-body text-xs text-slate-500 mt-0.5">{sessionsRestantes} séances restantes × {frequenceCours}× ({sessionsRestantes * frequenceCours} total)</div>
                        <div className="font-body text-lg font-bold text-green-600 mt-1">{totalAnnuel.toFixed(2)}€</div>
                        {prorata < 1 && <div className="font-body text-[10px] text-orange-500 mt-0.5">Prorata : {Math.round(prorata * 100)}% du tarif annuel</div>}
                      </>
                    )}
                  </button>
                </div>

                {/* Inscription Établissement : disponible même sans prix de séance.
                    L'enfant est inscrit au suivi péda, l'établissement est facturé
                    à part (forfait). Ne compte PAS comme séance offerte. */}
                {inscriptionMode === "ponctuel" && !showPay && !useRattrapage && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-2">
                    {freeEnroll && freeReason === "Établissement" ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-body text-xs font-semibold text-purple-700">🏫 Inscription établissement — aucune facture aux parents</span>
                          <button onClick={() => { setFreeEnroll(false); setFreeReason("Rattrapage"); }}
                            className="font-body text-[10px] text-slate-500 bg-transparent border-none cursor-pointer underline">Annuler</button>
                        </div>
                        {/* Inscrire sur toute la saison récurrente, sans facturation */}
                        {/* Inscrire sur toute la saison récurrente, sans facturation.
                            Marche pour tous les cavaliers sélectionnés (multi). */}
                        {selectedChildren.length > 0 && selFam && (() => {
                          const fam = families.find((f: any) => f.firestoreId === selFam);
                          if (!fam) return null;
                          const cavaliers = selectedChildren.map((cid: string) => {
                            const c: any = (fam.children || []).find((x: any) => x.id === cid);
                            return c ? { id: cid, name: `${c.firstName}${c.lastName ? " " + c.lastName : ""}` } : null;
                          }).filter(Boolean) as { id: string; name: string }[];
                          return (
                            <button onClick={async () => {
                              for (const cav of cavaliers) {
                                await inscrireSaisonEtablissement(cav.id, cav.name, fam.firestoreId, fam.parentName || "—");
                              }
                            }}
                              disabled={enrollingSaison}
                              className="w-full flex items-center justify-center gap-1.5 font-body text-xs font-semibold text-white bg-purple-500 hover:bg-purple-600 rounded-lg px-3 py-2 cursor-pointer border-none disabled:opacity-50">
                              {enrollingSaison ? "Inscription en cours…" : `📅 Inscrire ${cavaliers.length > 1 ? `les ${cavaliers.length} cavaliers` : "sur toute la saison"} (créneaux récurrents)`}
                            </button>
                          );
                        })()}
                        <p className="font-body text-[10px] text-purple-400">
                          « Inscrire » ci-dessous = cette séance seulement. Le bouton ci-dessus = toutes les séances récurrentes de la saison.
                        </p>
                      </div>
                    ) : (
                      <button onClick={() => { setFreeEnroll(true); setFreeReason("Établissement"); setShowPay(false); }}
                        className="w-full flex items-center justify-center gap-1.5 font-body text-xs font-semibold text-purple-700 bg-white border border-purple-200 rounded-lg px-3 py-2 cursor-pointer hover:bg-purple-50">
                        🏫 Inscrire pour un établissement (collège, hôpital…)
                      </button>
                    )}
                  </div>
                )}

                {/* Mode ponctuel */}
                {/* Pre-inscription : poser le cavalier sans rien declencher.
                    Presentee AVANT le bloc paiement, qu'elle escamote — sinon
                    on propose d'encaisser quelque chose qui n'existe pas. */}
                <label className={`flex items-start gap-2 mb-3 p-2.5 rounded-lg border cursor-pointer ${
                  preinscription ? "bg-indigo-50 border-indigo-300" : "bg-white border-gray-200"}`}>
                  <input type="checkbox" checked={preinscription}
                    onChange={e => setPreinscription(e.target.checked)}
                    className="mt-0.5 cursor-pointer" />
                  <span className="font-body text-xs text-slate-700 leading-relaxed">
                    <strong>Pré-inscription</strong> — retenir la place sans créer
                    de paiement, de facture ni d&apos;email. À transformer en
                    inscription définitive plus tard.
                  </span>
                </label>

                {!preinscription && inscriptionMode === "ponctuel" && priceTTC > 0 && !(freeEnroll && freeReason === "Établissement") && (
                  <div className="bg-white rounded-lg p-3">
                    {carteActive ? (
                      <div className="font-body text-xs text-gold-600 bg-gold-50 rounded-lg px-3 py-2">
                        🎟️ La carte sera débitée automatiquement à la clôture du montoir si l'enfant est présent. Aucun paiement à encaisser maintenant.
                      </div>
                    ) : freeEnroll ? (
                      <div className="bg-green-50 rounded-lg px-3 py-2">
                        <div className="font-body text-sm font-semibold text-green-700">🎁 Inscription offerte</div>
                        <div className="font-body text-[10px] text-green-600 mt-0.5">Un paiement à 0€ sera créé avec le motif ci-dessous (traçabilité).</div>
                        <div className="mt-2">
                          <label className="font-body text-[10px] font-semibold text-green-800 block mb-1">Motif</label>
                          <select value={freeReason} onChange={e => setFreeReason(e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg border border-green-200 font-body text-xs bg-white focus:border-green-500 focus:outline-none cursor-pointer">
                            {MOTIFS_OFFERT.map(m => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                        </div>
                        <button onClick={() => setFreeEnroll(false)} className="font-body text-[10px] text-slate-500 mt-2 bg-transparent border-none cursor-pointer underline">Annuler</button>
                      </div>
                    ) : (
                      <>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={showPay} onChange={e => { setShowPay(e.target.checked); setFreeEnroll(false); }} className="accent-blue-500 w-4 h-4"/>
                          <span className="font-body text-sm text-blue-800 font-semibold">Encaisser maintenant ({priceTTC.toFixed(2)}€)</span>
                        </label>
                        <div className="font-body text-[10px] text-slate-500 mt-1 ml-6">
                          {showPay ? "Le paiement sera enregistré immédiatement dans le journal." : "La prestation sera ajoutée aux impayés de la famille."}
                        </div>
                        {showPay && <div className="flex flex-wrap gap-1.5 mt-2">{payModes.filter(m => m.id !== "carte").map(m=>{
                          const isAvoir = m.id === "avoir";
                          const solde = isAvoir ? (avoirSolde[selFam] || 0) : 0;
                          const disabled = isAvoir && solde <= 0;
                          return <button key={m.id} onClick={()=>!disabled && setPayMode(m.id)} disabled={disabled} className={`px-3 py-1.5 rounded-lg border font-body text-[11px] font-medium cursor-pointer ${disabled ? "opacity-40 cursor-not-allowed bg-gray-50 text-gray-400 border-gray-200" : payMode===m.id?"bg-blue-500 text-white border-blue-500":"bg-white text-slate-600 border-gray-200"}`}>{m.icon} {m.label}{isAvoir && solde > 0 ? ` (${solde.toFixed(0)}€)` : ""}</button>;
                        })}</div>}
                        {!showPay && !freeEnroll && (
                          <div className="mt-2 ml-6 flex flex-col gap-1.5">
                            {/* ── Avoir disponible : raccourci d'utilisation ─────
                                L'avoir n'apparaissait que dans la liste des modes
                                d'encaissement, donc invisible si l'admin ne cochait
                                pas "Encaisser maintenant". Or l'avoir EST l'argent
                                de la famille — il devrait être proposé en évidence
                                dès qu'il existe. Le clic active automatiquement le
                                mode encaissement + sélectionne 'avoir', réutilisant
                                toute la mécanique existante. */}
                            {(avoirSolde[selFam] || 0) > 0 && !useRattrapage && (
                              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                                <div className="font-body text-xs font-semibold text-blue-700">💰 Avoir disponible : {(avoirSolde[selFam] || 0).toFixed(2)}€</div>
                                <button
                                  onClick={() => { setShowPay(true); setPayMode("avoir"); setFreeEnroll(false); }}
                                  className="flex items-center justify-between w-full mt-1.5 px-2 py-1.5 rounded bg-white border border-blue-100 font-body text-[10px] text-blue-700 cursor-pointer hover:bg-blue-50 text-left"
                                >
                                  <span>Déduire de l'avoir famille</span>
                                  <span className="text-blue-500 font-semibold ml-2">Utiliser →</span>
                                </button>
                              </div>
                            )}
                            {childRattrapages.length > 0 && !useRattrapage && (
                              <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                                <div className="font-body text-xs font-semibold text-purple-700">🔄 {childRattrapages.length} rattrapage{childRattrapages.length > 1 ? "s" : ""} disponible{childRattrapages.length > 1 ? "s" : ""}</div>
                                <div className="flex flex-col gap-1 mt-1.5">
                                  {childRattrapages.map((r: any) => (
                                    <button key={r.id} onClick={() => { setUseRattrapage(r.id); setShowPay(false); setFreeEnroll(false); }}
                                      className="flex items-center justify-between px-2 py-1.5 rounded bg-white border border-purple-100 font-body text-[10px] text-purple-700 cursor-pointer hover:bg-purple-50 text-left">
                                      <span>Absent le {new Date(r.sourceDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} — {r.sourceActivity}</span>
                                      <span className="text-purple-500 font-semibold ml-2">Utiliser →</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {useRattrapage && (
                              <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                                <div className="font-body text-sm font-semibold text-purple-700">🔄 Rattrapage sélectionné</div>
                                <div className="font-body text-[10px] text-purple-600 mt-0.5">
                                  {(() => { const r = childRattrapages.find((x: any) => x.id === useRattrapage); return r ? `Absence du ${new Date(r.sourceDate).toLocaleDateString("fr-FR")} — ${r.sourceActivity}` : ""; })()}
                                </div>
                                <div className="font-body text-[10px] text-green-600 mt-0.5">Aucun paiement ne sera créé.</div>
                                <button onClick={() => setUseRattrapage(null)} className="font-body text-[10px] text-slate-500 mt-1 bg-transparent border-none cursor-pointer underline">Annuler</button>
                              </div>
                            )}
                            {!useRattrapage && (
                              <button onClick={() => { setFreeEnroll(true); setShowPay(false); }}
                                className="flex items-center justify-center gap-1.5 font-body text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 cursor-pointer hover:bg-green-100">
                                🎁 Inscrire sans facturation (offert / établissement)
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Mode annuel */}
                {inscriptionMode === "annuel" && preinscription && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                    <div className="font-body text-xs font-semibold text-indigo-800">
                      Pré-inscription à l&apos;année
                    </div>
                    <div className="mt-1 font-body text-[11px] text-indigo-700 leading-relaxed">
                      La place est retenue sur ce créneau. Aucun forfait, aucun
                      échéancier et aucune facture ne sont créés — le tarif sera
                      calculé au moment où vous confirmerez l&apos;inscription.
                    </div>
                  </div>
                )}
                {inscriptionMode === "annuel" && !preinscription && blocForfaitAnnuel}
              </div>
            ) : (
              /* Activités ponctuelles (balade, promenade, animation) — encaissement direct */
              <div className="bg-sand rounded-xl p-4 space-y-3">
                {priceTTC > 0 && (
                  <div>
                    <div className="font-body text-lg font-bold text-blue-500 mb-2">{priceTTC.toFixed(2)}€</div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={showPay} onChange={e => setShowPay(e.target.checked)} className="accent-blue-500 w-4 h-4"/>
                      <span className="font-body text-sm text-blue-800 font-semibold">Encaisser maintenant</span>
                    </label>
                    <div className="font-body text-[10px] text-slate-500 mt-1 ml-6">
                      {showPay ? "Le paiement sera enregistré immédiatement." : "Ajouté aux impayés de la famille."}
                    </div>
                    {/* Raccourci avoir disponible (visible aussi quand encaissement non coché) */}
                    {!showPay && (avoirSolde[selFam] || 0) > 0 && (
                      <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                        <div className="font-body text-xs font-semibold text-blue-700">💰 Avoir disponible : {(avoirSolde[selFam] || 0).toFixed(2)}€</div>
                        <button
                          onClick={() => { setShowPay(true); setPayMode("avoir"); }}
                          className="flex items-center justify-between w-full mt-1.5 px-2 py-1.5 rounded bg-white border border-blue-100 font-body text-[10px] text-blue-700 cursor-pointer hover:bg-blue-50 text-left"
                        >
                          <span>Déduire de l'avoir famille</span>
                          <span className="text-blue-500 font-semibold ml-2">Utiliser →</span>
                        </button>
                      </div>
                    )}
                    {showPay && <div className="flex flex-wrap gap-1.5 mt-2">{payModes.map(m=>{
                          const isAvoir = m.id === "avoir";
                          const solde = isAvoir ? (avoirSolde[selFam] || 0) : 0;
                          const disabled = isAvoir && solde <= 0;
                          return <button key={m.id} onClick={()=>!disabled && setPayMode(m.id)} disabled={disabled} className={`px-3 py-1.5 rounded-lg border font-body text-[11px] font-medium cursor-pointer ${disabled ? "opacity-40 cursor-not-allowed bg-gray-50 text-gray-400 border-gray-200" : payMode===m.id?"bg-blue-500 text-white border-blue-500":"bg-white text-slate-600 border-gray-200"}`}>{m.icon} {m.label}{isAvoir && solde > 0 ? ` (${solde.toFixed(0)}€)` : ""}</button>;
                        })}</div>}
                  </div>
                )}
              </div>
            );
}
