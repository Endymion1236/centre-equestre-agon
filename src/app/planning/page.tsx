"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import IllustratedFeatureBand from "@/components/public/IllustratedFeatureBand";
import { compareCreneaux } from "@/lib/creneau-sort";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock, Filter, Sparkles, Users } from "lucide-react";

interface Creneau {
  id: string;
  activityTitle: string;
  activityType: string;
  date: string;
  startTime: string;
  endTime: string;
  monitor: string;
  maxPlaces: number;
  enrolled: unknown[];
  priceTTC?: number;
  priceHT?: number;
  tvaTaux?: number;
  status?: string;
}

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  cours: { label: "Cours", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
  balade: { label: "Balade", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
  stage: { label: "Stage", color: "#b45309", bg: "#fffbeb", border: "#fde68a" },
  stage_journee: { label: "Stage", color: "#b45309", bg: "#fffbeb", border: "#fde68a" },
  ponyride: { label: "Pony ride", color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
  anniversaire: { label: "Anniversaire", color: "#be185d", bg: "#fdf2f8", border: "#fbcfe8" },
  animation: { label: "Animation", color: "#0e7490", bg: "#ecfeff", border: "#a5f3fc" },
};

function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getMonday(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day));
  return copy;
}

function priceOf(slot: Creneau) {
  if (typeof slot.priceTTC === "number") return slot.priceTTC;
  if (typeof slot.priceHT === "number") return Math.round(slot.priceHT * (1 + (slot.tvaTaux || 5.5) / 100) * 100) / 100;
  return null;
}

function activityLink(type: string) {
  if (type === "balade") return "/activites?profil=balade";
  if (type === "stage" || type === "stage_journee") return "/activites?profil=enfant";
  if (type === "cours") return "/activites?profil=cours";
  if (type === "ponyride") return "/activites/ponyride";
  if (type === "anniversaire") return "/activites/anniversaire";
  return "/activites";
}

function PlanningSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="animate-pulse overflow-hidden rounded-[22px] border border-slate-100 bg-white">
          <div className="h-16 bg-slate-100" />
          <div className="space-y-3 p-4"><div className="h-28 rounded-2xl bg-slate-100" /><div className="h-24 rounded-2xl bg-slate-100" /></div>
        </div>
      ))}
    </div>
  );
}

export default function PlanningPublic() {
  const [slots, setSlots] = useState<Creneau[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [filter, setFilter] = useState("all");

  const monday = useMemo(() => {
    const date = getMonday(new Date());
    date.setDate(date.getDate() + weekOffset * 7);
    return date;
  }, [weekOffset]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  }), [monday]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const snapshot = await getDocs(query(
          collection(db, "creneaux"),
          where("date", ">=", localDateString(days[0])),
          where("date", "<=", localDateString(days[6])),
        ));
        const data = snapshot.docs
          .map((document) => ({ id: document.id, ...document.data() } as Creneau))
          .filter((slot) => slot.status !== "closed" && slot.status !== "cancelled")
          .sort(compareCreneaux);
        if (!cancelled) setSlots(data);
      } catch (error) {
        console.error("Erreur de chargement du planning public :", error);
        if (!cancelled) setSlots([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [days]);

  const types = useMemo(() => Array.from(new Set(slots.map((slot) => slot.activityType === "stage_journee" ? "stage" : slot.activityType))), [slots]);

  const filtered = useMemo(() => {
    if (filter === "all") return slots;
    return slots.filter((slot) => slot.activityType === filter || (filter === "stage" && slot.activityType === "stage_journee"));
  }, [filter, slots]);

  const byDay = useMemo(() => {
    const result: Record<string, Creneau[]> = {};
    days.forEach((day) => { result[localDateString(day)] = []; });
    filtered.forEach((slot) => result[slot.date]?.push(slot));
    Object.values(result).forEach((items) => items.sort(compareCreneaux));
    return result;
  }, [days, filtered]);

  const today = localDateString(new Date());
  const upcoming = slots.filter((slot) => slot.date >= today);
  const availablePlaces = upcoming.reduce((total, slot) => total + Math.max(0, Number(slot.maxPlaces || 0) - (slot.enrolled?.length || 0)), 0);
  const nextAvailable = upcoming.find((slot) => Number(slot.maxPlaces || 0) === 0 || (slot.enrolled?.length || 0) < Number(slot.maxPlaces || 0));
  const displayedDays = days.filter((day) => (byDay[localDateString(day)] || []).length > 0 || localDateString(day) === today);
  const weekLabel = `${days[0].toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} au ${days[6].toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-cream">
        <section className="relative overflow-hidden bg-[linear-gradient(135deg,#07111f_0%,#12346b_58%,#2050a0_100%)] px-6 pb-20 pt-36 text-white sm:pb-24 sm:pt-40">
          <div className="pointer-events-none absolute -right-24 -top-36 h-96 w-96 rounded-full border border-white/[0.06] bg-white/[0.03]" />
          <div className="relative mx-auto max-w-[1120px]">
            <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="max-w-3xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 py-2 font-body text-[10px] font-bold uppercase tracking-[0.18em] text-gold-300"><CalendarDays size={14} /> Les prochaines aventures</div>
                <h1 className="font-display text-4xl font-bold leading-tight text-white sm:text-5xl">Planning des activités</h1>
                <p className="mt-5 max-w-2xl font-body text-base leading-relaxed text-white/62">Repérez les stages, balades, animations et créneaux ouverts. La réservation se finalise ensuite dans votre espace famille.</p>
              </div>
              <Link href="/espace-cavalier/reserver" className="group inline-flex items-center justify-center gap-2 rounded-xl bg-gold-400 px-6 py-4 font-body text-sm font-bold text-blue-950 no-underline shadow-[0_12px_30px_rgba(240,160,16,0.2)] transition-transform hover:-translate-y-0.5">Réserver une activité <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></Link>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm"><div className="font-display text-2xl font-bold text-white">{loading ? "…" : upcoming.length}</div><div className="mt-1 font-body text-xs text-white/45">créneaux cette semaine</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm"><div className="font-display text-2xl font-bold text-gold-300">{loading ? "…" : availablePlaces}</div><div className="mt-1 font-body text-xs text-white/45">places encore affichées</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm"><div className="truncate font-display text-lg font-bold text-white">{loading ? "Chargement…" : nextAvailable?.activityTitle || "À venir"}</div><div className="mt-1 font-body text-xs text-white/45">{nextAvailable ? `${new Date(`${nextAvailable.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" })} · ${nextAvailable.startTime}` : "Consultez la semaine suivante"}</div></div>
            </div>
          </div>
        </section>

        <section className="px-4 pt-8 sm:px-6 sm:pt-10">
          <div className="mx-auto max-w-[1120px]">
            <IllustratedFeatureBand
              image="/images/vitrine/choices/balade-plage.webp"
              alt="Une cavalière découvre le littoral à poney"
              eyebrow="Choisir avant de réserver"
              title="Un stage, un cours ou une balade ?"
              text="Le planning montre les créneaux ouverts. Les fiches activités expliquent l’âge, le niveau et le contenu pour vous aider à choisir le bon groupe."
              href="/activites"
              cta="Comparer les activités"
              tone="orange"
              compact
            />
          </div>
        </section>

        <section className="px-4 py-10 sm:px-6 sm:py-14">
          <div className="mx-auto max-w-[1120px]">
            <div className="mb-6 rounded-[22px] border border-blue-500/[0.08] bg-white p-4 shadow-[0_10px_35px_rgba(12,26,46,0.04)] sm:p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <button type="button" onClick={() => setWeekOffset((value) => value - 1)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 font-body text-xs font-bold text-slate-600 hover:border-blue-200 hover:text-blue-700"><ChevronLeft size={16} /> Semaine précédente</button>
                <div className="text-center"><div className="font-display text-xl font-bold capitalize text-blue-950">{weekLabel}</div>{weekOffset !== 0 && <button type="button" onClick={() => setWeekOffset(0)} className="mt-1 border-none bg-transparent font-body text-xs font-bold text-blue-600">Revenir à cette semaine</button>}</div>
                <button type="button" onClick={() => setWeekOffset((value) => value + 1)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 font-body text-xs font-bold text-slate-600 hover:border-blue-200 hover:text-blue-700">Semaine suivante <ChevronRight size={16} /></button>
              </div>

              <div className="mt-5 flex items-center gap-2 overflow-x-auto border-t border-slate-100 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400"><Filter size={15} /></div>
                <button type="button" onClick={() => setFilter("all")} className={`flex-shrink-0 rounded-full border px-4 py-2 font-body text-xs font-bold ${filter === "all" ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 bg-white text-slate-500"}`}>Tout</button>
                {types.map((type) => {
                  const info = TYPE_LABELS[type] || { label: type, color: "#475569", bg: "#f8fafc", border: "#e2e8f0" };
                  const active = filter === type;
                  return <button key={type} type="button" onClick={() => setFilter(active ? "all" : type)} className="flex-shrink-0 rounded-full border px-4 py-2 font-body text-xs font-bold" style={active ? { background: info.color, borderColor: info.color, color: "white" } : { background: info.bg, borderColor: info.border, color: info.color }}>{info.label}</button>;
                })}
              </div>
            </div>

            {loading ? <PlanningSkeleton /> : displayedDays.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {displayedDays.map((day) => {
                  const key = localDateString(day);
                  const daySlots = byDay[key] || [];
                  const isToday = key === today;
                  const isPast = key < today;
                  return (
                    <article key={key} className={`overflow-hidden rounded-[22px] border bg-white shadow-[0_10px_35px_rgba(12,26,46,0.035)] ${isToday ? "border-blue-300 ring-4 ring-blue-50" : "border-blue-500/[0.08]"}`}>
                      <header className={`flex items-center justify-between px-5 py-4 ${isToday ? "bg-blue-700 text-white" : "bg-slate-50 text-blue-950"}`}>
                        <div><div className="font-body text-[10px] font-bold uppercase tracking-[0.14em] opacity-55">{isToday ? "Aujourd’hui" : day.toLocaleDateString("fr-FR", { weekday: "long" })}</div><div className="mt-0.5 font-display text-lg font-bold capitalize">{day.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</div></div>
                        <div className={`rounded-full px-2.5 py-1 font-body text-[10px] font-bold ${isToday ? "bg-white/12 text-white" : "bg-white text-slate-400"}`}>{daySlots.length} activité{daySlots.length > 1 ? "s" : ""}</div>
                      </header>

                      <div className="divide-y divide-slate-100 p-2">
                        {daySlots.length === 0 ? (
                          <div className="px-4 py-10 text-center"><Sparkles size={22} className="mx-auto text-blue-200" /><div className="mt-3 font-body text-xs text-slate-400">Aucun créneau publié aujourd’hui</div></div>
                        ) : daySlots.map((slot) => {
                          const info = TYPE_LABELS[slot.activityType] || TYPE_LABELS.cours;
                          const enrolled = slot.enrolled?.length || 0;
                          const capacity = Number(slot.maxPlaces || 0);
                          const places = capacity > 0 ? Math.max(0, capacity - enrolled) : null;
                          const full = places === 0;
                          const price = priceOf(slot);
                          return (
                            <div key={slot.id} className={`rounded-2xl p-4 transition-colors hover:bg-slate-50 ${isPast ? "opacity-55" : ""}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <span className="inline-flex rounded-full border px-2.5 py-1 font-body text-[9px] font-bold uppercase tracking-wide" style={{ background: info.bg, borderColor: info.border, color: info.color }}>{info.label}</span>
                                  <h2 className="mt-2 font-display text-lg font-bold leading-tight text-blue-950">{slot.activityTitle}</h2>
                                </div>
                                {price !== null && <div className="flex-shrink-0 font-display text-lg font-bold text-blue-700">{price}€</div>}
                              </div>
                              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 font-body text-xs text-slate-500">
                                <span className="flex items-center gap-1.5"><Clock size={13} className="text-blue-400" />{slot.startTime}–{slot.endTime}</span>
                                {slot.monitor && <span>{slot.monitor}</span>}
                              </div>
                              <div className="mt-4 flex items-center justify-between gap-3">
                                <div className={`flex items-center gap-1.5 font-body text-xs font-bold ${full ? "text-red-500" : places !== null && places <= 2 ? "text-orange-600" : "text-emerald-600"}`}><Users size={14} />{capacity === 0 ? `${enrolled} inscrit${enrolled > 1 ? "s" : ""}` : full ? "Complet" : `${places} place${places && places > 1 ? "s" : ""}`}</div>
                                {!isPast && <Link href="/espace-cavalier/reserver" className={`rounded-lg px-3 py-2 font-body text-[11px] font-bold no-underline ${full ? "bg-slate-100 text-slate-500" : "bg-blue-700 text-white"}`}>{full ? "Voir la liste d’attente" : "Réserver"}</Link>}
                              </div>
                              <Link href={activityLink(slot.activityType)} className="mt-3 inline-flex items-center gap-1 font-body text-[11px] font-semibold text-blue-500 no-underline">En savoir plus sur cette activité <ArrowRight size={12} /></Link>
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-blue-200 bg-white px-6 py-16 text-center"><CalendarDays size={30} className="mx-auto text-blue-300" /><h2 className="mt-4 font-display text-xl font-bold text-blue-950">Aucun créneau publié pour cette sélection</h2><p className="mt-2 font-body text-sm text-slate-500">Essayez une autre catégorie ou consultez la semaine suivante.</p></div>
            )}

            <div className="mt-10 grid overflow-hidden rounded-[26px] bg-[linear-gradient(135deg,#07111f,#12346b)] text-white shadow-[0_22px_60px_rgba(12,26,46,0.14)] md:grid-cols-[1fr_auto] md:items-center">
              <div className="p-7 sm:p-9"><div className="font-body text-xs font-bold uppercase tracking-[0.16em] text-gold-300">Votre espace famille</div><h2 className="mt-3 font-display text-2xl font-bold text-white">Réservez, payez et retrouvez toutes vos activités au même endroit</h2><p className="mt-3 max-w-2xl font-body text-sm leading-relaxed text-white/55">Ajoutez vos cavaliers, choisissez le bon niveau et suivez les inscriptions depuis votre compte.</p></div>
              <div className="flex flex-col gap-2 p-7 pt-0 md:p-9"><Link href="/espace-cavalier/reserver" className="rounded-xl bg-gold-400 px-6 py-3.5 text-center font-body text-sm font-bold text-blue-950 no-underline">Réserver en ligne</Link><Link href="/contact" className="rounded-xl border border-white/15 bg-white/[0.06] px-6 py-3.5 text-center font-body text-sm font-bold text-white no-underline">Nous contacter</Link></div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
