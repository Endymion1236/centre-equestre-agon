"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { Baby, Award, Medal, Crown, GraduationCap, type LucideIcon } from "lucide-react";
import { toParisDateString } from "@/lib/date-local";
import { addCalendarDays } from "@/lib/public-planning";
import { getNextStagesGrouped, formatDateRange, type NextStagesResult } from "@/lib/next-stages";

// Mapping heuristique d'un titre de stage vers une icône / couleur.
// Indépendant de la casse, on cherche des mots-clés.
function iconForStage(title: string): { icon: LucideIcon; color: string; sub: string } {
  const t = title.toLowerCase();
  if (t.includes("baby"))    return { icon: Baby,            color: "text-pink-500",  sub: "3-5 ans" };
  if (t.includes("bronze"))  return { icon: Award,           color: "text-amber-700", sub: "6-8 ans" };
  if (t.includes("argent"))  return { icon: Medal,           color: "text-gray-400",  sub: "8-10 ans" };
  if (t.includes("or"))      return { icon: Crown,           color: "text-amber-500", sub: "8+ ans" };
  return                          { icon: GraduationCap,    color: "text-blue-400",  sub: "" };
}

export function NextStagesBanner() {
  const [data, setData] = useState<NextStagesResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const todayStr = toParisDateString();
        const end = addCalendarDays(todayStr, 180);
        const response = await fetch(`/api/public/planning?start=${todayStr}&end=${end}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Planning public indisponible (${response.status})`);
        const payload = await response.json();
        if (cancelled) return;
        const creneaux = Array.isArray(payload.slots) ? payload.slots : [];
        const result = getNextStagesGrouped(creneaux, todayStr);
        setData(result);
      } catch (e) {
        console.error("Erreur chargement prochains stages :", e);
        setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Pendant le chargement OU si aucun stage à venir → on n'affiche rien
  // (pas de skeleton car ça ferait clignoter le layout)
  if (loading || !data) return null;

  // Formater le texte des semaines : "Semaines du 14 au 18 et du 21 au 25 avril"
  const weeksText = data.weekRanges
    .map(w => formatDateRange(w.start, w.end))
    .join(" et ");

  // Liste des activités (max 4 visibles dans la grille de droite)
  const visibleStages = data.stages.slice(0, 4);

  return (
    <section className="py-20 px-6 bg-blue-800 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_50%,rgba(240,160,16,0.08)_0%,transparent_50%)]" />
      <div className="max-w-[900px] mx-auto relative z-10 flex flex-wrap items-center gap-12">
        <div className="flex-1 min-w-[300px]">
          <span className="font-body text-xs font-bold text-gold-400 uppercase tracking-widest mb-3 block">
            {data.period.label}
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-white leading-tight mb-4">
            Les inscriptions<br />sont ouvertes !
          </h2>
          <p className="font-body text-base text-white/60 leading-relaxed mb-6">
            {weeksText.charAt(0).toUpperCase() + weeksText.slice(1)}.{" "}
            {data.stages.length > 0 && (
              <>
                {data.stages.map(s => s.activityTitle).join(", ")}.{" "}
              </>
            )}
            Places limitées à 6-8 cavaliers par groupe.
          </p>
          <div className="flex gap-4 flex-wrap">
            <Link href="/espace-cavalier/reserver">
              <Button variant="primary" size="lg">Réserver maintenant</Button>
            </Link>
            <Link href="/tarifs" className="no-underline">
              <button className="glass px-8 py-4 rounded-xl font-body text-base font-medium text-white hover:bg-white/18 transition-all cursor-pointer border-none">
                Voir les tarifs
              </button>
            </Link>
          </div>
        </div>
        <div className="flex-1 min-w-[200px] flex justify-center">
          <div className="grid grid-cols-2 gap-3">
            {visibleStages.map((s, i) => {
              const { icon: Icon, color, sub } = iconForStage(s.activityTitle);
              return (
                <div key={i} className="bg-white/8 backdrop-blur-sm border border-white/10 rounded-xl p-4 text-center">
                  <Icon size={24} className={`${color} mx-auto mb-1`} />
                  <div className="font-body text-xs font-semibold text-white">{s.activityTitle}</div>
                  {sub && <div className="font-body text-[10px] text-white/40">{sub}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
