"use client";
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Plus, ChevronLeft, ChevronRight, X, Check, Loader2, Trash2, Users, UserPlus } from "lucide-react";
import type { Activity, Family } from "@/types";

interface Creneau { id?: string; activityId: string; activityTitle: string; activityType: string; date: string; startTime: string; endTime: string; monitor: string; maxPlaces: number; enrolledCount: number; enrolled: any[]; status: string; priceHT?: number; tvaTaux?: number; }
interface EnrolledChild { childId: string; childName: string; familyId: string; familyName: string; enrolledAt: string; }

function getWeekDates(offset: number): Date[] { const t = new Date(); const m = new Date(t); m.setDate(t.getDate() - ((t.getDay() + 6) % 7) + offset * 7); return Array.from({ length: 7 }, (_, i) => { const d = new Date(m); d.setDate(m.getDate() + i); return d; }); }
function fmtDate(d: Date) { return d.toISOString().split("T")[0]; }
function fmtDateFR(d: Date) { return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }); }
function fmtMonthFR(d: Date) { return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); }
const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const typeColors: Record<string, string> = { stage: "#27ae60", balade: "#e67e22", cours: "#2050A0", competition: "#7c3aed", anniversaire: "#D63031", ponyride: "#16a085" };

function EnrollPanel({ creneau, families, onClose, onEnroll, onUnenroll }: { creneau: Creneau & { id: string }; families: (Family & { firestoreId: string })[]; onClose: () => void; onEnroll: (id: string, c: EnrolledChild) => Promise<void>; onUnenroll: (id: string, cid: string) => Promise<void>; }) {
  const [selFam, setSelFam] = useState(""); const [selChild, setSelChild] = useState(""); const [enrolling, setEnrolling] = useState(false);
  const fam = families.find(f => f.firestoreId === selFam); const children = fam?.children || []; const enrolled = creneau.enrolled || []; const enrolledIds = enrolled.map(e => e.childId);
  const available = children.filter((c: any) => !enrolledIds.includes(c.id)); const spots = creneau.maxPlaces - enrolled.length; const color = typeColors[creneau.activityType] || "#666";
  const priceTTC = (creneau.priceHT || 0) * (1 + (creneau.tvaTaux || 5.5) / 100);
  const handleEnroll = async () => { if (!selChild || !fam) return; setEnrolling(true); const child = children.find((c: any) => c.id === selChild); await onEnroll(creneau.id!, { childId: selChild, childName: (child as any)?.firstName || "—", familyId: fam.firestoreId, familyName: fam.parentName || "—", enrolledAt: new Date().toISOString() }); setSelChild(""); setEnrolling(false); };
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-blue-500/8" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
          <div className="flex justify-between items-start"><div><div className="font-body text-sm font-semibold" style={{ color }}>{creneau.startTime}–{creneau.endTime}</div><h2 className="font-display text-lg font-bold text-blue-800">{creneau.activityTitle}</h2><div className="font-body text-xs text-gray-400 mt-1">{new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {creneau.monitor}{priceTTC > 0 ? ` · ${priceTTC.toFixed(2)}€` : ""}</div></div><button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer"><X size={20} /></button></div>
          <div className="flex items-center gap-3 mt-3"><Badge color={spots > 2 ? "green" : spots > 0 ? "orange" : "red"}>{spots > 0 ? `${spots} place${spots > 1 ? "s" : ""} restante${spots > 1 ? "s" : ""}` : "COMPLET"}</Badge><span className="font-body text-xs text-gray-400">{enrolled.length}/{creneau.maxPlaces}</span></div>
        </div>
        <div className="p-5">
          <h3 className="font-body text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2"><Users size={16} /> Inscrits ({enrolled.length})</h3>
          {enrolled.length === 0 ? <p className="font-body text-sm text-gray-400 italic mb-4">Aucun inscrit</p> : <div className="flex flex-col gap-2 mb-4">{enrolled.map((e: any) => (<div key={e.childId} className="flex items-center justify-between bg-sand rounded-lg px-4 py-2.5"><div className="flex items-center gap-3"><span className="text-lg">🧒</span><div><div className="font-body text-sm font-semibold text-blue-800">{e.childName}</div><div className="font-body text-xs text-gray-400">{e.familyName}</div></div></div><button onClick={() => onUnenroll(creneau.id!, e.childId)} className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer"><Trash2 size={14} /></button></div>))}</div>}
          {spots > 0 && (<div className="border-t border-blue-500/8 pt-4"><h3 className="font-body text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2"><UserPlus size={16} /> Inscrire</h3><div className="flex flex-col gap-3"><select value={selFam} onChange={e => { setSelFam(e.target.value); setSelChild(""); }} className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"><option value="">Famille...</option>{families.map(f => <option key={f.firestoreId} value={f.firestoreId}>{f.parentName}</option>)}</select>
          {fam && available.length > 0 && <div className="flex flex-wrap gap-2">{available.map((c: any) => <button key={c.id} onClick={() => setSelChild(c.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-body text-sm cursor-pointer ${selChild === c.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>🧒 {c.firstName}</button>)}</div>}
          {fam && available.length === 0 && <p className="font-body text-xs text-orange-500">Tous inscrits.</p>}
          <button onClick={handleEnroll} disabled={!selChild || enrolling} className={`w-full py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${!selChild || enrolling ? "bg-gray-200 text-gray-400" : "bg-green-600 text-white hover:bg-green-500"}`}>{enrolling ? "..." : "Inscrire"}</button></div></div>)}
        </div>
      </div>
    </div>
  );
}

function CreneauForm({ activities, onSave, onCancel, defaultDate }: { activities: Activity[]; onSave: (c: Partial<Creneau>[]) => Promise<void>; onCancel: () => void; defaultDate?: string; }) {
  const [actId, setActId] = useState(""); const [st, setSt] = useState("10:00"); const [et, setEt] = useState("12:00"); const [mon, setMon] = useState("Emmeline"); const [mp, setMp] = useState(8);
  const [rec, setRec] = useState<{ mode: "single"|"weekly"|"daily_week"; startDate: string; endDate: string; daysOfWeek: number[] }>({ mode: "single", startDate: defaultDate || fmtDate(new Date()), endDate: "", daysOfWeek: [] });
  const [saving, setSaving] = useState(false);
  const act = activities.find(a => a.id === actId);
  useEffect(() => { if (act) setMp(act.maxPlaces || 8); }, [actId]);
  const dates = useMemo(() => { if (rec.mode === "single") return [rec.startDate]; if (!rec.endDate) return []; const r: string[] = []; const c = new Date(rec.startDate); const e = new Date(rec.endDate); while (c <= e) { const dow = (c.getDay() + 6) % 7; if (rec.mode === "daily_week" && dow < 5) r.push(fmtDate(c)); else if (rec.mode === "weekly" && rec.daysOfWeek.includes(dow)) r.push(fmtDate(c)); c.setDate(c.getDate() + 1); } return r; }, [rec]);
  const sub = async () => { if (!actId || !act) return; setSaving(true); await onSave(dates.map(d => ({ activityId: actId, activityTitle: act.title, activityType: act.type, date: d, startTime: st, endTime: et, monitor: mon, maxPlaces: mp, enrolledCount: 0, enrolled: [], status: "planned", priceHT: act.priceHT || 0, tvaTaux: act.tvaTaux || 5.5 }))); setSaving(false); };
  const inp = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";
  return (
    <Card padding="md" className="mb-6 border-blue-500/15">
      <div className="flex justify-between items-center mb-4"><h3 className="font-body text-base font-semibold text-blue-800">Nouveau créneau</h3><button onClick={onCancel} className="text-gray-400 bg-transparent border-none cursor-pointer"><X size={20} /></button></div>
      <div className="flex flex-col gap-4">
        <div><label className="font-body text-xs font-semibold text-blue-800 block mb-1">Activité *</label><select value={actId} onChange={e => setActId(e.target.value)} className={inp}><option value="">Choisir...</option>{activities.filter(a => a.active !== false).map(a => <option key={a.id} value={a.id}>{a.title} ({a.type})</option>)}</select></div>
        <div className="flex gap-3 flex-wrap"><div className="flex-1 min-w-[100px]"><label className="font-body text-xs font-semibold text-blue-800 block mb-1">Début</label><input type="time" value={st} onChange={e => setSt(e.target.value)} className={inp} /></div><div className="flex-1 min-w-[100px]"><label className="font-body text-xs font-semibold text-blue-800 block mb-1">Fin</label><input type="time" value={et} onChange={e => setEt(e.target.value)} className={inp} /></div><div className="flex-1 min-w-[120px]"><label className="font-body text-xs font-semibold text-blue-800 block mb-1">Moniteur</label><select value={mon} onChange={e => setMon(e.target.value)} className={inp}><option>Emmeline</option><option>Nicolas</option></select></div><div className="flex-1 min-w-[80px]"><label className="font-body text-xs font-semibold text-blue-800 block mb-1">Places</label><input type="number" value={mp} onChange={e => setMp(parseInt(e.target.value))} className={inp} /></div></div>
        <div><label className="font-body text-xs font-semibold text-blue-800 block mb-2">Récurrence</label><div className="flex flex-wrap gap-2 mb-3">{([["single","Date unique"],["daily_week","Lun–Ven"],["weekly","Jours spécifiques"]] as const).map(([id,l]) => <button key={id} onClick={() => setRec(r => ({...r, mode: id}))} className={`px-4 py-2 rounded-lg border text-sm font-medium cursor-pointer font-body ${rec.mode === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>{l}</button>)}</div>
        <div className="flex gap-3"><div className="flex-1"><label className="font-body text-xs font-semibold text-gray-500 block mb-1">{rec.mode === "single" ? "Date" : "Du"}</label><input type="date" value={rec.startDate} onChange={e => setRec(r => ({...r, startDate: e.target.value}))} className={inp} /></div>{rec.mode !== "single" && <div className="flex-1"><label className="font-body text-xs font-semibold text-gray-500 block mb-1">Au</label><input type="date" value={rec.endDate} onChange={e => setRec(r => ({...r, endDate: e.target.value}))} className={inp} /></div>}</div>
        {rec.mode === "weekly" && <div className="mt-2 flex gap-2">{dayNames.map((d,i) => <button key={d} onClick={() => setRec(r => ({...r, daysOfWeek: r.daysOfWeek.includes(i) ? r.daysOfWeek.filter(x => x !== i) : [...r.daysOfWeek, i]}))} className={`w-10 h-10 rounded-lg border text-xs font-semibold cursor-pointer font-body ${rec.daysOfWeek.includes(i) ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>{d}</button>)}</div>}</div>
        {dates.length > 0 && <div className="bg-blue-50 rounded-lg p-3"><div className="font-body text-xs font-semibold text-blue-800 mb-1">{dates.length} créneau{dates.length > 1 ? "x" : ""}</div><div className="flex flex-wrap gap-1">{dates.slice(0,14).map(d => <span key={d} className="font-body text-xs text-blue-500 bg-white px-2 py-0.5 rounded">{new Date(d).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"})}</span>)}{dates.length > 14 && <span className="font-body text-xs text-gray-400">+{dates.length-14}</span>}</div></div>}
        <button onClick={sub} disabled={!actId || dates.length === 0 || saving} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-body text-sm font-semibold border-none cursor-pointer ${!actId || dates.length === 0 || saving ? "bg-gray-200 text-gray-400" : "bg-blue-500 text-white hover:bg-blue-400"}`}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}{saving ? "..." : `Créer ${dates.length}`}</button>
      </div>
    </Card>
  );
}

export default function PlanningPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [dayOffset, setDayOffset] = useState(0);
  const [viewMode, setViewMode] = useState<"week"|"day">("week");
  const [creneaux, setCreneaux] = useState<(Creneau & { id: string })[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string|undefined>();
  const [selectedCreneau, setSelectedCreneau] = useState<(Creneau & { id: string })|null>(null);

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

  const handleCreate = async (nc: Partial<Creneau>[]) => { for (const c of nc) await addDoc(collection(db, "creneaux"), { ...c, createdAt: serverTimestamp() }); setShowForm(false); fetchData(); };
  const handleDelete = async (id: string) => { if (!confirm("Supprimer ?")) return; await deleteDoc(doc(db, "creneaux", id)); fetchData(); };
  const [dupWeeks, setDupWeeks] = useState(1);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const handleDuplicateWeek = async () => {
    if (creneaux.length === 0) return;
    setDuplicating(true);
    for (let w = 1; w <= dupWeeks; w++) {
      for (const c of creneaux) {
        const origDate = new Date(c.date);
        origDate.setDate(origDate.getDate() + 7 * w);
        const newDate = fmtDate(origDate);
        await addDoc(collection(db, "creneaux"), {
          activityId: c.activityId, activityTitle: c.activityTitle, activityType: c.activityType,
          date: newDate, startTime: c.startTime, endTime: c.endTime, monitor: c.monitor,
          maxPlaces: c.maxPlaces, enrolledCount: 0, enrolled: [], status: "planned",
          priceHT: c.priceHT || 0, tvaTaux: c.tvaTaux || 5.5,
          createdAt: serverTimestamp(),
        });
      }
    }
    setDuplicating(false);
    setShowDuplicate(false);
    alert(`${creneaux.length * dupWeeks} créneaux dupliqués sur ${dupWeeks} semaine(s) !`);
    fetchData();
  };
  const handleEnroll = async (cid: string, child: EnrolledChild) => { const c = creneaux.find(x => x.id === cid); if (!c) return; const en = [...(c.enrolled || []), child]; await updateDoc(doc(db, "creneaux", cid), { enrolled: en, enrolledCount: en.length }); fetchData(); };
  const handleUnenroll = async (cid: string, childId: string) => { const c = creneaux.find(x => x.id === cid); if (!c) return; const en = (c.enrolled || []).filter(e => e.childId !== childId); await updateDoc(doc(db, "creneaux", cid), { enrolled: en, enrolledCount: en.length }); fetchData(); };
  const isToday = (d: Date) => fmtDate(d) === fmtDate(new Date());
  const dayCreneaux = creneaux.filter(c => c.date === fmtDate(currentDay)).sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-display text-2xl font-bold text-blue-800">Planning</h1>
        <div className="flex gap-2">
          <div className="flex bg-sand rounded-lg p-0.5">{(["week","day"] as const).map(v => <button key={v} onClick={() => setViewMode(v)} className={`px-4 py-2 rounded-md font-body text-xs font-semibold cursor-pointer border-none ${viewMode === v ? "bg-white text-blue-500 shadow-sm" : "text-gray-400 bg-transparent"}`}>{v === "week" ? "Semaine" : "Jour"}</button>)}</div>
          <button onClick={() => { setShowForm(true); setSelectedDate(viewMode === "day" ? fmtDate(currentDay) : undefined); }} className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400"><Plus size={16} /> Nouveau</button>
          {viewMode === "week" && creneaux.length > 0 && <button onClick={() => setShowDuplicate(!showDuplicate)} className="font-body text-sm font-semibold text-blue-500 bg-blue-50 px-4 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-100">📋 Dupliquer</button>}
        </div>
      </div>

      {showForm && <CreneauForm activities={activities} onSave={handleCreate} onCancel={() => setShowForm(false)} defaultDate={selectedDate} />}

      {showDuplicate && (
        <Card padding="md" className="mb-6 border-gold-400/20 bg-gold-50">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-body text-base font-semibold text-blue-800">📋 Dupliquer cette semaine</h3>
            <button onClick={() => setShowDuplicate(false)} className="text-gray-400 bg-transparent border-none cursor-pointer"><X size={18} /></button>
          </div>
          <p className="font-body text-sm text-gray-500 mb-3">
            Copie les {creneaux.length} créneau{creneaux.length > 1 ? "x" : ""} de cette semaine sur les semaines suivantes (sans les inscriptions).
            Parfait pour créer 8 semaines de stages d&apos;été en un clic !
          </p>
          <div className="flex items-center gap-4 mb-4">
            <label className="font-body text-sm text-blue-800 font-semibold">Nombre de semaines à dupliquer :</label>
            <input type="number" min={1} max={20} value={dupWeeks} onChange={(e) => setDupWeeks(parseInt(e.target.value) || 1)}
              className="w-20 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-white text-center focus:border-blue-500 focus:outline-none" />
          </div>
          <div className="bg-white rounded-lg p-3 mb-4 font-body text-xs text-gray-500">
            → Cela créera <strong className="text-blue-800">{creneaux.length * dupWeeks} créneaux</strong> sur les semaines du{" "}
            {Array.from({ length: Math.min(dupWeeks, 4) }, (_, i) => {
              const d = new Date(weekDates[0]);
              d.setDate(d.getDate() + 7 * (i + 1));
              return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
            }).join(", ")}
            {dupWeeks > 4 ? `, ... (+${dupWeeks - 4} semaines)` : ""}
          </div>
          <button onClick={handleDuplicateWeek} disabled={duplicating}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-body text-sm font-semibold border-none cursor-pointer ${duplicating ? "bg-gray-200 text-gray-400" : "bg-gold-400 text-blue-800 hover:bg-gold-300"}`}>
            {duplicating ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {duplicating ? "Duplication..." : `Dupliquer ${creneaux.length * dupWeeks} créneaux`}
          </button>
        </Card>
      )}

      {viewMode === "week" && <>
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => setWeekOffset(w => w-1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"><ChevronLeft size={16} /> Préc.</button>
          <div className="text-center"><div className="font-display text-lg font-bold text-blue-800 capitalize">{fmtMonthFR(weekDates[0])}</div><div className="font-body text-xs text-gray-400">Du {weekDates[0].toLocaleDateString("fr-FR",{day:"numeric",month:"short"})} au {weekDates[6].toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}</div></div>
          <div className="flex gap-2"><button onClick={() => setWeekOffset(0)} className="font-body text-sm text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer">Auj.</button><button onClick={() => setWeekOffset(w => w+1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Suiv. <ChevronRight size={16} /></button></div>
        </div>
        <div className="flex flex-wrap gap-4 mb-4">{[["Stages","stage"],["Cours","cours"],["Balades","balade"],["Compét.","competition"]].map(([l,t]) => <span key={t} className="flex items-center gap-1.5 font-body text-xs text-gray-400"><span className="w-2.5 h-2.5 rounded-sm" style={{background:typeColors[t]}} />{l}</span>)}<span className="font-body text-xs text-gray-400 ml-auto">Cliquez un jour pour la vue détaillée</span></div>
        {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
        <div className="grid grid-cols-7 gap-1.5">
          {weekDates.map((d,i) => <div key={i} onClick={() => { setViewMode("day"); setDayOffset(Math.round((d.getTime() - new Date().getTime()) / 86400000)); }} className={`text-center py-2 rounded-lg font-body text-xs font-semibold cursor-pointer hover:ring-2 hover:ring-blue-300 ${isToday(d) ? "bg-blue-500 text-white" : "bg-sand text-gray-500"}`}>{fmtDateFR(d)}</div>)}
          {weekDates.map((d,i) => { const ds = fmtDate(d); const dc = creneaux.filter(c => c.date === ds).sort((a,b) => a.startTime.localeCompare(b.startTime)); return (
            <div key={`c${i}`} className="min-h-[140px] flex flex-col gap-1">
              {dc.map(c => { const en = c.enrolled||[]; const fill = c.maxPlaces > 0 ? en.length/c.maxPlaces : 0; const col = typeColors[c.activityType]||"#666"; return (
                <div key={c.id} onClick={() => setSelectedCreneau(c)} className="bg-white rounded-lg p-2 border border-blue-500/8 group relative hover:shadow-md cursor-pointer" style={{borderLeftWidth:3,borderLeftColor:col}}>
                  <div className="font-body text-[11px] font-semibold" style={{color:col}}>{c.startTime}–{c.endTime}</div>
                  <div className="font-body text-xs font-semibold text-blue-800 leading-tight mt-0.5">{c.activityTitle}</div>
                  <div className="font-body text-[10px] text-gray-400 mt-0.5">{c.monitor}</div>
                  <div className="flex items-center gap-1 mt-1"><Users size={10} className="text-gray-400" /><span className={`font-body text-[10px] font-semibold ${fill>=1?"text-red-500":fill>=0.7?"text-orange-500":"text-green-600"}`}>{en.length}/{c.maxPlaces}</span></div>
                  <div className="mt-1 h-1 rounded-full bg-gray-100"><div className="h-1 rounded-full" style={{width:`${Math.min(fill*100,100)}%`,background:fill>=1?"#D63031":fill>=0.7?"#e67e22":"#27ae60"}} /></div>
                  <button onClick={e => { e.stopPropagation(); handleDelete(c.id!); }} className="absolute top-1 right-1 w-5 h-5 rounded bg-red-50 text-red-400 hover:bg-red-100 border-none cursor-pointer opacity-0 group-hover:opacity-100 flex items-center justify-center"><Trash2 size={10} /></button>
                </div>); })}
              <button onClick={() => { setSelectedDate(ds); setShowForm(true); }} className="mt-auto py-2 rounded-lg border border-dashed border-gray-200 text-gray-300 hover:border-blue-300 hover:text-blue-400 bg-transparent cursor-pointer font-body text-lg">+</button>
            </div>); })}
        </div>}
      </>}

      {viewMode === "day" && <>
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => setDayOffset(d => d-1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"><ChevronLeft size={16} /> Veille</button>
          <div className="text-center"><div className="font-display text-lg font-bold text-blue-800 capitalize">{currentDay.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div><div className="font-body text-xs text-gray-400">{dayCreneaux.length} créneau{dayCreneaux.length>1?"x":""}</div></div>
          <div className="flex gap-2"><button onClick={() => setDayOffset(0)} className="font-body text-sm text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer">Auj.</button><button onClick={() => setDayOffset(d => d+1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Lendemain <ChevronRight size={16} /></button></div>
        </div>
        {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
        dayCreneaux.length === 0 ? <Card padding="lg" className="text-center"><span className="text-4xl block mb-3">📅</span><p className="font-body text-sm text-gray-500 mb-3">Aucun créneau ce jour.</p><button onClick={() => { setSelectedDate(fmtDate(currentDay)); setShowForm(true); }} className="font-body text-sm font-semibold text-blue-500 bg-transparent border-none cursor-pointer">+ Créer un créneau</button></Card> :
        <div className="flex flex-col gap-3">{dayCreneaux.map(c => { const en = c.enrolled||[]; const fill = c.maxPlaces > 0 ? en.length/c.maxPlaces : 0; const col = typeColors[c.activityType]||"#666"; const ttc = (c.priceHT||0)*(1+(c.tvaTaux||5.5)/100); return (
          <Card key={c.id} padding="md" className="cursor-pointer hover:shadow-lg" hover>
            <div onClick={() => setSelectedCreneau(c)}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-4">
                  <div className="w-14 text-center"><div className="font-body text-lg font-bold" style={{color:col}}>{c.startTime}</div><div className="font-body text-[10px] text-gray-400">{c.endTime}</div></div>
                  <div style={{borderLeftWidth:3,borderLeftColor:col,paddingLeft:12}}><div className="font-body text-base font-semibold text-blue-800">{c.activityTitle}</div><div className="font-body text-xs text-gray-400">{c.monitor} · {c.maxPlaces} places{ttc>0?` · ${ttc.toFixed(0)}€`:""}</div></div>
                </div>
                <div className="flex items-center gap-3"><Badge color={fill>=1?"red":fill>=0.7?"orange":"green"}>{en.length}/{c.maxPlaces}</Badge><button onClick={e => { e.stopPropagation(); handleDelete(c.id!); }} className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer"><Trash2 size={16} /></button></div>
              </div>
              {en.length > 0 && <div className="ml-[68px] flex flex-wrap gap-2">{en.map((e: any) => <span key={e.childId} className="font-body text-xs bg-sand text-blue-800 px-3 py-1 rounded-full">🧒 {e.childName} <span className="text-gray-400">({e.familyName})</span></span>)}</div>}
              <div className="ml-[68px] mt-2 h-1.5 rounded-full bg-gray-100 max-w-xs"><div className="h-1.5 rounded-full" style={{width:`${Math.min(fill*100,100)}%`,background:fill>=1?"#D63031":fill>=0.7?"#e67e22":"#27ae60"}} /></div>
            </div>
          </Card>); })}</div>}
      </>}

      <div className="mt-6 flex gap-4 flex-wrap">
        {[["text-blue-500",(viewMode==="day"?dayCreneaux:creneaux).length,"créneaux"],["text-green-600",(viewMode==="day"?dayCreneaux:creneaux).reduce((s,c) => s+(c.enrolled?.length||0),0),"inscrits"],["text-gold-400",(viewMode==="day"?dayCreneaux:creneaux).reduce((s,c) => s+c.maxPlaces,0),"places"]].map(([col,val,lab],i) => (
          <Card key={i} padding="sm" className="flex items-center gap-3"><span className={`font-body text-xl font-bold ${col}`}>{val}</span><span className="font-body text-xs text-gray-400">{lab as string}</span></Card>
        ))}
      </div>

      {selectedCreneau && <EnrollPanel creneau={selectedCreneau as any} families={families} onClose={() => { setSelectedCreneau(null); fetchData(); }} onEnroll={handleEnroll} onUnenroll={handleUnenroll} />}
    </div>
  );
}
