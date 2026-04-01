"use client";
import { useState } from "react";
import { X, Copy, ChevronLeft, ChevronRight, Loader2, Check } from "lucide-react";
import type { Creneau } from "./types";
import { fmtDate } from "./types";

interface Props {
  creneau: Creneau & { id: string };
  onDuplicate: (dates: string[]) => Promise<void>;
  onClose: () => void;
}

const MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const DAYS_FR = ["Lu","Ma","Me","Je","Ve","Sa","Di"];

export default function DuplicateCreneauModal({ creneau, onDuplicate, onClose }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const srcDate = creneau.date; // YYYY-MM-DD de l'original

  // Jours du mois affiché
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Offset lundi = 0
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();

  // Toutes les cases (null = vide, nombre = jour)
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Compléter à multiple de 7
  while (cells.length % 7 !== 0) cells.push(null);

  const fmtCell = (d: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const toggle = (dateStr: string) => {
    if (dateStr === srcDate) return; // pas l'original
    setSelected(prev => prev.includes(dateStr) ? prev.filter(x => x !== dateStr) : [...prev, dateStr]);
  };

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const handleSave = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    await onDuplicate(selected);
    setSaving(false);
  };

  const col = (creneau as any).color || "#2050A0";

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="font-display text-lg font-bold text-blue-800 flex items-center gap-2">
              <Copy size={18} style={{ color: col }}/>
              Dupliquer ce créneau
            </h2>
            <div className="mt-1 flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: col }}/>
              <span className="font-body text-xs text-slate-600">
                {creneau.activityTitle} · {creneau.startTime}–{creneau.endTime}
              </span>
            </div>
            <div className="font-body text-[11px] text-slate-400 mt-0.5">
              Cliquez sur les jours où répéter ce créneau
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 bg-transparent border-none cursor-pointer ml-3 flex-shrink-0">
            <X size={20}/>
          </button>
        </div>

        {/* Calendrier */}
        <div className="p-4 flex-1 overflow-y-auto">
          {/* Nav mois */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="w-8 h-8 rounded-lg bg-sand border-none cursor-pointer flex items-center justify-center text-slate-600 hover:bg-blue-50">
              <ChevronLeft size={16}/>
            </button>
            <span className="font-body text-sm font-semibold text-blue-800 capitalize">
              {MONTHS_FR[month]} {year}
            </span>
            <button onClick={nextMonth} className="w-8 h-8 rounded-lg bg-sand border-none cursor-pointer flex items-center justify-center text-slate-600 hover:bg-blue-50">
              <ChevronRight size={16}/>
            </button>
          </div>

          {/* En-têtes jours */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_FR.map(d => (
              <div key={d} className="text-center font-body text-[10px] font-semibold text-slate-400 py-1">{d}</div>
            ))}
          </div>

          {/* Cases */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={`e${i}`}/>;
              const dateStr = fmtCell(day);
              const isOriginal = dateStr === srcDate;
              const isSel = selected.includes(dateStr);
              const isPast = dateStr < fmtDate(today);
              return (
                <button key={dateStr}
                  onClick={() => !isPast && toggle(dateStr)}
                  disabled={isOriginal || isPast}
                  title={isOriginal ? "Créneau original" : isPast ? "Date passée" : dateStr}
                  className={`
                    aspect-square rounded-lg text-center font-body text-sm border-none cursor-pointer
                    flex items-center justify-center relative transition-all
                    ${isOriginal
                      ? "cursor-default opacity-100"
                      : isPast
                        ? "text-slate-300 cursor-not-allowed bg-transparent"
                        : isSel
                          ? "text-white scale-105 shadow-sm"
                          : "text-slate-700 hover:bg-blue-50"
                    }
                  `}
                  style={
                    isOriginal
                      ? { background: `${col}20`, color: col, fontWeight: 700, border: `2px solid ${col}` }
                      : isSel
                        ? { background: col }
                        : {}
                  }>
                  {day}
                  {isOriginal && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-white border flex items-center justify-center" style={{ borderColor: col }}>
                      <span className="text-[7px]" style={{ color: col }}>★</span>
                    </span>
                  )}
                  {isSel && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-white border border-green-400 flex items-center justify-center">
                      <Check size={7} className="text-green-500"/>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Résumé sélection */}
          {selected.length > 0 && (
            <div className="mt-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
              <div className="font-body text-xs font-semibold text-blue-800 mb-1.5">
                {selected.length} copie{selected.length > 1 ? "s" : ""} à créer
              </div>
              <div className="flex flex-wrap gap-1">
                {[...selected].sort().map(d => (
                  <span key={d} className="font-body text-[10px] bg-white border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                    {new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                    <button onClick={() => toggle(d)} className="text-blue-400 hover:text-red-400 bg-transparent border-none cursor-pointer leading-none p-0 ml-0.5">×</button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl font-body text-sm text-slate-500 bg-gray-100 border-none cursor-pointer">
            Annuler
          </button>
          <button onClick={handleSave} disabled={selected.length === 0 || saving}
            className="flex-1 py-2.5 rounded-xl font-body text-sm font-semibold text-white border-none cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: selected.length === 0 ? "#ccc" : col }}>
            {saving ? <Loader2 size={16} className="animate-spin"/> : <Copy size={16}/>}
            {saving ? "Création..." : selected.length === 0 ? "Sélectionnez des jours" : `Créer ${selected.length} copie${selected.length > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
