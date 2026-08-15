"use client";
import { Check } from "lucide-react";
import type { Salarie, TachePlanifiee } from "./types";
import { fmtDuree } from "./types";
import type { JourDate } from "./planning-types";
import { heureToMin, minToHeure } from "./planning-utils";

/**
 * Vue « Horaire » : la semaine vue par tranches horaires (une ligne par heure
 * de début rencontrée, une colonne par jour), toutes personnes confondues.
 *
 * Elle répond à une question que la vue Tableau ne sait pas montrer : « à 8 h
 * mardi, qui est où ? ». Seules les heures réellement utilisées apparaissent,
 * pour ne pas dérouler une grille vide de 7 h à 20 h.
 *
 * Extraite dans son propre fichier : c'est une lecture complètement autonome
 * des mêmes tâches, elle n'a besoin d'aucun état de TabPlanning à part la
 * bascule « fait ».
 */

interface Props {
  jourDates: JourDate[];
  nbJours: number;
  salaries: Salarie[];
  taches: TachePlanifiee[];
  getCat: (cat: string) => { id: string; label: string; color: string; emoji: string } | undefined;
  getTaskColor: (t: TachePlanifiee) => string;
  toggleDone: (t: TachePlanifiee) => void;
}

export default function PlanningVueHoraire({
  jourDates, nbJours, salaries, taches, getCat, getTaskColor, toggleDone,
}: Props) {
    // Collecter tous les créneaux horaires uniques de la semaine
    const allSlots = new Set<string>();
    taches.forEach(t => allSlots.add(t.heureDebut));
    const slots = [...allSlots].sort();

    if (slots.length === 0) {
      return <div className="text-center py-8 text-slate-400 font-body text-sm">Aucune tâche cette semaine.</div>;
    }

    const activeSals = salaries.filter(s => s.actif);

    return (
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%", borderCollapse:"collapse", tableLayout:"fixed"}}>
          <colgroup>
            <col style={{width:"7%"}} />
            {jourDates.slice(0, nbJours).map(({jour}) => <col key={jour} style={{width:`${Math.floor(93/nbJours)}%`}} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{padding:"6px 4px", textAlign:"center", fontSize:10, fontWeight:700, color:"#475569", background:"#f1f5f9", borderBottom:"2px solid #e2e8f0"}}>
                Heure
              </th>
              {jourDates.slice(0, nbJours).map(({jour, label}) => (
                <th key={jour} style={{padding:"6px 3px", textAlign:"center", fontSize:10, fontWeight:700, color:"#475569", background:"#f1f5f9", borderBottom:"2px solid #e2e8f0"}}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot, si) => {
              return (
                <tr key={slot} style={{background: si % 2 === 0 ? "#fafbff" : "#fff"}}>
                  <td style={{padding:"4px 4px", borderBottom:"1px solid #eef2f7", verticalAlign:"top", textAlign:"center"}}>
                    <span style={{fontFamily:"sans-serif", fontSize:12, fontWeight:700, color:"#1e3a5f"}}>{slot}</span>
                  </td>
                  {jourDates.slice(0, nbJours).map(({jour}) => {
                    const slotTaches = taches.filter(t => t.jour === jour && t.heureDebut === slot)
                      .sort((a, b) => a.salarieName.localeCompare(b.salarieName));
                    return (
                      <td key={jour} style={{padding:"2px 3px", borderBottom:"1px solid #eef2f7", verticalAlign:"top"}}>
                        <div style={{display:"flex", flexDirection:"column", gap:2}}>
                          {slotTaches.map(t => {
                            const cat = getCat(t.categorie);
                            const sal = activeSals.find(s => s.id === t.salarieId);
                            const color = getTaskColor(t);
                            return (
                              <div key={t.id} title={`${t.tacheLabel} — ${t.salarieName}\n${t.heureDebut}→${minToHeure(heureToMin(t.heureDebut) + t.dureeMinutes)}${t.notes ? "\n" + t.notes : ""}`}
                                style={{
                                  display:"flex", alignItems:"center", gap:3, padding:"2px 4px",
                                  borderRadius:5, background: t.done ? "#f0fdf4" : (color + "15"),
                                  borderLeft: `3px solid ${sal?.couleur || color}`,
                                  opacity: t.done ? 0.5 : 1,
                                }}>
                                <div style={{flex:1, minWidth:0}}>
                                  <div style={{fontFamily:"sans-serif", fontSize:9, fontWeight:700, color: color, lineHeight:"1.2", wordBreak:"break-word"}}>
                                    {t.tacheLabel}
                                  </div>
                                  <div style={{fontFamily:"sans-serif", fontSize:8, color:"#64748b"}}>
                                    {t.salarieName} · {fmtDuree(t.dureeMinutes)}
                                  </div>
                                </div>
                                <button onClick={()=>toggleDone(t)} style={{width:14,height:14,borderRadius:3,border:"1px solid "+(t.done?"#16a34a":"#d1d5db"),background:t.done?"#16a34a":"white",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0}}>
                                  {t.done && <Check size={8} color="white"/>}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
}
