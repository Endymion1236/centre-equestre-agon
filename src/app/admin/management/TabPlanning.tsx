"use client";
import { useState, useMemo } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Plus, Trash2, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { TacheType, TachePlanifiee, Salarie, JourSemaine } from "./types";
import { CATEGORIES, JOURS, JOURS_LABELS, getLundideSemaine, formatDateCourte } from "./types";

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
  const [view, setView] = useState<"tableau" | "timeline">("tableau");

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
                  {Math.round((chargeParSalarie[sal.id]||0)/60*10)/10}h cette semaine
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
    const pct = (min: number) => `${((min-START)/TOTAL)*100}%`;
    const w = (dur: number) => `${(dur/TOTAL)*100}%`;

    return (
      <div className="flex flex-col gap-4 overflow-x-auto">
        {/* Axe horaire */}
        <div style={{display:"flex",alignItems:"center",marginLeft:100}}>
          {[7,8,9,10,11,12,13,14,15,16,17,18,19,20].map(h=>(
            <div key={h} style={{flex:1,textAlign:"left",fontFamily:"sans-serif",fontSize:9,color:"#94a3b8",borderLeft:"1px solid #f1f5f9",paddingLeft:2}}>
              {h}h
            </div>
          ))}
        </div>

        {salaries.filter(s=>s.actif).map(sal => (
          <div key={sal.id}>
            {/* Label salarié */}
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:sal.couleur}}/>
              <span style={{fontFamily:"sans-serif",fontSize:12,fontWeight:700,color:"#1e293b"}}>{sal.nom}</span>
              <span style={{fontFamily:"sans-serif",fontSize:10,color:"#94a3b8"}}>{Math.round((chargeParSalarie[sal.id]||0)/60*10)/10}h</span>
            </div>
            {/* Ligne par jour */}
            {jourDates.slice(0,5).map(({jour,label})=>{
              const cellTaches = taches.filter(t=>t.salarieId===sal.id&&t.jour===jour);
              // Aussi les créneaux d'activités (stages, cours) de ce salarié
              const jourDate = jourDates.find(jd=>jd.jour===jour);
              const dateStr = jourDate?.date.toISOString().split("T")[0];
              const actCreneau = creneaux.filter(c=>c.date===dateStr&&c.monitor===sal.nom);

              return (
                <div key={jour} style={{display:"flex",alignItems:"center",marginBottom:2}}>
                  <div style={{width:100,flexShrink:0,fontFamily:"sans-serif",fontSize:9,color:"#94a3b8",paddingRight:6,textAlign:"right"}}>
                    {JOURS_LABELS[jour].slice(0,3)} {formatDateCourte(jourDate!.date)}
                  </div>
                  <div style={{flex:1,height:28,background:"#f8faff",borderRadius:6,position:"relative",overflow:"hidden",border:"1px solid #eef2f7"}}>
                    {/* Activités planning (gris clair) */}
                    {actCreneau.map((c,i)=>{
                      const s=heureToMin(c.startTime), e=heureToMin(c.endTime);
                      if(s<START||s>=END) return null;
                      return <div key={i} style={{position:"absolute",left:pct(s),width:w(e-s),top:0,bottom:0,background:"#e0e7ff",opacity:0.7,borderRight:"1px solid #c7d2fe"}} title={c.activityTitle}/>;
                    })}
                    {/* Tâches planifiées */}
                    {cellTaches.map(t=>{
                      const s=heureToMin(t.heureDebut);
                      if(s<START||s>=END) return null;
                      const cat=getCat(t.categorie);
                      return (
                        <div key={t.id} title={`${t.tacheLabel} ${t.heureDebut} (${t.dureeMinutes}min)`}
                          style={{position:"absolute",left:pct(s),width:w(t.dureeMinutes),top:2,bottom:2,background:cat?.color||"#64748b",borderRadius:4,opacity:t.done?0.4:0.9,cursor:"pointer",overflow:"hidden",display:"flex",alignItems:"center",paddingLeft:3}}
                          onClick={()=>toggleDone(t)}>
                          <span style={{fontSize:9,color:"white",fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.tacheLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
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
          const heures = Math.round(charge/60*10)/10;
          const done = taches.filter(t=>t.salarieId===sal.id&&t.done).length;
          const total = taches.filter(t=>t.salarieId===sal.id).length;
          return (
            <div key={sal.id} className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-3 py-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{background:sal.couleur}}/>
              <span className="font-body text-xs font-semibold text-blue-800">{sal.nom}</span>
              <span className="font-body text-xs text-slate-500">{heures}h</span>
              {total > 0 && <span className="font-body text-[10px] text-green-600">{done}/{total} ✓</span>}
            </div>
          );
        })}
      </div>

      {/* Toggle vue */}
      <div className="flex gap-2">
        {(["tableau","timeline"] as const).map(v => (
          <button key={v} onClick={()=>setView(v)}
            className={`px-4 py-1.5 rounded-lg font-body text-xs font-semibold border-none cursor-pointer ${view===v?"bg-blue-500 text-white":"bg-white text-slate-500 border border-gray-200"}`}>
            {v === "tableau" ? "📊 Tableau" : "📅 Timeline"}
          </button>
        ))}
      </div>

      {/* Vue */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden p-4">
        {salaries.filter(s=>s.actif).length === 0 ? (
          <div className="text-center py-8 text-slate-400 font-body text-sm">Ajoutez des salariés dans l'onglet Équipe.</div>
        ) : view === "tableau" ? <TableauView/> : <TimelineView/>}
      </div>
    </div>
  );
}
