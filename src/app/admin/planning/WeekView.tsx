"use client";

import { ChevronLeft, ChevronRight, Loader2, Plus, Settings, Trash2, Users } from "lucide-react";
import { fmtDate, fmtDateFR, fmtMonthFR, typeColors, compareCreneaux, itemMatchesCreneau, isForfaitChildPaye } from "./types";
import type { Creneau } from "./types";

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

function fillTone(fill: number) {
  if (fill >= 1) return { text: "text-red-600", bar: "bg-red-500", bg: "bg-red-50" };
  if (fill >= 0.7) return { text: "text-orange-600", bar: "bg-orange-500", bg: "bg-orange-50" };
  return { text: "text-emerald-700", bar: "bg-emerald-500", bg: "bg-emerald-50" };
}

function StageBadge({ list, onGoToDay }: { list: any[]; onGoToDay: () => void }) {
  if (list.length === 0) return null;
  const label = list.length === 1
    ? `${list[0].startTime} · ${list[0].activityTitle}`
    : `${list.length} stages`;
  const enrolled = list.reduce((total, slot) => total + (slot.enrolled?.length || slot.enrolledCount || 0), 0);

  return (
    <button
      type="button"
      onClick={onGoToDay}
      className="group w-full rounded-xl border border-emerald-100 bg-[linear-gradient(135deg,#ecfdf5_0%,#f7fff9_100%)] px-2.5 py-2 text-left shadow-[0_3px_12px_rgba(16,185,129,0.05)] transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_8px_20px_rgba(16,185,129,0.1)]"
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 font-body text-[9px] font-bold text-white">
          {list.length}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-body text-[10px] font-bold leading-tight text-emerald-800">{label}</div>
          <div className="mt-1 flex items-center justify-between gap-1 font-body text-[9px] text-emerald-600/75">
            <span>Stage</span>
            <span>{enrolled} inscrit{enrolled > 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function PaymentDot({ enrolled, payments, childId, childName, creneauId, activityTitle }: {
  enrolled: any;
  payments: any[];
  childId: string;
  childName: string;
  creneauId: string;
  activityTitle: string;
}) {
  const isCard = enrolled.paymentSource === "card";
  const isCeleris = enrolled.paymentSource === "celeris";
  const isForfait = enrolled.paymentSource === "forfait";
  const isForfaitPaid = isForfait && isForfaitChildPaye(payments, enrolled.familyId, childId);
  const isForfaitPending = isForfait && !isForfaitPaid;
  const matchesThis = (item: any) => itemMatchesCreneau(item, enrolled, { id: creneauId, activityTitle });
  const hasPaid = isCard || isCeleris || isForfaitPaid || payments.some((payment: any) =>
    payment.familyId === enrolled.familyId && payment.status === "paid" && (payment.items || []).some(matchesThis)
  );
  const hasPending = !hasPaid && !isCard && !isCeleris && (isForfaitPending || payments.some((payment: any) =>
    payment.familyId === enrolled.familyId &&
    (payment.status === "pending" || payment.status === "partial") &&
    (payment.items || []).some(matchesThis)
  ));
  const status = isCard ? "carte"
    : isCeleris ? "réglé (Celeris)"
    : isForfaitPaid ? "forfait"
    : isForfaitPending ? "forfait à régler"
    : hasPaid ? "réglé"
    : hasPending ? "en attente"
    : "non réglé";

  return (
    <span
      title={`${childName} · ${status}`}
      className={`h-2.5 w-2.5 flex-shrink-0 rounded-full border border-white ring-1 ${
        isCard ? "bg-blue-500 ring-blue-200"
          : isCeleris ? "bg-teal-500 ring-teal-200"
          : isForfaitPaid ? "bg-emerald-500 ring-emerald-200"
          : isForfaitPending ? "bg-amber-400 ring-amber-200"
          : hasPaid ? "bg-green-500 ring-green-200"
          : hasPending ? "bg-orange-400 ring-orange-200"
          : "bg-slate-300 ring-slate-200"
      }`}
    />
  );
}

function CreneauCard({ c, payments, onSelect, onDelete, onEdit }: {
  c: Creneau & { id: string };
  payments: any[];
  onSelect: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const enrolled = c.enrolled || [];
  const fill = c.maxPlaces > 0 ? enrolled.length / c.maxPlaces : 0;
  const tone = fillTone(fill);
  const color = (c as any).color || typeColors[c.activityType] || "#64748b";

  const unpaidCount = enrolled.filter((person: any) => {
    const isCard = person.paymentSource === "card";
    const isCeleris = person.paymentSource === "celeris";
    const isForfait = person.paymentSource === "forfait";
    const isForfaitPaid = isForfait && isForfaitChildPaye(payments, person.familyId, person.childId);
    const isForfaitPending = isForfait && !isForfaitPaid;
    const matchesThis = (item: any) => itemMatchesCreneau(item, person, c);
    const hasPaid = isCard || isCeleris || isForfaitPaid || payments.some((payment: any) =>
      payment.familyId === person.familyId && payment.status === "paid" && (payment.items || []).some(matchesThis)
    );
    const hasPending = !hasPaid && !isCard && !isCeleris && (isForfaitPending || payments.some((payment: any) =>
      payment.familyId === person.familyId &&
      (payment.status === "pending" || payment.status === "partial") &&
      (payment.items || []).some(matchesThis)
    ));
    return !hasPaid && !hasPending && !isCard && !isCeleris;
  }).length;

  return (
    <div
      onClick={onSelect}
      className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-100 bg-white p-2.5 shadow-[0_4px_16px_rgba(12,26,46,0.045)] transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_10px_26px_rgba(12,26,46,0.1)]"
    >
      <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color }} />
      <div className="pl-1">
        <div className="flex items-center justify-between gap-2 pr-8">
          <div className="font-body text-[10px] font-bold" style={{ color }}>{c.startTime}–{c.endTime}</div>
          <span className={`rounded-full px-1.5 py-0.5 font-body text-[8px] font-bold ${tone.bg} ${tone.text}`}>
            {enrolled.length}/{c.maxPlaces}
          </span>
        </div>
        <div className="mt-1 font-body text-[11px] font-bold leading-tight text-blue-950">{c.activityTitle}</div>
        <div className="mt-0.5 truncate font-body text-[9px] text-slate-400">{c.monitor || "Moniteur à définir"}</div>

        <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(fill * 100, 100)}%` }} />
        </div>

        {enrolled.length > 0 && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {enrolled.slice(0, 7).map((person: any) => (
                <PaymentDot
                  key={person.childId}
                  enrolled={person}
                  payments={payments}
                  childId={person.childId}
                  childName={person.childName}
                  creneauId={c.id}
                  activityTitle={c.activityTitle}
                />
              ))}
              {enrolled.length > 7 && <span className="font-body text-[8px] font-semibold text-slate-400">+{enrolled.length - 7}</span>}
            </div>
            {unpaidCount > 0 && (
              <span className="rounded-full bg-red-50 px-1.5 py-0.5 font-body text-[8px] font-bold text-red-600" title={`${unpaidCount} impayé${unpaidCount > 1 ? "s" : ""}`}>
                {unpaidCount} dû{unpaidCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onEdit(); }}
          aria-label="Modifier le créneau"
          className="flex h-6 w-6 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-500 hover:bg-blue-100"
        >
          <Settings size={11} />
        </button>
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onDelete(); }}
          aria-label="Supprimer le créneau"
          className="flex h-6 w-6 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-500 hover:bg-red-100"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

function CreneauCardCompact({ c, onSelect, onDelete, onEdit }: {
  c: Creneau & { id: string };
  payments: any[];
  onSelect: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const enrolled = c.enrolled || [];
  const fill = c.maxPlaces > 0 ? enrolled.length / c.maxPlaces : 0;
  const tone = fillTone(fill);
  const color = (c as any).color || typeColors[c.activityType] || "#64748b";

  return (
    <div
      onClick={onSelect}
      className="group relative min-w-0 flex-1 cursor-pointer overflow-hidden rounded-xl border border-slate-100 bg-white p-2 shadow-[0_3px_12px_rgba(12,26,46,0.04)] transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
    >
      <div className="absolute inset-y-0 left-0 w-0.5" style={{ backgroundColor: color }} />
      <div className="pl-0.5 pr-4">
        <div className="font-body text-[9px] font-bold" style={{ color }}>{c.startTime}</div>
        <div className="mt-0.5 break-words font-body text-[9px] font-bold leading-tight text-blue-950">{c.activityTitle}</div>
        <div className={`mt-1 font-body text-[8px] font-bold ${tone.text}`}>{enrolled.length}/{c.maxPlaces}</div>
      </div>
      <div className="absolute right-1 top-1 flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
        <button type="button" onClick={(event) => { event.stopPropagation(); onEdit(); }} aria-label="Modifier" className="flex h-4 w-4 items-center justify-center rounded bg-blue-50 text-blue-500"><Settings size={8} /></button>
        <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(); }} aria-label="Supprimer" className="flex h-4 w-4 items-center justify-center rounded bg-red-50 text-red-500"><Trash2 size={8} /></button>
      </div>
    </div>
  );
}

function WeekSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white p-2">
      <div className="grid min-w-[760px] grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="animate-pulse space-y-2 rounded-xl bg-slate-50 p-2">
            <div className="h-9 rounded-lg bg-slate-200" />
            <div className="h-24 rounded-xl bg-slate-100" />
            <div className="h-16 rounded-xl bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WeekView({
  loading,
  weekDates,
  creneaux,
  payments,
  onPrev,
  onNext,
  onToday,
  onPickDate,
  onSelectCreneau,
  onOpenDelete,
  onOpenEdit,
  onAddCreneau,
  onGoToDay,
}: Props) {
  const isToday = (date: Date) => fmtDate(date) === fmtDate(new Date());

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-3 shadow-[0_5px_22px_rgba(12,26,46,0.035)]">
        <button
          type="button"
          onClick={onPrev}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 font-body text-xs font-semibold text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        >
          <ChevronLeft size={15} /> Précédente
        </button>

        <div className="order-first flex w-full flex-col items-center gap-1 sm:order-none sm:w-auto">
          <div className="font-display text-lg font-bold capitalize text-blue-950">{fmtMonthFR(weekDates[0])}</div>
          <div className="font-body text-[11px] text-slate-400">
            {weekDates[0].toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} → {weekDates[6].toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </div>
          <input
            type="date"
            title="Aller à cette date"
            aria-label="Aller à une date"
            className="mt-0.5 border border-slate-200 bg-slate-50 px-2 py-1 font-body text-[10px] text-slate-500"
            onChange={(event) => {
              if (!event.target.value) return;
              const [year, month, day] = event.target.value.split("-").map(Number);
              const picked = new Date(year, month - 1, day);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const pickedDow = (picked.getDay() + 6) % 7;
              const pickedMonday = new Date(picked);
              pickedMonday.setDate(picked.getDate() - pickedDow);
              const todayDow = (today.getDay() + 6) % 7;
              const todayMonday = new Date(today);
              todayMonday.setDate(today.getDate() - todayDow);
              onPickDate(Math.round((pickedMonday.getTime() - todayMonday.getTime()) / (7 * 86400000)));
              event.target.value = "";
            }}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onToday}
            className="rounded-xl border-none bg-blue-50 px-3 py-2 font-body text-xs font-bold text-blue-700 hover:bg-blue-100"
          >
            Aujourd’hui
          </button>
          <button
            type="button"
            onClick={onNext}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 font-body text-xs font-semibold text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          >
            Suivante <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {loading ? (
        <WeekSkeleton />
      ) : (
        <div className="-mx-3 overflow-x-auto px-3 pb-2">
          <div className="grid min-w-[820px] grid-cols-7 gap-2 rounded-2xl border border-slate-100 bg-white p-2 shadow-[0_8px_30px_rgba(12,26,46,0.035)]">
            {weekDates.map((date, index) => (
              <button
                type="button"
                key={index}
                onClick={() => onGoToDay(date)}
                className={`rounded-xl border px-2 py-2.5 text-center font-body transition-all ${
                  isToday(date)
                    ? "border-blue-600 bg-blue-600 text-white shadow-[0_6px_18px_rgba(32,80,160,0.2)]"
                    : "border-transparent bg-slate-50 text-slate-600 hover:border-blue-100 hover:bg-blue-50 hover:text-blue-700"
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-[0.08em]">{date.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}</div>
                <div className="mt-0.5 font-display text-lg font-bold">{date.getDate()}</div>
              </button>
            ))}

            {weekDates.map((date, index) => {
              const dateString = fmtDate(date);
              const allDaySlots = creneaux.filter((slot) => slot.date === dateString).sort(compareCreneaux);
              const regularSlots = allDaySlots.filter((slot) => !isStageType(slot));
              const stages = allDaySlots.filter((slot) => isStageType(slot));
              const stagesByTime: Record<string, typeof stages> = {};
              stages.forEach((slot) => {
                if (!stagesByTime[slot.startTime]) stagesByTime[slot.startTime] = [];
                stagesByTime[slot.startTime].push(slot);
              });

              const grouped: Array<{ key: string; items: typeof regularSlots; startTime: string }> = [];
              regularSlots.forEach((slot) => {
                const key = `${slot.startTime}-${slot.endTime}`;
                const existing = grouped.find((group) => group.key === key);
                if (existing) existing.items.push(slot);
                else grouped.push({ key, items: [slot], startTime: slot.startTime });
              });

              type RenderItem =
                | { type: "stage"; startTime: string; list: typeof stages }
                | { type: "cours"; startTime: string; group: typeof grouped[0] };

              const renderItems: RenderItem[] = [
                ...Object.entries(stagesByTime).map(([startTime, list]) => ({ type: "stage" as const, startTime, list })),
                ...grouped.map((group) => ({ type: "cours" as const, startTime: group.startTime, group })),
              ];

              renderItems.sort((first, second) => {
                const toMinutes = (time: string) => {
                  const [hours, minutes] = time.split(":").map(Number);
                  return hours * 60 + (minutes || 0);
                };
                const difference = toMinutes(first.startTime) - toMinutes(second.startTime);
                if (difference !== 0) return difference;
                return first.type === "cours" ? -1 : 1;
              });

              return (
                <div
                  key={`column-${index}`}
                  className={`flex min-h-[230px] flex-col gap-1.5 rounded-xl p-1.5 ${isToday(date) ? "bg-blue-50/55 ring-1 ring-blue-100" : "bg-slate-50/55"}`}
                  style={{ minWidth: "105px" }}
                >
                  {renderItems.map((item, itemIndex) => {
                    if (item.type === "stage") {
                      return <StageBadge key={`stage-${itemIndex}`} list={item.list} onGoToDay={() => onGoToDay(date)} />;
                    }

                    if (item.group.items.length > 1) {
                      return (
                        <div key={item.group.key} className="flex gap-1">
                          {item.group.items.map((slot) => (
                            <CreneauCardCompact
                              key={slot.id}
                              c={slot}
                              payments={payments}
                              onSelect={() => onSelectCreneau(slot)}
                              onDelete={() => onOpenDelete(slot)}
                              onEdit={() => onOpenEdit(slot)}
                            />
                          ))}
                        </div>
                      );
                    }

                    const slot = item.group.items[0];
                    return (
                      <CreneauCard
                        key={slot.id}
                        c={slot}
                        payments={payments}
                        onSelect={() => onSelectCreneau(slot)}
                        onDelete={() => onOpenDelete(slot)}
                        onEdit={() => onOpenEdit(slot)}
                      />
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => onAddCreneau(dateString)}
                    className="group/add mt-auto flex min-h-10 items-center justify-center gap-1 rounded-xl border border-dashed border-slate-200 bg-white/60 font-body text-[10px] font-semibold text-slate-400 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Plus size={13} /> <span>Ajouter</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
