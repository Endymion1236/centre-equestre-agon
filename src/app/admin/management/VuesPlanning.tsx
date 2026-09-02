"use client";

/**
 * src/app/admin/management/VuesPlanning.tsx
 *
 * Les trois façons de regarder la semaine de travail : le tableau par
 * salarié, la grille horaire, et la fiche individuelle imprimable.
 *
 * Elles étaient déclarées À L'INTÉRIEUR de TabPlanning. Une fonction
 * composant recréée à chaque rendu du parent n'est pas la même fonction pour
 * React : il démontait la vue entière et la remontait à chaque frappe, ce qui
 * perd le focus et la position de défilement. Sorties d'ici, elles gardent
 * leur état d'un rendu à l'autre.
 *
 * Aucune ne lit ni n'écrit la base : tout arrive par les props, et les
 * actions remontent au parent.
 */

import type { TachePlanifiee, TacheType, Salarie, JourSemaine } from "./types";
import { fmtDuree, calcTempsTravailJour, bornesJournee, JOURS_LABELS, JOURS, formatDateCourte, CATEGORIES } from "./types";
import { heureToMin, minToHeure, roundToQuarter, TIME_SLOTS } from "./planning-utils";
import { Check, Printer, Trash2, Plus, X, Loader2, AlignVerticalSpaceAround } from "lucide-react";

/** Un jour de la semaine affichée, avec sa date et son libellé. */
export interface JourAffiche {
  jour: JourSemaine;
  date: Date;
  label: string;
}

/** Ce dont les trois vues ont besoin en commun. */
interface BaseVue {
  /** Identifiant de la semaine affichée (format ISO « 2026-W36 »). */
  semaine: string;
  taches: TachePlanifiee[];
  salaries: Salarie[];
  jourDates: JourAffiche[];
  /** 6 jours, ou 7 quand le dimanche est affiché. */
  nbJours: number;
  getCat: (categorie: string) => any;
  getTaskColor: (t: TachePlanifiee) => string;
  toggleDone: (t: TachePlanifiee) => void;
}

export function HoraireView({
  semaine, taches, salaries, jourDates, nbJours, getCat, getTaskColor, toggleDone,
}: BaseVue) {

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
                              <button type="button" onClick={()=>toggleDone(t)} style={{width:14,height:14,borderRadius:3,border:"1px solid "+(t.done?"#16a34a":"#d1d5db"),background:t.done?"#16a34a":"white",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0}}>
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
};

export function FicheView({
  semaine, taches, salaries, jourDates, nbJours, getCat, getTaskColor, toggleDone,
  creneaux, chargeParSalarie, dimancheMasque, lundi, selectedSalarieId, setSelectedSalarieId,
}: BaseVue & {
  creneaux: any[];
  chargeParSalarie: Record<string, number>;
  dimancheMasque: Record<string, number>;
  lundi: Date;
  selectedSalarieId: string;
  setSelectedSalarieId: (id: string) => void;
}) {

  const activeSalaries = salaries.filter(s => s.actif);
  const sal = activeSalaries.find(s => s.id === selectedSalarieId) || activeSalaries[0];
  if (!sal) return <div className="text-center py-8 text-slate-400 font-body text-sm">Aucun salarié actif.</div>;

  // Auto-select first salarie if none selected
  if (!selectedSalarieId && sal) {
    setTimeout(() => setSelectedSalarieId(sal.id), 0);
  }

  const printFiche = () => {
    const el = document.getElementById("management-fiche-print");
    if (!el) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><meta charset="utf-8"><title>Planning ${sal.nom} — Semaine ${semaine}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: Arial, sans-serif; padding: 20px; background: white; color: #1e293b; }
        h1 { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
        .subtitle { font-size: 12px; color: #64748b; margin-bottom: 20px; }
        .day-section { margin-bottom: 18px; page-break-inside: avoid; }
        .day-title { font-size: 14px; font-weight: 800; color: #1e3a5f; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px; }
        .task-row { display: flex; align-items: flex-start; padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
        .task-time { width: 70px; font-size: 13px; font-weight: 700; color: #475569; flex-shrink: 0; }
        .task-name { flex: 1; font-size: 13px; font-weight: 600; }
        .task-dur { width: 60px; font-size: 11px; color: #64748b; text-align: right; flex-shrink: 0; }
        .task-cat { font-size: 10px; color: #94a3b8; margin-left: 8px; }
        .task-note { font-size: 11px; color: #92400e; background: #fef3c7; border-left: 3px solid #f59e0b; padding: 4px 8px; margin: 4px 0 4px 50px; border-radius: 0 4px 4px 0; white-space: pre-wrap; line-height: 1.4; }
        .activity-row { display: flex; align-items: center; padding: 5px 0; border-bottom: 1px solid #f1f5f9; background: #f0f7ff; margin: 0 -8px; padding: 5px 8px; border-radius: 4px; }
        .activity-row .task-name { color: #1d4ed8; }
        .total { margin-top: 6px; font-size: 12px; font-weight: 700; color: #475569; text-align: right; }
        .empty-day { font-size: 11px; color: #94a3b8; font-style: italic; padding: 4px 0; }
        @media print { body { padding: 10px; } .day-section { page-break-inside: avoid; } }
      </style></head><body>
      <h1>Planning — ${sal.nom}</h1>
      <div class="subtitle">Semaine ${semaine.split("-W")[1]} · ${semaine.split("-W")[0]} · ${formatDateCourte(lundi)} → ${formatDateCourte(new Date(lundi.getTime()+(nbJours-1)*86400000))}</div>
      ${el.innerHTML}
    </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Sélecteur salarié */}
      <div className="flex items-center gap-3 flex-wrap">
        {activeSalaries.map(s => (
          <button type="button" key={s.id} onClick={() => setSelectedSalarieId(s.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-body text-sm font-semibold border cursor-pointer transition-all
              ${selectedSalarieId === s.id || (!selectedSalarieId && s.id === sal.id)
                ? "text-white border-transparent"
                : "bg-white text-slate-600 border-gray-200 hover:bg-gray-50"}`}
            style={selectedSalarieId === s.id || (!selectedSalarieId && s.id === sal.id) ? {background: s.couleur} : {}}>
            <div className="w-2.5 h-2.5 rounded-full" style={{background: selectedSalarieId === s.id || (!selectedSalarieId && s.id === sal.id) ? "white" : s.couleur}}/>
            {s.nom}
          </button>
        ))}
      </div>

      {/* Bouton imprimer */}
      <div className="flex justify-between items-center">
        <div className="font-display text-lg font-bold text-blue-800">
          Planning de {sal.nom}
        </div>
        <button type="button" onClick={printFiche}
          className="flex items-center gap-2 font-body text-xs font-semibold text-slate-600 bg-white border border-gray-200 px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors">
          <Printer size={14}/> Imprimer la fiche
        </button>
      </div>

      <div id="management-fiche-print" style={{maxWidth: "100%", overflow: "hidden"}}>
        {jourDates.slice(0, nbJours).map(({jour, date}) => {
          const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
          const dayTaches = taches.filter(t => t.salarieId === sal.id && t.jour === jour)
            .sort((a,b) => heureToMin(a.heureDebut) - heureToMin(b.heureDebut));
          const dayActivities = creneaux.filter(c => {
            if (c.date !== dateStr) return false;
            // Support multi-moniteurs (séparés par virgule)
            const monitors = (c.monitor || "").split(",").map((s: string) => s.trim().toLowerCase());
            if (!monitors.includes(sal.nom.toLowerCase().trim())) return false;
            // Ne pas afficher si déjà importé comme tâche management
            const alreadyImported = dayTaches.some(t =>
              t.tacheLabel === c.activityTitle && t.heureDebut === c.startTime
            );
            return !alreadyImported;
          }).sort((a: any, b: any) => heureToMin(a.startTime) - heureToMin(b.startTime));
          const dayCharge = calcTempsTravailJour(dayTaches);
          const jourComplet = date.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });
          const isEmpty = dayTaches.length === 0 && dayActivities.length === 0;

          return (
            <div key={jour} style={{marginBottom:18, pageBreakInside:"avoid"}}>
              <div style={{fontSize:14, fontWeight:800, color:"#1e3a5f", borderBottom:"2px solid #e2e8f0", paddingBottom:4, marginBottom:8, textTransform:"capitalize"}}>
                {jourComplet}
              </div>

              {isEmpty ? (
                <div style={{fontSize:11, color:"#94a3b8", fontStyle:"italic", padding:"4px 0"}}>Rien de prévu</div>
              ) : (
                <>
                  {/* Activités planning (cours, stages...) */}
                  {dayActivities.map((c: any, i: number) => (
                    <div key={`act-${i}`} style={{display:"flex", alignItems:"center", padding:"6px 8px", borderBottom:"1px solid #f1f5f9", background:"#f0f7ff", borderRadius:4, marginBottom:2}}>
                      <div style={{width:70, fontSize:13, fontWeight:700, color:"#1d4ed8", flexShrink:0}}>{c.startTime}</div>
                      <div style={{flex:1, fontSize:13, fontWeight:600, color:"#1d4ed8"}}>
                        📅 {c.activityTitle}
                      </div>
                      <div style={{width:60, fontSize:11, color:"#64748b", textAlign:"right", flexShrink:0}}>
                        → {c.endTime}
                      </div>
                    </div>
                  ))}

                  {/* Tâches planifiées */}
                  {dayTaches.map(t => {
                    const cat = getCat(t.categorie);
                    const fin = minToHeure(heureToMin(t.heureDebut) + t.dureeMinutes);
                    return (
                      <div key={t.id}>
                        <div
                          style={{display:"flex", alignItems:"center", padding:"6px 4px", borderBottom: t.notes ? "none" : "1px solid #f1f5f9", cursor:"pointer", opacity: t.done ? 0.5 : 1, gap: 6, minWidth: 0}}
                          onClick={() => toggleDone(t)}>
                          {/* Heure de début — largeur réduite sur mobile */}
                          <div style={{width:50, fontSize:13, fontWeight:700, color:"#475569", flexShrink:0}}>{t.heureDebut}</div>
                          {/* Label de tâche — prend l'espace disponible, ellipsis si trop long */}
                          <div style={{flex:1, display:"flex", alignItems:"center", gap:6, minWidth: 0, flexWrap: "wrap"}}>
                            <span style={{fontSize:14, flexShrink:0}}>{cat?.emoji}</span>
                            <span style={{fontSize:13, fontWeight:600, color: t.done ? "#94a3b8" : getTaskColor(t), textDecoration: t.done ? "line-through" : "none", overflow:"hidden", textOverflow:"ellipsis"}}>
                              {t.tacheLabel}
                            </span>
                            <span style={{fontSize:10, color:"#94a3b8", flexShrink:0}}>{cat?.label}</span>
                          </div>
                          {/* Durée → fin — cachée sur mobile (<480px) pour éviter le débordement */}
                          <div className="hide-on-mobile" style={{fontSize:11, color:"#64748b", textAlign:"right", flexShrink:0, whiteSpace:"nowrap"}}>
                            {fmtDuree(t.dureeMinutes)} → {fin}
                          </div>
                          {/* Checkbox — taille réduite sur mobile pour garantir qu'elle reste visible */}
                          <div style={{width:22, height:22, borderRadius:6, border:`2px solid ${t.done?"#16a34a":"#d1d5db"}`, background:t.done?"#16a34a":"white", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0}}>
                            {t.done && <Check size={13} color="white"/>}
                          </div>
                        </div>
                        {/* Note de l'admin pour cette tâche ─────────────────
                            Affichée en-dessous, en retrait sous l'horaire, fond
                            ambré pour bien la distinguer. Visible aussi dans
                            la version imprimée (via la classe .task-note). */}
                        {t.notes && (
                          <div
                            className="task-note"
                            style={{
                              fontSize: 11, color: "#92400e",
                              background: "#fef3c7",
                              borderLeft: "3px solid #f59e0b",
                              padding: "4px 8px",
                              margin: "4px 0 4px 50px",
                              borderRadius: "0 4px 4px 0",
                              whiteSpace: "pre-wrap",
                              lineHeight: 1.4,
                              borderBottom: "1px solid #f1f5f9",
                            }}
                          >
                            📝 {t.notes}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Total jour */}
                  {dayCharge > 0 && (() => {
                    // Heure de fin de journée = fin de la dernière tâche
                    // (heure de début + durée), calculée par bornesJournee.
                    const bornes = bornesJournee(dayTaches);
                    return (
                      <div style={{marginTop:6, fontSize:12, fontWeight:700, color:"#475569", textAlign:"right"}}>
                        {bornes && <span style={{color:"#2050A0"}}>Journée {bornes.debut} → {bornes.fin}</span>}
                        {bornes && " · "}
                        Total : {fmtDuree(dayCharge)} · {dayTaches.filter(t=>t.done).length}/{dayTaches.length} tâches validées
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          );
        })}

        {/* Total semaine */}
        <div style={{marginTop:12, padding:"10px 14px", background:"#f0f7ff", borderRadius:8, border:"1px solid #bfdbfe"}}>
          <div style={{fontFamily:"sans-serif", fontSize:13, fontWeight:800, color:"#1e3a5f"}}>
            Total semaine : {fmtDuree(chargeParSalarie[sal.id] || 0)}
            {dimancheMasque[sal.id] ? ` (dont ${fmtDuree(dimancheMasque[sal.id])} le dimanche, colonne masquée)` : ""}
            {" · "}{taches.filter(t=>t.salarieId===sal.id&&t.done).length}/{taches.filter(t=>t.salarieId===sal.id).length} tâches validées
          </div>
        </div>
      </div>
    </div>
  );
};

export function TableauView({
  semaine, taches, salaries, jourDates, nbJours, getCat, getTaskColor, toggleDone,
  tachesType, chargeParSalarie, dimancheMasque, salariesReplies, basculerSalarie,
  addCell, setAddCell, addForm, setAddForm, addTache, delTache, openAdd, openEditTache,
  viderCellule, compacterJournee, compactingKey, saving,
}: BaseVue & {
  tachesType: TacheType[];
  chargeParSalarie: Record<string, number>;
  dimancheMasque: Record<string, number>;
  salariesReplies: Set<string>;
  basculerSalarie: (id: string) => void;
  addCell: { salarieId: string; jour: JourSemaine } | null;
  setAddCell: (c: { salarieId: string; jour: JourSemaine } | null) => void;
  addForm: {
    tacheTypeId: string;
    heureDebut: string;
    dureeMinutes: number;
    joursSelectionnes: JourSemaine[];
    enchainer: boolean;
    binomeIds: string[];
  };
  setAddForm: (f: any) => void;
  addTache: () => void;
  delTache: (t: any) => void;
  openAdd: (salarieId: string, jour: JourSemaine) => void;
  openEditTache: (t: any) => void;
  viderCellule: (salarieId: string, jour: JourSemaine) => void;
  compacterJournee: (salarieId: string, jour: JourSemaine) => void;
  compactingKey: string | null;
  saving: boolean;
}) {
  return (

  <div style={{overflowX:"auto", margin:"0 -16px", padding:"0 16px"}}>
    <table style={{width:"100%", borderCollapse:"collapse", tableLayout:"fixed"}}>
      <colgroup>
        <col style={{width:"10%", minWidth:80}} />
        {jourDates.slice(0, nbJours).map(({jour}) => <col key={jour} style={{width:`${Math.floor(90/nbJours)}%`}} />)}
      </colgroup>
      <thead>
        <tr>
          <th style={{padding:"6px 6px", textAlign:"left", fontSize:10, fontWeight:700, color:"#475569", background:"#f1f5f9", borderBottom:"2px solid #e2e8f0"}}>
            Salarié
          </th>
          {jourDates.slice(0, nbJours).map(({jour, label}) => (
            <th key={jour} style={{padding:"6px 3px", textAlign:"center", fontSize:10, fontWeight:700, color:"#475569", background:"#f1f5f9", borderBottom:"2px solid #e2e8f0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {salaries.filter(s=>s.actif).map((sal, si) => (
          <tr key={sal.id} style={{background: si%2===0?"#f8faff":"#fff"}}>
            <td style={{padding:"6px 6px", borderBottom:"1px solid #eef2f7", verticalAlign:"top"}}>
              <div style={{display:"flex", alignItems:"center", gap:4}}>
                <button
                  type="button"
                  onClick={() => basculerSalarie(sal.id)}
                  title={salariesReplies.has(sal.id) ? "Afficher la semaine" : "Replier la semaine"}
                  style={{background:"none", border:"none", padding:0, cursor:"pointer", fontSize:10, color:"#64748b", width:12, flexShrink:0}}
                >
                  {salariesReplies.has(sal.id) ? "▶" : "▼"}
                </button>
                <div style={{width:7, height:7, borderRadius:"50%", background:sal.couleur, flexShrink:0}}/>
                <span style={{fontFamily:"sans-serif", fontSize:11, fontWeight:700, color:"#1e293b", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{sal.nom}</span>
              </div>
              <div style={{fontFamily:"sans-serif", fontSize:9, color:"#94a3b8", marginTop:2}}>
                {fmtDuree(chargeParSalarie[sal.id]||0)} cette sem.
                {dimancheMasque[sal.id] && (
                  <span title="Le dimanche est compté dans le total mais sa colonne est masquée. Bouton « Dim. » pour l'afficher."
                    style={{color:"#b45309"}}> · dont {fmtDuree(dimancheMasque[sal.id])} dim.</span>
                )}
              </div>
            </td>
            {salariesReplies.has(sal.id) ? (
              <td colSpan={nbJours} style={{padding:"6px 10px", borderBottom:"1px solid #eef2f7", verticalAlign:"middle"}}>
                <span style={{fontFamily:"sans-serif", fontSize:10, color:"#94a3b8", fontStyle:"italic"}}>
                  Semaine repliée — {taches.filter(t => t.salarieId===sal.id).length} tâche(s). Cliquez sur ▶ pour afficher.
                </span>
              </td>
            ) : jourDates.slice(0, nbJours).map(({jour}) => {
              const cellTaches = taches.filter(t => t.salarieId===sal.id && t.jour===jour).sort((a,b) => a.heureDebut.localeCompare(b.heureDebut));
              return (
                <td key={jour} style={{padding:"3px 3px", borderBottom:"1px solid #eef2f7", verticalAlign:"top"}}>
                  <div style={{display:"flex", flexDirection:"column", gap:3}}>
                    {cellTaches.map(t => {
                      const cat = getCat(t.categorie);
                      const isFromPlanning = t.tacheTypeId === "__planning__";
                      return (
                        <div key={t.id} title={`${t.tacheLabel}\n${t.heureDebut}→${minToHeure(heureToMin(t.heureDebut) + t.dureeMinutes)}${t.notes ? "\n" + t.notes : ""}${isFromPlanning ? "\n(importée du planning — non éditable ici)" : "\n(cliquer pour modifier)"}`} style={{
                          display:"flex", alignItems:"flex-start", gap:3, padding:"3px 5px",
                          borderRadius:6, background: t.done ? "#f0fdf4" : (getTaskColor(t)+"18"),
                          border:`1px solid ${getTaskColor(t)+"30"}`,
                          opacity: t.done ? 0.6 : 1,
                        }}>
                          <span style={{fontSize:10, marginTop:1}}>{cat?.emoji}</span>
                          {/* Zone cliquable : label + horaires. Pour les tâches importées
                              du planning, on désactive le pointer mais on laisse l'onClick
                              qui montre un toast explicatif. */}
                          <div onClick={() => openEditTache(t)}
                            style={{flex:1, minWidth:0, cursor: isFromPlanning ? "not-allowed" : "pointer"}}>
                            <div style={{fontFamily:"sans-serif", fontSize:10, fontWeight:600, color: t.done?"#16a34a":getTaskColor(t), textDecoration:t.done?"line-through":"none", lineHeight:"1.3", wordBreak:"break-word", display:"flex", alignItems:"center", gap:3}}>
                              {isFromPlanning && <span style={{fontSize:8, color:"#94a3b8"}} title="Vient du planning">🔒</span>}
                              {t.tacheLabel}
                              {/* Indicateur visible qu'une note existe :
                                  📝 avant n'apparaissait que dans le tooltip
                                  (invisible sur mobile). Cet indicateur cliquable
                                  rappelle qu'il y a une consigne associée. */}
                              {t.notes && <span style={{fontSize:9}} title={t.notes}>📝</span>}
                            </div>
                            <div style={{fontFamily:"sans-serif", fontSize:8, color:"#94a3b8"}}>
                              {t.heureDebut}→{minToHeure(heureToMin(t.heureDebut) + t.dureeMinutes)} ({t.dureeMinutes<60?`${t.dureeMinutes}min`:`${Math.floor(t.dureeMinutes/60)}h${t.dureeMinutes%60>0?t.dureeMinutes%60:""}`})
                            </div>
                            {/* Aperçu de la note (1 ligne max, ellipsis) pour
                                voir le contenu sans avoir à ouvrir la modale */}
                            {t.notes && (
                              <div style={{
                                fontFamily:"sans-serif", fontSize:9, color:"#92400e",
                                background:"#fef3c7", borderRadius:3, padding:"1px 4px",
                                marginTop:2, overflow:"hidden", textOverflow:"ellipsis",
                                whiteSpace:"nowrap", lineHeight:"1.3",
                              }} title={t.notes}>
                                {t.notes}
                              </div>
                            )}
                          </div>
                          <button type="button" onClick={()=>toggleDone(t)} style={{width:18,height:18,borderRadius:4,border:"1px solid "+(t.done?"#16a34a":"#d1d5db"),background:t.done?"#16a34a":"white",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0}}>
                            {t.done && <Check size={10} color="white"/>}
                          </button>
                          <button type="button" onClick={()=>delTache(t)} style={{width:16,height:16,borderRadius:3,border:"none",background:"transparent",cursor:"pointer",color:"#cbd5e1",padding:0,fontSize:12,lineHeight:1}}>✕</button>
                        </div>
                      );
                    })}
                    {/* Bouton ajouter */}
                    {addCell?.salarieId===sal.id && addCell?.jour===jour ? (
                      <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:8,padding:8,display:"flex",flexDirection:"column",gap:6}}>
                        {/* Choix de la personne : la cellule cliquee determine
                            la valeur de depart, mais on peut se tromper de
                            ligne — ce menu evite de fermer et recommencer. */}
                        <select
                          value={addCell?.salarieId || ""}
                          onChange={(e) => setAddCell({ ...addCell!, salarieId: e.target.value })}
                          style={{width:"100%",padding:"4px 6px",borderRadius:6,border:"1px solid #bfdbfe",fontFamily:"sans-serif",fontSize:11,fontWeight:600,background:"white",color:"#1e40af"}}
                        >
                          {salaries.filter(x => x.actif).map(x => (
                            <option key={x.id} value={x.id}>👤 {x.nom}</option>
                          ))}
                        </select>
                        <select value={addForm.tacheTypeId} onChange={e=>{
                          const tt=tachesType.find(t=>t.id===e.target.value);
                          const firstHoraire = tt?.horairesDefaut?.sort()[0];
                          setAddForm({...addForm, tacheTypeId:e.target.value, dureeMinutes:roundToQuarter(tt?.dureeMinutes||30), heureDebut: firstHoraire || addForm.heureDebut});
                        }} style={{width:"100%",padding:"4px 6px",borderRadius:6,border:"1px solid #bfdbfe",fontFamily:"sans-serif",fontSize:11,background:"white"}}>
                          <option value="">— Choisir une tâche —</option>
                          {CATEGORIES.map(cat => {
                            const items = tachesType.filter(t => t.categorie === cat.id);
                            if (!items.length) return null;
                            return (
                              <optgroup key={cat.id} label={`${cat.emoji} ${cat.label}`}>
                                {items.map(t => <option key={t.id} value={t.id}>{cat.emoji} {t.label} ({t.dureeMinutes < 60 ? `${t.dureeMinutes}min` : `${Math.floor(t.dureeMinutes/60)}h${t.dureeMinutes%60>0?t.dureeMinutes%60:""}`})</option>)}
                              </optgroup>
                            );
                          })}
                        </select>
                        {/* Horaires standards en raccourcis */}
                        {(() => {
                          const tt = tachesType.find(t => t.id === addForm.tacheTypeId);
                          const horaires = tt?.horairesDefaut?.sort() || [];
                          if (horaires.length === 0) return null;
                          return (
                            <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                              {horaires.map(h => (
                                <button type="button" key={h} onClick={() => setAddForm({...addForm, heureDebut: h})}
                                  style={{padding:"3px 8px",borderRadius:6,border: addForm.heureDebut===h ? "2px solid #f59e0b" : "1px solid #e5e7eb",
                                    background: addForm.heureDebut===h ? "#fffbeb" : "white",
                                    fontFamily:"sans-serif",fontSize:11,fontWeight: addForm.heureDebut===h ? 700 : 500,
                                    color: addForm.heureDebut===h ? "#b45309" : "#475569",cursor:"pointer"}}>
                                  {h}
                                </button>
                              ))}
                              <button type="button" onClick={() => {
                                const el = document.getElementById("_custom_hour_select") as HTMLSelectElement;
                                if (el) el.style.display = el.style.display === "none" ? "block" : "none";
                              }}
                                style={{padding:"3px 6px",borderRadius:6,border:"1px dashed #cbd5e1",background:"transparent",fontFamily:"sans-serif",fontSize:10,color:"#94a3b8",cursor:"pointer"}}>
                                Autre…
                              </button>
                            </div>
                          );
                        })()}
                        <div style={{display:"flex",gap:4,alignItems:"center"}}>
                          <select id="_custom_hour_select" value={addForm.heureDebut} onChange={e=>setAddForm({...addForm,heureDebut:e.target.value})}
                            style={{flex:1,padding:"3px 4px",borderRadius:6,border:"1px solid #bfdbfe",fontFamily:"sans-serif",fontSize:10,background:"white",
                              display: (tachesType.find(t=>t.id===addForm.tacheTypeId)?.horairesDefaut?.length || 0) > 0 ? "none" : "block"}}>
                            {TIME_SLOTS.map(t=><option key={t} value={t}>{t}</option>)}
                          </select>
                          <select value={addForm.dureeMinutes} onChange={e=>setAddForm({...addForm,dureeMinutes:parseInt(e.target.value)})}
                            style={{flex:1,padding:"3px 4px",borderRadius:6,border:"1px solid #bfdbfe",fontFamily:"sans-serif",fontSize:10,background:"white"}}>
                            {/* Toutes durees au quart d'heure : de 15 min a 5h, par pas de 15 min */}
                            {[15,30,45,60,75,90,105,120,135,150,165,180,195,210,225,240,255,270,285,300].map(d=>{
                              const h = Math.floor(d/60);
                              const m = d%60;
                              const label = h === 0 ? `${m}min` : (m === 0 ? `${h}h` : `${h}h${String(m).padStart(2,"0")}`);
                              return <option key={d} value={d}>{label}</option>;
                            })}
                          </select>
                          {/* Bouton enchaîner après la précédente */}
                          {(() => {
                            if (!addCell) return null;
                            const prev = taches
                              .filter(t => t.salarieId === addCell.salarieId && t.jour === addCell.jour)
                              .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
                            if (prev.length === 0) return null;
                            const last = prev[prev.length - 1];
                            const finLast = minToHeure(heureToMin(last.heureDebut) + last.dureeMinutes);
                            return (
                              <button type="button" onClick={() => setAddForm({...addForm, heureDebut: finLast})}
                                title={`Démarrer à ${finLast} (après ${last.tacheLabel})`}
                                style={{padding:"3px 6px",borderRadius:6,border:"1px solid #c4b5fd",background: addForm.heureDebut === finLast ? "#ede9fe" : "white",
                                  fontFamily:"sans-serif",fontSize:9,color:"#7c3aed",cursor:"pointer",whiteSpace:"nowrap",fontWeight:600}}>
                                ⏩ {finLast}
                              </button>
                            );
                          })()}
                        </div>
                        {/* Heure de fin calculée */}
                        {addForm.heureDebut && addForm.dureeMinutes > 0 && (
                          <div style={{fontFamily:"sans-serif",fontSize:10,color:"#3b82f6",fontWeight:600,textAlign:"center",background:"#dbeafe",borderRadius:6,padding:"3px 0"}}>
                            {addForm.heureDebut} → {minToHeure(heureToMin(addForm.heureDebut) + addForm.dureeMinutes)} ({addForm.dureeMinutes < 60 ? `${addForm.dureeMinutes}min` : `${Math.floor(addForm.dureeMinutes/60)}h${addForm.dureeMinutes%60>0?String(addForm.dureeMinutes%60).padStart(2,"0"):""}`})
                          </div>
                        )}
                        {/* Sélection des jours */}
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
                            <span style={{fontFamily:"sans-serif",fontSize:9,color:"#475569",fontWeight:600}}>Jours :</span>
                            <button type="button" onClick={() => {
                              const allDays = JOURS.slice(0, nbJours) as JourSemaine[];
                              const allSelected = allDays.every(j => addForm.joursSelectionnes.includes(j));
                              setAddForm({...addForm, joursSelectionnes: allSelected ? [] : [...allDays]});
                            }}
                              style={{fontFamily:"sans-serif",fontSize:8,color:"#3b82f6",background:"transparent",border:"none",cursor:"pointer",textDecoration:"underline",padding:0}}>
                              {JOURS.slice(0, nbJours).every(j => addForm.joursSelectionnes.includes(j as JourSemaine)) ? "Aucun" : "Tous"}
                            </button>
                          </div>
                          <div style={{display:"flex",gap:2}}>
                            {JOURS.slice(0, nbJours).map(j => {
                              const selected = addForm.joursSelectionnes.includes(j as JourSemaine);
                              const isCurrent = j === addCell?.jour;
                              return (
                                <button type="button" key={j} onClick={() => {
                                  const curr = addForm.joursSelectionnes;
                                  setAddForm({...addForm, joursSelectionnes: selected ? curr.filter(x => x !== j) : [...curr, j as JourSemaine]});
                                }}
                                  style={{
                                    padding:"3px 0", width:"100%", borderRadius:5, fontSize:9, fontWeight:selected?700:500,
                                    fontFamily:"sans-serif", cursor:"pointer",
                                    background: selected ? "#3b82f6" : isCurrent ? "#eff6ff" : "white",
                                    color: selected ? "white" : isCurrent ? "#3b82f6" : "#94a3b8",
                                    border: selected ? "1px solid #3b82f6" : isCurrent ? "1px solid #bfdbfe" : "1px solid #e5e7eb",
                                  }}>
                                  {JOURS_LABELS[j].slice(0,2)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        {/* Option enchaîner + aperçu par jour */}
                        {addForm.joursSelectionnes.length > 1 && (
                          <div>
                            <label style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",fontFamily:"sans-serif",fontSize:10,color:"#475569",marginBottom:4}}>
                              <input type="checkbox" checked={addForm.enchainer}
                                onChange={e => setAddForm({...addForm, enchainer: e.target.checked})}
                                style={{accentColor:"#7c3aed",width:12,height:12}} />
                              <span style={{fontWeight:600}}>⏩ Après les tâches existantes</span>
                              <span style={{color:"#94a3b8",fontWeight:400}}>(heure auto par jour)</span>
                            </label>
                            {addForm.enchainer && addCell && (
                              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                                {addForm.joursSelectionnes.sort((a,b) => JOURS.indexOf(a) - JOURS.indexOf(b)).map(j => {
                                  const jourTaches = taches
                                    .filter(t => t.salarieId === addCell.salarieId && t.jour === j)
                                    .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
                                  let h = addForm.heureDebut;
                                  if (jourTaches.length > 0) {
                                    const last = jourTaches[jourTaches.length - 1];
                                    h = minToHeure(heureToMin(last.heureDebut) + last.dureeMinutes);
                                  }
                                  return (
                                    <span key={j} style={{fontFamily:"sans-serif",fontSize:9,background:"#f3f0ff",color:"#7c3aed",padding:"2px 6px",borderRadius:5,fontWeight:600}}>
                                      {JOURS_LABELS[j].slice(0,2)} {h}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                        {/* Zone multi-personnes : proposée SYSTÉMATIQUEMENT dès qu'une tâche
                            est choisie. Permet d'affecter la même tâche à d'autres salariés
                            (une tâche identique est créée pour chacun). Le libellé s'adapte
                            selon que la tâche exige un binôme ou non. */}
                        {(() => {
                          const ttSel = tachesType.find(t => t.id === addForm.tacheTypeId);
                          if (!ttSel) return null;
                          const otherSals = salaries.filter(s => s.actif && s.id !== addCell?.salarieId);
                          if (otherSals.length === 0) return null;
                          return (
                            <div style={{background:"#faf5ff", border:"1px solid #e9d5ff", borderRadius:6, padding:6}}>
                              <div style={{fontFamily:"sans-serif", fontSize:10, fontWeight:600, color:"#7c3aed", marginBottom:4, display:"flex", alignItems:"center", gap:3}}>
                                👥 {ttSel.binomeRequis ? "Cette tâche nécessite un binôme" : "Affecter aussi à d'autres personnes (facultatif)"}
                              </div>
                              <div style={{display:"flex", flexWrap:"wrap", gap:3}}>
                                {otherSals.map(s => {
                                  const selected = addForm.binomeIds.includes(s.id);
                                  return (
                                    <button type="button" key={s.id}
                                      onClick={() => {
                                        const curr = addForm.binomeIds;
                                        setAddForm({...addForm, binomeIds: selected ? curr.filter(x => x !== s.id) : [...curr, s.id]});
                                      }}
                                      style={{
                                        padding:"3px 8px", borderRadius:5,
                                        border: selected ? "1px solid #7c3aed" : "1px solid #e2e8f0",
                                        background: selected ? "#7c3aed" : "white",
                                        color: selected ? "white" : "#475569",
                                        fontFamily:"sans-serif", fontSize:10, fontWeight:600,
                                        cursor:"pointer",
                                      }}>
                                      {selected ? "✓ " : "+ "}{s.nom}
                                    </button>
                                  );
                                })}
                              </div>
                              {addForm.binomeIds.length > 0 && (
                                <div style={{fontFamily:"sans-serif", fontSize:9, color:"#7c3aed", marginTop:4, fontStyle:"italic"}}>
                                  {addForm.binomeIds.length + 1} personnes assignées sur le même créneau
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        <div style={{display:"flex",gap:4}}>
                          <button type="button" onClick={addTache} disabled={saving||!addForm.tacheTypeId}
                            style={{flex:1,padding:"4px 0",borderRadius:6,border:"none",
                              background: addForm.joursSelectionnes.length > 1 ? "#16a34a" : "#3b82f6",
                              color:"white",fontFamily:"sans-serif",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                            {saving ? "..." : addForm.joursSelectionnes.length > 1 ? `✓ Ajouter (${addForm.joursSelectionnes.length}j)` : "✓ Ajouter"}
                          </button>
                          <button type="button" onClick={()=>setAddCell(null)}
                            style={{padding:"4px 8px",borderRadius:6,border:"none",background:"#f1f5f9",color:"#64748b",fontFamily:"sans-serif",fontSize:11,cursor:"pointer"}}>
                            ✕
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{display:"flex", gap:3}}>
                        <button type="button" onClick={()=>openAdd(sal.id,jour)}
                          style={{flex:1, padding:"3px 0",borderRadius:6,border:"1px dashed #cbd5e1",background:"transparent",color:"#94a3b8",fontFamily:"sans-serif",fontSize:11,cursor:"pointer"}}>
                          + Ajouter
                        </button>
                        {/* Bouton Compacter visible uniquement si la cellule a au moins 2 tâches.
                            Sert à tasser les tâches manuelles et combler les trous, en
                            respectant les cours/stages comme ancres temporelles fixes. */}
                        {cellTaches.length >= 2 && (
                          <button type="button" onClick={() => compacterJournee(sal.id, jour)}
                            disabled={compactingKey === `${sal.id}|${jour}`}
                            title="Compacter la journée (tasser les tâches sans toucher aux cours)"
                            style={{padding:"3px 6px", borderRadius:6, border:"1px dashed #cbd5e1", background:"transparent", color:"#64748b", fontFamily:"sans-serif", fontSize:11, cursor:"pointer", display:"flex", alignItems:"center", gap:2}}>
                            <AlignVerticalSpaceAround size={11}/>
                          </button>
                        )}
                        {cellTaches.length > 0 && (
                          <button type="button" onClick={() => viderCellule(sal.id, jour)}
                            title={`Vider — supprimer les ${cellTaches.length} tâche${cellTaches.length>1?"s":""} de ${sal.nom} le ${JOURS_LABELS[jour]}`}
                            style={{padding:"3px 6px", borderRadius:6, border:"1px dashed #fecaca", background:"transparent", color:"#dc2626", fontFamily:"sans-serif", fontSize:11, cursor:"pointer", display:"flex", alignItems:"center", gap:2}}>
                            <Trash2 size={11}/>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
}
