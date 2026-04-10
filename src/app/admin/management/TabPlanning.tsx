"use client";
import { useState, useMemo } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Plus, Trash2, Check, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { TacheType, TachePlanifiee, Salarie, JourSemaine } from "./types";
import { CATEGORIES, JOURS, JOURS_LABELS, getLundideSemaine, formatDateCourte, fmtDuree } from "./types";

interface Props {
  semaine: string;
  setSemaine: (s: string) => void;
  taches: TachePlanifiee[];
  tachesType: TacheType[];
  salaries: Salarie[];
  creneaux: any[]; // activités du planning ce jour
  onRefresh: () => void;
}

const TIME_SLOTS = Array.from({length: (20-7)*4+1}, (_,i) => {
  const totalMin = 7*60 + i*15;
  return `${String(Math.floor(totalMin/60)).padStart(2,"0")}:${String(totalMin%60).padStart(2,"0")}`;
});

function heureToMin(h: string) { const [hh,mm] = h.split(":").map(Number); return hh*60+mm; }
function minToHeure(m: number) { return `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`; }

const COULEURS_SALARIE = ["#2050A0","#16a34a","#dc2626","#d97706","#7c3aed","#0891b2","#be185d","#374151"];

export default function TabPlanning({ semaine, setSemaine, taches, tachesType, salaries, creneaux, onRefresh }: Props) {
  const { toast } = useToast();
  const [addCell, setAddCell] = useState<{ salarieId: string; jour: JourSemaine } | null>(null);
  const [addForm, setAddForm] = useState({ tacheTypeId: "", heureDebut: "08:00", dureeMinutes: 30 });
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"tableau" | "timeline" | "journalier" | "fiche">("tableau");
  const [selectedDay, setSelectedDay] = useState<JourSemaine>(() => {
    const dayIndex = (new Date().getDay() + 6) % 7; // 0=lundi
    return JOURS[Math.min(dayIndex, 4)] as JourSemaine; // cap à vendredi
  });
  const [selectedSalarieId, setSelectedSalarieId] = useState<string>("");

  const lundi = getLundideSemaine(semaine);

  const prevWeek = () => {
    const d = new Date(lundi); d.setDate(d.getDate()-7);
    const iso = getISO(d); setSemaine(iso);
  };
  const nextWeek = () => {
    const d = new Date(lundi); d.setDate(d.getDate()+7);
    setSemaine(getISO(d));
  };
  function getISO(date: Date) {
    const d = new Date(date); d.setHours(0,0,0,0);
    d.setDate(d.getDate()+3-((d.getDay()+6)%7));
    const w1 = new Date(d.getFullYear(),0,4);
    const wn = 1+Math.round(((d.getTime()-w1.getTime())/86400000-3+((w1.getDay()+6)%7))/7);
    return `${d.getFullYear()}-W${String(wn).padStart(2,"0")}`;
  }

  const jourDates = JOURS.map((j, i) => {
    const d = new Date(lundi); d.setDate(d.getDate()+i);
    return { jour: j, date: d, label: `${JOURS_LABELS[j]} ${formatDateCourte(d)}` };
  });

  // Ouvrir le formulaire d'ajout
  const openAdd = (salarieId: string, jour: JourSemaine) => {
    const defaultTache = tachesType.find(t => t.joursDefaut?.includes(jour));
    setAddForm({
      tacheTypeId: defaultTache?.id || (tachesType[0]?.id || ""),
      heureDebut: "08:00",
      dureeMinutes: defaultTache?.dureeMinutes || 30,
    });
    setAddCell({ salarieId, jour });
  };

  const addTache = async () => {
    if (!addCell || !addForm.tacheTypeId) return;
    setSaving(true);
    const tt = tachesType.find(t => t.id === addForm.tacheTypeId)!;
    const sal = salaries.find(s => s.id === addCell.salarieId)!;
    try {
      await addDoc(collection(db, "taches-planifiees"), {
        tacheTypeId: addForm.tacheTypeId,
        tacheLabel: tt.label,
        categorie: tt.categorie,
        salarieId: addCell.salarieId,
        salarieName: sal?.nom || "",
        jour: addCell.jour,
        heureDebut: addForm.heureDebut,
        dureeMinutes: addForm.dureeMinutes || tt.dureeMinutes,
        semaine,
        done: false,
        createdAt: serverTimestamp(),
      });
      setAddCell(null);
      onRefresh();
    } catch(e:any) { toast(`Erreur : ${e.message}`, "error"); }
    setSaving(false);
  };

  const toggleDone = async (t: TachePlanifiee) => {
    await updateDoc(doc(db, "taches-planifiees", t.id), { done: !t.done, updatedAt: serverTimestamp() });
    onRefresh();
  };

  const delTache = async (t: TachePlanifiee) => {
    await deleteDoc(doc(db, "taches-planifiees", t.id));
    onRefresh();
  };

  // Calcul charge par salarié (minutes totales / semaine)
  const chargeParSalarie = useMemo(() => {
    const map: Record<string, number> = {};
    taches.forEach(t => { map[t.salarieId] = (map[t.salarieId] || 0) + t.dureeMinutes; });
    return map;
  }, [taches]);

  const getCat = (cat: string) => CATEGORIES.find(c => c.id === cat);

  // ── Vue tableau ──────────────────────────────────────────────────────────
  const TableauView = () => (
    <div className="overflow-x-auto">
      <table style={{width:"100%", borderCollapse:"collapse", minWidth: 700}}>
        <thead>
          <tr>
            <th style={{width:120, padding:"8px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#475569", background:"#f1f5f9", borderBottom:"2px solid #e2e8f0"}}>
              Salarié
            </th>
            {jourDates.slice(0,5).map(({jour, label}) => (
              <th key={jour} style={{padding:"8px 10px", textAlign:"center", fontSize:11, fontWeight:700, color:"#475569", background:"#f1f5f9", borderBottom:"2px solid #e2e8f0", whiteSpace:"nowrap"}}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {salaries.filter(s=>s.actif).map((sal, si) => (
            <tr key={sal.id} style={{background: si%2===0?"#f8faff":"#fff"}}>
              <td style={{padding:"8px 12px", borderBottom:"1px solid #eef2f7", verticalAlign:"top"}}>
                <div style={{display:"flex", alignItems:"center", gap:6}}>
                  <div style={{width:10, height:10, borderRadius:"50%", background:sal.couleur, flexShrink:0}}/>
                  <span style={{fontFamily:"sans-serif", fontSize:13, fontWeight:700, color:"#1e293b"}}>{sal.nom}</span>
                </div>
                <div style={{fontFamily:"sans-serif", fontSize:10, color:"#94a3b8", marginTop:2}}>
                  {fmtDuree(chargeParSalarie[sal.id]||0)} cette semaine
                </div>
              </td>
              {jourDates.slice(0,5).map(({jour}) => {
                const cellTaches = taches.filter(t => t.salarieId===sal.id && t.jour===jour);
                return (
                  <td key={jour} style={{padding:"6px 8px", borderBottom:"1px solid #eef2f7", verticalAlign:"top", minWidth:120}}>
                    <div style={{display:"flex", flexDirection:"column", gap:3}}>
                      {cellTaches.map(t => {
                        const cat = getCat(t.categorie);
                        return (
                          <div key={t.id} style={{
                            display:"flex", alignItems:"center", gap:4, padding:"4px 7px",
                            borderRadius:8, background: t.done ? "#f0fdf4" : (cat?.color+"18" || "#f1f5f9"),
                            border:`1px solid ${cat?.color+"30" || "#e2e8f0"}`,
                            opacity: t.done ? 0.6 : 1,
                          }}>
                            <span style={{fontSize:12}}>{cat?.emoji}</span>
                            <div style={{flex:1, minWidth:0}}>
                              <div style={{fontFamily:"sans-serif", fontSize:11, fontWeight:600, color: t.done?"#16a34a":cat?.color||"#1e293b", textDecoration:t.done?"line-through":"none", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>
                                {t.tacheLabel}
                              </div>
                              <div style={{fontFamily:"sans-serif", fontSize:9, color:"#94a3b8"}}>
                                {t.heureDebut} · {t.dureeMinutes<60?`${t.dureeMinutes}min`:`${t.dureeMinutes/60}h`}
                              </div>
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
                          <select value={addForm.tacheTypeId} onChange={e=>{
                            const tt=tachesType.find(t=>t.id===e.target.value);
                            setAddForm({...addForm,tacheTypeId:e.target.value,dureeMinutes:tt?.dureeMinutes||30});
                          }} style={{width:"100%",padding:"4px 6px",borderRadius:6,border:"1px solid #bfdbfe",fontFamily:"sans-serif",fontSize:11,background:"white"}}>
                            <option value="">— Choisir —</option>
                            {tachesType.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
                          </select>
                          <div style={{display:"flex",gap:4}}>
                            <select value={addForm.heureDebut} onChange={e=>setAddForm({...addForm,heureDebut:e.target.value})}
                              style={{flex:1,padding:"3px 4px",borderRadius:6,border:"1px solid #bfdbfe",fontFamily:"sans-serif",fontSize:10,background:"white"}}>
                              {TIME_SLOTS.map(t=><option key={t} value={t}>{t}</option>)}
                            </select>
                            <select value={addForm.dureeMinutes} onChange={e=>setAddForm({...addForm,dureeMinutes:parseInt(e.target.value)})}
                              style={{flex:1,padding:"3px 4px",borderRadius:6,border:"1px solid #bfdbfe",fontFamily:"sans-serif",fontSize:10,background:"white"}}>
                              {[15,30,45,60,90,120,180,240].map(d=><option key={d} value={d}>{d<60?`${d}m`:`${d/60}h`}</option>)}
                            </select>
                          </div>
                          <div style={{display:"flex",gap:4}}>
                            <button onClick={addTache} disabled={saving||!addForm.tacheTypeId}
                              style={{flex:1,padding:"4px 0",borderRadius:6,border:"none",background:"#3b82f6",color:"white",fontFamily:"sans-serif",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                              ✓ Ajouter
                            </button>
                            <button onClick={()=>setAddCell(null)}
                              style={{padding:"4px 8px",borderRadius:6,border:"none",background:"#f1f5f9",color:"#64748b",fontFamily:"sans-serif",fontSize:11,cursor:"pointer"}}>
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={()=>openAdd(sal.id,jour)}
                          style={{padding:"3px 0",borderRadius:6,border:"1px dashed #cbd5e1",background:"transparent",color:"#94a3b8",fontFamily:"sans-serif",fontSize:11,cursor:"pointer",width:"100%"}}>
                          + Ajouter
                        </button>
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

  // ── Vue timeline par salarié ─────────────────────────────────────────────
  const TimelineView = () => {
    const START = 7*60, END = 20*60;
    const TOTAL = END-START;
    const HEURES = [7,8,9,10,11,12,13,14,15,16,17,18,19,20];
    const pct = (min: number) => `${((min-START)/TOTAL)*100}%`;
    const w = (dur: number) => `${Math.max((dur/TOTAL)*100, 1)}%`;
    const ROW_H = 44;
    const LABEL_W = 110;

    const printTimeline = () => {
      const printContent = document.getElementById("management-timeline-print");
      if (!printContent) return;
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(`
        <html><head><meta charset="utf-8"><title>Planning équipe — Semaine ${semaine}</title>
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family: Arial, sans-serif; font-size: 11px; padding: 16px; background: white; }
          h1 { font-size: 16px; font-weight: 800; color: #0C1A2E; margin-bottom: 4px; }
          .subtitle { font-size: 11px; color: #64748b; margin-bottom: 16px; }
          .timeline-wrap { overflow: visible; }
          .header-row { display: flex; margin-left: ${LABEL_W}px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px; }
          .header-h { flex: 1; font-size: 9px; font-weight: 700; color: #64748b; border-left: 1px solid #e2e8f0; padding-left: 3px; }
          .salarie-block { margin-bottom: 16px; page-break-inside: avoid; }
          .salarie-name { font-size: 13px; font-weight: 800; color: #1e293b; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
          .salarie-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
          .salarie-charge { font-size: 10px; color: #64748b; }
          .day-row { display: flex; align-items: center; margin-bottom: 4px; }
          .day-label { width: ${LABEL_W}px; flex-shrink: 0; font-size: 10px; color: #475569; font-weight: 600; padding-right: 8px; text-align: right; }
          .day-bar { flex: 1; height: ${ROW_H}px; background: #f8faff; border-radius: 6px; position: relative; border: 1px solid #e2e8f0; overflow: visible; }
          .act-block { position: absolute; top: 0; bottom: 0; background: #dbeafe; border-right: 2px solid #93c5fd; }
          .act-label { position: absolute; top: 50%; transform: translateY(-50%); font-size: 9px; color: #1d4ed8; font-weight: 700; padding-left: 4px; white-space: nowrap; }
          .task-block { position: absolute; top: 3px; bottom: 3px; border-radius: 4px; display: flex; align-items: center; overflow: visible; }
          .task-label { font-size: 10px; color: white; font-weight: 700; padding: 0 5px; white-space: nowrap; }
          .task-time { font-size: 8px; color: rgba(255,255,255,0.8); padding-left: 4px; white-space: nowrap; flex-shrink: 0; }
          .hour-grid { position: absolute; top: 0; bottom: 0; border-left: 1px dashed #e2e8f0; pointer-events: none; }
          .legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
          .legend-item { display: flex; align-items: center; gap: 4px; font-size: 9px; color: #475569; }
          .legend-dot { width: 10px; height: 10px; border-radius: 3px; }
          @media print { body { padding: 8px; } .salarie-block { page-break-inside: avoid; } }
        </style></head><body>
        <h1>Planning équipe — Semaine ${semaine.split("-W")[1]} · ${semaine.split("-W")[0]}</h1>
        <div class="subtitle">${formatDateCourte(lundi)} → ${formatDateCourte(new Date(lundi.getTime()+4*86400000))} · Généré le ${new Date().toLocaleDateString("fr-FR")}</div>
        ${printContent.innerHTML}
        </body></html>
      `);
      win.document.close();
      setTimeout(() => { win.print(); }, 300);
    };

    return (
      <div className="flex flex-col gap-1">
        {/* Bouton print */}
        <div className="flex justify-end mb-2 print:hidden">
          <button onClick={printTimeline}
            className="flex items-center gap-2 font-body text-xs font-semibold text-slate-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors">
            <Printer size={13}/> Imprimer le planning
          </button>
        </div>

        <div id="management-timeline-print">
          {/* Axe horaire */}
          <div style={{display:"flex", marginLeft:LABEL_W, marginBottom:6}}>
            {HEURES.map(h => (
              <div key={h} style={{flex:1, textAlign:"left", fontFamily:"sans-serif", fontSize:10, fontWeight:700, color:"#64748b", borderLeft:"1px solid #e2e8f0", paddingLeft:3}}>
                {h}h
              </div>
            ))}
          </div>

          {salaries.filter(s=>s.actif).map(sal => {
            const chargeSal = fmtDuree(chargeParSalarie[sal.id]||0);
            const doneSal = taches.filter(t=>t.salarieId===sal.id&&t.done).length;
            const totalSal = taches.filter(t=>t.salarieId===sal.id).length;
            return (
              <div key={sal.id} style={{marginBottom:20}}>
                {/* En-tête salarié */}
                <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:6, paddingLeft:LABEL_W}}>
                  <div style={{width:12, height:12, borderRadius:"50%", background:sal.couleur, flexShrink:0}}/>
                  <span style={{fontFamily:"sans-serif", fontSize:13, fontWeight:800, color:"#1e293b"}}>{sal.nom}</span>
                  <span style={{fontFamily:"sans-serif", fontSize:10, color:"#64748b"}}>{chargeSal} cette semaine</span>
                  {totalSal > 0 && (
                    <span style={{fontFamily:"sans-serif", fontSize:10, color:"#16a34a", background:"#f0fdf4", padding:"1px 6px", borderRadius:10}}>
                      {doneSal}/{totalSal} ✓
                    </span>
                  )}
                </div>

                {/* Lignes par jour */}
                {jourDates.slice(0,5).map(({jour, date}) => {
                  const cellTaches = taches.filter(t=>t.salarieId===sal.id&&t.jour===jour);
                  const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
                  const actCreneau = creneaux.filter(c=>c.date===dateStr&&c.monitor===sal.nom);
                  const jourLabel = `${JOURS_LABELS[jour].slice(0,3)} ${formatDateCourte(date)}`;

                  return (
                    <div key={jour} style={{display:"flex", alignItems:"center", marginBottom:3}}>
                      <div style={{width:LABEL_W, flexShrink:0, fontFamily:"sans-serif", fontSize:10, fontWeight:600, color:"#475569", paddingRight:8, textAlign:"right"}}>
                        {jourLabel}
                      </div>
                      <div style={{flex:1, height:ROW_H, background:"#f8faff", borderRadius:6, position:"relative", border:"1px solid #e8edf5", overflow:"visible"}}>
                        {/* Grille heures */}
                        {HEURES.slice(1).map(h => (
                          <div key={h} style={{position:"absolute", left:pct(h*60), top:0, bottom:0, borderLeft:"1px dashed #e2e8f0"}}/>
                        ))}

                        {/* Activités planning (bleu clair avec label) */}
                        {actCreneau.map((c,i) => {
                          const s=heureToMin(c.startTime), e=heureToMin(c.endTime);
                          if(s<START||s>=END) return null;
                          return (
                            <div key={i} style={{position:"absolute", left:pct(s), width:w(e-s), top:0, bottom:0, background:"#dbeafe", borderRight:"2px solid #93c5fd", display:"flex", alignItems:"center", overflow:"visible", zIndex:1}}>
                              <span style={{fontSize:9, color:"#1d4ed8", fontWeight:700, padding:"0 4px", whiteSpace:"nowrap", overflow:"visible"}}>
                                {c.activityTitle}
                              </span>
                            </div>
                          );
                        })}

                        {/* Tâches planifiées */}
                        {cellTaches.map(t => {
                          const s=heureToMin(t.heureDebut);
                          if(s<START||s>=END) return null;
                          const cat=getCat(t.categorie);
                          const durMin = t.dureeMinutes;
                          const isShort = durMin < 45;
                          return (
                            <div key={t.id}
                              title={`${t.tacheLabel} — ${t.heureDebut} (${durMin}min)`}
                              style={{
                                position:"absolute", left:pct(s), width:w(durMin), minWidth:isShort?6:undefined,
                                top:3, bottom:3,
                                background: t.done ? "#94a3b8" : (cat?.color||"#64748b"),
                                borderRadius:5,
                                opacity: t.done ? 0.5 : 1,
                                cursor:"pointer",
                                display:"flex", alignItems:"center",
                                overflow:"visible",
                                boxShadow: t.done ? "none" : "0 1px 3px rgba(0,0,0,0.15)",
                                zIndex: 2,
                              }}
                              onClick={()=>toggleDone(t)}>
                              <span style={{fontSize:10, color:"white", fontWeight:700, paddingLeft:5, paddingRight:4, whiteSpace:"nowrap", overflow:"visible", flex:"none"}}>
                                {t.done ? "✓ " : ""}{t.tacheLabel}
                              </span>
                              {!isShort && (
                                <span style={{fontSize:8, color:"rgba(255,255,255,0.8)", paddingRight:4, flexShrink:0, whiteSpace:"nowrap"}}>
                                  {t.heureDebut}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Légende */}
          <div style={{display:"flex", flexWrap:"wrap", gap:8, marginTop:12, paddingTop:10, borderTop:"1px solid #e2e8f0"}}>
            {CATEGORIES.map(cat => (
              <div key={cat.id} style={{display:"flex", alignItems:"center", gap:4}}>
                <div style={{width:10, height:10, borderRadius:3, background:cat.color}}/>
                <span style={{fontFamily:"sans-serif", fontSize:9, color:"#475569"}}>{cat.emoji} {cat.label}</span>
              </div>
            ))}
            <div style={{display:"flex", alignItems:"center", gap:4}}>
              <div style={{width:10, height:10, borderRadius:3, background:"#dbeafe", border:"2px solid #93c5fd"}}/>
              <span style={{fontFamily:"sans-serif", fontSize:9, color:"#475569"}}>📅 Activité planning</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Vue journalière par salarié ──────────────────────────────────────────
  const JournalierView = () => {
    const START = 7*60, END = 20*60;
    const TOTAL = END-START;
    const HEURES = [7,8,9,10,11,12,13,14,15,16,17,18,19,20];
    const pct = (min: number) => `${((min-START)/TOTAL)*100}%`;
    const w = (dur: number) => `${Math.max((dur/TOTAL)*100, 1)}%`;
    const ROW_H = 44;
    const LABEL_W = 140;

    const dayData = jourDates.find(j => j.jour === selectedDay)!;
    const dateStr = `${dayData.date.getFullYear()}-${String(dayData.date.getMonth()+1).padStart(2,"0")}-${String(dayData.date.getDate()).padStart(2,"0")}`;
    const jourLabel = dayData.date.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" });

    const printJournalier = () => {
      const printContent = document.getElementById("management-journalier-print");
      if (!printContent) return;
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(`
        <html><head><meta charset="utf-8"><title>Planning journalier — ${jourLabel}</title>
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family: Arial, sans-serif; font-size: 11px; padding: 20px; background: white; }
          h1 { font-size: 18px; font-weight: 800; color: #0C1A2E; margin-bottom: 4px; }
          .subtitle { font-size: 12px; color: #64748b; margin-bottom: 20px; }
          .header-row { display: flex; margin-left: ${LABEL_W}px; border-bottom: 2px solid #cbd5e1; padding-bottom: 4px; margin-bottom: 12px; }
          .header-h { flex: 1; font-size: 10px; font-weight: 700; color: #475569; border-left: 1px solid #e2e8f0; padding-left: 4px; }
          .sal-row { display: flex; align-items: center; margin-bottom: 6px; }
          .sal-label { width: ${LABEL_W}px; flex-shrink: 0; padding-right: 12px; }
          .sal-name { font-size: 13px; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 6px; }
          .sal-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
          .sal-charge { font-size: 9px; color: #64748b; margin-top: 1px; }
          .sal-bar { flex: 1; height: ${ROW_H}px; background: #f8faff; border-radius: 8px; position: relative; border: 1px solid #e2e8f0; overflow: visible; }
          .hour-grid { position: absolute; top: 0; bottom: 0; border-left: 1px dashed #e2e8f0; }
          .act-block { position: absolute; top: 0; bottom: 0; background: #dbeafe; border-right: 2px solid #93c5fd; display: flex; align-items: center; overflow: visible; }
          .act-label { font-size: 9px; color: #1d4ed8; font-weight: 700; padding: 0 5px; white-space: nowrap; }
          .task-block { position: absolute; top: 4px; bottom: 4px; border-radius: 5px; display: flex; align-items: center; overflow: visible; box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
          .task-label { font-size: 10px; color: white; font-weight: 700; padding: 0 6px; white-space: nowrap; flex: none; }
          .task-time { font-size: 9px; color: rgba(255,255,255,0.85); padding-right: 5px; white-space: nowrap; flex-shrink: 0; }
          .legend { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; padding-top: 14px; border-top: 1px solid #e2e8f0; }
          .legend-item { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #475569; }
          .legend-dot { width: 10px; height: 10px; border-radius: 3px; }
          .summary { margin-top: 20px; padding: 12px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
          .summary h3 { font-size: 12px; font-weight: 700; color: #1e293b; margin-bottom: 6px; }
          .summary-line { font-size: 11px; color: #475569; margin-bottom: 3px; display: flex; align-items: center; gap: 6px; }
          @media print { body { padding: 10px; } }
        </style></head><body>
        <h1>Planning journalier</h1>
        <div class="subtitle">${jourLabel} — Semaine ${semaine.split("-W")[1]}</div>
        ${printContent.innerHTML}
        </body></html>
      `);
      win.document.close();
      setTimeout(() => { win.print(); }, 300);
    };

    const activeSalaries = salaries.filter(s => s.actif);

    return (
      <div className="flex flex-col gap-3">
        {/* Sélecteur de jour */}
        <div className="flex items-center gap-2 flex-wrap">
          {jourDates.slice(0,5).map(({jour, date}) => {
            const isToday = new Date().toDateString() === date.toDateString();
            return (
              <button key={jour} onClick={() => setSelectedDay(jour)}
                className={`px-4 py-2 rounded-xl font-body text-xs font-semibold border cursor-pointer transition-all
                  ${selectedDay===jour
                    ? "bg-blue-600 text-white border-blue-600"
                    : isToday
                      ? "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100"
                      : "bg-white text-slate-500 border-gray-200 hover:bg-gray-50"}`}>
                {JOURS_LABELS[jour].slice(0,3)} {formatDateCourte(date)}
                {isToday && selectedDay !== jour && <span className="ml-1 text-[10px]">•</span>}
              </button>
            );
          })}
          {jourDates.length > 5 && jourDates.slice(5).map(({jour, date}) => (
            <button key={jour} onClick={() => setSelectedDay(jour)}
              className={`px-4 py-2 rounded-xl font-body text-xs font-semibold border cursor-pointer transition-all
                ${selectedDay===jour
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-400 border-gray-200 hover:bg-gray-50"}`}>
              {JOURS_LABELS[jour].slice(0,3)} {formatDateCourte(date)}
            </button>
          ))}
        </div>

        {/* Bouton imprimer */}
        <div className="flex justify-between items-center">
          <div className="font-display text-sm font-bold text-blue-800 capitalize">{jourLabel}</div>
          <button onClick={printJournalier}
            className="flex items-center gap-2 font-body text-xs font-semibold text-slate-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors">
            <Printer size={13}/> Imprimer cette journée
          </button>
        </div>

        <div id="management-journalier-print">
          {/* Axe horaire */}
          <div style={{display:"flex", marginLeft:LABEL_W, marginBottom:6}}>
            {HEURES.map(h => (
              <div key={h} style={{flex:1, textAlign:"left", fontFamily:"sans-serif", fontSize:10, fontWeight:700, color:"#64748b", borderLeft:"1px solid #e2e8f0", paddingLeft:3}}>
                {h}h
              </div>
            ))}
          </div>

          {/* Une ligne par salarié */}
          {activeSalaries.map(sal => {
            const dayTaches = taches.filter(t => t.salarieId === sal.id && t.jour === selectedDay);
            const dayActivities = creneaux.filter(c => c.date === dateStr && c.monitor === sal.nom);
            const dayCharge = dayTaches.reduce((sum, t) => sum + t.dureeMinutes, 0);
            const dayDone = dayTaches.filter(t => t.done).length;

            return (
              <div key={sal.id} style={{display:"flex", alignItems:"center", marginBottom:6}}>
                {/* Label salarié */}
                <div style={{width:LABEL_W, flexShrink:0, paddingRight:12}}>
                  <div style={{display:"flex", alignItems:"center", gap:6}}>
                    <div style={{width:10, height:10, borderRadius:"50%", background:sal.couleur, flexShrink:0}}/>
                    <span style={{fontFamily:"sans-serif", fontSize:13, fontWeight:800, color:"#1e293b"}}>{sal.nom}</span>
                  </div>
                  <div style={{fontFamily:"sans-serif", fontSize:9, color:"#64748b", marginTop:1, paddingLeft:16}}>
                    {fmtDuree(dayCharge)}
                    {dayTaches.length > 0 && ` · ${dayDone}/${dayTaches.length} ✓`}
                  </div>
                </div>

                {/* Barre timeline */}
                <div style={{flex:1, height:ROW_H, background:"#f8faff", borderRadius:8, position:"relative", border:"1px solid #e8edf5", overflow:"visible"}}>
                  {/* Grille heures */}
                  {HEURES.slice(1).map(h => (
                    <div key={h} style={{position:"absolute", left:pct(h*60), top:0, bottom:0, borderLeft:"1px dashed #e2e8f0"}}/>
                  ))}

                  {/* Activités planning */}
                  {dayActivities.map((c, i) => {
                    const s = heureToMin(c.startTime), e = heureToMin(c.endTime);
                    if (s < START || s >= END) return null;
                    return (
                      <div key={`act-${i}`} style={{position:"absolute", left:pct(s), width:w(e-s), top:0, bottom:0, background:"#dbeafe", borderRight:"2px solid #93c5fd", display:"flex", alignItems:"center", overflow:"visible", zIndex:1}}>
                        <span style={{fontSize:9, color:"#1d4ed8", fontWeight:700, padding:"0 5px", whiteSpace:"nowrap", overflow:"visible"}}>
                          {c.activityTitle}
                        </span>
                      </div>
                    );
                  })}

                  {/* Tâches planifiées */}
                  {dayTaches.map(t => {
                    const s = heureToMin(t.heureDebut);
                    if (s < START || s >= END) return null;
                    const cat = getCat(t.categorie);
                    const durMin = t.dureeMinutes;
                    const isShort = durMin < 45;
                    return (
                      <div key={t.id}
                        title={`${t.tacheLabel} — ${t.heureDebut} (${durMin}min)`}
                        style={{
                          position:"absolute", left:pct(s), width:w(durMin),
                          top:4, bottom:4,
                          background: t.done ? "#94a3b8" : (cat?.color || "#64748b"),
                          borderRadius:5,
                          opacity: t.done ? 0.5 : 1,
                          cursor:"pointer",
                          display:"flex", alignItems:"center",
                          overflow:"visible",
                          boxShadow: t.done ? "none" : "0 1px 3px rgba(0,0,0,0.15)",
                          zIndex: 2,
                        }}
                        onClick={() => toggleDone(t)}>
                        <span style={{fontSize:10, color:"white", fontWeight:700, paddingLeft:6, paddingRight:4, whiteSpace:"nowrap", overflow:"visible", flex:"none"}}>
                          {t.done ? "✓ " : ""}{t.tacheLabel}
                        </span>
                        {!isShort && (
                          <span style={{fontSize:9, color:"rgba(255,255,255,0.85)", paddingRight:5, flexShrink:0, whiteSpace:"nowrap"}}>
                            {t.heureDebut}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Résumé journée */}
          <div style={{marginTop:16, padding:"10px 14px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8}}>
            <div style={{fontFamily:"sans-serif", fontSize:11, fontWeight:700, color:"#1e293b", marginBottom:6}}>Résumé de la journée</div>
            {activeSalaries.map(sal => {
              const dayTaches = taches.filter(t => t.salarieId === sal.id && t.jour === selectedDay);
              if (dayTaches.length === 0) return null;
              const charge = dayTaches.reduce((sum, t) => sum + t.dureeMinutes, 0);
              return (
                <div key={sal.id} style={{fontFamily:"sans-serif", fontSize:10, color:"#475569", marginBottom:3, display:"flex", alignItems:"center", gap:6}}>
                  <div style={{width:8, height:8, borderRadius:"50%", background:sal.couleur}}/>
                  <strong>{sal.nom}</strong> — {fmtDuree(charge)} — {dayTaches.map(t => t.tacheLabel).join(", ")}
                </div>
              );
            })}
          </div>

          {/* Légende */}
          <div style={{display:"flex", flexWrap:"wrap", gap:8, marginTop:12, paddingTop:10, borderTop:"1px solid #e2e8f0"}}>
            {CATEGORIES.map(cat => (
              <div key={cat.id} style={{display:"flex", alignItems:"center", gap:4}}>
                <div style={{width:10, height:10, borderRadius:3, background:cat.color}}/>
                <span style={{fontFamily:"sans-serif", fontSize:9, color:"#475569"}}>{cat.emoji} {cat.label}</span>
              </div>
            ))}
            <div style={{display:"flex", alignItems:"center", gap:4}}>
              <div style={{width:10, height:10, borderRadius:3, background:"#dbeafe", border:"2px solid #93c5fd"}}/>
              <span style={{fontFamily:"sans-serif", fontSize:9, color:"#475569"}}>📅 Activité planning</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Vue Fiche individuelle (lisible + imprimable) ────────────────────────
  const FicheView = () => {
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
          .task-row { display: flex; align-items: center; padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
          .task-time { width: 70px; font-size: 13px; font-weight: 700; color: #475569; flex-shrink: 0; }
          .task-name { flex: 1; font-size: 13px; font-weight: 600; }
          .task-dur { width: 60px; font-size: 11px; color: #64748b; text-align: right; flex-shrink: 0; }
          .task-cat { font-size: 10px; color: #94a3b8; margin-left: 8px; }
          .activity-row { display: flex; align-items: center; padding: 5px 0; border-bottom: 1px solid #f1f5f9; background: #f0f7ff; margin: 0 -8px; padding: 5px 8px; border-radius: 4px; }
          .activity-row .task-name { color: #1d4ed8; }
          .total { margin-top: 6px; font-size: 12px; font-weight: 700; color: #475569; text-align: right; }
          .empty-day { font-size: 11px; color: #94a3b8; font-style: italic; padding: 4px 0; }
          @media print { body { padding: 10px; } .day-section { page-break-inside: avoid; } }
        </style></head><body>
        <h1>Planning — ${sal.nom}</h1>
        <div class="subtitle">Semaine ${semaine.split("-W")[1]} · ${semaine.split("-W")[0]} · ${formatDateCourte(lundi)} → ${formatDateCourte(new Date(lundi.getTime()+4*86400000))}</div>
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

        <div id="management-fiche-print">
          {jourDates.slice(0,5).map(({jour, date}) => {
            const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
            const dayTaches = taches.filter(t => t.salarieId === sal.id && t.jour === jour)
              .sort((a,b) => heureToMin(a.heureDebut) - heureToMin(b.heureDebut));
            const dayActivities = creneaux.filter(c => c.date === dateStr && c.monitor === sal.nom)
              .sort((a: any, b: any) => heureToMin(a.startTime) - heureToMin(b.startTime));
            const dayCharge = dayTaches.reduce((s, t) => s + t.dureeMinutes, 0);
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
                        <div key={t.id}
                          style={{display:"flex", alignItems:"center", padding:"6px 0", borderBottom:"1px solid #f1f5f9", cursor:"pointer", opacity: t.done ? 0.5 : 1}}
                          onClick={() => toggleDone(t)}>
                          <div style={{width:70, fontSize:13, fontWeight:700, color:"#475569", flexShrink:0}}>{t.heureDebut}</div>
                          <div style={{flex:1, display:"flex", alignItems:"center", gap:6}}>
                            <span style={{fontSize:14}}>{cat?.emoji}</span>
                            <span style={{fontSize:13, fontWeight:600, color: t.done ? "#94a3b8" : (cat?.color || "#1e293b"), textDecoration: t.done ? "line-through" : "none"}}>
                              {t.tacheLabel}
                            </span>
                            <span style={{fontSize:10, color:"#94a3b8"}}>{cat?.label}</span>
                          </div>
                          <div style={{width:80, fontSize:11, color:"#64748b", textAlign:"right", flexShrink:0}}>
                            {fmtDuree(t.dureeMinutes)} → {fin}
                          </div>
                          <div style={{width:24, height:24, borderRadius:6, border:`2px solid ${t.done?"#16a34a":"#d1d5db"}`, background:t.done?"#16a34a":"white", display:"flex", alignItems:"center", justifyContent:"center", marginLeft:8, flexShrink:0}}>
                            {t.done && <Check size={14} color="white"/>}
                          </div>
                        </div>
                      );
                    })}

                    {/* Total jour */}
                    {dayCharge > 0 && (
                      <div style={{marginTop:6, fontSize:12, fontWeight:700, color:"#475569", textAlign:"right"}}>
                        Total : {fmtDuree(dayCharge)} · {dayTaches.filter(t=>t.done).length}/{dayTaches.length} tâches validées
                      </div>
                    )}
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
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Navigation semaine */}
      <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-gray-100">
        <button onClick={prevWeek} className="flex items-center gap-1 font-body text-sm text-slate-500 bg-transparent border-none cursor-pointer hover:text-blue-500">
          <ChevronLeft size={16}/> Semaine préc.
        </button>
        <div className="text-center">
          <div className="font-display text-base font-bold text-blue-800">Semaine {semaine.split("-W")[1]} — {semaine.split("-W")[0]}</div>
          <div className="font-body text-xs text-slate-500">
            {formatDateCourte(lundi)} → {formatDateCourte(new Date(lundi.getTime()+4*86400000))}
          </div>
        </div>
        <button onClick={nextWeek} className="flex items-center gap-1 font-body text-sm text-slate-500 bg-transparent border-none cursor-pointer hover:text-blue-500">
          Semaine suiv. <ChevronRight size={16}/>
        </button>
      </div>

      {/* Résumé charge */}
      <div className="flex flex-wrap gap-2">
        {salaries.filter(s=>s.actif).map(sal => {
          const charge = chargeParSalarie[sal.id]||0;
          const heures = fmtDuree(charge);
          const done = taches.filter(t=>t.salarieId===sal.id&&t.done).length;
          const total = taches.filter(t=>t.salarieId===sal.id).length;
          return (
            <div key={sal.id} className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-3 py-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{background:sal.couleur}}/>
              <span className="font-body text-xs font-semibold text-blue-800">{sal.nom}</span>
              <span className="font-body text-xs text-slate-500">{heures}</span>
              {total > 0 && <span className="font-body text-[10px] text-green-600">{done}/{total} ✓</span>}
            </div>
          );
        })}
      </div>

      {/* Toggle vue */}
      <div className="flex gap-2 flex-wrap">
        {(["tableau","timeline","journalier","fiche"] as const).map(v => (
          <button key={v} onClick={()=>setView(v)}
            className={`px-4 py-1.5 rounded-lg font-body text-xs font-semibold border-none cursor-pointer ${view===v?"bg-blue-500 text-white":"bg-white text-slate-500 border border-gray-200"}`}>
            {v === "tableau" ? "📊 Tableau" : v === "timeline" ? "📅 Timeline" : v === "journalier" ? "👤 Journalier" : "📋 Fiche"}
          </button>
        ))}
      </div>

      {/* Vue */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden p-4">
        {salaries.filter(s=>s.actif).length === 0 ? (
          <div className="text-center py-8 text-slate-400 font-body text-sm">Ajoutez des salariés dans l'onglet Équipe.</div>
        ) : view === "tableau" ? <TableauView/>
          : view === "timeline" ? <TimelineView/>
          : view === "journalier" ? <JournalierView/>
          : <FicheView/>}
      </div>
    </div>
  );
}
