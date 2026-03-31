"use client";
import { ChevronLeft, ChevronRight, Bell, Trash2, Loader2 } from "lucide-react";
import { Card, Badge } from "@/components/ui";
import { fmtDate } from "./types";
import { RDV_CATEGORIES } from "./RdvModal";
import type { Creneau } from "./types";

interface Props {
  loading: boolean;
  currentMonth: Date;
  monthDays: (Date | null)[];
  creneaux: (Creneau & { id: string })[];
  rdvPros: any[];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onGoToDay: (d: Date) => void;
  onDeleteRdv: (id: string) => void;
}

export default function MonthView({
  loading, currentMonth, monthDays, creneaux, rdvPros,
  onPrev, onNext, onToday, onGoToDay, onDeleteRdv,
}: Props) {
  const monthStr = fmtDate(currentMonth).slice(0, 7);
  const rdvsDuMois = rdvPros.filter(r => r.date?.startsWith(monthStr));

  return (
    <>
      {/* Navigation */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={onPrev} className="flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">
          <ChevronLeft size={16}/>Préc.
        </button>
        <div className="text-center">
          <div className="font-display text-lg font-bold text-blue-800 capitalize">
            {currentMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
          </div>
          <div className="font-body text-xs text-slate-600">
            {creneaux.length} créneaux · {rdvsDuMois.length} RDV pro
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onToday} className="font-body text-sm text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer">Auj.</button>
          <button onClick={onNext} className="flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">
            Suiv.<ChevronRight size={16}/>
          </button>
        </div>
      </div>

      {/* Grille */}
      {loading
        ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto"/></div>
        : (
          <div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(d => (
                <div key={d} className="text-center font-body text-[10px] font-semibold text-slate-600 uppercase py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthDays.map((d, i) => {
                if (!d) return <div key={`e${i}`} className="min-h-[90px] bg-gray-50/50 rounded-lg" />;
                const ds = fmtDate(d);
                const today = fmtDate(new Date()) === ds;
                const dc = creneaux.filter(c => c.date === ds);
                const dr = rdvPros.filter(r => r.date === ds);
                const totalInscrits = dc.reduce((s, c) => s + (c.enrolled?.length || 0), 0);
                return (
                  <div key={ds}
                    className={`min-h-[90px] rounded-lg p-1.5 cursor-pointer border transition-all hover:shadow-md ${today ? "bg-blue-50 border-blue-300" : "bg-white border-gray-100"}`}
                    onClick={() => onGoToDay(d)}>
                    <div className={`font-body text-xs font-semibold mb-1 ${today ? "text-blue-500" : d.getDay() === 0 || d.getDay() === 6 ? "text-slate-400" : "text-gray-600"}`}>
                      {d.getDate()}
                    </div>
                    {dc.length > 0 && (
                      <div className="font-body text-[9px] text-blue-500 bg-blue-50 rounded px-1 py-0.5 mb-0.5">
                        {dc.length} cours · {totalInscrits} inscr.
                      </div>
                    )}
                    {dr.map(r => (
                      <div key={r.id} className="font-body text-[9px] rounded px-1 py-0.5 mb-0.5 truncate"
                        style={{ backgroundColor: `${RDV_CATEGORIES[r.category]?.color || "#95a5a6"}20`, color: RDV_CATEGORIES[r.category]?.color || "#95a5a6" }}>
                        {r.startTime} {r.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )
      }

      {/* Liste RDV du mois */}
      {rdvsDuMois.length > 0 && (
        <div className="mt-6">
          <h3 className="font-body text-sm font-semibold text-slate-600 uppercase tracking-wider mb-3">RDV professionnels du mois</h3>
          <div className="flex flex-col gap-2">
            {rdvsDuMois.sort((a: any, b: any) => a.date.localeCompare(b.date)).map((r: any) => (
              <Card key={r.id} padding="sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: RDV_CATEGORIES[r.category]?.color || "#95a5a6" }} />
                    <div>
                      <div className="font-body text-sm font-semibold text-blue-800">{r.title}</div>
                      <div className="font-body text-xs text-slate-600">
                        {new Date(r.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} · {r.startTime}–{r.endTime}
                        {r.notes && ` · ${r.notes}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge color="gray">{RDV_CATEGORIES[r.category]?.label || r.category}</Badge>
                    {r.reminderEmail && (
                      <span title={`Rappel ${r.reminderDays}j avant → ${r.reminderEmail}`}>
                        <Bell size={12} className="text-orange-400" />
                      </span>
                    )}
                    <button onClick={() => onDeleteRdv(r.id)} className="text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer">
                      <Trash2 size={14}/>
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
