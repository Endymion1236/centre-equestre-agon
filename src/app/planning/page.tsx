"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { CalendarDays, Clock, Users, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";

interface Creneau {
  id: string;
  activityTitle: string;
  activityType: string;
  date: string;
  startTime: string;
  endTime: string;
  monitor: string;
  maxPlaces: number;
  enrolled: any[];
  priceTTC?: number;
  priceHT?: number;
  tvaTaux?: number;
  status?: string;
}

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  cours:           { label: "Cours",      color: "#1a5fa8", bg: "#e8f0fb" },
  balade:          { label: "Balade",     color: "#1a8a4a", bg: "#e6f5ec" },
  stage:           { label: "Stage",      color: "#b45309", bg: "#fef3c7" },
  stage_journee:   { label: "Stage",      color: "#b45309", bg: "#fef3c7" },
  ponyride:        { label: "Pony ride",  color: "#7c3aed", bg: "#f3f0ff" },
  anniversaire:    { label: "Anniversaire", color: "#be185d", bg: "#fce7f3" },
  animation:       { label: "Animation", color: "#0891b2", bg: "#e0f7fa" },
};

function fmtDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function getMonday(d: Date) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  return mon;
}

export default function PlanningPublic() {
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [filter, setFilter] = useState("all");

  const monday = useMemo(() => {
    const m = getMonday(new Date());
    m.setDate(m.getDate() + weekOffset * 7);
    return m;
  }, [weekOffset]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [monday]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const start = fmtDate(days[0]);
        const end = fmtDate(days[6]);
        const snap = await getDocs(query(
          collection(db, "creneaux"),
          where("date", ">=", start),
          where("date", "<=", end),
        ));
        const data = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Creneau))
          .filter(c => c.status !== "closed");
        setCreneaux(data);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [days]);

  const filtered = useMemo(() => {
    if (filter === "all") return creneaux;
    return creneaux.filter(c => c.activityType === filter || (filter === "stage" && c.activityType === "stage_journee"));
  }, [creneaux, filter]);

  const byDay = useMemo(() => {
    const map: Record<string, Creneau[]> = {};
    days.forEach(d => { map[fmtDate(d)] = []; });
    filtered.forEach(c => {
      if (map[c.date]) map[c.date].push(c);
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => a.startTime.localeCompare(b.startTime)));
    return map;
  }, [filtered, days]);

  const types = useMemo(() => {
    const found = new Set(creneaux.map(c => c.activityType === "stage_journee" ? "stage" : c.activityType));
    return Array.from(found);
  }, [creneaux]);

  const weekLabel = `${days[0].toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} – ${days[6].toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-cream pt-20 pb-16">
        <div className="max-w-5xl mx-auto px-4">

          {/* Header */}
          <div className="mb-8 pt-6">
            <h1 className="font-display text-3xl font-bold text-blue-800 mb-1">Planning</h1>
            <p className="font-body text-sm text-gray-500">Consultez les créneaux disponibles cette semaine</p>
          </div>

          {/* Navigation semaine */}
          <div className="flex items-center justify-between mb-5">
            <button onClick={() => setWeekOffset(w => w - 1)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white font-body text-sm text-gray-600 cursor-pointer hover:border-blue-300 transition-colors">
              <ChevronLeft size={16} /> Semaine préc.
            </button>
            <div className="font-body text-sm font-semibold text-blue-800 text-center">{weekLabel}</div>
            <button onClick={() => setWeekOffset(w => w + 1)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white font-body text-sm text-gray-600 cursor-pointer hover:border-blue-300 transition-colors">
              Semaine suiv. <ChevronRight size={16} />
            </button>
          </div>

          {/* Filtres */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button onClick={() => setFilter("all")}
              className={`px-4 py-1.5 rounded-full font-body text-sm font-medium border cursor-pointer transition-all ${filter === "all" ? "bg-blue-800 text-white border-blue-800" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>
              Tout
            </button>
            {types.map(t => {
              const info = TYPE_LABELS[t] || { label: t, color: "#555", bg: "#f5f5f5" };
              const active = filter === t;
              return (
                <button key={t} onClick={() => setFilter(filter === t ? "all" : t)}
                  className="px-4 py-1.5 rounded-full font-body text-sm font-medium border cursor-pointer transition-all"
                  style={active ? { background: info.color, color: "white", borderColor: info.color } : { background: "white", color: "#555", borderColor: "#e5e7eb" }}>
                  {info.label}
                </button>
              );
            })}
          </div>

          {/* Grille jours */}
          {loading ? (
            <div className="text-center py-20 font-body text-sm text-gray-400">Chargement...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {days.map(day => {
                const key = fmtDate(day);
                const slots = byDay[key] || [];
                const isToday = fmtDate(day) === fmtDate(new Date());
                const isPast = day < new Date() && !isToday;
                if (slots.length === 0 && !isToday) return null;
                return (
                  <div key={key} className={`rounded-xl border ${isToday ? "border-blue-400 bg-blue-50/40" : "border-gray-200 bg-white"} overflow-hidden`}>
                    {/* Entête jour */}
                    <div className={`px-3 py-2 border-b ${isToday ? "bg-blue-800 border-blue-800" : "bg-gray-50 border-gray-100"}`}>
                      <div className={`font-body text-sm font-semibold ${isToday ? "text-white" : "text-blue-800"}`}>
                        {day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" })}
                        {isToday && <span className="ml-2 text-xs font-normal opacity-80">Aujourd'hui</span>}
                      </div>
                    </div>

                    {slots.length === 0 ? (
                      <div className="px-3 py-4 font-body text-xs text-gray-400 text-center">Pas de créneau</div>
                    ) : (
                      <div className="flex flex-col gap-0">
                        {slots.map((c, i) => {
                          const info = TYPE_LABELS[c.activityType] || TYPE_LABELS.cours;
                          const spots = c.maxPlaces - (c.enrolled?.length || 0);
                          const full = spots <= 0;
                          const prix = c.priceTTC || (c.priceHT ? Math.round(c.priceHT * (1 + (c.tvaTaux || 5.5) / 100) * 100) / 100 : null);
                          return (
                            <div key={c.id} className={`px-3 py-2.5 ${i > 0 ? "border-t border-gray-100" : ""} ${isPast ? "opacity-50" : ""}`}>
                              {/* Badge type */}
                              <span className="inline-block px-2 py-0.5 rounded-full font-body text-[10px] font-semibold mb-1"
                                style={{ background: info.bg, color: info.color }}>
                                {info.label}
                              </span>
                              <div className="font-body text-sm font-semibold text-blue-800 leading-tight mb-1">{c.activityTitle}</div>
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="font-body text-xs text-gray-500 flex items-center gap-1">
                                  <Clock size={10} />{c.startTime}–{c.endTime}
                                </span>
                                {c.monitor && (
                                  <span className="font-body text-xs text-gray-500">{c.monitor}</span>
                                )}
                              </div>
                              <div className="flex items-center justify-between mt-1.5">
                                <span className={`font-body text-xs font-semibold ${full ? "text-red-500" : spots <= 2 ? "text-orange-500" : "text-green-600"}`}>
                                  <Users size={10} className="inline mr-0.5" />
                                  {full ? "Complet" : `${spots} place${spots > 1 ? "s" : ""}`}
                                </span>
                                {prix && <span className="font-body text-xs font-bold text-blue-700">{prix}€</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* CTA inscription */}
          <div className="mt-10 rounded-2xl bg-blue-800 px-6 py-8 text-center">
            <div className="font-display text-xl font-bold text-white mb-2">Vous souhaitez vous inscrire ?</div>
            <p className="font-body text-sm text-white/70 mb-5">Créez votre espace famille pour réserver en ligne, payer et suivre vos inscriptions.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/espace-cavalier/reserver"
                className="px-6 py-3 rounded-xl font-body text-sm font-bold text-blue-800 bg-white no-underline hover:bg-blue-50 transition-colors">
                Réserver en ligne →
              </Link>
              <Link href="/contact"
                className="px-6 py-3 rounded-xl font-body text-sm font-bold text-white border border-white/40 no-underline hover:bg-white/10 transition-colors">
                Nous contacter
              </Link>
            </div>
          </div>

        </div>
      </main>
      <Footer />
    </>
  );
}
