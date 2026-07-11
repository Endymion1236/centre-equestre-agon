"use client";

import Link from "next/link";
import { useVitrine } from "@/lib/use-vitrine";
import IllustratedFeatureBand from "@/components/public/IllustratedFeatureBand";
import { ArrowRight, Check, CreditCard, Gift, Trophy } from "lucide-react";

function StageCard({ title, subtitle, price, features, highlight = false }: { title: string; subtitle: string; price: string; features: string[]; highlight?: boolean }) {
  return (
    <article className={`relative flex h-full flex-col overflow-hidden rounded-[24px] border p-6 transition-all hover:-translate-y-1 ${highlight ? "border-blue-700 bg-[linear-gradient(145deg,#07111f,#12346b)] text-white shadow-[0_22px_55px_rgba(12,26,46,0.16)]" : "border-blue-500/[0.08] bg-white shadow-[0_12px_38px_rgba(12,26,46,0.04)]"}`}>
      {highlight && <div className="absolute right-4 top-4 rounded-full bg-gold-400 px-3 py-1 font-body text-[9px] font-bold uppercase tracking-wide text-blue-950">Le plus choisi</div>}
      <div className={`font-body text-[10px] font-bold uppercase tracking-[0.15em] ${highlight ? "text-gold-300" : "text-gold-600"}`}>{subtitle}</div>
      <h3 className={`mt-3 font-display text-2xl font-bold ${highlight ? "text-white" : "text-blue-950"}`}>{title}</h3>
      <div className="mt-5 flex items-end gap-2"><span className={`font-display text-4xl font-bold ${highlight ? "text-white" : "text-blue-700"}`}>{price}€</span><span className={`mb-1 font-body text-xs ${highlight ? "text-white/45" : "text-slate-400"}`}>/ semaine</span></div>
      <div className="mt-6 flex-1 space-y-3">
        {features.map((feature) => <div key={feature} className={`flex items-start gap-2.5 font-body text-sm leading-relaxed ${highlight ? "text-white/68" : "text-slate-500"}`}><span className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${highlight ? "bg-white/10 text-gold-300" : "bg-emerald-50 text-emerald-600"}`}><Check size={11} strokeWidth={3} /></span>{feature}</div>)}
      </div>
      <Link href="/espace-cavalier/reserver" className={`mt-7 rounded-xl px-5 py-3.5 text-center font-body text-sm font-bold no-underline transition-transform hover:-translate-y-0.5 ${highlight ? "bg-gold-400 text-blue-950" : "bg-blue-700 text-white"}`}>Voir les places</Link>
    </article>
  );
}

export function TarifsContent() {
  const { vitrine } = useVitrine();
  const tariffs = vitrine.tarifs;
  const stages = tariffs.stages as { baby_poney: number | string; galop_bronze_argent: number | string; galop_or: number | string };
  const annualCourses = ((tariffs as any).cours_annuels || []) as Array<{ label: string; level?: string; freq?: string; price: number | string }>;

  return (
    <>
      <section className="bg-cream px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-[1120px]">
          <div className="mb-10 text-center"><div className="font-body text-xs font-bold uppercase tracking-[0.18em] text-gold-500">Stages vacances</div><h2 className="mt-3 font-display text-3xl font-bold text-blue-950 sm:text-4xl">Une semaine complète à poney</h2><p className="mx-auto mt-4 max-w-2xl font-body text-base leading-relaxed text-slate-500">Les groupes sont organisés par âge et niveau. La réservation affiche les dates et horaires réellement disponibles.</p></div>
          <div className="grid gap-5 lg:grid-cols-3">
            <StageCard title="Baby Poney" subtitle="3 – 5 ans" price={String(stages.baby_poney)} features={["10h de stage", "Petits groupes", "Thèmes imaginaires", "Mini-ferme et soins"]} />
            <StageCard title="Galop Bronze / Argent" subtitle="6 – 10 ans" price={String(stages.galop_bronze_argent)} features={["10h de stage", "Semaines thématiques", "Jeux et progression", "Soins aux poneys", "Passage de galop possible"]} highlight />
            <StageCard title="Galop d’Or / G3-4" subtitle="Cavaliers réguliers" price={String(stages.galop_or)} features={["10h de stage", "Multi-disciplines", "CSO, dressage, cross", "Objectifs techniques"]} />
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20">
        <div className="mx-auto grid max-w-[1120px] gap-7 lg:grid-cols-[1fr_1fr] lg:items-stretch">
          <IllustratedFeatureBand
            image="/images/vitrine/choices/balade-plage.webp"
            alt="Une balade à poney sur la plage d'Agon-Coutainville"
            eyebrow="Balades à la plage"
            title="Deux heures entre dunes, estuaire et bord de mer"
            text="Les groupes sont séparés selon le niveau. Débutants, cavaliers débrouillés et confirmés profitent chacun d’un rythme adapté."
            href="/activites/balade-soleil"
            cta="Découvrir les balades"
            tone="orange"
            compact
          />

          <div className="flex flex-col overflow-hidden rounded-[28px] border border-blue-500/[0.08] bg-cream shadow-[0_18px_50px_rgba(12,26,46,0.06)]">
            <div className="border-b border-blue-500/[0.07] p-5 sm:p-6">
              <div className="font-body text-xs font-bold uppercase tracking-[0.16em] text-gold-500">Tarifs des promenades</div>
              <p className="mt-2 font-body text-sm leading-relaxed text-slate-500">Toutes les formules durent deux heures. Les disponibilités dépendent de la saison et de la météo.</p>
            </div>
            <div className="flex-1 divide-y divide-blue-500/[0.07]">
              {tariffs.balades.map((item, index) => (
                <div key={`${item.label}-${index}`} className="flex items-center justify-between gap-5 p-5 sm:p-6">
                  <div><div className="font-display text-lg font-bold text-blue-950">{item.label}</div><div className="mt-1 font-body text-xs leading-relaxed text-slate-400">{item.level}{item.note ? ` · ${item.note}` : ""}</div></div>
                  <div className="flex-shrink-0 font-display text-2xl font-bold text-blue-700">{item.price}€</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 border-t border-blue-500/[0.07] p-5 sm:p-6">
              <Link href="/espace-cavalier/reserver" className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 font-body text-sm font-bold text-white no-underline">Voir les places <ArrowRight size={15} /></Link>
              <Link href="/offrir-un-bon" className="inline-flex items-center gap-2 rounded-xl border border-gold-200 bg-gold-50 px-5 py-3.5 font-body text-sm font-bold text-gold-700 no-underline"><Gift size={15} /> Offrir une balade</Link>
            </div>
          </div>
        </div>
      </section>

      {annualCourses.length > 0 && (
        <section className="bg-sand px-6 py-20">
          <div className="mx-auto grid max-w-[1120px] gap-7 lg:grid-cols-[0.92fr_1.08fr] lg:items-stretch">
            <IllustratedFeatureBand
              image="/images/vitrine/choices/cavalier-regulier.webp"
              alt="Une cavalière progresse à l'obstacle avec son poney"
              eyebrow="Cours à l’année"
              title="Progresser dans la durée"
              text="Les forfaits annuels permettent de suivre un groupe régulier, de construire des repères et d’avancer vers des objectifs adaptés."
              href="/activites/cours-loisir"
              cta="Comprendre les cours"
              tone="blue"
              compact
            />

            <div className="rounded-[28px] border border-blue-500/[0.08] bg-white p-5 shadow-[0_18px_50px_rgba(12,26,46,0.05)] sm:p-6">
              <div className="mb-5"><div className="font-body text-xs font-bold uppercase tracking-[0.16em] text-gold-500">Forfaits annuels</div><h2 className="mt-2 font-display text-2xl font-bold text-blue-950">Choisissez la fréquence qui convient</h2></div>
              <div className="grid gap-3">
                {annualCourses.map((course, index) => (
                  <div key={`${course.label}-${index}`} className="flex items-center justify-between gap-5 rounded-[20px] border border-blue-500/[0.07] bg-cream p-5">
                    <div><div className="font-display text-lg font-bold text-blue-950">{course.label}</div><div className="mt-1 font-body text-xs text-slate-400">{course.level}{course.freq ? ` · ${course.freq}` : ""}</div></div>
                    <div className="flex-shrink-0 text-right"><div className="font-display text-2xl font-bold text-blue-700">{course.price}€</div><div className="font-body text-[10px] text-slate-400">forfait annuel</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="bg-white px-6 py-20">
        <div className="mx-auto grid max-w-[1000px] gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
          <div><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-50 text-gold-600"><Trophy size={23} /></div><div className="mt-5 font-body text-xs font-bold uppercase tracking-[0.18em] text-gold-500">Challenges & concours</div><h2 className="mt-3 font-display text-3xl font-bold text-blue-950">Participer à la vie sportive du club</h2><p className="mt-4 font-body text-sm leading-relaxed text-slate-500">Les tarifs et niveaux sont précisés pour chaque épreuve. Les inscriptions apparaissent dans le planning et l’espace famille.</p></div>
          <div className="divide-y divide-slate-100 rounded-[24px] border border-blue-500/[0.08] bg-cream px-5">
            {tariffs.competitions.map((competition, index) => (
              <div key={`${competition.label}-${index}`} className="flex items-center justify-between gap-5 py-5"><div><div className="font-body text-sm font-bold text-blue-950">{competition.label}</div><div className="mt-1 font-body text-xs text-slate-400">{competition.level} · {competition.freq}</div></div><div className="font-display text-xl font-bold text-blue-700">{competition.price}€</div></div>
            ))}
          </div>
        </div>
        {tariffs.forfaits_note && <p className="mx-auto mt-6 max-w-xl text-center font-body text-xs italic leading-relaxed text-slate-400">{tariffs.forfaits_note}</p>}
      </section>

      <section className="bg-cream px-6 pb-24 pt-8">
        <div className="mx-auto grid max-w-[1000px] overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#07111f,#12346b)] text-white shadow-[0_22px_65px_rgba(12,26,46,0.14)] md:grid-cols-[1fr_auto] md:items-center">
          <div className="p-7 sm:p-9"><div className="flex items-center gap-2 font-body text-xs font-bold uppercase tracking-[0.15em] text-gold-300"><CreditCard size={15} /> Paiement</div><h2 className="mt-3 font-display text-2xl font-bold text-white">Réservez en ligne, puis suivez vos règlements dans l’espace famille</h2>{tariffs.paiement_note && <p className="mt-3 max-w-2xl font-body text-sm leading-relaxed text-white/55">{tariffs.paiement_note}</p>}</div>
          <div className="flex flex-col gap-2 p-7 pt-0 md:p-9"><Link href="/espace-cavalier/reserver" className="rounded-xl bg-gold-400 px-6 py-3.5 text-center font-body text-sm font-bold text-blue-950 no-underline">Réserver maintenant</Link><Link href="/contact" className="rounded-xl border border-white/15 bg-white/[0.06] px-6 py-3.5 text-center font-body text-sm font-bold text-white no-underline">Une question ?</Link></div>
        </div>
      </section>
    </>
  );
}
