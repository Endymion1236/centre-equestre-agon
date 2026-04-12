"use client";
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card } from "@/components/ui";
import { Loader2, Plus, X, Trash2, Calendar } from "lucide-react";
import type { Activity } from "@/types";
import { Creneau, Period, SlotDef, dayNames, dayNamesFull, fmtDate } from "./types";
import ActivityPicker from "./ActivityPicker";

function PeriodGenerator({ activities, onGenerate, onCancel }: { activities: Activity[]; onGenerate: (creneaux: Partial<Creneau>[]) => Promise<void>; onCancel: () => void; }) {
  const [periods, setPeriods] = useState<Period[]>([
    { startDate: "2025-09-24", endDate: "2025-10-18" },
    { startDate: "2025-11-03", endDate: "2025-12-20" },
    { startDate: "2026-01-06", endDate: "2026-02-14" },
    { startDate: "2026-03-03", endDate: "2026-04-11" },
    { startDate: "2026-04-28", endDate: "2026-06-28" },
  ]);
  const [slots, setSlots] = useState<SlotDef[]>([{ activityId: "", day: 2, startTime: "10:00", endTime: "11:00", monitor: "", maxPlaces: 8 }]);
  const [saving, setSaving] = useState(false);
  const [moniteurs, setMoniteurs] = useState<string[]>([]);

  useEffect(() => {
    getDocs(collection(db, "moniteurs")).then(snap => {
      const noms = snap.docs.map(d => (d.data() as any).name).filter(Boolean).sort();
      setMoniteurs(noms);
      // Initialiser le premier slot avec le premier moniteur
      if (noms.length > 0) setSlots(s => s.map(slot => slot.monitor ? slot : { ...slot, monitor: noms[0] }));
    });
  }, []);

  const addPeriod = () => setPeriods([...periods, { startDate: "", endDate: "" }]);
  const removePeriod = (i: number) => setPeriods(periods.filter((_, j) => j !== i));
  const updatePeriod = (i: number, field: string, val: string) => setPeriods(periods.map((p, j) => j === i ? { ...p, [field]: val } : p));
  const addSlot = () => setSlots([...slots, { activityId: "", day: 2, startTime: "10:00", endTime: "11:00", monitor: moniteurs[0] || "", maxPlaces: 8 }]);
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
              // Tarifs multi-jours (stages)
              ...((act as any).price1day ? { price1day: (act as any).price1day } : {}),
              ...((act as any).price2days ? { price2days: (act as any).price2days } : {}),
              ...((act as any).price3days ? { price3days: (act as any).price3days } : {}),
              ...((act as any).price4days ? { price4days: (act as any).price4days } : {}),
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
                <div className="flex-1 min-w-[200px]">
                  <ActivityPicker activities={activities} value={s.activityId}
                    onChange={v => updateSlot(i, "activityId", v)}/>
                </div>
                <select value={s.day} onChange={e => updateSlot(i, "day", parseInt(e.target.value))} className={`${inp} w-28`}>
                  {dayNamesFull.map((d, j) => <option key={j} value={j}>{d}</option>)}
                </select>
                <input type="time" value={s.startTime} onChange={e => updateSlot(i, "startTime", e.target.value)} className={`${inp} w-24`}/>
                <input type="time" value={s.endTime} onChange={e => updateSlot(i, "endTime", e.target.value)} className={`${inp} w-24`}/>
                <div className="flex flex-wrap gap-1 flex-1">
                  {moniteurs.map(m => {
                    const selected = (s.monitor || "").split(",").map(x => x.trim()).filter(Boolean);
                    const isSelected = selected.includes(m);
                    return (
                      <button key={m} type="button" onClick={() => {
                        const curr = (s.monitor || "").split(",").map(x => x.trim()).filter(Boolean);
                        const newList = isSelected ? curr.filter(x => x !== m) : [...curr, m];
                        updateSlot(i, "monitor", newList.join(", "));
                      }}
                        className={`px-2 py-0.5 rounded font-body text-[10px] font-semibold border-none cursor-pointer
                          ${isSelected ? "bg-blue-500 text-white" : "bg-gray-100 text-slate-500"}`}>
                        {isSelected ? "✓" : ""}{m}
                      </button>
                    );
                  })}
                </div>
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

export default PeriodGenerator;
