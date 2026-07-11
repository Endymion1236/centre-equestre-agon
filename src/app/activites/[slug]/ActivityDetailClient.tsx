"use client";

import Link from "next/link";
import { useVitrine } from "@/lib/use-vitrine";
import { EditableImage } from "@/components/ui/EditableImage";
import {
  CATEGORY_LABELS,
  PUBLIC_ACTIVITIES,
  getVitrineActivityOverride,
  type PublicActivity,
} from "@/lib/public-activities";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock, Gift, Info, ShieldCheck } from "lucide-react";

function textValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export default function ActivityDetailClient({ activity }: { activity: PublicActivity }) {
  const { vitrine } = useVitrine();
  const override = getVitrineActivityOverride(activity, (vitrine.activites || {}) as Record<string, unknown>);
  const display = {
    ...activity,
    title: textValue(override?.title, activity.title),
    ages: textValue(override?.ages, activity.ages),
    schedule: textValue(override?.schedule, activity.schedule),
    description: textValue(override?.description, activity.description),
    price: textValue(override?.price, activity.price || "") || undefined,
    image: textValue(override?.image, "") || undefined,
  };

  const related = PUBLIC_ACTIVITIES
    .filter((item) => item.category === activity.category && item.id !== activity.id)
    .slice(0, 3);

  return (
    <main className="bg-cream">
      <section className="relative overflow-hidden bg-blue-950 pt-24 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,rgba(240,160,16,0.16),transparent_38%)]" />
        <div className="relative mx-auto grid min-h-[650px] max-w-[1280px] lg:grid-cols-[0.92fr_1.08fr]">
          <div className="flex flex-col justify-center px-6 py-14 sm:px-10 lg:px-14 lg:py-20">
            <Link href="/activites" className="mb-8 inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 py-2 font-body text-xs font-bold text-white/70 no-underline backdrop-blur-sm hover:text-white">
              <ArrowLeft size={14} /> Toutes les activités
            </Link>
            <div className="font-body text-[11px] font-bold uppercase tracking-[0.2em] text-gold-300">{CATEGORY_LABELS[display.category]}</div>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.04] text-white sm:text-5xl lg:text-6xl">{display.title}</h1>
            <p className="mt-6 max-w-xl font-body text-base leading-relaxed text-white/66 sm:text-lg">{display.description}</p>

            <div className="mt-7 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/12 bg-white/[0.07] px-3 py-2 font-body text-xs font-bold text-white/80">{display.ages}</span>
              {display.level && <span className="rounded-full bg-gold-400 px-3 py-2 font-body text-xs font-bold text-blue-950">{display.level}</span>}
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                <Clock size={18} className="mt-0.5 flex-shrink-0 text-gold-300" />
                <div><div className="font-body text-[10px] font-bold uppercase tracking-wide text-white/35">Quand</div><div className="mt-1 font-body text-sm font-semibold text-white/82">{display.schedule}</div></div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                <CalendarDays size={18} className="mt-0.5 flex-shrink-0 text-gold-300" />
                <div><div className="font-body text-[10px] font-bold uppercase tracking-wide text-white/35">Tarif</div><div className="mt-1 font-body text-sm font-semibold text-white/82">{display.price || "Selon la formule"}</div></div>
              </div>
            </div>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/espace-cavalier/reserver" className="group inline-flex items-center gap-2 rounded-xl bg-gold-400 px-6 py-4 font-body text-sm font-bold text-blue-950 no-underline shadow-[0_12px_28px_rgba(240,160,16,0.2)] transition-transform hover:-translate-y-0.5">
                {display.bookingLabel || "Voir les disponibilités"} <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/contact" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-6 py-4 font-body text-sm font-bold text-white no-underline hover:bg-white/10">Une question ?</Link>
            </div>
          </div>

          <div className="relative min-h-[420px] overflow-hidden lg:min-h-full">
            {display.image ? (
              <img src={display.image} alt={display.title} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <EditableImage imageKey={display.imageKey} mode="img" label={`Photo ${display.title}`} alt={display.title} className="absolute inset-0 h-full w-full overflow-hidden">
                <div className={`absolute inset-0 bg-gradient-to-br ${display.gradient}`} />
              </EditableImage>
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-950 via-blue-950/10 to-transparent lg:block" />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-blue-950/55 to-transparent lg:hidden" />
          </div>
        </div>
      </section>

      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto grid max-w-[1120px] gap-12 lg:grid-cols-[1.08fr_0.92fr]">
          <div>
            <div className="font-body text-xs font-bold uppercase tracking-[0.18em] text-gold-500">L’expérience</div>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-blue-950">Ce que vous allez vivre</h2>
            <p className="mt-5 font-body text-base leading-relaxed text-slate-600">{display.intro}</p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {display.features.map((feature) => (
                <div key={feature} className="flex items-start gap-3 rounded-2xl border border-blue-500/[0.07] bg-white p-4 shadow-[0_7px_25px_rgba(12,26,46,0.025)]">
                  <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Check size={13} strokeWidth={3} /></span>
                  <span className="font-body text-sm font-semibold leading-relaxed text-blue-950">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          <aside className="self-start rounded-[26px] border border-blue-500/[0.08] bg-white p-6 shadow-[0_18px_55px_rgba(12,26,46,0.07)] sm:p-8 lg:sticky lg:top-28">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Info size={20} /></div>
              <div><div className="font-display text-xl font-bold text-blue-950">À prévoir</div><div className="font-body text-xs text-slate-400">Pour venir l’esprit tranquille</div></div>
            </div>
            <div className="mt-6 divide-y divide-slate-100">
              {display.practical.map((item) => (
                <div key={item} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                  <ShieldCheck size={17} className="mt-0.5 flex-shrink-0 text-blue-500" />
                  <span className="font-body text-sm leading-relaxed text-slate-600">{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-7 rounded-2xl bg-blue-50 p-5">
              <div className="font-body text-xs font-bold uppercase tracking-wide text-blue-500">Bon à savoir</div>
              <p className="mt-2 font-body text-sm leading-relaxed text-blue-950/68">Le casque est fourni. Pour toute hésitation sur le niveau, l’âge ou l’activité, l’équipe vous conseille avant la réservation.</p>
            </div>
          </aside>
        </div>
      </section>

      <section className="bg-white px-6 py-20">
        <div className="mx-auto max-w-[1120px]">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><div className="font-body text-xs font-bold uppercase tracking-[0.18em] text-gold-500">Dans le même univers</div><h2 className="mt-2 font-display text-3xl font-bold text-blue-950">À découvrir aussi</h2></div>
            <Link href="/activites" className="inline-flex items-center gap-2 font-body text-sm font-bold text-blue-700 no-underline">Toutes les activités <ArrowRight size={15} /></Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {related.map((item) => (
              <Link key={item.id} href={`/activites/${item.id}`} className="group rounded-[22px] border border-blue-500/[0.08] bg-cream p-5 no-underline transition-all hover:-translate-y-1 hover:bg-white hover:shadow-[0_15px_40px_rgba(12,26,46,0.08)]">
                <div className="font-body text-[10px] font-bold uppercase tracking-[0.14em] text-gold-500">{item.ages}</div>
                <h3 className="mt-3 font-display text-xl font-bold text-blue-950">{item.title}</h3>
                <p className="mt-2 line-clamp-3 font-body text-sm leading-relaxed text-slate-500">{item.description}</p>
                <div className="mt-5 flex items-center gap-2 font-body text-xs font-bold text-blue-700">Voir la fiche <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" /></div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-cream px-6 py-20 text-center">
        <div className="mx-auto max-w-2xl">
          <Gift size={28} className="mx-auto text-gold-500" />
          <h2 className="mt-4 font-display text-3xl font-bold text-blue-950">Offrir cette expérience</h2>
          <p className="mx-auto mt-4 max-w-lg font-body text-sm leading-relaxed text-slate-500">Les bons cadeaux permettent de faire plaisir tout en laissant le bénéficiaire choisir son créneau.</p>
          <Link href="/offrir-un-bon" className="mt-7 inline-flex items-center gap-2 rounded-xl border border-gold-200 bg-gold-50 px-5 py-3.5 font-body text-sm font-bold text-gold-700 no-underline hover:border-gold-300">Découvrir les bons cadeaux <ArrowRight size={15} /></Link>
        </div>
      </section>
    </main>
  );
}
