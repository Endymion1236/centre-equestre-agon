/**
 * src/app/admin/montoir/CarteReprise.tsx
 *
 * Une reprise du jour dans le montoir : l'en-tete (horaire, titre, moniteur,
 * x/y inscrits, compteur de presents), les actions de la monitrice (ajouter un
 * cavalier, rotation poneys, rappel par mail, cloturer, rouvrir) et, une fois
 * depliee, la liste des cavaliers.
 *
 * Deux choses a savoir avant d'y toucher :
 *  - a l'ouverture du montoir tout est REPLIE : on veut la vue d'ensemble des
 *    cours de la journee, pas 200 lignes de cavaliers. Le contenu replie reste
 *    rendu (`hidden print:block`) pour que l'impression, elle, sorte complete.
 *  - la navigation jour integree a l'en-tete permet de passer a la veille ou
 *    au lendemain sans remonter en haut de page ; la page memorise la reprise
 *    d'ou l'on vient pour y revenir apres chargement.
 *
 * Pourquoi ce fichier : c'etait le bloc le plus dense de page.tsx (230 lignes
 * imbriquees dans un `.map`). L'etat et les ecritures restent a la page, ce
 * composant ne fait qu'afficher et remonter les intentions.
 *
 * JSX DEPLACE tel quel : libelles, infobulles et classes inchanges.
 */

"use client";

import { Card, Badge } from "@/components/ui";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import type { MonteHistorique } from "./horse-history";
import ThemeSuggestion from "./ThemeSuggestion";
import SeanceNotes from "./SeanceNotes";
import LigneCavalier from "./LigneCavalier";
import { typeColors, type Creneau } from "./types";

export default function CarteReprise({
  c, creneaux, families, availableHorses, poneyCharge, poneyChuteCount,
  seuilPoney, chutes, childHorseHistory, dayOffset, estDepliee, basculerReprise,
  onChangerJour, displayFromHorseName, nomActuel, reopenCreneau, setAddCreneau,
  toggleRotationPoneys, envoyerRappel, closeCreneau, fetchData, assignHorse,
  togglePresence, openChute,
}: {
  c: Creneau;
  creneaux: Creneau[];
  families: any[];
  availableHorses: any[];
  poneyCharge: Record<string, { seances: number; heures: number }>;
  poneyChuteCount: Record<string, number>;
  seuilPoney: { orange: number; rouge: number; heures: number };
  chutes: Record<string, any>;
  childHorseHistory: Record<string, MonteHistorique[]>;
  dayOffset: number;
  estDepliee: (id: string) => boolean;
  basculerReprise: (id: string) => void;
  /** Change de jour en memorisant la reprise d'ou l'on part (re-scroll). */
  onChangerJour: (v: number | ((d: number) => number)) => void;
  displayFromHorseName: (horseName: string) => string;
  nomActuel: (e: any) => string;
  reopenCreneau: (cid: string, title: string) => void;
  setAddCreneau: (c: any) => void;
  toggleRotationPoneys: (c: Creneau) => void;
  envoyerRappel: (c: Creneau, en: any[]) => void;
  closeCreneau: (cid: string) => void;
  fetchData: () => void;
  assignHorse: (c: Creneau, childId: string, h: string) => void;
  togglePresence: (c: Creneau, childId: string, val: string) => void;
  openChute: (c: Creneau, e: any) => void;
}) {
  const en = c.enrolled||[];
  const col = (c as any).color || typeColors[c.activityType]||"#666";
  const closed = c.status==="closed";
  const pres = en.filter((e:any)=>e.presence!=="absent" && e.presence!=="absent_nonjustified").length;
  return (
        <Card padding="md" className={closed ? "border-gray-200 bg-gray-50/50" : ""}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-blue-500/8">
            <div className="flex items-center gap-4">
              <div className="w-14 text-center"><div className="font-body text-lg font-bold" style={{color:col}}>{c.startTime}</div><div className="font-body text-[10px]" style={{color:"#475569"}}>{c.endTime}</div></div>
              <button onClick={()=>basculerReprise(c.id!)} aria-label={estDepliee(c.id!) ? "Replier" : "Déplier"}
                title={estDepliee(c.id!) ? "Replier cette reprise" : "Voir les cavaliers"}
                className="print:hidden p-1.5 rounded-lg text-slate-500 bg-gray-100 hover:bg-gray-200 border-none cursor-pointer shrink-0">
                {estDepliee(c.id!) ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
              </button>
              <div style={{borderLeftWidth:3,borderLeftColor:col,paddingLeft:12}}><div className="font-body text-base font-semibold text-blue-800">{c.activityTitle}{(c as any).themeStage && <span className="ml-2 font-body text-xs font-normal text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">🎭 {(c as any).themeStage}</span>}</div><div className="font-body text-xs" style={{color:"#334155"}}>{c.monitor} · {en.length}/{c.maxPlaces}</div></div>
            </div>
            <div className="flex items-center gap-2 flex-wrap print:hidden">
              {/* Navigation jour intégrée à la reprise : passer veille/lendemain
                  sans remonter en haut de page. */}
              <div className="flex items-center gap-0.5 mr-1" title="Changer de jour">
                <button onClick={()=>{ onChangerJour(d=>d-1); }} aria-label="Jour précédent"
                  className="p-1.5 rounded-md text-slate-500 bg-gray-100 hover:bg-gray-200 border-none cursor-pointer"><ChevronLeft size={14}/></button>
                {dayOffset !== 0 && <button onClick={()=>{ onChangerJour(0); }}
                  className="px-2 py-1 rounded-md text-[11px] font-semibold text-blue-600 bg-blue-50 border-none cursor-pointer">auj.</button>}
                <button onClick={()=>{ onChangerJour(d=>d+1); }} aria-label="Jour suivant"
                  className="p-1.5 rounded-md text-slate-500 bg-gray-100 hover:bg-gray-200 border-none cursor-pointer"><ChevronRight size={14}/></button>
              </div>
              <Badge color={closed?"gray":pres===en.length&&en.length>0?"green":"orange"}>{closed?"Clôturée":`${pres}/${en.length} présents`}</Badge>
              {closed && (
                <button onClick={()=>reopenCreneau(c.id, c.activityTitle)}
                  className="flex items-center gap-1.5 font-body text-xs font-semibold text-slate-700 bg-amber-100 px-2.5 py-1.5 rounded-lg border-none cursor-pointer hover:bg-amber-200">
                  🔓 Rouvrir
                </button>
              )}
              {!closed && (
                <button onClick={()=>setAddCreneau(c)}
                  className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-600 px-2.5 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-500">
                  + Ajouter
                </button>
              )}
              {!closed && (
                <button onClick={()=>toggleRotationPoneys(c)}
                  title="Rotation poneys : même poney autorisé sur deux stages simultanés (fait 1h dans chacun)"
                  className={`flex items-center gap-1.5 font-body text-xs px-2.5 py-1.5 rounded-lg border-none cursor-pointer transition-all ${c.rotationPoneys ? "bg-green-100 text-green-700 font-semibold" : "bg-gray-100 text-gray-400"}`}>
                  🔄 Rotation{c.rotationPoneys ? " ✓" : ""}
                </button>
              )}
              {!closed && (c.activityType === "stage" || c.activityType === "stage_journee") && (
                <ThemeSuggestion creneau={c} families={families} />
              )}
              {!closed && en.length>0 && <>
                <button onClick={()=>envoyerRappel(c, en)} className="font-body text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100">Rappeler</button>
                <button onClick={()=>closeCreneau(c.id)} className="font-body text-xs font-semibold text-slate-600 bg-sand px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-gray-200">Clôturer</button>
              </>}
            </div>
          </div>
          <div className={estDepliee(c.id!) ? "" : "hidden print:block"}>
          <SeanceNotes creneau={c} onChanged={fetchData} />
          {en.length===0 ? <p className="font-body text-sm text-slate-600 italic">Aucun inscrit</p> :
          <div>
            {/* En-tête masqué sur mobile : les lignes y passent en 2 niveaux
                (nom+âge / poney+présence), les libellés deviennent inutiles. */}
            <div className="hidden sm:flex items-center px-3 py-2 font-body text-[11px] font-semibold uppercase tracking-wider" style={{color:"#334155"}}>
              <span className="w-8">#</span><span className="flex-1">Cavalier</span><span className="w-32">Famille</span><span className="w-36">Poney</span><span className="w-24 text-center">Présence</span>
            </div>
            {en.map((e:any, i:number) => (
              <LigneCavalier
                key={e.childId}
                e={e} i={i} c={c} en={en} closed={closed}
                creneaux={creneaux} families={families}
                availableHorses={availableHorses} poneyCharge={poneyCharge}
                poneyChuteCount={poneyChuteCount} seuilPoney={seuilPoney}
                chutes={chutes} childHorseHistory={childHorseHistory}
                displayFromHorseName={displayFromHorseName} nomActuel={nomActuel}
                assignHorse={assignHorse} togglePresence={togglePresence}
                openChute={openChute}
              />
            ))}
          </div>}
          </div>
        </Card>
  );
}
