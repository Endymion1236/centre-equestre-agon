"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useVitrine } from "@/lib/use-vitrine";
import { EditableImage } from "@/components/ui/EditableImage";
import { getCatalogueVisual } from "@/lib/catalogue-visuals";
import {
  CATEGORY_LABELS,
  PUBLIC_ACTIVITIES,
  getVitrineActivityImage,
  getVitrineActivityOverride,
  type PublicActivity,
  type PublicActivityCategory,
} from "@/lib/public-activities";
import { ArrowRight, Check, Clock, Search, SlidersHorizontal, Sparkles } from "lucide-react";

type DisplayActivity = PublicActivity & { image?: string };

type VisualTone = "baby" | "stage" | "gold" | "sport" | "beach" | "party";

const categories: Array<{ id: "all" | PublicActivityCategory; label: string }> = [
  { id: "all", label: "Toutes" },
  { id: "stages", label: "Stages vacances" },
  { id: "balades", label: "Balades" },
  { id: "cours", label: "Cours à l’année" },
  { id: "competitions", label: "Compétitions" },
  { id: "autres", label: "Autres" },
];

const profileToCategory: Record<string, "all" | PublicActivityCategory> = {
  baby: "stages",
  enfant: "stages",
  confirme: "stages",
  balade: "balades",
  cours: "cours",
  competition: "competitions",
};

const VISUALS: Record<VisualTone, { shell: string; wash: string; accent: string; chip: string }> = {
  baby: {
    shell: "bg-pink-50 border-pink-100",
    wash: "from-pink-50 via-pink-50/75 to-transparent",
    accent: "text-pink-700",
    chip: "bg-pink-600 text-white",
  },
  stage: {
    shell: "bg-amber-50 border-amber-100",
    wash: "from-amber-50 via-amber-50/75 to-transparent",
    accent: "text-amber-700",
    chip: "bg-amber-600 text-white",
  },
  gold: {
    shell: "bg-yellow-50 border-yellow-100",
    wash: "from-yellow-50 via-yellow-50/75 to-transparent",
    accent: "text-yellow-700",
    chip: "bg-yellow-500 text-blue-950",
  },
  sport: {
    shell: "bg-blue-50 border-blue-100",
    wash: "from-blue-50 via-blue-50/75 to-transparent",
    accent: "text-blue-700",
    chip: "bg-blue-700 text-white",
  },
  beach: {
    shell: "bg-orange-50 border-orange-100",
    wash: "from-orange-50 via-orange-50/75 to-transparent",
    accent: "text-orange-700",
    chip: "bg-orange-600 text-white",
  },
  party: {
    shell: "bg-violet-50 border-violet-100",
    wash: "from-violet-50 via-violet-50/75 to-transparent",
    accent: "text-violet-700",
    chip: "bg-violet-700 text-white",
  },
};

const CARD_TITLES: Record<string, string> = {
  galop34: "Galop 3–4",
  "randonnee-jeunes": "Randonnée jeunes",
};

function textValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function visualToneFor(activity: DisplayActivity): VisualTone {
  if (activity.id === "baby" || activity.id.includes("ponyride")) return "baby";
  if (activity.id.includes("anniversaire")) return "party";
  if (activity.category === "balades") return "beach";
  if (activity.id === "or") return "gold";
  if (activity.category === "cours" || activity.category === "competitions" || activity.id === "galop34") return "sport";
  return "stage";
}

function cardTitle(activity: DisplayActivity) {
  return CARD_TITLES[activity.id] || activity.title;
}

function ActivityVisual({ activity }: { activity: DisplayActivity }) {
  const visual = VISUALS[visualToneFor(activity)];
  const catalogueVisual = getCatalogueVisual(activity.id);
  const title = cardTitle(activity);

  if (activity.image) {
    return (
      <div className="relative h-56 overflow-hidden sm:h-72">
        <img
          src={activity.image}
          alt={activity.title}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.035]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/78 via-slate-950/8 to-white/5" />
        <div className="absolute left-4 top-4 rounded-full border border-white/25 bg-slate-950/42 px-3 py-1.5 font-body text-[9px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur-md sm:text-[10px]">
          {CATEGORY_LABELS[activity.category]}
        </div>
        {activity.price && <div className="absolute right-4 top-12 rounded-xl bg-white/95 px-3 py-2 font-body text-[11px] font-bold text-blue-800 shadow-lg backdrop-blur-md sm:text-xs">{activity.price}</div>}
        <div className="absolute inset-x-4 bottom-4 sm:inset-x-5 sm:bottom-5">
          <h2 className="max-w-[88%] font-display text-[25px] font-bold leading-[1.02] text-white [text-shadow:0_2px_20px_rgba(0,0,0,0.3)] sm:text-[28px] sm:leading-tight">{title}</h2>
          <div className="mt-2.5 flex flex-wrap gap-1.5 sm:mt-3 sm:gap-2">
            <span className="rounded-full bg-white/15 px-2.5 py-1.5 font-body text-[9px] font-bold text-white backdrop-blur-md sm:px-3 sm:text-[10px]">{activity.ages}</span>
            {activity.level && <span className="rounded-full bg-gold-400/92 px-2.5 py-1.5 font-body text-[9px] font-bold text-blue-950 sm:px-3 sm:text-[10px]">{activity.level}</span>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative min-h-[220px] overflow-hidden border-b sm:min-h-[255px] ${visual.shell}`}>
      <div
        aria-hidden="true"
        className="absolute bottom-0 right-0 top-0 w-[52%] bg-no-repeat opacity-100 transition-transform duration-700 group-hover:scale-[1.025] sm:w-[50%]"
        style={{
          backgroundImage: `url('${catalogueVisual.image}')`,
          backgroundSize: catalogueVisual.backgroundSize || "cover",
          backgroundPosition: catalogueVisual.backgroundPosition || "center",
        }}
      />
      <EditableImage
        imageKey={activity.imageKey}
        mode="background"
        label={`Photo ${activity.title}`}
        alt={activity.title}
        style={{ backgroundImage: "none", backgroundPosition: "center" }}
        className="absolute bottom-0 right-0 top-0 w-[52%] overflow-hidden !bg-transparent sm:w-[50%]"
      />
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${visual.wash}`} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/15 via-transparent to-white/5" />

      <div className="relative z-10 flex min-h-[220px] max-w-[76%] flex-col justify-end p-4 sm:min-h-[255px] sm:max-w-[67%] sm:p-6">
        <div className={`font-body text-[9px] font-bold uppercase tracking-[0.14em] sm:text-[10px] sm:tracking-[0.15em] ${visual.accent}`}>{CATEGORY_LABELS[activity.category]}</div>
        <h2 className="mt-2.5 font-display text-[25px] font-bold leading-[1.02] text-blue-950 sm:mt-3 sm:text-[28px] sm:leading-tight">{title}</h2>
        <div className="mt-2.5 flex flex-wrap gap-1.5 sm:mt-3 sm:gap-2">
          <span className="rounded-full bg-white/78 px-2.5 py-1.5 font-body text-[9px] font-bold text-blue-950 shadow-sm backdrop-blur-sm sm:px-3 sm:text-[10px]">{activity.ages}</span>
          {activity.level && <span className={`rounded-full px-2.5 py-1.5 font-body text-[9px] font-bold shadow-sm sm:px-3 sm:text-[10px] ${visual.chip}`}>{activity.level}</span>}
        </div>
        {activity.price && <div className="mt-4 w-fit rounded-xl bg-white/92 px-3 py-2 font-body text-[11px] font-bold text-blue-800 shadow-sm backdrop-blur-sm sm:mt-5 sm:text-xs">{activity.price}</div>}
      </div>
    </div>
  );
}

function ActivityCard({ activity }: { activity: DisplayActivity }) {
  return (
    <article
      id={activity.id}
      className={`group scroll-mt-28 overflow-hidden rounded-[24px] border bg-white transition-all duration-300 hover:-translate-y-1 sm:rounded-[26px] ${
        activity.signature
          ? "border-gold-300/80 shadow-[0_16px_42px_rgba(240,160,16,0.14)] ring-1 ring-gold-200/70 hover:shadow-[0_26px_62px_rgba(240,160,16,0.2)]"
          : "border-blue-500/[0.08] shadow-[0_10px_30px_rgba(12,26,46,0.05)] hover:shadow-[0_24px_58px_rgba(12,26,46,0.11)]"
      }`}
    >
      <ActivityVisual activity={activity} />

      <div className="p-4 sm:p-6">
        {activity.signature && (
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-3 py-1.5 font-body text-[10px] font-bold uppercase tracking-[0.12em] text-gold-800 sm:mb-4">
            <Sparkles size={12} /> Expérience phare du centre
          </div>
        )}
        <div className="mb-3 flex items-start gap-2 font-body text-[11px] font-semibold text-slate-400 sm:mb-4 sm:text-xs">
          <Clock size={15} className="mt-0.5 flex-shrink-0 text-blue-500" />
          <span>{activity.schedule}</span>
        </div>
        <p className="font-body text-[13px] leading-relaxed text-slate-500 sm:text-sm">{activity.description}</p>

        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 sm:mt-5 sm:gap-x-4">
          {activity.features.slice(0, 4).map((feature) => (
            <div key={feature} className="flex items-start gap-2 font-body text-[11px] leading-snug text-slate-500 sm:text-xs sm:leading-relaxed">
              <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Check size={10} strokeWidth={3} /></span>
              <span>{feature}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-2.5 border-t border-slate-100 pt-4 sm:mt-6 sm:gap-3 sm:pt-5">
          <Link href={`/activites/${activity.id}`} className="group/link inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 py-3 font-body text-[11px] font-bold text-white no-underline shadow-[0_7px_20px_rgba(32,80,160,0.16)] transition-all hover:-translate-y-0.5 hover:bg-blue-600 sm:flex-none sm:px-4 sm:text-xs">
            Voir la fiche <ArrowRight size={14} className="transition-transform group-hover/link:translate-x-1" />
          </Link>
          <Link href="/espace-cavalier/reserver" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 font-body text-[11px] font-bold text-blue-700 no-underline transition-colors hover:border-blue-200 hover:bg-blue-100 sm:flex-none sm:px-4 sm:text-xs">
            Réserver
          </Link>
        </div>
      </div>
    </article>
  );
}

export function ActivitiesContent() {
  const [filter, setFilter] = useState<"all" | PublicActivityCategory>("all");
  const [search, setSearch] = useState("");
  const { vitrine } = useVitrine();
  const searchParams = useSearchParams();

  // Réagit à CHAQUE changement de ?profil= (et du hash). Sans ça, cliquer une
  // carte "Stages"/"Balades" alors qu'on est déjà sur /activites ne faisait
  // rien : Next navigue côté client sans remonter le composant, donc un effet
  // à dépendances vides ne se rejouait jamais. La page semblait figée.
  const profile = searchParams.get("profil") || "";
  useEffect(() => {
    if (profileToCategory[profile]) {
      setFilter(profileToCategory[profile]);
    } else if (profile === "") {
      setFilter("all");
    }

    if (typeof window !== "undefined" && window.location.hash) {
      window.setTimeout(() => {
        document.querySelector(window.location.hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 180);
    }
  }, [profile, searchParams]);

  const activities = useMemo<DisplayActivity[]>(() => {
    const source = (vitrine.activites || {}) as Record<string, unknown>;
    return PUBLIC_ACTIVITIES.map((activity) => {
      const override = getVitrineActivityOverride(activity, source);
      if (!override) return activity;
      return {
        ...activity,
        title: textValue(override.title, activity.title),
        ages: textValue(override.ages, activity.ages),
        schedule: textValue(override.schedule, activity.schedule),
        description: textValue(override.description, activity.description),
        price: textValue(override.price, activity.price || "") || undefined,
        image: getVitrineActivityImage(override),
      };
    });
  }, [vitrine.activites]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("fr");
    return activities.filter((activity) => {
      const categoryMatches = filter === "all" || activity.category === filter;
      if (!categoryMatches) return false;
      if (!needle) return true;
      return [activity.title, activity.ages, activity.description, activity.level, ...activity.features]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("fr").includes(needle));
    });
  }, [activities, filter, search]);

  return (
    <section className="bg-cream px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-6 rounded-[22px] border border-blue-500/[0.08] bg-white p-4 shadow-[0_12px_38px_rgba(12,26,46,0.045)] sm:mb-8 sm:rounded-[24px] sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><SlidersHorizontal size={20} /></div>
              <div>
                <div className="font-display text-lg font-bold text-blue-950">Affinez selon votre envie</div>
                <div className="font-body text-xs text-slate-400">{filtered.length} activité{filtered.length > 1 ? "s" : ""} affichée{filtered.length > 1 ? "s" : ""}</div>
              </div>
            </div>

            <div className="relative w-full lg:max-w-[320px]">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Âge, balade, débutant, CSO…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 font-body text-sm text-blue-950 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-300 focus:bg-white"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map((category) => {
              const count = category.id === "all" ? activities.length : activities.filter((activity) => activity.category === category.id).length;
              const active = filter === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setFilter(category.id)}
                  className={`flex flex-shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 font-body text-xs font-bold transition-all ${
                    active
                      ? "border-blue-700 bg-blue-700 text-white shadow-[0_6px_18px_rgba(32,80,160,0.16)]"
                      : "border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-700"
                  }`}
                >
                  {category.label}<span className={`text-[10px] ${active ? "text-white/55" : "text-slate-300"}`}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {filtered.length > 0 ? (
          <div className="grid gap-5 sm:gap-6 lg:grid-cols-2">
            {filtered.map((activity) => <ActivityCard key={activity.id} activity={activity} />)}
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-blue-200 bg-white px-6 py-16 text-center">
            <Sparkles size={28} className="mx-auto text-blue-300" />
            <h2 className="mt-4 font-display text-xl font-bold text-blue-950">Aucune activité ne correspond</h2>
            <p className="mt-2 font-body text-sm text-slate-500">Essayez un autre mot ou revenez à toutes les activités.</p>
            <button type="button" onClick={() => { setFilter("all"); setSearch(""); }} className="mt-5 rounded-xl border-none bg-blue-700 px-5 py-3 font-body text-xs font-bold text-white">Tout afficher</button>
          </div>
        )}

        <div className="mt-8 grid gap-4 rounded-[22px] border border-blue-100 bg-blue-50 p-5 sm:mt-10 sm:rounded-[24px] sm:p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="font-display text-lg font-bold text-blue-950">Plusieurs enfants ou plusieurs semaines ?</div>
            <p className="mt-1 font-body text-sm leading-relaxed text-slate-500">Les réductions multi-stages et famille sont appliquées automatiquement lorsqu’elles sont prévues dans l’offre.</p>
          </div>
          <Link href="/tarifs" className="inline-flex items-center gap-2 font-body text-sm font-bold text-blue-700 no-underline">Voir tous les tarifs <ArrowRight size={15} /></Link>
        </div>
      </div>
    </section>
  );
}
