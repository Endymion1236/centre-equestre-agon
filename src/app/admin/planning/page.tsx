"use client";
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Plus, ChevronLeft, ChevronRight, X, Check, Loader2, Trash2, Users, UserPlus, Search, CreditCard, Calendar, CalendarDays,
} from "lucide-react";
import type { Activity, Family } from "@/types";

interface Creneau { id?: string; activityId: string; activityTitle: string; activityType: string; date: string; startTime: string; endTime: string; monitor: string; maxPlaces: number; enrolledCount: number; enrolled: any[]; status: string; priceHT?: number; priceTTC?: number; tvaTaux?: number; }
interface EnrolledChild { childId: string; childName: string; familyId: string; familyName: string; enrolledAt: string; }
interface Period { startDate: string; endDate: string; }
interface SlotDef { activityId: string; day: number; startTime: string; endTime: string; monitor: string; maxPlaces: number; }

function getWeekDates(offset: number): Date[] { const t = new Date(); const m = new Date(t); m.setDate(t.getDate() - ((t.getDay() + 6) % 7) + offset * 7); return Array.from({ length: 7 }, (_, i) => { const d = new Date(m); d.setDate(m.getDate() + i); return d; }); }
function fmtDate(d: Date) { return d.toISOString().split("T")[0]; }
function fmtDateFR(d: Date) { return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }); }
function fmtMonthFR(d: Date) { return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); }
const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const dayNamesFull = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const typeColors: Record<string, string> = { stage: "#27ae60", stage_journee: "#16a085", balade: "#e67e22", cours: "#2050A0", competition: "#7c3aed", anniversaire: "#D63031", ponyride: "#16a085" };
const payModes = [{ id: "cb_terminal", label: "CB", icon: "💳" }, { id: "cheque", label: "Chèque", icon: "📝" }, { id: "especes", label: "Espèces", icon: "💶" }, { id: "cheque_vacances", label: "Chq.Vac.", icon: "🏖️" }, { id: "pass_sport", label: "Pass'Sport", icon: "🎽" }, { id: "ancv", label: "ANCV", icon: "🎫" }, { id: "carte", label: "Carte", icon: "🎟️" }];

// ─── Enroll Panel ───
function EnrollPanel({ creneau, families, onClose, onEnroll, onUnenroll }: {
  creneau: Creneau & { id: string }; families: (Family & { firestoreId: string })[]; onClose: () => void;
  onEnroll: (id: string, c: EnrolledChild, payMode?: string) => Promise<void>;
  onUnenroll: (id: string, childId: string) => Promise<void>;
}) {
  const [search, setSearch] = useState(""); const [selFam, setSelFam] = useState(""); const [selChild, setSelChild] = useState("");
  const [enrolling, setEnrolling] = useState(false); const [justEnrolled, setJustEnrolled] = useState("");
  const [showPay, setShowPay] = useState(false); const [payMode, setPayMode] = useState("cb_terminal"); const [unenrolling, setUnenrolling] = useState("");
  const enrolled = creneau.enrolled || []; const enrolledIds = enrolled.map((e: any) => e.childId);
  const spots = creneau.maxPlaces - enrolled.length; const color = typeColors[creneau.activityType] || "#666";
  const priceTTC = (creneau as any).priceTTC || (creneau.priceHT || 0) * (1 + (creneau.tvaTaux || 5.5) / 100);
  const filteredFamilies = useMemo(() => { if (!search) return families; const q = search.toLowerCase(); return families.filter(f => f.parentName?.toLowerCase().includes(q) || f.parentEmail?.toLowerCase().includes(q) || (f.children || []).some((c: any) => c.firstName?.toLowerCase().includes(q))); }, [families, search]);
  const fam = families.find(f => f.firestoreId === selFam); const children = fam?.children || [];
  const available = children.filter((c: any) => !enrolledIds.includes(c.id));
  const handleEnroll = async () => { if (!selChild || !fam) return; setEnrolling(true); const child = children.find((c: any) => c.id === selChild); const childName = (child as any)?.firstName || "—"; await onEnroll(creneau.id!, { childId: selChild, childName, familyId: fam.firestoreId, familyName: fam.parentName || "—", enrolledAt: new Date().toISOString() }, showPay ? payMode : undefined); setJustEnrolled(childName); setSelChild(""); setSelFam(""); setSearch(""); setEnrolling(false); setShowPay(false); setTimeout(() => setJustEnrolled(""), 3000); };
  const handleUnenroll = async (childId: string) => { setUnenrolling(childId); await onUnenroll(creneau.id!, childId); setUnenrolling(""); };
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-blue-500/8" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
          <div className="flex justify-between items-start"><div><div className="font-body text-sm font-semibold" style={{ color }}>{creneau.startTime}–{creneau.endTime}</div><h2 className="font-display text-lg font-bold text-blue-800">{creneau.activityTitle}</h2><div className="font-body text-xs text-gray-400 mt-1">{new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {creneau.monitor}{priceTTC > 0 ? ` · ${priceTTC.toFixed(2)}€` : ""}</div></div><button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer"><X size={20} /></button></div>
          <div className="flex items-center gap-3 mt-3"><Badge color={spots > 2 ? "green" : spots > 0 ? "orange" : "red"}>{spots > 0 ? `${spots} place${spots > 1 ? "s" : ""}` : "COMPLET"}</Badge><span className="font-body text-xs text-gray-400">{enrolled.length}/{creneau.maxPlaces}</span></div>
        </div>
        <div className="p-5">
          {justEnrolled && <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg font-body text-sm text-green-700">✅ {justEnrolled} inscrit(e) !</div>}
          <h3 className="font-body text-sm font-semibold text-blue-800 mb-3"><Users size={16} className="inline mr-1" />Inscrits ({enrolled.length})</h3>
          {enrolled.length === 0 ? <p className="font-body text-sm text-gray-400 italic mb-4">Aucun</p> :
          <div className="flex flex-col gap-2 mb-4">{enrolled.map((e: any) => (<div key={e.childId} className="flex items-center justify-between bg-sand rounded-lg px-4 py-2.5"><div className="flex items-center gap-3"><span>🧒</span><div><div className="font-body text-sm font-semibold text-blue-800">{e.childName}</div><div className="font-body text-xs text-gray-400">{e.familyName}</div></div></div><button onClick={() => handleUnenroll(e.childId)} disabled={unenrolling===e.childId} className="flex items-center gap-1 font-body text-xs text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer px-2 py-1 rounded hover:bg-red-50">{unenrolling===e.childId ? <Loader2 size={12} className="animate-spin"/> : <Trash2 size={12}/>} Désinscrire</button></div>))}</div>}
          {spots > 0 && (<div className="border-t border-blue-500/8 pt-4"><h3 className="font-body text-sm font-semibold text-blue-800 mb-3"><UserPlus size={16} className="inline mr-1"/>Inscrire</h3><div className="flex flex-col gap-3">
            <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300"/><input value={search} onChange={e=>{setSearch(e.target.value);setSelFam("");setSelChild("");}} placeholder="Nom parent, prénom enfant, email..." className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"/></div>
            <select value={selFam} onChange={e=>{setSelFam(e.target.value);setSelChild("");}} className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream"><option value="">Famille ({filteredFamilies.length})</option>{filteredFamilies.map(f=>{const n=(f.children||[]).map((c:any)=>c.firstName).join(", ");return<option key={f.firestoreId} value={f.firestoreId}>{f.parentName} {n?`(${n})`:""}</option>})}</select>
            {fam&&available.length>0&&<div className="flex flex-wrap gap-2">{available.map((c:any)=><button key={c.id} onClick={()=>setSelChild(c.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-body text-sm cursor-pointer ${selChild===c.id?"bg-blue-500 text-white border-blue-500":"bg-white text-gray-500 border-gray-200"}`}>🧒 {c.firstName}</button>)}</div>}
            {selChild&&priceTTC>0&&<div className="bg-blue-50 rounded-lg p-3"><label className="flex items-center gap-2 cursor-pointer mb-2"><input type="checkbox" checked={showPay} onChange={e=>setShowPay(e.target.checked)} className="accent-blue-500 w-4 h-4"/><span className="font-body text-sm text-blue-800 font-semibold">💳 Encaisser ({priceTTC.toFixed(2)}€)</span></label>{showPay&&<div className="flex flex-wrap gap-1.5 mt-2">{payModes.map(m=><button key={m.id} onClick={()=>setPayMode(m.id)} className={`px-3 py-1.5 rounded-lg border font-body text-[11px] font-medium cursor-pointer ${payMode===m.id?"bg-blue-500 text-white border-blue-500":"bg-white text-gray-500 border-gray-200"}`}>{m.icon} {m.label}</button>)}</div>}</div>}
            <button onClick={handleEnroll} disabled={!selChild||enrolling} className={`w-full py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${!selChild||enrolling?"bg-gray-200 text-gray-400":"bg-green-600 text-white hover:bg-green-500"}`}>{enrolling?"...":showPay?`Inscrire + Encaisser`:"Inscrire"}</button>
          </div></div>)}
        </div>
      </div>
    </div>
  );
}

// ─── Period-based Créneau Generator (like Celeris) ───
function PeriodGenerator({ activities, onGenerate, onCancel }: { activities: Activity[]; onGenerate: (creneaux: Partial<Creneau>[]) => Promise<void>; onCancel: () => void; }) {
  const [periods, setPeriods] = useState<Period[]>([
    { startDate: "2025-09-24", endDate: "2025-10-18" },
    { startDate: "2025-11-03", endDate: "2025-12-20" },
    { startDate: "2026-01-06", endDate: "2026-02-14" },
    { startDate: "2026-03-03", endDate: "2026-04-11" },
    { startDate: "2026-04-28", endDate: "2026-06-28" },
  ]);
  const [slots, setSlots] = useState<SlotDef[]>([{ activityId: "", day: 2, startTime: "10:00", endTime: "11:00", monitor: "Emmeline", maxPlaces: 8 }]);
  const [saving, setSaving] = useState(false);

  const addPeriod = () => setPeriods([...periods, { startDate: "", endDate: "" }]);
  const removePeriod = (i: number) => setPeriods(periods.filter((_, j) => j !== i));
  const updatePeriod = (i: number, field: string, val: string) => setPeriods(periods.map((p, j) => j === i ? { ...p, [field]: val } : p));
  const addSlot = () => setSlots([...slots, { activityId: "", day: 2, startTime: "10:00", endTime: "11:00", monitor: "Emmeline", maxPlaces: 8 }]);
  const removeSlot = (i: number) => setSlots(slots.filter((_, j) => j !== i));
  const updateSlot = (i: number, field: string, val: any) => setSlots(slots.map((s, j) => j === i ? { ...s, [field]: val } : s));

  // Generate all dates
  const allCreneaux = useMemo(() => {
    const result: Partial<Creneau>[] = [];
    for (const slot of slots) {
      if (!slot.activityId) continue;
      const act = activities.find(a => a.id === slot.activityId);
      if (!act) continue;
      const actPriceTTC = (act as any).priceTTC || (act.priceHT || 0) * (1 + (act.tvaTaux || 5.5) / 100);
      for (const period of periods) {
        if (!period.startDate || !period.endDate) continue;
        const cur = new Date(period.startDate);
        const end = new Date(period.endDate);
        while (cur <= end) {
          const dow = (cur.getDay() + 6) % 7;
          if (dow === slot.day) {
            result.push({
              activityId: slot.activityId, activityTitle: act.title, activityType: act.type,
              date: fmtDate(cur), startTime: slot.startTime, endTime: slot.endTime,
              monitor: slot.monitor, maxPlaces: slot.maxPlaces, enrolledCount: 0, enrolled: [],
              status: "planned", priceHT: actPriceTTC / (1 + (act.tvaTaux || 5.5) / 100),
              priceTTC: actPriceTTC, tvaTaux: act.tvaTaux || 5.5,
            });
          }
          cur.setDate(cur.getDate() + 1);
        }
      }
    }
    return result;
  }, [slots, periods, activities]);

  const handleGenerate = async () => { setSaving(true); await onGenerate(allCreneaux); setSaving(false); };
  const inp = "px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  return (
    <Card padding="md" className="mb-6 border-gold-400/20 bg-gold-50/30">
      <div className="flex justify-between items-center mb-4"><h3 className="font-body text-base font-semibold text-blue-800 flex items-center gap-2"><Calendar size={18}/>Générateur de séances (périodes)</h3><button onClick={onCancel} className="text-gray-400 bg-transparent border-none cursor-pointer"><X size={20}/></button></div>
      <p className="font-body text-xs text-gray-500 mb-4">Comme dans Celeris : définissez les périodes de cours et les plages horaires, tout sera généré automatiquement.</p>
      
      {/* Periods */}
      <div className="mb-5">
        <div className="font-body text-sm font-semibold text-blue-800 mb-2">📅 Périodes de cours</div>
        <div className="flex flex-col gap-2">
          {periods.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="font-body text-xs text-gray-400 w-6">{i+1}.</span>
              <input type="date" value={p.startDate} onChange={e => updatePeriod(i, "startDate", e.target.value)} className={`${inp} flex-1`}/>
              <span className="font-body text-xs text-gray-400">→</span>
              <input type="date" value={p.endDate} onChange={e => updatePeriod(i, "endDate", e.target.value)} className={`${inp} flex-1`}/>
              <button onClick={() => removePeriod(i)} className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer"><Trash2 size={14}/></button>
            </div>
          ))}
          <button onClick={addPeriod} className="font-body text-xs text-blue-500 bg-transparent border-none cursor-pointer mt-1">+ Ajouter une période</button>
        </div>
      </div>
      
      {/* Slots (activities + day + time) */}
      <div className="mb-5">
        <div className="font-body text-sm font-semibold text-blue-800 mb-2">🕐 Plages de cours</div>
        <div className="flex flex-col gap-3">
          {slots.map((s, i) => (
            <div key={i} className="bg-white rounded-lg p-3 border border-blue-500/8">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-body text-xs font-bold text-gold-500">Cours {i+1}</span>
                {slots.length > 1 && <button onClick={() => removeSlot(i)} className="ml-auto text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer"><Trash2 size={12}/></button>}
              </div>
              <div className="flex flex-wrap gap-2">
                <select value={s.activityId} onChange={e => updateSlot(i, "activityId", e.target.value)} className={`${inp} flex-1 min-w-[160px]`}>
                  <option value="">Activité...</option>
                  {activities.filter(a => a.active !== false).map((a, idx) => <option key={`${a.id}-${idx}`} value={a.id}>{a.title}</option>)}
                </select>
                <select value={s.day} onChange={e => updateSlot(i, "day", parseInt(e.target.value))} className={`${inp} w-28`}>
                  {dayNamesFull.map((d, j) => <option key={j} value={j}>{d}</option>)}
                </select>
                <input type="time" value={s.startTime} onChange={e => updateSlot(i, "startTime", e.target.value)} className={`${inp} w-24`}/>
                <input type="time" value={s.endTime} onChange={e => updateSlot(i, "endTime", e.target.value)} className={`${inp} w-24`}/>
                <select value={s.monitor} onChange={e => updateSlot(i, "monitor", e.target.value)} className={`${inp} w-28`}>
                  <option>Emmeline</option><option>Nicolas</option>
                </select>
                <input type="number" value={s.maxPlaces} onChange={e => updateSlot(i, "maxPlaces", parseInt(e.target.value))} className={`${inp} w-16`} title="Places"/>
              </div>
            </div>
          ))}
          <button onClick={addSlot} className="font-body text-xs text-blue-500 bg-transparent border-none cursor-pointer">+ Ajouter un cours</button>
        </div>
      </div>
      
      {/* Preview */}
      {allCreneaux.length > 0 && (
        <div className="bg-blue-50 rounded-lg p-3 mb-4">
          <div className="font-body text-sm font-semibold text-blue-800 mb-1">✨ {allCreneaux.length} séances à générer</div>
          <div className="font-body text-xs text-gray-500">
            {slots.filter(s => s.activityId).map((s, i) => {
              const act = activities.find(a => a.id === s.activityId);
              const count = allCreneaux.filter(c => c.activityId === s.activityId && c.startTime === s.startTime).length;
              return <div key={i}>{act?.title} — {dayNamesFull[s.day]} {s.startTime}–{s.endTime} — <strong>{count} séances</strong></div>;
            })}
          </div>
        </div>
      )}
      
      <button onClick={handleGenerate} disabled={allCreneaux.length === 0 || saving}
        className={`w-full py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${allCreneaux.length === 0 || saving ? "bg-gray-200 text-gray-400" : "bg-blue-500 text-white hover:bg-blue-400"}`}>
        {saving ? <><Loader2 size={16} className="inline animate-spin mr-2"/>Génération...</> : `Générer ${allCreneaux.length} séances`}
      </button>
    </Card>
  );
}

// ─── Simple single créneau form ───
function SimpleCreneauForm({ activities, onSave, onCancel, defaultDate }: { activities: Activity[]; onSave: (c: Partial<Creneau>[]) => Promise<void>; onCancel: () => void; defaultDate?: string; }) {
  const [actId, setActId] = useState(""); const [st, setSt] = useState("10:00"); const [et, setEt] = useState("12:00"); const [mon, setMon] = useState("Emmeline"); const [mp, setMp] = useState(8);
  const [date, setDate] = useState(defaultDate || fmtDate(new Date())); const [saving, setSaving] = useState(false);
  const [multiDay, setMultiDay] = useState(false);
  const [nbDays, setNbDays] = useState(5);
  const [skipWeekend, setSkipWeekend] = useState(true);
  const act = activities.find(a => a.id === actId);
  useEffect(() => { if (act) setMp(act.maxPlaces || 8); }, [actId]);

  const generateDates = (): string[] => {
    if (!multiDay) return [date];
    const dates: string[] = [];
    const start = new Date(date);
    let current = new Date(start);
    while (dates.length < nbDays) {
      const day = current.getDay();
      if (!skipWeekend || (day !== 0 && day !== 6)) {
        dates.push(fmtDate(current));
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const sub = async () => {
    if (!actId || !act) return;
    setSaving(true);
    const ttc = (act as any).priceTTC || (act.priceHT || 0) * (1 + (act.tvaTaux || 5.5) / 100);
    const dates = generateDates();
    const creneaux = dates.map(d => ({
      activityId: actId, activityTitle: act.title, activityType: act.type, date: d,
      startTime: st, endTime: et, monitor: mon, maxPlaces: mp, enrolledCount: 0, enrolled: [],
      status: "planned", priceHT: ttc / (1 + (act.tvaTaux || 5.5) / 100), priceTTC: ttc, tvaTaux: act.tvaTaux || 5.5,
    }));
    await onSave(creneaux);
    setSaving(false);
  };

  const previewDates = multiDay ? generateDates() : [];
  const inp = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  return (
    <Card padding="md" className="mb-6 border-blue-500/15">
      <div className="flex justify-between items-center mb-4"><h3 className="font-body text-base font-semibold text-blue-800">Créer des créneaux</h3><button onClick={onCancel} className="text-gray-400 bg-transparent border-none cursor-pointer"><X size={20}/></button></div>
      <div className="flex flex-col gap-3">
        <select value={actId} onChange={e => setActId(e.target.value)} className={inp}><option value="">Activité...</option>{activities.filter(a => a.active !== false).map((a, i) => <option key={`${a.id}-${i}`} value={a.id}>{a.title}</option>)}</select>

        {/* Mode multi-jours */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={multiDay} onChange={e => setMultiDay(e.target.checked)} className="w-4 h-4 accent-blue-500" />
            <span className="font-body text-sm text-gray-600">Stage multi-jours</span>
          </label>
          {multiDay && (
            <>
              <select value={nbDays} onChange={e => setNbDays(parseInt(e.target.value))} className={`${inp} !w-auto`}>
                <option value={2}>2 jours</option>
                <option value={3}>3 jours</option>
                <option value={4}>4 jours</option>
                <option value={5}>5 jours (semaine)</option>
                <option value={10}>10 jours (2 semaines)</option>
              </select>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={skipWeekend} onChange={e => setSkipWeekend(e.target.checked)} className="w-4 h-4 accent-blue-500" />
                <span className="font-body text-xs text-gray-500">Sauter week-end</span>
              </label>
            </>
          )}
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="font-body text-[10px] text-gray-400 block mb-1">{multiDay ? "Date de début" : "Date"}</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp}/>
          </div>
          <div className="w-24">
            <label className="font-body text-[10px] text-gray-400 block mb-1">Début</label>
            <input type="time" value={st} onChange={e => setSt(e.target.value)} className={inp}/>
          </div>
          <div className="w-24">
            <label className="font-body text-[10px] text-gray-400 block mb-1">Fin</label>
            <input type="time" value={et} onChange={e => setEt(e.target.value)} className={inp}/>
          </div>
        </div>
        <div className="flex gap-2"><select value={mon} onChange={e => setMon(e.target.value)} className={`${inp} flex-1`}><option>Emmeline</option><option>Nicolas</option></select><input type="number" value={mp} onChange={e => setMp(parseInt(e.target.value))} className={`${inp} w-20`} placeholder="Places"/></div>

        {/* Preview multi-jours */}
        {multiDay && previewDates.length > 0 && (
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="font-body text-xs font-semibold text-blue-800 mb-1">{previewDates.length} créneaux à générer :</div>
            <div className="font-body text-xs text-gray-500">
              {previewDates.map(d => new Date(d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })).join(" · ")}
            </div>
          </div>
        )}

        <button onClick={sub} disabled={!actId || saving} className={`flex items-center justify-center gap-2 py-2.5 rounded-lg font-body text-sm font-semibold border-none cursor-pointer ${!actId||saving?"bg-gray-200 text-gray-400":"bg-blue-500 text-white hover:bg-blue-400"}`}>
          {saving?<Loader2 size={16} className="animate-spin"/>:<Check size={16}/>}
          {multiDay ? `Créer ${previewDates.length} créneaux` : "Créer"}
        </button>
      </div>
    </Card>
  );
}

// ─── Main Planning ───
export default function PlanningPage() {
  const [weekOffset, setWeekOffset] = useState(0); const [dayOffset, setDayOffset] = useState(0);
  const [viewMode, setViewMode] = useState<"week"|"day">("week");
  const [creneaux, setCreneaux] = useState<(Creneau & { id: string })[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSimple, setShowSimple] = useState(false); const [showGenerator, setShowGenerator] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string|undefined>();
  const [selectedCreneau, setSelectedCreneau] = useState<(Creneau & { id: string })|null>(null);
  const [showDuplicate, setShowDuplicate] = useState(false); const [dupWeeks, setDupWeeks] = useState(1); const [duplicating, setDuplicating] = useState(false);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const currentDay = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + dayOffset); return d; }, [dayOffset]);

  const fetchData = async () => {
    try {
      const [aS, fS] = await Promise.all([getDocs(collection(db, "activities")), getDocs(collection(db, "families"))]);
      setActivities(aS.docs.map(d => ({ id: d.id, ...d.data() })) as Activity[]);
      setFamilies(fS.docs.map(d => ({ firestoreId: d.id, ...d.data() })) as any);
      const s = viewMode === "day" ? fmtDate(currentDay) : fmtDate(weekDates[0]);
      const e = viewMode === "day" ? fmtDate(currentDay) : fmtDate(weekDates[6]);
      const cS = await getDocs(query(collection(db, "creneaux"), where("date", ">=", s), where("date", "<=", e)));
      setCreneaux(cS.docs.map(d => ({ id: d.id, ...d.data() })) as any);
    } catch(e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { setLoading(true); fetchData(); }, [weekOffset, dayOffset, viewMode]);

  const handleCreate = async (nc: Partial<Creneau>[]) => { for (const c of nc) await addDoc(collection(db, "creneaux"), { ...c, createdAt: serverTimestamp() }); setShowSimple(false); setShowGenerator(false); alert(`${nc.length} créneau${nc.length>1?"x":""} créé${nc.length>1?"s":""}!`); fetchData(); };
  const handleDelete = async (id: string) => { if (!confirm("Supprimer ?")) return; await deleteDoc(doc(db, "creneaux", id)); fetchData(); };
  const handleDuplicateWeek = async () => { if (creneaux.length===0) return; setDuplicating(true); for (let w=1;w<=dupWeeks;w++){for(const c of creneaux){const d=new Date(c.date);d.setDate(d.getDate()+7*w);await addDoc(collection(db,"creneaux"),{activityId:c.activityId,activityTitle:c.activityTitle,activityType:c.activityType,date:fmtDate(d),startTime:c.startTime,endTime:c.endTime,monitor:c.monitor,maxPlaces:c.maxPlaces,enrolledCount:0,enrolled:[],status:"planned",priceHT:c.priceHT||0,priceTTC:(c as any).priceTTC||0,tvaTaux:c.tvaTaux||5.5,createdAt:serverTimestamp()});}} setDuplicating(false);setShowDuplicate(false);alert(`Dupliqué!`);fetchData(); };

  const refreshCreneaux = async () => { const s=viewMode==="day"?fmtDate(currentDay):fmtDate(weekDates[0]); const e=viewMode==="day"?fmtDate(currentDay):fmtDate(weekDates[6]); const snap=await getDocs(query(collection(db,"creneaux"),where("date",">=",s),where("date","<=",e))); const fresh=snap.docs.map(d=>({id:d.id,...d.data()})) as (Creneau&{id:string})[]; setCreneaux(fresh); return fresh; };

  const handleEnroll = async (cid: string, child: EnrolledChild, payMode?: string) => { const c=creneaux.find(x=>x.id===cid); if(!c) return; const en=[...(c.enrolled||[]),child]; await updateDoc(doc(db,"creneaux",cid),{enrolled:en,enrolledCount:en.length}); const priceTTC=(c as any).priceTTC||(c.priceHT||0)*(1+(c.tvaTaux||5.5)/100); const priceHT=priceTTC/(1+(c.tvaTaux||5.5)/100);
    await addDoc(collection(db,"reservations"),{familyId:child.familyId,familyName:child.familyName,childId:child.childId,childName:child.childName,activityTitle:c.activityTitle,activityType:c.activityType,creneauId:cid,date:c.date,startTime:c.startTime,endTime:c.endTime,priceTTC:Math.round(priceTTC*100)/100,status:"confirmed",source:"admin",createdAt:serverTimestamp()});
    if(payMode&&priceTTC>0){await addDoc(collection(db,"payments"),{familyId:child.familyId,familyName:child.familyName,items:[{activityTitle:c.activityTitle,priceHT:Math.round(priceHT*100)/100,tva:c.tvaTaux||5.5,priceTTC:Math.round(priceTTC*100)/100}],totalTTC:Math.round(priceTTC*100)/100,paymentMode:payMode,paymentRef:"",status:"paid",paidAmount:Math.round(priceTTC*100)/100,date:serverTimestamp()});}
    const fresh=await refreshCreneaux(); const upd=fresh.find(x=>x.id===cid); if(upd)setSelectedCreneau(upd); };

  const handleUnenroll = async (cid: string, childId: string) => { const c=creneaux.find(x=>x.id===cid); if(!c) return; const en=(c.enrolled||[]).filter((e:any)=>e.childId!==childId); await updateDoc(doc(db,"creneaux",cid),{enrolled:en,enrolledCount:en.length});
    try{const rs=await getDocs(query(collection(db,"reservations"),where("creneauId","==",cid),where("childId","==",childId)));for(const d of rs.docs)await deleteDoc(doc(db,"reservations",d.id));}catch(e){console.error(e);}
    const fresh=await refreshCreneaux(); const upd=fresh.find(x=>x.id===cid); if(upd)setSelectedCreneau(upd); };

  const isToday = (d: Date) => fmtDate(d) === fmtDate(new Date());
  const dayCreneaux = creneaux.filter(c => c.date === fmtDate(currentDay)).sort((a,b) => a.startTime.localeCompare(b.startTime));

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-display text-2xl font-bold text-blue-800">Planning</h1>
        <div className="flex gap-2">
          <div className="flex bg-sand rounded-lg p-0.5">{(["week","day"] as const).map(v=><button key={v} onClick={()=>setViewMode(v)} className={`px-4 py-2 rounded-md font-body text-xs font-semibold cursor-pointer border-none ${viewMode===v?"bg-white text-blue-500 shadow-sm":"text-gray-400 bg-transparent"}`}>{v==="week"?"Semaine":"Jour"}</button>)}</div>
          <button onClick={()=>{setShowSimple(true);setShowGenerator(false);setSelectedDate(viewMode==="day"?fmtDate(currentDay):undefined);}} className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400"><Plus size={16}/>Créneau</button>
          <button onClick={()=>{setShowGenerator(true);setShowSimple(false);}} className="flex items-center gap-2 font-body text-sm font-semibold text-blue-800 bg-gold-400 px-4 py-2.5 rounded-lg border-none cursor-pointer hover:bg-gold-300"><Calendar size={16}/>Périodes</button>
          {viewMode==="week"&&creneaux.length>0&&<button onClick={()=>setShowDuplicate(!showDuplicate)} className="font-body text-sm font-semibold text-blue-500 bg-blue-50 px-3 py-2.5 rounded-lg border-none cursor-pointer">📋</button>}
        </div>
      </div>

      {showSimple && <SimpleCreneauForm activities={activities} onSave={handleCreate} onCancel={()=>setShowSimple(false)} defaultDate={selectedDate}/>}
      {showGenerator && <PeriodGenerator activities={activities} onGenerate={handleCreate} onCancel={()=>setShowGenerator(false)}/>}
      {showDuplicate && <Card padding="md" className="mb-6 border-gold-400/20 bg-gold-50"><div className="flex justify-between items-center mb-3"><h3 className="font-body text-base font-semibold text-blue-800">📋 Dupliquer semaine</h3><button onClick={()=>setShowDuplicate(false)} className="text-gray-400 bg-transparent border-none cursor-pointer"><X size={18}/></button></div><div className="flex items-center gap-4 mb-3"><label className="font-body text-sm text-blue-800">Semaines:</label><input type="number" min={1} max={20} value={dupWeeks} onChange={e=>setDupWeeks(parseInt(e.target.value)||1)} className="w-20 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-white text-center"/></div><button onClick={handleDuplicateWeek} disabled={duplicating} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-body text-sm font-semibold border-none cursor-pointer ${duplicating?"bg-gray-200 text-gray-400":"bg-gold-400 text-blue-800"}`}>{duplicating?<Loader2 size={16} className="animate-spin"/>:<Check size={16}/>} Dupliquer</button></Card>}

      {viewMode==="week"&&<>
        <div className="flex items-center justify-between mb-5">
          <button onClick={()=>setWeekOffset(w=>w-1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"><ChevronLeft size={16}/>Préc.</button>
          <div className="text-center"><div className="font-display text-lg font-bold text-blue-800 capitalize">{fmtMonthFR(weekDates[0])}</div><div className="font-body text-xs text-gray-400">Du {weekDates[0].toLocaleDateString("fr-FR",{day:"numeric",month:"short"})} au {weekDates[6].toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}</div></div>
          <div className="flex gap-2"><button onClick={()=>setWeekOffset(0)} className="font-body text-sm text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer">Auj.</button><button onClick={()=>setWeekOffset(w=>w+1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Suiv.<ChevronRight size={16}/></button></div>
        </div>
        {loading?<div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto"/></div>:
        <div className="grid grid-cols-7 gap-1.5">
          {weekDates.map((d,i)=><div key={i} onClick={()=>{setViewMode("day");setDayOffset(Math.round((d.getTime()-new Date().getTime())/86400000));}} className={`text-center py-2 rounded-lg font-body text-xs font-semibold cursor-pointer hover:ring-2 hover:ring-blue-300 ${isToday(d)?"bg-blue-500 text-white":"bg-sand text-gray-500"}`}>{fmtDateFR(d)}</div>)}
          {weekDates.map((d,i)=>{const ds=fmtDate(d);const dc=creneaux.filter(c=>c.date===ds).sort((a,b)=>a.startTime.localeCompare(b.startTime));return(
            <div key={`c${i}`} className="min-h-[140px] flex flex-col gap-1">
              {dc.map(c=>{const en=c.enrolled||[];const fill=c.maxPlaces>0?en.length/c.maxPlaces:0;const col=typeColors[c.activityType]||"#666";return(
                <div key={c.id} onClick={()=>setSelectedCreneau(c)} className="bg-white rounded-lg p-2 border border-blue-500/8 group relative hover:shadow-md cursor-pointer" style={{borderLeftWidth:3,borderLeftColor:col}}>
                  <div className="font-body text-[11px] font-semibold" style={{color:col}}>{c.startTime}–{c.endTime}</div>
                  <div className="font-body text-xs font-semibold text-blue-800 leading-tight mt-0.5">{c.activityTitle}</div>
                  <div className="font-body text-[10px] text-gray-400 mt-0.5">{c.monitor}</div>
                  <div className="flex items-center gap-1 mt-1"><Users size={10} className="text-gray-400"/><span className={`font-body text-[10px] font-semibold ${fill>=1?"text-red-500":fill>=0.7?"text-orange-500":"text-green-600"}`}>{en.length}/{c.maxPlaces}</span></div>
                  <button onClick={e=>{e.stopPropagation();handleDelete(c.id!);}} className="absolute top-1 right-1 w-5 h-5 rounded bg-red-50 text-red-400 hover:bg-red-100 border-none cursor-pointer opacity-0 group-hover:opacity-100 flex items-center justify-center"><Trash2 size={10}/></button>
                </div>);})}
              <button onClick={()=>{setSelectedDate(ds);setShowSimple(true);setShowGenerator(false);}} className="mt-auto py-2 rounded-lg border border-dashed border-gray-200 text-gray-300 hover:border-blue-300 hover:text-blue-400 bg-transparent cursor-pointer font-body text-lg">+</button>
            </div>);})}
        </div>}
      </>}

      {viewMode==="day"&&<>
        <div className="flex items-center justify-between mb-5">
          <button onClick={()=>setDayOffset(d=>d-1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"><ChevronLeft size={16}/>Veille</button>
          <div className="text-center"><div className="font-display text-lg font-bold text-blue-800 capitalize">{currentDay.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div><div className="font-body text-xs text-gray-400">{dayCreneaux.length} créneau{dayCreneaux.length>1?"x":""}</div></div>
          <div className="flex gap-2"><button onClick={()=>setDayOffset(0)} className="font-body text-sm text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer">Auj.</button><button onClick={()=>setDayOffset(d=>d+1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Lendemain<ChevronRight size={16}/></button></div>
        </div>
        {loading?<div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto"/></div>:
        dayCreneaux.length===0?<Card padding="lg" className="text-center"><div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><CalendarDays size={28} className="text-blue-300" /></div><p className="font-body text-sm text-gray-500">Aucun créneau.</p></Card>:
        <div className="flex flex-col gap-3">{dayCreneaux.map(c=>{const en=c.enrolled||[];const fill=c.maxPlaces>0?en.length/c.maxPlaces:0;const col=typeColors[c.activityType]||"#666";const ttc=(c as any).priceTTC||(c.priceHT||0)*(1+(c.tvaTaux||5.5)/100);return(
          <Card key={c.id} padding="md" className="cursor-pointer hover:shadow-lg" hover>
            <div onClick={()=>setSelectedCreneau(c)}>
              <div className="flex items-start justify-between mb-3"><div className="flex items-center gap-4"><div className="w-14 text-center"><div className="font-body text-lg font-bold" style={{color:col}}>{c.startTime}</div><div className="font-body text-[10px] text-gray-400">{c.endTime}</div></div><div style={{borderLeftWidth:3,borderLeftColor:col,paddingLeft:12}}><div className="font-body text-base font-semibold text-blue-800">{c.activityTitle}</div><div className="font-body text-xs text-gray-400">{c.monitor} · {c.maxPlaces} pl.{ttc>0?` · ${ttc.toFixed(0)}€`:""}</div></div></div><div className="flex items-center gap-3"><Badge color={fill>=1?"red":fill>=0.7?"orange":"green"}>{en.length}/{c.maxPlaces}</Badge><button onClick={e=>{e.stopPropagation();handleDelete(c.id!);}} className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer"><Trash2 size={16}/></button></div></div>
              {en.length>0&&<div className="ml-[68px] flex flex-wrap gap-2">{en.map((e:any)=><span key={e.childId} className="font-body text-xs bg-sand text-blue-800 px-3 py-1 rounded-full">🧒 {e.childName} <span className="text-gray-400">({e.familyName})</span></span>)}</div>}
            </div>
          </Card>);})}</div>}
      </>}

      <div className="mt-6 flex gap-4 flex-wrap">
        {[["text-blue-500",(viewMode==="day"?dayCreneaux:creneaux).length,"créneaux"],["text-green-600",(viewMode==="day"?dayCreneaux:creneaux).reduce((s:number,c:any)=>s+(c.enrolled?.length||0),0),"inscrits"],["text-gold-400",(viewMode==="day"?dayCreneaux:creneaux).reduce((s:number,c:any)=>s+c.maxPlaces,0),"places"]].map(([col,val,lab],i)=>(
          <Card key={i} padding="sm" className="flex items-center gap-3"><span className={`font-body text-xl font-bold ${col}`}>{val}</span><span className="font-body text-xs text-gray-400">{lab as string}</span></Card>
        ))}
      </div>

      {selectedCreneau&&<EnrollPanel creneau={selectedCreneau as any} families={families} onClose={()=>{setSelectedCreneau(null);fetchData();}} onEnroll={handleEnroll} onUnenroll={handleUnenroll}/>}
    </div>
  );
}
