"use client";

/**
 * src/app/espace-cavalier/reserver/CarteStage.tsx
 *
 * La carte d'UN stage dans la vue liste : horaires, prix, places restantes,
 * détail dépliable, choix semaine / journée, sélection des cavaliers,
 * récapitulatif tarifaire et liste d'attente quand c'est complet.
 *
 * C'est le plus gros morceau de l'écran de réservation, et le plus sensible :
 * c'est ici que la famille voit le montant AVANT de l'engager dans le panier.
 * Isolé dans son fichier, on peut le relire entièrement sans dérouler le reste
 * de la page, et le calcul du tarif passe par `calculerTarifStage` — la même
 * fonction que l'ajout au panier, pour que l'affiché et le facturé ne puissent
 * pas diverger.
 *
 * Quelques points d'attention conservés tels quels :
 *  - le mode « à la journée » ne propose QUE les jours réellement ouverts à
 *    l'unité (réglage par créneau côté admin) ;
 *  - un stage complet ne doit jamais ressembler à une impasse : la liste
 *    d'attente est annoncée sans avoir à déplier la carte ;
 *  - la couleur du liseré vient de l'activité, c'est le même repère visuel
 *    qu'au planning admin.
 */

import { derouleEstRempli } from "@/lib/stage-deroule";
import { Card, Badge } from "@/components/ui";
import { Calendar, Clock, Users, Loader2, Check } from "lucide-react";
import type { Creneau } from "./types";
import { calculerTarifStage, holdActive, libellePlageJours, placesRestantes } from "./utils-reservation";

export default function CarteStage({
  cleGroupe, stageCreneaux, showWeekHeader, weekLabel,
  activities, deroule, familyId, cavaliers,
  selectedCreneau, setSelectedCreneau, selectedChildren, setSelectedChildren,
  stageBookingMode, setStageBookingMode, selectedDays, setSelectedDays,
  expandedStageDetail, setExpandedStageDetail,
  waitlistSuccess, waitlistLoading, addStageToWaitlist, addStageToCart,
  existingStageCount, prixPlancherStage, reservationsFermees,
}: {
  /** Clé du groupe de stages (stageGroupId + lundi) : sert d'identité au détail déplié. */
  cleGroupe: string;
  stageCreneaux: Creneau[];
  showWeekHeader: boolean;
  weekLabel: string;
  activities: any[];
  deroule: any;
  familyId: string;
  /** Cavaliers de la famille (propres + liés). */
  cavaliers: any[];
  selectedCreneau: Creneau | null;
  setSelectedCreneau: (c: Creneau | null) => void;
  selectedChildren: string[];
  setSelectedChildren: (ids: string[]) => void;
  stageBookingMode: "semaine" | "jour";
  setStageBookingMode: (m: "semaine" | "jour") => void;
  selectedDays: string[];
  setSelectedDays: (ids: string[]) => void;
  expandedStageDetail: string | null;
  setExpandedStageDetail: (k: string | null) => void;
  waitlistSuccess: string | null;
  waitlistLoading: string | null;
  addStageToWaitlist: (stageCreneaux: Creneau[], childId: string) => void;
  addStageToCart: (stageCreneaux: Creneau[], prixJourParam?: number, totalJoursStageParam?: number) => void;
  existingStageCount: number;
  prixPlancherStage: number;
  reservationsFermees: boolean;
}) {
  const first = stageCreneaux[0];
  const prix = (first as any).priceTTC || first.priceHT * (1 + (first.tvaTaux || 5.5) / 100);
  const spots = Math.min(...stageCreneaux.map(c => placesRestantes(c, familyId)));
  const joursUniques = [...new Map(stageCreneaux.map(c => [c.date, c])).values()]
    .sort((a, b) => a.date.localeCompare(b.date));
  const jours = libellePlageJours(joursUniques);
  const isSelected = selectedCreneau?.id === first.id;

    return (
      <div className="flex flex-col gap-3">
        {showWeekHeader && (
          <div className="font-body text-xs font-bold uppercase tracking-wider text-slate-500 mt-2 first:mt-0">
            📅 {weekLabel}
          </div>
        )}
      {/* Liseré coloré = couleur de l'ACTIVITÉ (celle choisie dans
          l'admin, déjà utilisée dans le planning). La couleur
          encode le niveau du stage plutôt que de décorer : même
          repère visuel côté back-office et côté famille. */}
      <Card
        padding="md"
        className={isSelected ? "ring-2 ring-green-500" : ""}
        style={(() => {
          const col = (first as any).color
            || activities.find((a: any) => a.id === (first as any).activityId)?.color;
          return col ? { borderLeft: `4px solid ${col}` } : undefined;
        })()}
      >
        <div className="flex justify-between items-start cursor-pointer" onClick={() => { setSelectedCreneau(isSelected ? null : first); setSelectedChildren([]); setStageBookingMode("semaine"); setSelectedDays([]); }}>
          <div>
            <div className="font-body text-base font-semibold text-blue-800">{first.activityTitle}</div>
            <div className="font-body text-xs text-gray-600 mt-1">
              <Calendar size={12} className="inline mr-1" />{jours}
              <span className="ml-3"><Users size={12} className="inline mr-1" />{first.monitor}</span>
            </div>
            {/* Horaires — par jour si les horaires varient */}
            {(() => {
              const horairesUniques = [...new Set(stageCreneaux.map(c => `${c.startTime}–${c.endTime}`))];
              if (horairesUniques.length === 1) {
                // Tous les jours au même horaire → une seule ligne
                return (
                  <div className="font-body text-xs text-gray-600 mt-0.5">
                    <Clock size={12} className="inline mr-1" />{horairesUniques[0]}
                  </div>
                );
              }
              // Horaires variés → grouper par date et afficher proprement
              // Regrouper les créneaux par date
              const parDate: Record<string, Creneau[]> = {};
              stageCreneaux.forEach(c => {
                if (!parDate[c.date]) parDate[c.date] = [];
                parDate[c.date].push(c);
              });
              return (
                <div className="mt-1.5 flex flex-col gap-0.5">
                  {Object.entries(parDate).sort(([a],[b])=>a.localeCompare(b)).map(([date, cs]) => {
                    const jourLabel = new Date(date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
                    const horaires = cs.map(c => `${c.startTime}–${c.endTime}`).join(" + ");
                    return (
                      <div key={date} className="font-body text-xs text-gray-600 flex items-center gap-1.5">
                        <span className="font-semibold text-slate-600 w-24 flex-shrink-0">{jourLabel}</span>
                        <Clock size={10} className="text-gray-600 flex-shrink-0"/>
                        <span>{horaires}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
          <div className="text-right">
            <div className="font-body text-lg font-bold text-green-600">{prix.toFixed(0)}€</div>
            <div className="font-body text-xs text-gray-600">
              {joursUniques.length} {(() => {
                const dur = parseInt(first.endTime) - parseInt(first.startTime);
                return dur <= 4 ? "demi-journée" : "journée";
              })()}{joursUniques.length > 1 ? "s" : ""}
            </div>
            <div className="font-body text-xs text-gray-500">{first.startTime}–{first.endTime}</div>
            <Badge color={spots > 2 ? "green" : spots > 0 ? "orange" : "red"}>{spots > 0 ? `${spots} place${spots > 1 ? "s" : ""}` : "Complet"}</Badge>
            {/* Un badge "Complet" seul ressemble à une porte fermée :
                on annonce la liste d'attente SANS avoir à déplier. */}
            {spots === 0 && (
              <div className="mt-1 font-body text-[11px] font-semibold text-orange-600 whitespace-nowrap">
                🔔 Liste d&apos;attente
              </div>
            )}
          </div>
        </div>

        {/* Bouton détail dépliable */}
        {(() => {
          const act = activities.find((a: any) => a.id === first.activityId);
          const desc = act?.description?.trim();
          // Le deroule des 2 sequences s'affiche meme sans
          // description : c'est l'information qui manquait le
          // plus aux familles, elle ne doit dependre d'aucune
          // autre saisie.
          const montrerDeroule = derouleEstRempli(deroule);
          if (!desc && !montrerDeroule) return null;
          const isOpen = expandedStageDetail === cleGroupe;
          return (
            <div className="mt-2">
              <button
                onClick={e => { e.stopPropagation(); setExpandedStageDetail(isOpen ? null : cleGroupe); }}
                className="flex items-center gap-1.5 font-body text-xs text-green-700 font-semibold bg-transparent border-none cursor-pointer px-0 py-1 hover:text-green-900"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2a5 5 0 100 10A5 5 0 007 2zm0 2.5a.75.75 0 110 1.5.75.75 0 010-1.5zM6.25 6.5h1.5v3h-1.5v-3z" fill="currentColor"/></svg>
                {isOpen ? "Masquer le détail" : (montrerDeroule ? "Voir le détail et le déroulé de la séance" : "Voir le détail du stage")}
              </button>
              {isOpen && (
                <div className="mt-2 p-3 bg-green-50 rounded-xl border border-green-100">
                  {desc && (
                    <p className="font-body text-xs text-gray-700 leading-relaxed whitespace-pre-line">{desc}</p>
                  )}
                  {montrerDeroule && (
                    <div className={desc ? "mt-3 pt-3 border-t border-green-200" : ""}>
                      <div className="font-body text-[10px] font-semibold text-green-800 uppercase tracking-wider mb-2">
                        🐴 Comment se déroule la séance
                      </div>
                      {[1, 2].map((n) => {
                        const titre = n === 1 ? deroule.sequence1Titre : deroule.sequence2Titre;
                        const detail = n === 1 ? deroule.sequence1Detail : deroule.sequence2Detail;
                        return (
                          <div key={n} className="flex gap-2 mb-1.5 last:mb-0">
                            <span className="w-4 h-4 rounded-full bg-green-600 text-white font-body text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
                            <div className="min-w-0">
                              <div className="font-body text-xs font-semibold text-gray-800 leading-snug">{titre}</div>
                              {detail?.trim() && (
                                <div className="font-body text-[11px] text-gray-600 leading-snug">{detail}</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {deroule.note?.trim() && (
                        <p className="font-body text-[10px] text-gray-500 mt-2 mb-0">{deroule.note}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Sélection enfants pour ce stage */}
        {/* Place réservée POUR CETTE FAMILLE suite à la liste d'attente.
            Sans ce rappel, la famille notifiée par email arrive sur un
            stage qui semble simplement disponible : rien ne lui dit que
            la place lui est gardée, ni jusqu'à quand. */}
        {(() => {
          const hold = (first as any).waitlistHold;
          if (!holdActive(first) || hold?.familyId !== familyId) return null;
          const fin = new Date(hold.until);
          return (
            <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
              <div className="font-body text-xs font-semibold text-green-800">
                🎉 Place réservée pour {hold.childName}
              </div>
              <div className="mt-0.5 font-body text-[11px] text-green-700">
                Confirmez votre inscription avant le{" "}
                {fin.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} à{" "}
                {fin.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.
                Passé ce délai, la place sera proposée aux autres familles.
              </div>
            </div>
          );
        })()}

        {/* Appel à l'action visible SANS déplier la carte : sinon
            un "Complet" seul donne l'impression d'une impasse. */}
        {!isSelected && spots === 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); setSelectedCreneau(first); setSelectedChildren([]); }}
            className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 font-body text-xs font-semibold text-orange-700 cursor-pointer hover:bg-orange-100"
          >
            🔔 Stage complet — s&apos;inscrire en liste d&apos;attente
          </button>
        )}

        {/* Stage complet — liste d'attente (UNE entrée pour la semaine) */}
        {isSelected && spots === 0 && (
          <div className="mt-4 pt-4 border-t border-orange-100">
            {waitlistSuccess === joursUniques[0]?.id ? (
              <div className="flex items-center gap-2 text-green-600 font-body text-xs">
                <Check size={14} /> Inscrit en liste d&apos;attente ! Vous serez notifié par email si une place se libère.
              </div>
            ) : (
              <>
                <div className="font-body text-xs text-orange-600 mb-2">
                  🔔 Ce stage est complet. Inscrivez-vous en liste d&apos;attente pour la semaine :
                </div>
                <div className="flex flex-wrap gap-2">
                  {cavaliers.filter((ch: any) => !(first.enrolled || []).some((e: any) => e.childId === ch.id)).map((ch: any) => (
                    <button key={ch.id}
                      onClick={(e) => { e.stopPropagation(); addStageToWaitlist(stageCreneaux, ch.id); }}
                      disabled={waitlistLoading === joursUniques[0]?.id}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50 font-body text-xs text-orange-700 cursor-pointer hover:bg-orange-100 disabled:opacity-50">
                      {waitlistLoading === joursUniques[0]?.id ? <Loader2 size={12} className="animate-spin" /> : "🔔"} {ch.firstName}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {isSelected && spots > 0 && (() => {
          // Jours REELLEMENT ouverts à la journée. L'option se règle
          // créneau par créneau dans l'admin : un `some()` sur la
          // semaine ouvrait le mode journée dès qu'UN jour l'autorisait,
          // et le sélecteur proposait ensuite les 5 jours — dont ceux
          // vendus uniquement à la semaine.
          const joursJournee = joursUniques.filter((c: any) => c.allowDayBooking);
          const allowDay = joursJournee.length > 0;
          const prixJour = (first as any).priceTTCDay || (stageCreneaux.find((c: any) => (c as any).priceTTCDay) as any)?.priceTTCDay || Math.round(prix / joursUniques.length * 100) / 100;
          return (
          <div className="mt-4 pt-4 border-t border-green-200">
            {/* Choix mode si autorisé */}
            {allowDay && (
              <div className="mb-3">
                <div className="font-body text-xs font-semibold text-green-700 mb-2">Mode d'inscription :</div>
                <div className="flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); setStageBookingMode("semaine"); setSelectedDays([]); }}
                    className={`flex-1 py-2 rounded-lg font-body text-sm font-semibold border cursor-pointer ${stageBookingMode === "semaine" ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-200"}`}>
                    Semaine complète ({prix.toFixed(0)}€)
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setStageBookingMode("jour"); }}
                    className={`flex-1 py-2 rounded-lg font-body text-sm font-semibold border cursor-pointer ${stageBookingMode === "jour" ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-200"}`}>
                    À la journée ({prixJour.toFixed(0)}€/j)
                  </button>
                </div>
              </div>
            )}

            {/* Sélection des jours si mode jour */}
            {allowDay && stageBookingMode === "jour" && (
              <div className="mb-3">
                <div className="font-body text-xs font-semibold text-green-700 mb-2">
                  Choisissez vos jours :
                  {joursJournee.length < joursUniques.length && (
                    <span className="ml-1 font-normal text-gray-500">
                      (seuls certains jours sont proposés à l&apos;unité)
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {joursJournee.map(c => {
                    const dayLabel = new Date(c.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
                    const sel = selectedDays.includes(c.id);
                    const daySpots = placesRestantes(c, familyId);
                    return (
                      <button key={c.id} disabled={daySpots <= 0} onClick={(e) => { e.stopPropagation(); setSelectedDays(sel ? selectedDays.filter(x => x !== c.id) : [...selectedDays, c.id]); }}
                        className={`px-3 py-2 rounded-lg border font-body text-sm cursor-pointer transition-all ${daySpots <= 0 ? "opacity-40 cursor-not-allowed bg-gray-100 border-gray-200 text-gray-400" : sel ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-200 hover:border-green-400"}`}>
                        {sel ? <Check size={12} className="inline mr-1" /> : null}{dayLabel}
                        {daySpots <= 2 && daySpots > 0 && <span className="text-xs ml-1 text-orange-500">({daySpots} pl.)</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="font-body text-xs font-semibold text-green-700 mb-2">Inscrire vos enfants :</div>
            <div className="flex flex-wrap gap-2 mb-3">
              {cavaliers.filter((c: any) => !(first.enrolled || []).some((e: any) => e.childId === c.id)).map((c: any) => {
                const sel = selectedChildren.includes(c.id);
                return (
                  <button key={c.id} onClick={(e) => { e.stopPropagation(); setSelectedChildren(sel ? selectedChildren.filter(x => x !== c.id) : [...selectedChildren, c.id]); }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-body text-sm cursor-pointer ${sel ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-200"}`}>
                    {sel ? <Check size={14} /> : <Users size={14} />} {c.firstName}
                  </button>
                );
              })}
            </div>
            {/* Récap avec réductions */}
            {selectedChildren.length > 0 && (() => {
              const isJourMode = allowDay && stageBookingMode === "jour";
              const prixEffectif = isJourMode ? prixJour * selectedDays.length : prix;
              const creneauxToBook = isJourMode ? stageCreneaux.filter(c => selectedDays.includes(c.id)) : stageCreneaux;
              const nbJours = isJourMode ? selectedDays.length : joursUniques.length;
              return (
              <>
              <div className="bg-green-50 rounded-lg p-3 mb-3">
                {isJourMode && selectedDays.length === 0 && (
                  <p className="font-body text-xs text-orange-600">Sélectionnez au moins un jour</p>
                )}
                {(isJourMode ? selectedDays.length > 0 : true) && selectedChildren.map((childId, idx) => {
                  const child = cavaliers.find((c: any) => c.id === childId);
                  const rang = existingStageCount + idx;
                  // Mode JOUR : prix jour brut, AUCUNE remise, AUCUN plancher.
                  // Mode SEMAINE : remise dégressive + plancher.
                  // Le récap et l'ajout au panier appellent la MEME fonction : c'est
                  // ce qui garantit qu'on ne peut pas afficher un montant ici et en
                  // facturer un autre dans le panier (les deux blocs étaient recopiés).
                  const { prixFinal, remise } = calculerTarifStage(prixEffectif, rang, isJourMode, prixPlancherStage);
                  return (
                    <div key={childId} className="flex justify-between font-body text-sm py-1">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-800 font-semibold">{(child as any)?.firstName}</span>
                        {isJourMode && <span className="text-green-600 text-xs">{nbJours}j × {prixJour.toFixed(0)}€</span>}
                        {remise > 0 && <span className="text-green-600 text-xs">-{remise.toFixed(0)}€</span>}
                      </div>
                      <span className="font-bold text-green-600">{prixFinal.toFixed(0)}€</span>
                    </div>
                  );
                })}
              </div>
              {(!isJourMode || selectedDays.length > 0) && (
                <button onClick={(e) => {
                  e.stopPropagation();
                  if (isJourMode) {
                    // Mode jour : inscrire uniquement les jours sélectionnés.
                    // On passe le prix d'un jour et le nombre TOTAL de
                    // jours du stage pour un prorata correct.
                    addStageToCart(creneauxToBook, prixJour, joursUniques.length);
                  } else {
                    addStageToCart(stageCreneaux);
                  }
                }}
                  disabled={reservationsFermees}
                  className={`w-full py-2.5 rounded-lg font-body text-sm font-semibold border-none ${reservationsFermees ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "text-white bg-green-600 cursor-pointer hover:bg-green-500"}`}>
                  {reservationsFermees
                    ? "Réservations fermées"
                    : `Ajouter au panier (${selectedChildren.length} enfant${selectedChildren.length > 1 ? "s" : ""}${isJourMode ? ` · ${nbJours} jour${nbJours > 1 ? "s" : ""}` : ""})`}
                </button>
              )}
              </>
            );})()}
          </div>
        );})()}
      </Card>
      </div>
    );
}
