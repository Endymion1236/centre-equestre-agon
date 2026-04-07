"use client";
import { ChevronLeft, ChevronRight, Loader2, Users, Trash2, Settings } from "lucide-react";
import { fmtDate, fmtDateFR, fmtMonthFR, typeColors } from "./types";
import type { Creneau } from "./types";
import type { EditForm } from "./EditCreneauModal";

interface Props {
  loading: boolean;
  weekDates: Date[];
  creneaux: (Creneau & { id: string })[];
  payments: any[];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onPickDate: (weekOffset: number) => void;
  onSelectCreneau: (c: Creneau & { id: string }) => void;
  onOpenDelete: (c: Creneau & { id: string }) => void;
  onOpenEdit: (c: Creneau & { id: string }) => void;
  onAddCreneau: (date: string) => void;
  onGoToDay: (d: Date) => void;
}

const isStageType = (c: any) => c.activityType === "stage" || c.activityType === "stage_journee";

// ── Badge stage compact ──────────────────────────────────────────────────────
function StageBadge({ list, bg, border, dot, text, onGoToDay }: {
  list: any[]; bg: string; border: string; dot: string; text: string; onGoToDay: () => void;
}) {
  if (list.length === 0) return null;
  const label = list.length === 1
    ? `${list[0].startTime} ${list[0].activityTitle.slice(0, 10)}`
    : `${list.length} stages`;
  const horaires = [...new Set(list.map((c: any) => c.startTime))].join(", ");
  return (
    <button onClick={onGoToDay}
      className={`w-full flex flex-col px-1.5 py-1 rounded-lg border font-body cursor-pointer text-left hover:opacity-80 ${bg} ${border}`}>
      <div className={`flex items-center gap-1 text-[10px] font-semibold ${text}`}>
        <span className={`w-3.5 h-3.5 rounded-full ${dot} text-white text-[8px] flex items-center justify-center flex-shrink-0`}>{list.length}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-[9px] pl-4 ${text} opacity-70`}>{horaires}</div>
    </button>
  );
}

// ── Dots de paiement pour un cavalier ───────────────────────────────────────
function PaymentDot({ enrolled, payments, childId, childName }: {
  enrolled: any; payments: any[]; childId: string; childName: string;
}) {
  const isCard = enrolled.paymentSource === "card";
  const hasPaid = isCard || payments.some((p: any) =>
    p.familyId === enrolled.familyId && p.status === "paid" &&
    (p.items || []).some((i: any) => i.childId === childId)
  );
  const hasPending = !hasPaid && !isCard && payments.some((p: any) =>
    p.familyId === enrolled.familyId &&
    (p.status === "pending" || p.status === "partial") &&
    (p.items || []).some((i: any) => i.childId === childId)
  );
  return (
    <span
      title={`${childName} — ${isCard ? "carte" : hasPaid ? "réglé" : hasPending ? "en attente" : "non réglé"}`}
      className={`w-3 h-3 rounded-full flex-shrink-0 border ${
        isCard ? "bg-blue-400 border-blue-500"
        : hasPaid ? "bg-green-400 border-green-500"
        : hasPending ? "bg-orange-300 border-orange-400"
        : "bg-gray-200 border-gray-300"
      }`}
    />
  );
}

// ── Carte créneau seul ───────────────────────────────────────────────────────
function CreneauCard({ c, payments, onSelect, onDelete, onEdit }: {
  c: Creneau & { id: string }; payments: any[];
  onSelect: () => void; onDelete: () => void; onEdit: () => void;
}) {
  const en = c.enrolled || [];
  const fill = c.maxPlaces > 0 ? en.length / c.maxPlaces : 0;
  const col = (c as any).color || typeColors[c.activityType] || "#666";

  const unpaidCount = en.filter((e: any) => {
    const isCard = e.paymentSource === "card";
    const hasPaid = isCard || payments.some((p: any) =>
      p.familyId === e.familyId && p.status === "paid" &&
      (p.items || []).some((i: any) => i.childId === e.childId)
    );
    const hasPending = !hasPaid && !isCard && payments.some((p: any) =>
      p.familyId === e.familyId &&
      (p.status === "pending" || p.status === "partial") &&
      (p.items || []).some((i: any) => i.childId === e.childId)
    );
    return !hasPaid && !hasPending && !isCard;
  }).length;

  return (
    <div onClick={onSelect}
      className="bg-white rounded-lg p-2 border border-blue-500/8 group relative hover:shadow-md cursor-pointer"
      style={{ borderLeftWidth: 3, borderLeftColor: col }}>
      <div className="font-body text-[11px] font-semibold" style={{ color: col }}>{c.startTime}–{c.endTime}</div>
      <div className="font-body text-xs font-semibold text-blue-800 leading-tight mt-0.5">{c.activityTitle}</div>
      <div className="font-body text-[10px] text-slate-600 mt-0.5">{c.monitor}</div>
      <div className="flex items-center gap-1 mt-1">
        <Users size={10} className="text-slate-600"/>
        <span className={`font-body text-[10px] font-semibold ${fill >= 1 ? "text-red-500" : fill >= 0.7 ? "text-orange-500" : "text-green-600"}`}>
          {en.length}/{c.maxPlaces}
        </span>
      </div>
      {en.length > 0 && (
        <div className="flex items-center gap-1 mt-1">
          <div className="flex flex-wrap gap-0.5">
            {en.slice(0, 6).map((e: any) => (
              <PaymentDot key={e.childId} enrolled={e} payments={payments} childId={e.childId} childName={e.childName} />
            ))}
            {en.length > 6 && <span className="font-body text-[9px] text-slate-600 ml-0.5">+{en.length - 6}</span>}
          </div>
          {unpaidCount > 0 && (
            <span className="font-body text-[9px] font-semibold text-red-500 bg-red-50 px-1 py-0.5 rounded" title={`${unpaidCount} impayé${unpaidCount > 1 ? "s" : ""}`}>
              ⚠️{unpaidCount}
            </span>
          )}
        </div>
      )}
      <button onClick={e => { e.stopPropagation(); onDelete(); }}
        className="absolute top-1 right-1 w-5 h-5 rounded bg-red-50 text-red-400 hover:bg-red-100 border-none cursor-pointer sm:opacity-0 sm:group-hover:opacity-100 flex items-center justify-center">
        <Trash2 size={10}/>
      </button>
      <button onClick={e => { e.stopPropagation(); onEdit(); }}
        className="absolute top-1 right-7 w-5 h-5 rounded bg-blue-50 text-blue-400 hover:bg-blue-100 border-none cursor-pointer sm:opacity-0 sm:group-hover:opacity-100 flex items-center justify-center">
        <Settings size={10}/>
      </button>
    </div>
  );
}

// ── Carte créneau groupé (même horaire) ─────────────────────────────────────
function CreneauCardCompact({ c, payments, onSelect, onDelete, onEdit }: {
  c: Creneau & { id: string }; payments: any[];
  onSelect: () => void; onDelete: () => void; onEdit: () => void;
}) {
  const en = c.enrolled || [];
  const fill = c.maxPlaces > 0 ? en.length / c.maxPlaces : 0;
  const col = (c as any).color || typeColors[c.activityType] || "#666";

  return (
    <div onClick={onSelect}
      className="flex-1 min-w-0 bg-white rounded-lg p-1.5 border border-blue-500/8 group relative hover:shadow-md cursor-pointer"
      style={{ borderLeftWidth: 3, borderLeftColor: col }}>
      <div className="font-body text-[10px] font-semibold" style={{ color: col }}>{c.startTime}</div>
      <div className="font-body text-[10px] font-semibold text-blue-800 leading-tight mt-0.5"
        style={{ overflowWrap: "break-word", wordBreak: "break-word" }}>{c.activityTitle}</div>
      <div className="font-body text-[9px] text-slate-500 mt-0.5 truncate">{c.monitor}</div>
      <div className={`font-body text-[9px] font-semibold mt-0.5 ${fill >= 1 ? "text-red-500" : fill >= 0.7 ? "text-orange-500" : "text-green-600"}`}>
        {en.length}/{c.maxPlaces}
      </div>
      <button onClick={e => { e.stopPropagation(); onDelete(); }}
        className="absolute top-0.5 right-0.5 w-4 h-4 rounded bg-red-50 text-red-400 border-none cursor-pointer sm:opacity-0 sm:group-hover:opacity-100 flex items-center justify-center">
        <Trash2 size={8}/>
      </button>
      <button onClick={e => { e.stopPropagation(); onEdit(); }}
        className="absolute top-0.5 right-5 w-4 h-4 rounded bg-blue-50 text-blue-400 border-none cursor-pointer sm:opacity-0 sm:group-hover:opacity-100 flex items-center justify-center">
        <Settings size={8}/>
      </button>
    </div>
  );
}

// ── Composant principal ──────────────────────────────────────────────────────
export default function WeekView({
  loading, weekDates, creneaux, payments,
  onPrev, onNext, onToday, onPickDate,
  onSelectCreneau, onOpenDelete, onOpenEdit, onAddCreneau, onGoToDay,
}: Props) {
  const isToday = (d: Date) => fmtDate(d) === fmtDate(new Date());

  const buildEditForm = (c: Creneau & { id: string }): EditForm => ({
    activityTitle: c.activityTitle,
    monitor: c.monitor || "",
    startTime: c.startTime,
    endTime: c.endTime,
    maxPlaces: c.maxPlaces,
    priceTTC: (c as any).priceTTC || 0,
    color: (c as any).color || "",
  });

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
          <input type="date" title="Aller à cette date"
            className="font-body text-xs px-2 py-1 rounded-lg border border-gray-200 bg-white cursor-pointer focus:border-blue-400 focus:outline-none text-slate-500"
            onChange={e => {
              if (!e.target.value) return;
              const [py, pm, pd] = e.target.value.split("-").map(Number);
              const picked = new Date(py, pm - 1, pd);
              const today = new Date(); today.setHours(0, 0, 0, 0);
              const pickedDow = (picked.getDay() + 6) % 7;
              const pickedMon = new Date(picked); pickedMon.setDate(picked.getDate() - pickedDow);
              const todayDow = (today.getDay() + 6) % 7;
              const todayMon = new Date(today); todayMon.setDate(today.getDate() - todayDow);
              const diffWeeks = Math.round((pickedMon.getTime() - todayMon.getTime()) / (7 * 86400000));
              onPickDate(diffWeeks);
              e.target.value = "";
            }}/>
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
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="grid grid-cols-7 gap-1.5" style={{ minWidth: "700px" }}>
              {/* Headers jours */}
              {weekDates.map((d, i) => (
                <div key={i}
                  onClick={() => onGoToDay(d)}
                  className={`text-center py-2 rounded-lg font-body text-xs font-semibold cursor-pointer hover:ring-2 hover:ring-blue-300 ${isToday(d) ? "bg-blue-500 text-white" : "bg-sand text-slate-600"}`}>
                  {fmtDateFR(d)}
                </div>
              ))}

              {/* Colonnes jours */}
              {weekDates.map((d, i) => {
                const ds = fmtDate(d);
                const allDc = creneaux.filter(c => c.date === ds).sort((a, b) => a.startTime.localeCompare(b.startTime));
                const dc = allDc.filter(c => !isStageType(c));
                const stages = allDc.filter(c => isStageType(c));

                // Grouper stages par startTime
                const stagesByTime: Record<string, typeof stages> = {};
                stages.forEach(c => {
                  if (!stagesByTime[c.startTime]) stagesByTime[c.startTime] = [];
                  stagesByTime[c.startTime].push(c);
                });

                // Grouper cours par horaire
                const grouped: Array<{ key: string; items: typeof dc; startTime: string }> = [];
                dc.forEach(c => {
                  const key = `${c.startTime}-${c.endTime}`;
                  const g = grouped.find(x => x.key === key);
                  if (g) g.items.push(c); else grouped.push({ key, items: [c], startTime: c.startTime });
                });

                // Créer un flux unifié trié par startTime
                type RenderItem = { type: "stage"; startTime: string; list: typeof stages } | { type: "cours"; startTime: string; group: typeof grouped[0] };
                const renderItems: RenderItem[] = [
                  ...Object.entries(stagesByTime).map(([st, list]) => ({ type: "stage" as const, startTime: st, list })),
                  ...grouped.map(g => ({ type: "cours" as const, startTime: g.startTime, group: g })),
                ];
                renderItems.sort((a, b) => {
                  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
                  const diff = toMin(a.startTime) - toMin(b.startTime);
                  if (diff !== 0) return diff;
                  // À horaire égal, cours avant stages
                  return a.type === "cours" ? -1 : 1;
                });

                return (
                  <div key={`c${i}`} className="min-h-[160px] flex flex-col gap-1" style={{ minWidth: "95px" }}>
                    {renderItems.map((item, idx) => {
                      if (item.type === "stage") {
                        return <StageBadge key={`s-${idx}`} list={item.list} bg="bg-green-50" border="border-green-200" dot="bg-green-500" text="text-green-700" onGoToDay={() => onGoToDay(d)} />;
                      }
                      const g = item.group;
                      if (g.items.length > 1) {
                        return (
                          <div key={g.key} className="flex gap-0.5">
                            {g.items.map(c => (
                              <CreneauCardCompact
                                key={c.id} c={c} payments={payments}
                                onSelect={() => onSelectCreneau(c)}
                                onDelete={() => onOpenDelete(c)}
                                onEdit={() => onOpenEdit(c)}
                              />
                            ))}
                          </div>
                        );
                      }
                      const c = g.items[0];
                      return (
                        <CreneauCard
                          key={c.id} c={c} payments={payments}
                          onSelect={() => onSelectCreneau(c)}
                          onDelete={() => onOpenDelete(c)}
                          onEdit={() => onOpenEdit(c)}
                        />
                      );
                    })}

                    {/* Bouton ajouter */}
                    <button onClick={() => onAddCreneau(ds)}
                      className="mt-auto py-2 rounded-lg border border-dashed border-gray-200 text-slate-400 hover:border-blue-300 hover:text-blue-400 bg-transparent cursor-pointer font-body text-lg">
                      +
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )
      }
    </>
  );
}
