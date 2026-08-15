"use client";
import { Check, Printer } from "lucide-react";
import type { Salarie, TachePlanifiee } from "./types";
import { bornesJournee, calcTempsTravailJour, fmtDuree, formatDateCourte } from "./types";
import type { JourDate } from "./planning-types";
import { heureToMin, minToHeure } from "./planning-utils";
import { CSS_IMPRESSION_FICHE } from "./planning-impression";

/**
 * Vue « Fiche » : le planning d'UNE personne, jour par jour, lisible tel quel
 * et imprimable pour être affiché à l'écurie.
 *
 * C'est la vue imposée aux monitrices (elles n'ont pas besoin du semainier
 * complet) et celle qu'on imprime. Elle affiche aussi les cours/stages du
 * planning général qui n'ont pas encore été importés en tâches, sinon une
 * journée de cours apparaîtrait vide sur la fiche.
 *
 * Séparée car elle porte sa propre impression (fenêtre autonome, styles
 * dédiés) et n'a rien en commun avec la grille d'édition.
 */

interface Props {
  salaries: Salarie[];
  taches: TachePlanifiee[];
  creneaux: any[];
  jourDates: JourDate[];
  nbJours: number;
  lundi: Date;
  semaine: string;
  chargeParSalarie: Record<string, number>;
  selectedSalarieId: string;
  setSelectedSalarieId: (id: string) => void;
  getCat: (cat: string) => { id: string; label: string; color: string; emoji: string } | undefined;
  getTaskColor: (t: TachePlanifiee) => string;
  toggleDone: (t: TachePlanifiee) => void;
}

export default function PlanningFicheSalarie({
  salaries, taches, creneaux, jourDates, nbJours, lundi, semaine,
  chargeParSalarie, selectedSalarieId, setSelectedSalarieId,
  getCat, getTaskColor, toggleDone,
}: Props) {
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
        <style>${CSS_IMPRESSION_FICHE}</style></head><body>
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
            <button key={s.id} onClick={() => setSelectedSalarieId(s.id)}
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
          <button onClick={printFiche}
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
              {" · "}{taches.filter(t=>t.salarieId===sal.id&&t.done).length}/{taches.filter(t=>t.salarieId===sal.id).length} tâches validées
            </div>
          </div>
        </div>
      </div>
    );
}
