"use client";
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Users, Clock, Star, Check, Sparkles } from "lucide-react";
import { Card, Badge } from "@/components/ui";

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
  onBook: (creneau: Creneau) => void; // ouvre le modal de réservation existant
}

const TYPE_COLORS: Record<string, string> = {
  cours: "#2050A0",
  stage: "#27ae60",
  stage_journee: "#16a085",
  balade: "#e67e22",
  competition: "#7c3aed",
  anniversaire: "#D63031",
};

const TYPE_LABELS: Record<string, string> = {
  cours: "Cours",
  stage: "Stage",
  stage_journee: "Stage journée",
  balade: "Balade",
  competition: "Compét.",
  anniversaire: "Anniversaire",
};

const DAYS_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const DAYS_FULL_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function fmtDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Déduire les niveaux compatibles d'un galop
function getCompatibleLevels(galopLevel: string): string[] {
  if (!galopLevel || galopLevel === "—") return [];
  const n = parseInt(galopLevel.replace(/[^0-9]/g, ""));
  if (isNaN(n)) return [];
  // Compatible : niveau enfant ±1, et tout ce qui est inférieur
  const levels: string[] = [];
  for (let i = Math.max(1, n - 1); i <= n + 1; i++) {
    levels.push(String(i));
    levels.push(`G${i}`);
    levels.push(`Galop ${i}`);
  }
  return levels;
}

// Est-ce qu'un créneau est pertinent pour ces enfants ?
function isRelevantForFamily(creneau: Creneau, children: Child[]): "perfect" | "ok" | "maybe" {
  if (children.length === 0) return "ok";

  const title = creneau.activityTitle.toLowerCase();
  const type = creneau.activityType;

  // Balades et stages sont pour tout le monde
  if (type === "balade" || type === "stage" || type === "stage_journee") return "ok";

  // Chercher un niveau de galop dans le titre
  const galopMatch = title.match(/galop\s*(\d+)|g(\d+)|[gG](\d+)/);
  if (!galopMatch) return "ok"; // pas de niveau mentionné → ouvert à tous

  const titleLevel = parseInt(galopMatch[1] || galopMatch[2] || galopMatch[3]);

  // Vérifier si un enfant correspond exactement
  const perfectMatch = children.some(child => {
    if (!child.galopLevel || child.galopLevel === "—") return false;
    const childLevel = parseInt(child.galopLevel.replace(/[^0-9]/g, ""));
    return childLevel === titleLevel;
  });
  if (perfectMatch) return "perfect";

  // Vérifier si un enfant est proche (±1)
  const okMatch = children.some(child => {
    if (!child.galopLevel || child.galopLevel === "—") return false;
    const childLevel = parseInt(child.galopLevel.replace(/[^0-9]/g, ""));
    return Math.abs(childLevel - titleLevel) <= 1;
  });
  if (okMatch) return "ok";

  return "maybe";
}

export default function TimelineReservation({ creneaux, children, familyId, onBook }: Props) {
  const [dayOffset, setDayOffset] = useState(0);
  const [filter, setFilter] = useState<"tous" | "pour_moi" | "cours" | "stage" | "balade">("pour_moi");
  const [selectedChild, setSelectedChild] = useState<string>("tous");

  // Jour courant
  const currentDay = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + dayOffset);
    return d;
  }, [dayOffset]);

  const todayStr = fmtDate(new Date());
  const currentDayStr = fmtDate(currentDay);

  // Semaine (7 jours depuis aujourd'hui)
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);

  // Enfants sélectionnés pour le filtre
  const activeChildren = useMemo(() => {
    if (selectedChild === "tous") return children;
    return children.filter(c => c.id === selectedChild);
  }, [children, selectedChild]);

  // Créneaux du jour courant, filtrés
  const dayCreneaux = useMemo(() => {
    let result = creneaux.filter(c => c.date === currentDayStr && c.date >= todayStr);

    if (filter === "pour_moi") {
      result = result.filter(c => isRelevantForFamily(c, activeChildren) !== "maybe");
    } else if (filter !== "tous") {
      if (filter === "stage") {
        result = result.filter(c => c.activityType === "stage" || c.activityType === "stage_journee");
      } else {
        result = result.filter(c => c.activityType === filter);
      }
    }

    return result.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [creneaux, currentDayStr, filter, activeChildren, todayStr]);

  // Nb créneaux par jour (pour les points indicateurs)
  const creneauxByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    weekDays.forEach(d => {
      const ds = fmtDate(d);
      let dayC = creneaux.filter(c => c.date === ds);
      if (filter === "pour_moi") {
        dayC = dayC.filter(c => isRelevantForFamily(c, activeChildren) !== "maybe");
      } else if (filter !== "tous") {
        if (filter === "stage") {
          dayC = dayC.filter(c => c.activityType === "stage" || c.activityType === "stage_journee");
        } else {
          dayC = dayC.filter(c => c.activityType === filter);
        }
      }
      counts[ds] = dayC.length;
    });
    return counts;
  }, [creneaux, weekDays, filter, activeChildren]);

  const spotsLeft = (c: Creneau) => c.maxPlaces - (c.enrolled?.length || 0);
  const isAlreadyEnrolled = (c: Creneau) =>
    (c.enrolled || []).some((e: any) => e.familyId === familyId);

  const prix = (c: Creneau) => c.priceTTC || (c.priceHT || 0) * (1 + (c.tvaTaux || 5.5) / 100);

  return (
    <div>
      {/* ── Filtre enfant ── */}
      {children.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          <button onClick={() => setSelectedChild("tous")}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full font-body text-xs font-semibold border cursor-pointer transition-all ${selectedChild === "tous" ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
            Tous les cavaliers
          </button>
          {children.map(child => (
            <button key={child.id} onClick={() => setSelectedChild(child.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full font-body text-xs font-semibold border cursor-pointer transition-all ${selectedChild === child.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
              {child.firstName}
              {child.galopLevel && child.galopLevel !== "—" && (
                <span className={`text-[9px] px-1 py-0.5 rounded ${selectedChild === child.id ? "bg-white/20" : "bg-blue-50 text-blue-600"}`}>
                  G{child.galopLevel}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Filtres type ── */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {([
          ["pour_moi", "✨ Pour moi"],
          ["tous", "Tout voir"],
          ["cours", "Cours"],
          ["stage", "Stages"],
          ["balade", "Balades"],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full font-body text-xs font-semibold border cursor-pointer transition-all ${filter === id ? "bg-gold-400 text-blue-800 border-gold-400" : "bg-white text-slate-600 border-gray-200"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Navigation semaine (scroll horizontal) ── */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setDayOffset(d => Math.max(0, d - 1))}
          disabled={dayOffset === 0}
          className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center cursor-pointer disabled:opacity-30 flex-shrink-0 border-solid">
          <ChevronLeft size={16} className="text-slate-600"/>
        </button>

        <div className="flex gap-1.5 overflow-x-auto flex-1 pb-1">
          {weekDays.map((d, i) => {
            const ds = fmtDate(d);
            const isActive = ds === currentDayStr;
            const isToday = ds === todayStr;
            const count = creneauxByDay[ds] || 0;

            return (
              <button key={i} onClick={() => setDayOffset(i)}
                className={`flex-shrink-0 flex flex-col items-center py-2 px-3 rounded-xl cursor-pointer border transition-all min-w-[52px] ${
                  isActive ? "bg-blue-500 text-white border-blue-500 shadow-md" :
                  isToday ? "bg-blue-50 text-blue-600 border-blue-200" :
                  "bg-white text-slate-600 border-gray-200"
                }`}>
                <span className="font-body text-[9px] uppercase tracking-wide opacity-70">{DAYS_FR[d.getDay()]}</span>
                <span className={`font-body text-base font-bold ${isActive ? "text-white" : ""}`}>{d.getDate()}</span>
                <div className="flex gap-0.5 mt-0.5 h-1.5">
                  {count > 0 && Array.from({ length: Math.min(count, 4) }, (_, j) => (
                    <span key={j} className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-white/70" : "bg-blue-400"}`}/>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <button onClick={() => setDayOffset(d => d + 1)}
          className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center cursor-pointer flex-shrink-0 border-solid">
          <ChevronRight size={16} className="text-slate-600"/>
        </button>
      </div>

      {/* ── Titre du jour ── */}
      <div className="mb-4">
        <div className="font-display text-lg font-bold text-blue-800 capitalize">
          {DAYS_FULL_FR[currentDay.getDay()]} {currentDay.getDate()} {currentDay.toLocaleDateString("fr-FR", { month: "long" })}
        </div>
        <div className="font-body text-xs text-slate-500">
          {dayCreneaux.length === 0 ? "Aucun créneau disponible ce jour" : `${dayCreneaux.length} créneau${dayCreneaux.length > 1 ? "x" : ""} disponible${dayCreneaux.length > 1 ? "s" : ""}`}
          {filter === "pour_moi" && children.length > 0 && (
            <span className="ml-1 text-blue-500">· filtrés pour {selectedChild === "tous" ? "votre famille" : children.find(c => c.id === selectedChild)?.firstName}</span>
          )}
        </div>
      </div>

      {/* ── Liste créneaux du jour ── */}
      {dayCreneaux.length === 0 ? (
        <Card padding="lg" className="text-center">
          <div className="text-3xl mb-2">🐴</div>
          <p className="font-body text-sm text-slate-500 mb-1">Pas de créneau ce jour-là.</p>
          <p className="font-body text-xs text-slate-400">Naviguez sur un autre jour ou changez le filtre.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {dayCreneaux.map(c => {
            const spots = spotsLeft(c);
            const full = spots <= 0;
            const enrolled = isAlreadyEnrolled(c);
            const relevance = isRelevantForFamily(c, activeChildren);
            const col = c.color || TYPE_COLORS[c.activityType] || "#666";
            const p = prix(c);

            return (
              <div key={c.id}
                className={`rounded-2xl border overflow-hidden transition-all ${
                  enrolled ? "border-green-200 bg-green-50" :
                  full ? "border-gray-200 bg-gray-50 opacity-70" :
                  "border-blue-500/10 bg-white shadow-sm"
                }`}
                style={{ borderLeftWidth: 4, borderLeftColor: col }}>
                <div className="p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-body text-sm font-bold text-blue-800">{c.activityTitle}</span>
                        {relevance === "perfect" && (
                          <span className="flex items-center gap-0.5 font-body text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                            <Sparkles size={9}/> Parfait pour toi
                          </span>
                        )}
                        {enrolled && (
                          <span className="flex items-center gap-0.5 font-body text-[10px] font-semibold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">
                            <Check size={9}/> Inscrit
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 font-body text-xs text-slate-500">
                          <Clock size={11}/>{c.startTime}–{c.endTime}
                        </span>
                        {c.monitor && (
                          <span className="font-body text-xs text-slate-400">avec {c.monitor}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {p > 0 && <div className="font-body text-base font-bold text-blue-500">{p.toFixed(0)}€</div>}
                      <Badge color={full ? "red" : spots <= 3 ? "orange" : "green"}>
                        <Users size={10} className="inline mr-0.5"/>
                        {full ? "Complet" : `${spots} place${spots > 1 ? "s" : ""}`}
                      </Badge>
                    </div>
                  </div>

                  {/* Action */}
                  {!enrolled && (
                    <button
                      onClick={() => onBook(c)}
                      disabled={full}
                      className={`w-full py-2.5 rounded-xl font-body text-sm font-semibold border-none cursor-pointer transition-all ${
                        full ? "bg-gray-100 text-gray-400 cursor-not-allowed" :
                        relevance === "perfect" ? "text-white" : "bg-blue-500 text-white hover:bg-blue-600"
                      }`}
                      style={relevance === "perfect" && !full ? { background: `linear-gradient(135deg, ${col}, #2050A0)` } : {}}>
                      {full ? "Complet — liste d'attente →" : "Réserver →"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Astuce filtre ── */}
      {filter === "pour_moi" && children.some(c => !c.galopLevel || c.galopLevel === "—") && (
        <p className="font-body text-xs text-slate-400 text-center mt-4">
          💡 Renseignez le niveau de galop de vos cavaliers dans votre profil pour un filtre encore plus précis.
        </p>
      )}
    </div>
  );
}
