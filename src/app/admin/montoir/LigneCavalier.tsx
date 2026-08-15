/**
 * src/app/admin/montoir/LigneCavalier.tsx
 *
 * Une ligne de la feuille d'appel : le cavalier, son age, son poney du jour et
 * les boutons de pointage.
 *
 * Ce que porte cette ligne, et qu'on ne voit nulle part ailleurs :
 *  - AUCUN bouton « present ». Depuis mai 2026 la presence est acquise par
 *    defaut, on ne coche que les absences — les deux boutons rouge et ambre.
 *  - le badge quinzaine (garde alternee) : il est bien attendu aujourd'hui,
 *    mais pas la semaine prochaine ;
 *  - l'anniversaire a J-7, pour que la monitrice le souhaite en seance ;
 *  - les poneys deja pris sur un creneau simultane, grises dans le select ;
 *  - le compteur de chutes de la saison, qui pese sur l'affectation.
 *
 * Pourquoi ce fichier : 130 lignes de JSX dense repetees pour chaque inscrit,
 * imbriquees a trois niveaux dans la page. Isolees, les regles ci-dessus se
 * relisent d'un bloc.
 *
 * JSX DEPLACE tel quel : libelles, titres d'infobulle et classes inchanges.
 */

"use client";

import { Badge } from "@/components/ui";
import { XCircle, AlertCircle, TrendingUp, AlertTriangle } from "lucide-react";
import { estQuinzaine, libelleRythme, expliqueRythme } from "@/lib/rythme";
import { libelleJourCourt } from "./horse-history";
import type { MonteHistorique } from "./horse-history";
import { calcAge, displayName, chuteKey } from "./montoir-helpers";
import { SEUIL_CHUTES_PONEY, type Creneau } from "./types";

export default function LigneCavalier({
  e, i, c, en, closed, creneaux, families, availableHorses, poneyCharge,
  poneyChuteCount, seuilPoney, chutes, childHorseHistory,
  displayFromHorseName, nomActuel, assignHorse, togglePresence, openChute,
}: {
  e: any;
  i: number;
  c: Creneau;
  en: any[];
  closed: boolean;
  creneaux: Creneau[];
  families: any[];
  availableHorses: any[];
  poneyCharge: Record<string, { seances: number; heures: number }>;
  poneyChuteCount: Record<string, number>;
  seuilPoney: { orange: number; rouge: number; heures: number };
  chutes: Record<string, any>;
  childHorseHistory: Record<string, MonteHistorique[]>;
  displayFromHorseName: (horseName: string) => string;
  nomActuel: (e: any) => string;
  assignHorse: (c: Creneau, childId: string, h: string) => void;
  togglePresence: (c: Creneau, childId: string, val: string) => void;
  openChute: (c: Creneau, e: any) => void;
}) {
  return (
              <div className={`flex flex-wrap sm:flex-nowrap items-center gap-y-1.5 px-3 py-2.5 rounded-lg ${i%2===0?"bg-sand":""} ${(e.presence==="absent"||e.presence==="absent_nonjustified")?"opacity-40":""}`}>
                <span className="w-8 font-body text-xs hidden sm:block" style={{color:"#475569"}}>{i+1}</span>
                {/* Mobile : nom + âge sur une ligne pleine largeur (le badge ne
                    casse plus au milieu) ; desktop : colonne flexible inchangée. */}
                <span className="w-full sm:w-auto sm:flex-1 font-body text-sm font-semibold text-blue-800 flex items-center gap-1.5 min-w-0">
                  {(() => {
                    const famForLink = families.find((f:any) => (f.children||[]).some((cc:any)=>cc.id===e.childId));
                    const famId = famForLink?.firestoreId || famForLink?.id;
                    return (<>
                      {/* Nom cliquable → fiche famille (cavalier ciblé) */}
                      {famId ? (
                        <a href={`/admin/cavaliers?id=${famId}&child=${e.childId}`} title="Ouvrir la fiche client"
                          className="truncate text-blue-800 no-underline hover:underline hover:text-blue-600">{nomActuel(e)}</a>
                      ) : <span className="truncate">{nomActuel(e)}</span>}
                      {/* Desktop : icône progression, sans quitter le montoir */}
                      {famId && (
                        <a href={`/admin/progression/${e.childId}?familyId=${famId}`} title="Voir la progression"
                          target="_blank" rel="noopener noreferrer"
                          className="hidden sm:inline-flex shrink-0 text-pink-500 no-underline hover:text-pink-600">
                          <TrendingUp size={13} />
                        </a>
                      )}
                    </>);
                  })()}
                  {(() => {
                    const fam = families.find((f:any) => (f.children||[]).some((c:any)=>c.id===e.childId));
                    const child = (fam?.children||[]).find((c:any)=>c.id===e.childId);
                    const age = calcAge(child?.birthDate);
                    // Anniversaire dans les 7 jours → 🎂 pour que la monitrice le souhaite en séance
                    const dBirth = (() => {
                      if (!child?.birthDate) return null;
                      const bd = new Date(typeof child.birthDate === "string" ? child.birthDate : child.birthDate?.seconds ? child.birthDate.seconds * 1000 : child.birthDate);
                      if (isNaN(bd.getTime())) return null;
                      const today = new Date(); today.setHours(0,0,0,0);
                      const next = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
                      if (next < today) next.setFullYear(today.getFullYear() + 1);
                      return Math.round((next.getTime() - today.getTime()) / 86400000);
                    })();
                    return <>
                      {age ? <span className="shrink-0 whitespace-nowrap font-body text-[10px] font-normal text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{age}</span> : null}
                      {dBirth !== null && dBirth <= 7 && (
                        <span className="shrink-0 whitespace-nowrap font-body text-[10px] font-semibold text-pink-600 bg-pink-50 px-1.5 py-0.5 rounded-full"
                          title={dBirth === 0 ? "C'est son anniversaire aujourd'hui !" : `Anniversaire dans ${dBirth} jour${dBirth > 1 ? "s" : ""}`}>
                          🎂{dBirth === 0 ? " Aujourd'hui !" : ` J-${dBirth}`}
                        </span>
                      )}
                      {/* Garde alternée : il est bien attendu aujourd'hui,
                          mais pas la semaine prochaine. Le dire ici évite de
                          le porter absent au prochain cours. */}
                      {estQuinzaine(e) && (
                        <span className="shrink-0 whitespace-nowrap font-body text-[10px] font-semibold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded-full"
                          title={expliqueRythme(c.date, e)}>
                          ⇄ {libelleRythme(e)}
                        </span>
                      )}
                    </>;
                  })()}
                </span>
                <span className="w-32 font-body text-xs hidden sm:block" style={{color:"#334155"}}>
                  {(() => {
                    const famForLink = families.find((f:any) => (f.children||[]).some((cc:any)=>cc.id===e.childId));
                    const famId = famForLink?.firestoreId || famForLink?.id;
                    return famId
                      ? <a href={`/admin/cavaliers?id=${famId}&child=${e.childId}`} title="Ouvrir la fiche client" className="no-underline hover:underline" style={{color:"#334155"}}>{e.familyName}</a>
                      : e.familyName;
                  })()}
                </span>
                <span className="grow basis-40 sm:grow-0 sm:basis-auto sm:w-36 min-w-0">{!closed ? (() => {
                  // Doublon dans CE créneau → toujours bloqué
                  const usedInThis = new Set<string>();
                  en.forEach((oe: any) => { if (oe.childId !== e.childId && oe.horseName) usedInThis.add(oe.horseName); });
                  // Poneys sur créneaux simultanés → bloqué seulement si pas de rotation
                  const usedElsewhere = new Set<string>();
                  creneaux.forEach(other => {
                    if (other.id === c.id) return;
                    if (other.startTime >= c.endTime || other.endTime <= c.startTime) return;
                    (other.enrolled || []).forEach((oe: any) => { if (oe.horseName) usedElsewhere.add(oe.horseName); });
                  });

                  return (
                    <div className="w-full sm:w-36 flex flex-col gap-1">
                      <select value={e.horseName||""} onChange={ev=>assignHorse(c,e.childId,ev.target.value)} className="px-2 py-1.5 rounded-lg border border-blue-500/8 font-body text-xs bg-white w-full">
                        <option value="">Affecter...</option>
                        {availableHorses.map(h => {
                          const usedHere = usedInThis.has(h.name);
                          const usedOther = usedElsewhere.has(h.name);
                          const blockedOther = usedOther && !c.rotationPoneys;
                          const charge = poneyCharge[h.name];
                          const chargeStr = charge ? ` (${charge.seances}s)` : "";
                          const nbChutes = poneyChuteCount[h.name] || 0;
                          const chuteStr = nbChutes >= SEUIL_CHUTES_PONEY ? ` ⚠️${nbChutes}` : "";
                          return <option key={h.id} value={h.name} disabled={usedHere || blockedOther}
                            style={usedHere || blockedOther ? {color:"#ccc"} : charge?.seances >= seuilPoney.orange ? {color:"#f59e0b"} : {}}>
                            {displayName(h)}{chargeStr}{chuteStr}{usedHere ? " ✗" : blockedOther ? " ✗" : usedOther ? " ↺" : ""}
                          </option>;
                        })}
                      </select>
                      {e.horseName && (poneyChuteCount[e.horseName] || 0) >= SEUIL_CHUTES_PONEY && (
                        <div className="font-body text-[9px] font-semibold text-red-600 flex items-center gap-1" title={`${poneyChuteCount[e.horseName]} chutes enregistrées cette saison avec ce poney`}>
                          ⚠️ {poneyChuteCount[e.horseName]} chutes cette saison
                        </div>
                      )}
                      {/* Historique des derniers poneys montés (avec le jour) */}
                      {(childHorseHistory[e.childId] || []).length > 0 && (
                        <div
                          className="font-body text-[9px] text-slate-400 truncate"
                          title={`Historique : ${childHorseHistory[e.childId].map((m) => `${displayFromHorseName(m.horseName)} (${new Date(m.date).toLocaleDateString("fr-FR")})`).join(" → ")}`}
                        >
                          ↺ {childHorseHistory[e.childId].map((m) => `${displayFromHorseName(m.horseName)} ${libelleJourCourt(m.date)}`).join(" · ")}
                        </div>
                      )}
                    </div>
                  );
                })() : <span className="block truncate font-body text-xs font-semibold text-blue-800">{displayFromHorseName(e.horseName) || "—"}</span>}</span>
                <span className="shrink-0 ml-auto sm:ml-0 sm:w-32 flex justify-end sm:justify-center gap-1 sm:gap-2">{!closed ? <>
                  {/* Bouton "Chute" (facultatif) : à activer UNIQUEMENT s'il y a eu
                      une chute. Rouge plein = chute enregistrée dans le registre. */}
                  <button onClick={()=>openChute(c,e)} title={chutes[chuteKey(c.id,e.childId)] ? "Chute enregistrée — cliquer pour modifier" : "Signaler une chute"} className={`print:hidden w-10 h-10 sm:w-8 sm:h-8 rounded-xl sm:rounded-lg flex items-center justify-center border-none cursor-pointer ${chutes[chuteKey(c.id,e.childId)] ? "bg-red-600 text-white" : "bg-gray-100 text-slate-600 hover:bg-red-100"}`}><AlertTriangle size={17}/></button>
                  {/* Bouton "Present" retire (mai 2026, demande Nicolas) :
                      tout cavalier non explicitement marque absent/non
                      justifie est considere present par defaut. On ne
                      coche plus que les absences. */}
                  <button onClick={()=>togglePresence(c,e.childId,"absent")} title="Absent (rattrapage offert) — recliquer pour annuler" className={`print:hidden w-10 h-10 sm:w-8 sm:h-8 rounded-xl sm:rounded-lg flex items-center justify-center border-none cursor-pointer ${e.presence==="absent"?"bg-red-500 text-white":"bg-gray-100 text-slate-600 hover:bg-red-100"}`}><XCircle size={18}/></button>
                  {/* 3ème bouton : absence non justifiée → séance perdue, AUCUN rattrapage généré à la clôture.
                      Utilisé pour les cavaliers qui ne préviennent pas (ou trop tard). Couleur ambre/orange
                      pour le distinguer visuellement du rouge "absent justifié". */}
                  <button onClick={()=>togglePresence(c,e.childId,"absent_nonjustified")} title="Absent non justifié (séance perdue, pas de rattrapage) — recliquer pour annuler" className={`print:hidden w-10 h-10 sm:w-8 sm:h-8 rounded-xl sm:rounded-lg flex items-center justify-center border-none cursor-pointer ${e.presence==="absent_nonjustified"?"bg-amber-500 text-white":"bg-gray-100 text-slate-600 hover:bg-amber-100"}`}><AlertCircle size={18}/></button>
                  <span className="hidden print:inline font-body text-xs font-semibold">{e.presence==="absent"?"✗ Absent":e.presence==="absent_nonjustified"?"⚠ NJ":"✓ Présent"}</span>
                </> : <span className="flex items-center gap-1.5">{chutes[chuteKey(c.id,e.childId)] && <Badge color="red">⚠️ Chute</Badge>}<Badge color={e.presence==="absent"?"red":e.presence==="absent_nonjustified"?"orange":"green"}>{e.presence==="absent"?"Absent":e.presence==="absent_nonjustified"?"Absent non justifié":"Présent"}</Badge></span>}</span>
              </div>
  );
}
