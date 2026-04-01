"use client";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { fmtDate, fmtDateFR, fmtMonthFR, typeColors } from "./types";
import type { Creneau } from "./types";

interface Props {
  loading: boolean;
  weekDates: Date[];
  creneaux: (Creneau & { id: string })[];
  payments: any[];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelectCreneau: (c: Creneau & { id: string }) => void;
  onAddCreneau: (date: string) => void;
  onGoToDay: (d: Date) => void;
}

const HOUR_HEIGHT = 100; // px par heure

export default function TimelineView({
  loading, weekDates, creneaux, payments,
  onPrev, onNext, onToday, onSelectCreneau, onAddCreneau, onGoToDay,
}: Props) {
  const isToday = (d: Date) => fmtDate(d) === fmtDate(new Date());

  return (
    <>
      {/* Navigation */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={onPrev} className="flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">
          <ChevronLeft size={16}/>Préc.
        </button>
        <div className="flex flex-col items-center gap-1">
          <div className="font-display text-lg font-bold text-blue-800 capitalize">{fmtMonthFR(weekDates[0])}</div>
          <div className="font-body text-xs text-slate-600">
            Du {weekDates[0].toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} au {weekDates[6].toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
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
        : (() => {
            const allTimes = creneaux.flatMap(c => [c.startTime, c.endTime]).filter(Boolean);
            const hours = allTimes.map(t => parseInt(t.split(":")[0]));
            const minHour = Math.max(7, Math.min(...(hours.length ? hours : [8])));
            const maxHour = Math.min(21, Math.max(...(hours.length ? hours : [18])) + 1);
            const gridHours = Array.from({ length: maxHour - minHour + 1 }, (_, i) => minHour + i);
            const totalHeight = gridHours.length * HOUR_HEIGHT;

            const timeToY = (time: string) => {
              const [h, m] = time.split(":").map(Number);
              return ((h - minHour) + m / 60) * HOUR_HEIGHT;
            };

            const isStageType = (c: any) => c.activityType === "stage" || c.activityType === "stage_journee";

            return (
              <div className="overflow-x-auto -mx-4 px-4">
                <div className="flex" style={{ minWidth: "100%" }}>
                  {/* Colonne heures */}
                  <div className="w-14 flex-shrink-0 relative" style={{ height: totalHeight }}>
                    {gridHours.map(h => (
                      <div key={h} className="absolute w-full flex items-start" style={{ top: (h - minHour) * HOUR_HEIGHT }}>
                        <span className="font-body text-[10px] text-slate-400 pr-2 leading-none">{`${h}:00`}</span>
                      </div>
                    ))}
                  </div>

                  {/* 7 colonnes jours */}
                  {weekDates.map((d, dayIdx) => {
                    const ds = fmtDate(d);
                    const allDc = creneaux.filter(c => c.date === ds).sort((a, b) => a.startTime.localeCompare(b.startTime));

                    const stages = allDc.filter(c => isStageType(c));
                    const dc = allDc.filter(c => !isStageType(c));

                    const stagesMatin = stages.filter(c => parseInt(c.startTime) < 13);
                    const stagesAprem = stages.filter(c => parseInt(c.startTime) >= 13 && parseInt(c.startTime) < 16);
                    const stagesSoir = stages.filter(c => parseInt(c.startTime) >= 16);

                    const positioned = dc.map(c => {
                      const top = timeToY(c.startTime);
                      const bottom = timeToY(c.endTime);
                      return { ...c, top, height: Math.max(bottom - top, 30) };
                    });

                    // Gestion overlap (colonnes)
                    const columns: number[] = new Array(positioned.length).fill(0);
                    let maxCol = 0;
                    for (let i = 0; i < positioned.length; i++) {
                      for (let j = 0; j < i; j++) {
                        if (positioned[j].top + positioned[j].height > positioned[i].top + 2) {
                          if (columns[j] === columns[i]) { columns[i]++; }
                        }
                      }
                      maxCol = Math.max(maxCol, columns[i]);
                    }
                    const totalCols = maxCol + 1;

                    const stageBadge = (list: typeof stages, bg: string, border: string, dot: string, text: string) => {
                      if (list.length === 0) return null;
                      const label = list.length === 1
                        ? `${list[0].startTime} ${list[0].activityTitle.slice(0, 12)}`
                        : `${list.length} stages`;
                      const totalEnrolled = list.reduce((s, c) => s + (c.enrolled?.length || 0), 0);
                      const totalPlaces = list.reduce((s, c) => s + (c.maxPlaces || 0), 0);
                      return (
                        <button onClick={() => onGoToDay(d)}
                          className={`w-full flex items-center gap-1 px-1.5 py-0.5 rounded border font-body cursor-pointer text-left hover:opacity-80 ${bg} ${border}`}>
                          <span className={`w-3 h-3 rounded-full ${dot} text-white text-[7px] flex items-center justify-center flex-shrink-0`}>{list.length}</span>
                          <span className={`text-[9px] font-semibold ${text} truncate flex-1`}>{label}</span>
                          <span className={`text-[8px] ${text} opacity-70`}>{totalEnrolled}/{totalPlaces}</span>
                        </button>
                      );
                    };

                    return (
                      <div key={dayIdx} className="flex-1 relative border-l border-gray-100" style={{ minWidth: 0, height: totalHeight }}>
                        {/* Header jour */}
                        <div className={`sticky top-0 z-10 text-center py-1.5 font-body text-xs font-semibold border-b border-gray-200 ${isToday(d) ? "bg-blue-500 text-white" : "bg-sand text-slate-600"}`}>
                          {fmtDateFR(d)}
                        </div>

                        {/* Badges stages */}
                        {stages.length > 0 && (
                          <div className="absolute left-1 right-1 z-[5] flex flex-col gap-0.5" style={{ top: 30 }}>
                            {stageBadge(stagesMatin, "bg-green-50", "border-green-200", "bg-green-500", "text-green-700")}
                            {stageBadge(stagesAprem, "bg-teal-50", "border-teal-200", "bg-teal-500", "text-teal-700")}
                            {stageBadge(stagesSoir, "bg-indigo-50", "border-indigo-200", "bg-indigo-500", "text-indigo-700")}
                          </div>
                        )}

                        {/* Lignes horaires */}
                        {gridHours.map(h => (
                          <div key={h} className="absolute w-full border-t border-gray-50" style={{ top: (h - minHour) * HOUR_HEIGHT }} />
                        ))}

                        {/* Créneaux */}
                        {positioned.map((c, cIdx) => {
                          const en = c.enrolled || [];
                          const fill = c.maxPlaces > 0 ? en.length / c.maxPlaces : 0;
                          const col = (c as any).color || typeColors[c.activityType] || "#666";
                          const colWidth = 100 / totalCols;
                          const left = columns[cIdx] * colWidth;

                          const isWide = totalCols === 1;
                          const cardH = c.height - 2;
                          return (
                            <div key={c.id}
                              onClick={() => onSelectCreneau(c)}
                              title={`${c.activityTitle}${c.monitor ? " · " + c.monitor : ""} · ${c.startTime}–${c.endTime}`}
                              className="absolute rounded-lg border cursor-pointer hover:shadow-lg transition-shadow overflow-hidden group"
                              style={{
                                top: c.top + 28,
                                height: cardH,
                                left: `calc(${left}% + 2px)`,
                                width: `calc(${colWidth}% - 4px)`,
                                backgroundColor: `${col}15`,
                                borderColor: `${col}40`,
                                borderLeftWidth: 3,
                                borderLeftColor: col,
                                padding: "4px 5px",
                                boxSizing: "border-box",
                              }}>
                              {/* Heure */}
                              <div style={{ fontSize: "10px", fontWeight: 700, color: col, lineHeight: 1.2, whiteSpace: "nowrap" }}>
                                {c.startTime}–{c.endTime}
                              </div>
                              {/* Titre — retour à la ligne si assez large */}
                              <div style={{
                                fontSize: isWide ? "11px" : "10px",
                                fontWeight: 600,
                                color: "#1e3a5f",
                                lineHeight: 1.25,
                                marginTop: 1,
                                ...(isWide
                                  ? { whiteSpace: "normal", wordBreak: "break-word" }
                                  : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
                                ),
                              }}>
                                {c.activityTitle}
                              </div>
                              {/* Moniteur */}
                              {cardH > 50 && (
                                <div style={{
                                  fontSize: "9px",
                                  color: "#64748b",
                                  lineHeight: 1.2,
                                  marginTop: 1,
                                  ...(isWide
                                    ? { whiteSpace: "normal" }
                                    : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
                                  ),
                                }}>
                                  {c.monitor}
                                </div>
                              )}
                              {/* Compteur places */}
                              <div style={{ position: "absolute", bottom: 4, left: 5, display: "flex", alignItems: "center", gap: 3 }}>
                                <span style={{ fontSize: "9px", fontWeight: 700, color: fill >= 1 ? "#ef4444" : fill >= 0.7 ? "#f97316" : "#16a34a" }}>
                                  {en.length}/{c.maxPlaces}
                                </span>
                                {en.length > 0 && (
                                  <div style={{ display: "flex", gap: 1 }}>
                                    {en.slice(0, 5).map((e: any) => {
                                      const hasPaid = payments.some((p: any) => p.familyId === e.familyId && p.status === "paid");
                                      return <span key={e.childId} style={{ width: 6, height: 6, borderRadius: "50%", background: hasPaid ? "#22c55e" : "#fb923c", display: "inline-block" }} />;
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {/* Bouton ajouter */}
                        <button onClick={() => onAddCreneau(ds)}
                          className="absolute bottom-2 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full border border-dashed border-gray-300 text-slate-400 hover:border-blue-400 hover:text-blue-400 bg-white cursor-pointer font-body text-sm flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          +
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()
      }
    </>
  );
}
