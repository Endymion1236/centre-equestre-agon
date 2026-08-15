"use client";
import { Check, Trash2, AlignVerticalSpaceAround } from "lucide-react";
import type { JourSemaine, Salarie, TachePlanifiee, TacheType } from "./types";
import { CATEGORIES, JOURS, JOURS_LABELS, fmtDuree } from "./types";
import type { AddCell, AddForm, JourDate } from "./planning-types";
import { DUREES_STANDARD, TIME_SLOTS, heureToMin, minToHeure, roundToQuarter } from "./planning-utils";

/**
 * Vue « Tableau » du semainier : une ligne par salarié, une colonne par jour,
 * et dans chaque case les tâches de la journée plus le formulaire d'ajout.
 *
 * C'est l'écran de travail principal de l'admin, et de loin le plus gros
 * morceau de JSX de l'onglet — d'où son fichier dédié. Il ne décide de rien :
 * toutes les actions (ajouter, cocher, supprimer, compacter, vider) lui sont
 * passées par TabPlanning, qui reste le seul à écrire dans Firestore.
 *
 * ⚠️ Ce composant est volontairement rendu depuis TabPlanning via une fonction
 * recréée à chaque rendu (`const TableauView = () => <PlanningVueTableau …/>`).
 * Il est donc remonté à chaque rendu du parent, comme avant l'extraction : le
 * sélecteur d'heure « Autre… », qui est affiché en manipulant directement
 * `style.display` du DOM (hors React), compte sur cette remise à zéro.
 */

interface Props {
  jourDates: JourDate[];
  nbJours: number;
  salaries: Salarie[];
  taches: TachePlanifiee[];
  tachesType: TacheType[];
  chargeParSalarie: Record<string, number>;
  salariesReplies: Set<string>;
  basculerSalarie: (id: string) => void;
  addCell: AddCell | null;
  setAddCell: (c: AddCell | null) => void;
  addForm: AddForm;
  setAddForm: (f: AddForm) => void;
  saving: boolean;
  compactingKey: string | null;
  getCat: (cat: string) => { id: string; label: string; color: string; emoji: string } | undefined;
  getTaskColor: (t: TachePlanifiee) => string;
  openAdd: (salarieId: string, jour: JourSemaine) => void;
  openEditTache: (t: TachePlanifiee) => void;
  addTache: () => void;
  toggleDone: (t: TachePlanifiee) => void;
  delTache: (t: TachePlanifiee) => void;
  compacterJournee: (salarieId: string, jour: JourSemaine) => void;
  viderCellule: (salarieId: string, jour: JourSemaine) => void;
}

export default function PlanningVueTableau({
  jourDates, nbJours, salaries, taches, tachesType, chargeParSalarie,
  salariesReplies, basculerSalarie, addCell, setAddCell, addForm, setAddForm,
  saving, compactingKey, getCat, getTaskColor, openAdd, openEditTache,
  addTache, toggleDone, delTache, compacterJournee, viderCellule,
}: Props) {
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
                            <button onClick={()=>toggleDone(t)} style={{width:18,height:18,borderRadius:4,border:"1px solid "+(t.done?"#16a34a":"#d1d5db"),background:t.done?"#16a34a":"white",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0}}>
                              {t.done && <Check size={10} color="white"/>}
                            </button>
                            <button onClick={()=>delTache(t)} style={{width:16,height:16,borderRadius:3,border:"none",background:"transparent",cursor:"pointer",color:"#cbd5e1",padding:0,fontSize:12,lineHeight:1}}>✕</button>
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
                                  <button key={h} onClick={() => setAddForm({...addForm, heureDebut: h})}
                                    style={{padding:"3px 8px",borderRadius:6,border: addForm.heureDebut===h ? "2px solid #f59e0b" : "1px solid #e5e7eb",
                                      background: addForm.heureDebut===h ? "#fffbeb" : "white",
                                      fontFamily:"sans-serif",fontSize:11,fontWeight: addForm.heureDebut===h ? 700 : 500,
                                      color: addForm.heureDebut===h ? "#b45309" : "#475569",cursor:"pointer"}}>
                                    {h}
                                  </button>
                                ))}
                                <button onClick={() => {
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
                              {DUREES_STANDARD.map(d=>{
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
                                <button onClick={() => setAddForm({...addForm, heureDebut: finLast})}
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
                              <button onClick={() => {
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
                                  <button key={j} onClick={() => {
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
                                      <button key={s.id}
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
                            <button onClick={addTache} disabled={saving||!addForm.tacheTypeId}
                              style={{flex:1,padding:"4px 0",borderRadius:6,border:"none",
                                background: addForm.joursSelectionnes.length > 1 ? "#16a34a" : "#3b82f6",
                                color:"white",fontFamily:"sans-serif",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                              {saving ? "..." : addForm.joursSelectionnes.length > 1 ? `✓ Ajouter (${addForm.joursSelectionnes.length}j)` : "✓ Ajouter"}
                            </button>
                            <button onClick={()=>setAddCell(null)}
                              style={{padding:"4px 8px",borderRadius:6,border:"none",background:"#f1f5f9",color:"#64748b",fontFamily:"sans-serif",fontSize:11,cursor:"pointer"}}>
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{display:"flex", gap:3}}>
                          <button onClick={()=>openAdd(sal.id,jour)}
                            style={{flex:1, padding:"3px 0",borderRadius:6,border:"1px dashed #cbd5e1",background:"transparent",color:"#94a3b8",fontFamily:"sans-serif",fontSize:11,cursor:"pointer"}}>
                            + Ajouter
                          </button>
                          {/* Bouton Compacter visible uniquement si la cellule a au moins 2 tâches.
                              Sert à tasser les tâches manuelles et combler les trous, en
                              respectant les cours/stages comme ancres temporelles fixes. */}
                          {cellTaches.length >= 2 && (
                            <button onClick={() => compacterJournee(sal.id, jour)}
                              disabled={compactingKey === `${sal.id}|${jour}`}
                              title="Compacter la journée (tasser les tâches sans toucher aux cours)"
                              style={{padding:"3px 6px", borderRadius:6, border:"1px dashed #cbd5e1", background:"transparent", color:"#64748b", fontFamily:"sans-serif", fontSize:11, cursor:"pointer", display:"flex", alignItems:"center", gap:2}}>
                              <AlignVerticalSpaceAround size={11}/>
                            </button>
                          )}
                          {cellTaches.length > 0 && (
                            <button onClick={() => viderCellule(sal.id, jour)}
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
