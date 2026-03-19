"use client";

import { useState, useEffect, useMemo } from "react";
import {
  collection, getDocs, addDoc, deleteDoc, doc, query, where, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Plus, ChevronLeft, ChevronRight, X, Check, Loader2, Trash2, Users } from "lucide-react";
import type { Activity } from "@/types";

interface Creneau {
  id?: string;
  activityId: string;
  activityTitle: string;
  activityType: string;
  date: string;
  startTime: string;
  endTime: string;
  monitor: string;
  maxPlaces: number;
  enrolledCount: number;
  status: "planned" | "closed";
}

interface RecurrenceConfig {
  mode: "single" | "weekly" | "daily_week";
  startDate: string;
  endDate: string;
  daysOfWeek: number[];
}

function getWeekDates(offset: number): Date[] {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function fmtDate(d: Date): string { return d.toISOString().split("T")[0]; }
function fmtDateFR(d: Date): string { return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }); }
function fmtMonthFR(d: Date): string { return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); }

const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const typeColors: Record<string, string> = { stage: "#27ae60", balade: "#e67e22", cours: "#2050A0", competition: "#7c3aed", anniversaire: "#D63031", ponyride: "#16a085" };

function CreneauForm({ activities, onSave, onCancel, defaultDate }: {
  activities: Activity[]; onSave: (c: Partial<Creneau>[]) => Promise<void>; onCancel: () => void; defaultDate?: string;
}) {
  const [activityId, setActivityId] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("12:00");
  const [monitor, setMonitor] = useState("Emmeline");
  const [maxPlaces, setMaxPlaces] = useState(8);
  const [rec, setRec] = useState<RecurrenceConfig>({ mode: "single", startDate: defaultDate || fmtDate(new Date()), endDate: "", daysOfWeek: [] });
  const [saving, setSaving] = useState(false);

  const selActivity = activities.find((a) => a.id === activityId);
  useEffect(() => { if (selActivity) setMaxPlaces(selActivity.maxPlaces || 8); }, [activityId]);

  const dates = useMemo(() => {
    if (rec.mode === "single") return [rec.startDate];
    if (!rec.endDate) return [];
    const result: string[] = [];
    const cur = new Date(rec.startDate);
    const end = new Date(rec.endDate);
    while (cur <= end) {
      const dow = (cur.getDay() + 6) % 7;
      if (rec.mode === "daily_week" && dow < 5) result.push(fmtDate(cur));
      else if (rec.mode === "weekly" && rec.daysOfWeek.includes(dow)) result.push(fmtDate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }, [rec]);

  const handleSubmit = async () => {
    if (!activityId || !selActivity) return;
    setSaving(true);
    await onSave(dates.map((date) => ({
      activityId, activityTitle: selActivity.title, activityType: selActivity.type,
      date, startTime, endTime, monitor, maxPlaces, enrolledCount: 0, status: "planned" as const,
    })));
    setSaving(false);
  };

  const inputCls = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  return (
    <Card padding="md" className="mb-6 border-blue-500/15">
      <div className="flex justify-between items-center mb-5">
        <h3 className="font-body text-base font-semibold text-blue-800">Nouveau créneau</h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer"><X size={20} /></button>
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Activité *</label>
          <select value={activityId} onChange={(e) => setActivityId(e.target.value)} className={inputCls}>
            <option value="">Choisir une activité...</option>
            {activities.filter((a) => a.active !== false).map((a) => (
              <option key={a.id} value={a.id}>{a.title} ({a.type})</option>
            ))}
          </select>
        </div>
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[100px]"><label className="font-body text-xs font-semibold text-blue-800 block mb-1">Début</label><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} /></div>
          <div className="flex-1 min-w-[100px]"><label className="font-body text-xs font-semibold text-blue-800 block mb-1">Fin</label><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} /></div>
          <div className="flex-1 min-w-[120px]"><label className="font-body text-xs font-semibold text-blue-800 block mb-1">Moniteur</label>
            <select value={monitor} onChange={(e) => setMonitor(e.target.value)} className={inputCls}><option value="Emmeline">Emmeline</option><option value="Nicolas">Nicolas</option></select></div>
          <div className="flex-1 min-w-[80px]"><label className="font-body text-xs font-semibold text-blue-800 block mb-1">Places</label><input type="number" value={maxPlaces} onChange={(e) => setMaxPlaces(parseInt(e.target.value))} className={inputCls} /></div>
        </div>
        <div>
          <label className="font-body text-xs font-semibold text-blue-800 block mb-2">Récurrence</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {([["single", "Date unique"], ["daily_week", "Lun–Ven (stage)"], ["weekly", "Jours spécifiques"]] as const).map(([id, label]) => (
              <button key={id} onClick={() => setRec((r) => ({ ...r, mode: id }))}
                className={`px-4 py-2 rounded-lg border text-sm font-medium cursor-pointer transition-all font-body ${rec.mode === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>{label}</button>
            ))}
          </div>
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[140px]"><label className="font-body text-xs font-semibold text-gray-500 block mb-1">{rec.mode === "single" ? "Date" : "Date de début"}</label>
              <input type="date" value={rec.startDate} onChange={(e) => setRec((r) => ({ ...r, startDate: e.target.value }))} className={inputCls} /></div>
            {rec.mode !== "single" && <div className="flex-1 min-w-[140px]"><label className="font-body text-xs font-semibold text-gray-500 block mb-1">Date de fin</label>
              <input type="date" value={rec.endDate} onChange={(e) => setRec((r) => ({ ...r, endDate: e.target.value }))} className={inputCls} /></div>}
          </div>
          {rec.mode === "weekly" && (
            <div className="mt-3"><label className="font-body text-xs font-semibold text-gray-500 block mb-2">Jours</label>
              <div className="flex gap-2">{dayNames.map((day, i) => (
                <button key={day} onClick={() => setRec((r) => ({ ...r, daysOfWeek: r.daysOfWeek.includes(i) ? r.daysOfWeek.filter((d) => d !== i) : [...r.daysOfWeek, i] }))}
                  className={`w-10 h-10 rounded-lg border text-xs font-semibold cursor-pointer font-body ${rec.daysOfWeek.includes(i) ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>{day}</button>
              ))}</div></div>
          )}
        </div>
        {dates.length > 0 && (
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="font-body text-xs font-semibold text-blue-800 mb-2">{dates.length} créneau{dates.length > 1 ? "x" : ""} à créer</div>
            <div className="flex flex-wrap gap-1.5">
              {dates.slice(0, 14).map((d) => (<span key={d} className="font-body text-xs text-blue-500 bg-white px-2 py-1 rounded">{new Date(d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</span>))}
              {dates.length > 14 && <span className="font-body text-xs text-gray-400">+{dates.length - 14} autres</span>}
            </div>
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <button onClick={handleSubmit} disabled={!activityId || dates.length === 0 || saving}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-body text-sm font-semibold border-none cursor-pointer ${!activityId || dates.length === 0 || saving ? "bg-gray-200 text-gray-400" : "bg-blue-500 text-white hover:bg-blue-400"}`}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {saving ? "Création..." : `Créer ${dates.length} créneau${dates.length > 1 ? "x" : ""}`}
          </button>
          <button onClick={onCancel} className="px-6 py-2.5 rounded-lg font-body text-sm text-gray-500 bg-white border border-gray-200 cursor-pointer">Annuler</button>
        </div>
      </div>
    </Card>
  );
}

export default function PlanningPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [creneaux, setCreneaux] = useState<(Creneau & { id: string })[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | undefined>();

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  const fetchData = async () => {
    try {
      const actSnap = await getDocs(collection(db, "activities"));
      setActivities(actSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Activity[]);
      const startStr = fmtDate(weekDates[0]);
      const endStr = fmtDate(weekDates[6]);
      const crSnap = await getDocs(query(collection(db, "creneaux"), where("date", ">=", startStr), where("date", "<=", endStr)));
      setCreneaux(crSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as (Creneau & { id: string })[]);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { setLoading(true); fetchData(); }, [weekOffset]);

  const handleCreate = async (newCreneaux: Partial<Creneau>[]) => {
    for (const c of newCreneaux) await addDoc(collection(db, "creneaux"), { ...c, createdAt: serverTimestamp() });
    setShowForm(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce créneau ?")) return;
    await deleteDoc(doc(db, "creneaux", id));
    fetchData();
  };

  const isToday = (d: Date) => fmtDate(d) === fmtDate(new Date());

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-display text-2xl font-bold text-blue-800">Planning</h1>
        <button onClick={() => { setShowForm(true); setSelectedDate(undefined); }}
          className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400">
          <Plus size={16} /> Nouveau créneau
        </button>
      </div>

      {showForm && <CreneauForm activities={activities} onSave={handleCreate} onCancel={() => setShowForm(false)} defaultDate={selectedDate} />}

      <div className="flex items-center justify-between mb-5">
        <button onClick={() => setWeekOffset((w) => w - 1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
          <ChevronLeft size={16} /> Préc.
        </button>
        <div className="text-center">
          <div className="font-display text-lg font-bold text-blue-800 capitalize">{fmtMonthFR(weekDates[0])}</div>
          <div className="font-body text-xs text-gray-400">
            Semaine du {weekDates[0].toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} au {weekDates[6].toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setWeekOffset(0)} className="font-body text-sm text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer">Aujourd&apos;hui</button>
          <button onClick={() => setWeekOffset((w) => w + 1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
            Suiv. <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mb-4">
        {[["Stages", "stage"], ["Cours", "cours"], ["Balades", "balade"], ["Compétitions", "competition"]].map(([label, type]) => (
          <span key={type} className="flex items-center gap-1.5 font-body text-xs text-gray-400">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: typeColors[type] }} /> {label}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
      ) : (
        <div className="grid grid-cols-7 gap-1.5">
          {weekDates.map((d, i) => (
            <div key={i} className={`text-center py-2 rounded-lg font-body text-xs font-semibold ${isToday(d) ? "bg-blue-500 text-white" : "bg-sand text-gray-500"}`}>
              {fmtDateFR(d)}
            </div>
          ))}
          {weekDates.map((d, i) => {
            const dateStr = fmtDate(d);
            const dayCreneaux = creneaux.filter((c) => c.date === dateStr).sort((a, b) => a.startTime.localeCompare(b.startTime));
            return (
              <div key={`col-${i}`} className="min-h-[140px] flex flex-col gap-1">
                {dayCreneaux.map((c) => {
                  const fill = c.maxPlaces > 0 ? c.enrolledCount / c.maxPlaces : 0;
                  const color = typeColors[c.activityType] || "#666";
                  return (
                    <div key={c.id} className="bg-white rounded-lg p-2 border border-blue-500/8 group relative hover:shadow-md transition-all" style={{ borderLeftWidth: 3, borderLeftColor: color }}>
                      <div className="font-body text-[11px] font-semibold" style={{ color }}>{c.startTime}–{c.endTime}</div>
                      <div className="font-body text-xs font-semibold text-blue-800 leading-tight mt-0.5">{c.activityTitle}</div>
                      <div className="font-body text-[10px] text-gray-400 mt-0.5">{c.monitor}</div>
                      <div className="flex items-center gap-1 mt-1">
                        <Users size={10} className="text-gray-400" />
                        <span className={`font-body text-[10px] font-semibold ${fill >= 1 ? "text-red-500" : fill >= 0.7 ? "text-orange-500" : "text-green-600"}`}>
                          {c.enrolledCount}/{c.maxPlaces}
                        </span>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-gray-100">
                        <div className="h-1 rounded-full" style={{ width: `${Math.min(fill * 100, 100)}%`, background: fill >= 1 ? "#D63031" : fill >= 0.7 ? "#e67e22" : "#27ae60" }} />
                      </div>
                      <button onClick={() => handleDelete(c.id)} className="absolute top-1 right-1 w-5 h-5 rounded bg-red-50 text-red-400 hover:bg-red-100 border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Trash2 size={10} />
                      </button>
                    </div>
                  );
                })}
                <button onClick={() => { setSelectedDate(dateStr); setShowForm(true); }}
                  className="mt-auto py-2 rounded-lg border border-dashed border-gray-200 text-gray-300 hover:border-blue-300 hover:text-blue-400 bg-transparent cursor-pointer transition-colors font-body text-lg">+</button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex gap-4 flex-wrap">
        <Card padding="sm" className="flex items-center gap-3">
          <span className="font-body text-xl font-bold text-blue-500">{creneaux.length}</span>
          <span className="font-body text-xs text-gray-400">créneaux cette semaine</span>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <span className="font-body text-xl font-bold text-green-600">{creneaux.reduce((s, c) => s + c.enrolledCount, 0)}</span>
          <span className="font-body text-xs text-gray-400">inscrits</span>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <span className="font-body text-xl font-bold text-gold-400">{creneaux.reduce((s, c) => s + c.maxPlaces, 0)}</span>
          <span className="font-body text-xs text-gray-400">places totales</span>
        </Card>
      </div>
    </div>
  );
}
