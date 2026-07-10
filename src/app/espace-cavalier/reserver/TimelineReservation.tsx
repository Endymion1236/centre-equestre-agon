"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { compareCreneaux } from "@/lib/creneau-sort";

interface Creneau {
  id: string;
  activityTitle: string;
  activityType: string;
  activityId?: string;
  date: string;
  startTime: string;
  endTime: string;
  monitor: string;
  maxPlaces: number;
  enrolled: any[];
  enrolledCount?: number;
  priceTTC?: number;
  priceHT?: number;
  tvaTaux?: number;
  color?: string;
}

interface Child {
  id: string;
  firstName: string;
  galopLevel?: string;
}

interface Props {
  creneaux: Creneau[];
  children: Child[];
  familyId: string;
  onBook: (creneau: Creneau) => void;
  stagesAvailable?: number;
  onSeeStages?: () => void;
}

type FilterId = "pour_moi" | "cours" | "balade" | "tous";

const TYPE_COLORS: Record<string, string> = {
  cours: "#2050A0",
  cycle: "#0ea5e9",
  balade: "#e67e22",
  competition: "#7c3aed",
  anniversaire: "#D63031",
};

const DAYS_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const DAYS_FULL_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function fmtDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isRelevantForFamily(creneau: Creneau, children: Child[]): "perfect" | "ok" | "maybe" {
  if (children.length === 0) return "ok";
  if (creneau.activityType === "balade") return "ok";

  const title = creneau.activityTitle.toLowerCase();
  const galopMatch = title.match(/galop\s*(\d+)|g(\d+)|[gG](\d+)/);
  if (!galopMatch) return "ok";

  const titleLevel = parseInt(galopMatch[1] || galopMatch[2] || galopMatch[3]);
  const levels = children
    .map((child) => parseInt((child.galopLevel || "").replace(/[^0-9]/g, "")))
    .filter((level) => !Number.isNaN(level));

  if (levels.some((level) => level === titleLevel)) return "perfect";
  if (levels.some((level) => Math.abs(level - titleLevel) <= 1)) return "ok";
  return "maybe";
}

export default function TimelineReservation({
  creneaux,
  children,
  familyId,
  onBook,
  stagesAvailable = 0,
  onSeeStages,
}: Props) {
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  });
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  });
  const [filter, setFilter] = useState<FilterId>("pour_moi");
  const [selectedChild, setSelectedChild] = useState("tous");

  const todayStr = fmtDate(new Date());
  const currentDayStr = fmtDate(selectedDate);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + index);
      return date;
    }),
    [weekStart],
  );

  const activeChildren = useMemo(() => {
    if (selectedChild === "tous") return children;
    return children.filter((child) => child.id === selectedChild);
  }, [children, selectedChild]);

  const applyFilter = (items: Creneau[]) => {
    if (filter === "pour_moi") {
      return items.filter((creneau) => isRelevantForFamily(creneau, activeChildren) !== "maybe");
    }
    if (filter === "tous") return items;
    return items.filter((creneau) => creneau.activityType === filter);
  };

  const dayCreneaux = useMemo(() => {
    const items = creneaux.filter((creneau) => creneau.date === currentDayStr && creneau.date >= todayStr);
    return applyFilter(items).sort(compareCreneaux);
  }, [creneaux, currentDayStr, todayStr, filter, activeChildren]);

  const creneauxByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    weekDays.forEach((date) => {
      const dateStr = fmtDate(date);
      counts[dateStr] = applyFilter(creneaux.filter((creneau) => creneau.date === dateStr)).length;
    });
    return counts;
  }, [creneaux, weekDays, filter, activeChildren]);

  const goToDay = (date: Date) => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    setSelectedDate(normalized);

    const dateStr = fmtDate(normalized);
    const visibleDates = weekDays.map(fmtDate);
    if (!visibleDates.includes(dateStr)) {
      const nextStart = new Date(normalized);
      nextStart.setDate(nextStart.getDate() - 3);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (nextStart < today) nextStart.setTime(today.getTime());
      setWeekStart(nextStart);
    }
  };

  const moveWeek = (direction: -1 | 1) => {
    const nextStart = new Date(weekStart);
    nextStart.setDate(nextStart.getDate() + direction * 7);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (nextStart < today) nextStart.setTime(today.getTime());
    setWeekStart(nextStart);
    setSelectedDate(new Date(nextStart));
  };

  const holdActive = (creneau: any) => {
    const hold = creneau?.waitlistHold;
    if (!hold?.until) return false;
    if (new Date(hold.until).getTime() < Date.now()) return false;
    if ((creneau.enrolled || []).some((entry: any) => entry.childId === hold.childId)) return false;
    return true;
  };

  const spotsLeft = (creneau: Creneau) => {
    const base = creneau.maxPlaces - (creneau.enrolled?.length || 0);
    if (holdActive(creneau) && (creneau as any).waitlistHold?.familyId !== familyId) {
      return Math.max(0, base - 1);
    }
    return base;
  };

  const hasFamilyEnrolled = (creneau: Creneau) =>
    (creneau.enrolled || []).some((entry: any) => entry.familyId === familyId);

  const isAlreadyEnrolled = (creneau: Creneau) =>
    children.length > 0 &&
    children.every((child) => (creneau.enrolled || []).some((entry: any) => entry.childId === child.id));

  const price = (creneau: Creneau) =>
    creneau.priceTTC || (creneau.priceHT || 0) * (1 + (creneau.tvaTaux || 5.5) / 100);

  const filterOptions: { id: FilterId; label: string; icon: string }[] = [
    { id: "pour_moi", label: "Pour vous", icon: "✨" },
    { id: "cours", label: "Cours", icon: "🐴" },
    { id: "balade", label: "Balades", icon: "🌅" },
    { id: "tous", label: "Tout voir", icon: "＋" },
  ];

  return (
    <div>
      {/* Choix du cavalier */}
      {children.length > 1 && (
        <section className="mb-5">
          <div className="font-body text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Pour qui ?</div>
          <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedChild("tous")}
              className={`flex-shrink-0 px-4 py-2 rounded-xl font-body text-sm font-semibold border cursor-pointer transition-all ${
                selectedChild === "tous"
                  ? "bg-blue-800 text-white border-blue-800"
                  : "bg-white text-slate-600 border-gray-200"
              }`}
            >
              Toute la famille
            </button>
            {children.map((child) => (
              <button
                type="button"
                key={child.id}
                onClick={() => setSelectedChild(child.id)}
                className={`flex-shrink-0 px-4 py-2 rounded-xl font-body text-sm font-semibold border cursor-pointer transition-all ${
                  selectedChild === child.id
                    ? "bg-blue-800 text-white border-blue-800"
                    : "bg-white text-slate-600 border-gray-200"
                }`}
              >
                {child.firstName}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Catégories principales */}
      <section className="mb-5">
        <div className="font-body text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Que recherchez-vous ?</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {filterOptions.map((option) => (
            <button
              type="button"
              key={option.id}
              onClick={() => setFilter(option.id)}
              className={`flex items-center gap-2 px-3 py-3 rounded-xl border font-body text-sm font-semibold cursor-pointer transition-all text-left ${
                filter === option.id
                  ? "bg-blue-500 text-white border-blue-500 shadow-sm"
                  : "bg-white text-blue-800 border-gray-200 hover:border-blue-200"
              }`}
            >
              <span className="text-lg">{option.icon}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>

        {stagesAvailable > 0 && onSeeStages && (
          <button
            type="button"
            onClick={onSeeStages}
            className="mt-2 w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-green-200 bg-green-50 text-left cursor-pointer hover:bg-green-100 transition-colors"
          >
            <span>
              <span className="font-body text-sm font-bold text-green-800">🏇 Voir les stages</span>
              <span className="font-body text-xs text-green-700 block mt-0.5">
                {stagesAvailable} stage{stagesAvailable > 1 ? "s" : ""} disponible{stagesAvailable > 1 ? "s" : ""}
              </span>
            </span>
            <ChevronRight size={18} className="text-green-700" />
          </button>
        )}
      </section>

      {/* Navigation dans les jours */}
      <section className="mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="font-display text-lg font-bold text-blue-800">Planning des activités</div>
            <div className="font-body text-xs text-gray-600">Choisissez un jour pour voir les places disponibles.</div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => moveWeek(-1)}
              disabled={fmtDate(weekStart) <= todayStr}
              className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center cursor-pointer disabled:opacity-30"
              aria-label="Semaine précédente"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              onClick={() => moveWeek(1)}
              className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center cursor-pointer"
              aria-label="Semaine suivante"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {weekDays.map((date) => {
            const dateStr = fmtDate(date);
            const active = dateStr === currentDayStr;
            const today = dateStr === todayStr;
            const count = creneauxByDay[dateStr] || 0;
            return (
              <button
                type="button"
                key={dateStr}
                onClick={() => goToDay(date)}
                className={`min-w-0 rounded-xl border py-2 px-1 cursor-pointer transition-all ${
                  active
                    ? "bg-blue-500 text-white border-blue-500 shadow-sm"
                    : today
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-white text-slate-600 border-gray-200"
                }`}
              >
                <span className="font-body text-[10px] uppercase block opacity-75">{DAYS_FR[date.getDay()]}</span>
                <span className="font-body text-base font-bold block">{date.getDate()}</span>
                <span className={`font-body text-[10px] block mt-0.5 ${active ? "text-blue-100" : count > 0 ? "text-blue-500" : "text-gray-300"}`}>
                  {count > 0 ? count : "·"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Résumé du jour */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="font-display text-base font-bold text-blue-800 capitalize">
            {DAYS_FULL_FR[selectedDate.getDay()]} {selectedDate.getDate()} {selectedDate.toLocaleDateString("fr-FR", { month: "long" })}
          </div>
          <div className="font-body text-xs text-gray-600 mt-0.5">
            {dayCreneaux.length === 0
              ? "Aucune activité disponible ce jour"
              : `${dayCreneaux.length} activité${dayCreneaux.length > 1 ? "s" : ""} disponible${dayCreneaux.length > 1 ? "s" : ""}`}
          </div>
        </div>
        <label className="relative flex items-center gap-2 font-body text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-3 py-2 rounded-xl cursor-pointer">
          <CalendarDays size={15} />
          <span className="hidden sm:inline">Choisir une date</span>
          <input
            type="date"
            min={todayStr}
            value={currentDayStr}
            onChange={(event) => {
              if (event.target.value) goToDay(new Date(`${event.target.value}T00:00:00`));
            }}
            className="absolute inset-0 opacity-0 cursor-pointer"
            aria-label="Choisir une date"
          />
        </label>
      </div>

      {/* Activités du jour */}
      {dayCreneaux.length === 0 ? (
        <Card padding="lg" className="text-center">
          <div className="text-4xl mb-3">🌾</div>
          <div className="font-body text-sm font-bold text-blue-800">Rien de prévu ce jour-là</div>
          <p className="font-body text-xs text-gray-600 mt-1 mb-0">Essayez un autre jour ou une autre catégorie.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {dayCreneaux.map((creneau) => {
            const spots = spotsLeft(creneau);
            const full = spots <= 0;
            const familyEnrolled = hasFamilyEnrolled(creneau);
            const enrolled = isAlreadyEnrolled(creneau);
            const relevance = isRelevantForFamily(creneau, activeChildren);
            const color = creneau.color || TYPE_COLORS[creneau.activityType] || "#2050A0";
            const amount = price(creneau);

            return (
              <div
                key={creneau.id}
                className={`rounded-2xl border overflow-hidden transition-all ${
                  familyEnrolled
                    ? "border-green-200 bg-green-50"
                    : full
                      ? "border-gray-200 bg-gray-50"
                      : "border-blue-500/10 bg-white shadow-sm"
                }`}
                style={{ borderLeftWidth: 4, borderLeftColor: color }}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <div className="font-body text-base font-bold text-blue-800">{creneau.activityTitle}</div>
                        {relevance === "perfect" && (
                          <span className="inline-flex items-center gap-1 font-body text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                            <Sparkles size={10} /> Recommandé
                          </span>
                        )}
                        {familyEnrolled && (
                          <span className="inline-flex items-center gap-1 font-body text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                            <Check size={10} /> Inscrit
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-slate-500">
                        <span className="flex items-center gap-1 font-body text-xs">
                          <Clock size={12} /> {creneau.startTime}–{creneau.endTime}
                        </span>
                        {creneau.monitor && <span className="font-body text-xs">avec {creneau.monitor}</span>}
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      {amount > 0 && <div className="font-body text-lg font-bold text-blue-500">{amount.toFixed(0)}€</div>}
                      <Badge color={full ? "red" : spots <= 3 ? "orange" : "green"}>
                        <Users size={10} className="inline mr-0.5" />
                        {full ? "Complet" : `${spots} place${spots > 1 ? "s" : ""}`}
                      </Badge>
                    </div>
                  </div>

                  {!enrolled && (
                    <button
                      type="button"
                      onClick={() => onBook(creneau)}
                      className={`w-full mt-4 py-2.5 rounded-xl font-body text-sm font-bold cursor-pointer transition-all ${
                        full
                          ? "bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100"
                          : "bg-blue-500 text-white border-none hover:bg-blue-600"
                      }`}
                    >
                      {full ? "Rejoindre la liste d’attente" : "Choisir cette activité"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filter === "pour_moi" && children.some((child) => !child.galopLevel || child.galopLevel === "—") && (
        <p className="font-body text-xs text-slate-400 text-center mt-4">
          💡 Renseignez le niveau de vos cavaliers dans le profil pour affiner les recommandations.
        </p>
      )}
    </div>
  );
}
