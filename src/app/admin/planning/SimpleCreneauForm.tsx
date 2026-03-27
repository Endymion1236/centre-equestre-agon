"use client";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui";
import { Check, Loader2, X } from "lucide-react";
import type { Activity } from "@/types";
import { Creneau, fmtDate } from "./types";

function SimpleCreneauForm({ activities, onSave, onCancel, defaultDate }: {
  activities: Activity[];
  onSave: (c: Partial<Creneau>[]) => Promise<void>;
  onCancel: () => void;
  defaultDate?: string;
}) {
  const [actId, setActId] = useState("");
  const [st, setSt] = useState("10:00");
  const [et, setEt] = useState("12:00");
  const [mon, setMon] = useState("Emmeline");
  const [mp, setMp] = useState(8);
  const [date, setDate] = useState(defaultDate || fmtDate(new Date()));
  const [saving, setSaving] = useState(false);
  const [multiDay, setMultiDay] = useState(false);
  const [nbDays, setNbDays] = useState(5);
  const [skipWeekend, setSkipWeekend] = useState(true);
  const [customHours, setCustomHours] = useState<Record<string, { st: string; et: string }>>({});

  const act = activities.find(a => a.id === actId);
  useEffect(() => { if (act) setMp(act.maxPlaces || 8); }, [actId]);

  const generateDates = (startDate = date, n = nbDays, skip = skipWeekend): string[] => {
    const dates: string[] = [];
    const current = new Date(startDate);
    while (dates.length < n) {
      const day = current.getDay();
      if (!skip || (day !== 0 && day !== 6)) dates.push(fmtDate(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const previewDates = multiDay ? generateDates() : [];

  useEffect(() => {
    if (!multiDay) return;
    const dates = generateDates();
    setCustomHours(prev => {
      const next: Record<string, { st: string; et: string }> = {};
      dates.forEach(d => { next[d] = prev[d] || { st, et }; });
      return next;
    });
  }, [date, nbDays, skipWeekend, multiDay]);

  const updateGlobalHours = (newSt: string, newEt: string) => {
    setSt(newSt); setEt(newEt);
    if (multiDay) {
      setCustomHours(prev => {
        const next = { ...prev };
        generateDates().forEach(d => {
          if (!prev[d] || (prev[d].st === st && prev[d].et === et)) {
            next[d] = { st: newSt, et: newEt };
          }
        });
        return next;
      });
    }
  };

  const sub = async () => {
    if (!actId || !act) return;
    setSaving(true);
    const ttc = (act as any).priceTTC || (act.priceHT || 0) * (1 + (act.tvaTaux || 5.5) / 100);
    const dates = multiDay ? generateDates() : [date];
    const creneaux = dates.map(d => {
      const hours = (multiDay && customHours[d]) ? customHours[d] : { st, et };
      return {
        activityId: actId, activityTitle: act.title, activityType: act.type, date: d,
        startTime: hours.st, endTime: hours.et,
        monitor: mon, maxPlaces: mp, enrolledCount: 0, enrolled: [],
        status: "planned",
        priceHT: ttc / (1 + (act.tvaTaux || 5.5) / 100),
        priceTTC: ttc, tvaTaux: act.tvaTaux || 5.5,
        ...((act as any).price1day  ? { price1day:  (act as any).price1day  } : {}),
        ...((act as any).price2days ? { price2days: (act as any).price2days } : {}),
        ...((act as any).price3days ? { price3days: (act as any).price3days } : {}),
        ...((act as any).price4days ? { price4days: (act as any).price4days } : {}),
      };
    });
    await onSave(creneaux);
    setSaving(false);
  };

  const inp = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  return (
    <Card padding="md" className="mb-6 border-blue-500/15">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-body text-base font-semibold text-blue-800">Créer des créneaux</h3>
        <button onClick={onCancel} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20}/></button>
      </div>
      <div className="flex flex-col gap-3">
        <select value={actId} onChange={e => setActId(e.target.value)} className={inp}>
          <option value="">Activité...</option>
          {activities.filter(a => a.active !== false).map((a, i) => (
            <option key={`${a.id}-${i}`} value={a.id}>{a.title}</option>
          ))}
        </select>

        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={multiDay} onChange={e => setMultiDay(e.target.checked)} className="w-4 h-4 accent-blue-500" />
            <span className="font-body text-sm text-slate-600">Stage multi-jours</span>
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
                <span className="font-body text-xs text-slate-500">Sauter week-end</span>
              </label>
            </>
          )}
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="font-body text-[10px] text-slate-500 block mb-1">{multiDay ? "Date de début" : "Date"}</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp}/>
          </div>
          <div className="w-24">
            <label className="font-body text-[10px] text-slate-500 block mb-1">Début{multiDay ? " (défaut)" : ""}</label>
            <input type="time" value={st} onChange={e => updateGlobalHours(e.target.value, et)} className={inp}/>
          </div>
          <div className="w-24">
            <label className="font-body text-[10px] text-slate-500 block mb-1">Fin{multiDay ? " (défaut)" : ""}</label>
            <input type="time" value={et} onChange={e => updateGlobalHours(st, e.target.value)} className={inp}/>
          </div>
        </div>

        <div className="flex gap-2">
          <select value={mon} onChange={e => setMon(e.target.value)} className={`${inp} flex-1`}>
            <option>Emmeline</option><option>Nicolas</option><option>Sophie</option><option>Julien</option>
          </select>
          <input type="number" value={mp} onChange={e => setMp(parseInt(e.target.value))} className={`${inp} w-20`} placeholder="Places"/>
        </div>

        {multiDay && previewDates.length > 0 && (
          <div className="bg-blue-50 rounded-xl p-3 flex flex-col gap-2">
            <div className="font-body text-xs font-semibold text-blue-800 mb-0.5">
              Horaires par jour — modifiez si besoin :
            </div>
            {previewDates.map(d => {
              const dayLabel = new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
              const hours = customHours[d] || { st, et };
              const isCustom = hours.st !== st || hours.et !== et;
              return (
                <div key={d} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isCustom ? "bg-orange-50 border border-orange-100" : "bg-white border border-blue-100"}`}>
                  <span className={`font-body text-xs flex-1 capitalize ${isCustom ? "font-semibold text-orange-700" : "text-blue-700"}`}>
                    {dayLabel}
                    {isCustom && <span className="ml-1.5 text-[9px] bg-orange-200 text-orange-700 px-1.5 py-0.5 rounded">perso</span>}
                  </span>
                  <input type="time" value={hours.st}
                    onChange={e => setCustomHours(prev => ({ ...prev, [d]: { ...(prev[d]||{st,et}), st: e.target.value } }))}
                    className="w-20 px-2 py-1 rounded-lg border border-blue-200 font-body text-xs bg-white focus:outline-none focus:border-blue-500" />
                  <span className="font-body text-xs text-slate-400">→</span>
                  <input type="time" value={hours.et}
                    onChange={e => setCustomHours(prev => ({ ...prev, [d]: { ...(prev[d]||{st,et}), et: e.target.value } }))}
                    className="w-20 px-2 py-1 rounded-lg border border-blue-200 font-body text-xs bg-white focus:outline-none focus:border-blue-500" />
                  {isCustom && (
                    <button onClick={() => setCustomHours(prev => ({ ...prev, [d]: { st, et } }))}
                      title="Réinitialiser" className="text-slate-400 hover:text-red-400 bg-transparent border-none cursor-pointer text-sm">↺</button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <button onClick={sub} disabled={!actId || saving}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg font-body text-sm font-semibold border-none cursor-pointer ${!actId || saving ? "bg-gray-200 text-slate-400" : "bg-blue-500 text-white hover:bg-blue-400"}`}>
          {saving ? <Loader2 size={16} className="animate-spin"/> : <Check size={16}/>}
          {multiDay ? `Créer ${previewDates.length} créneaux` : "Créer"}
        </button>
      </div>
    </Card>
  );
}

export default SimpleCreneauForm;
