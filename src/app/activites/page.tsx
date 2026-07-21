import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, CalendarDays, Phone, ShieldCheck, Sparkles } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ActivitiesContent } from "./content";

export const metadata: Metadata = {
  title: "Activités équestres",
  description: "Stages vacances dès 3 ans, balades à cheval sur la plage, cours réguliers, Pony Games, compétitions et anniversaires à Agon-Coutainville.",
  alternates: { canonical: "/activites" },
};

const universes = [
  {
    eyebrow: "Dès 3 ans",
    title: "Stages vacances",
    text: "Baby Poney, Bronze, Argent, Or et semaines thématiques.",
    href: "/activites?profil=enfant#baby",
    image: "/images/vitrine/choices/stages-enfants.webp",
    accent: "text-amber-700",
    wash: "from-amber-50 via-amber-50/85 to-transparent",
    border: "border-amber-100",
  },
  {
    eyebrow: "Dès 12 ans",
    title: "Balades sur la plage",
    text: "En journée ou au coucher du soleil — l’expérience phare du centre.",
    href: "/activites?profil=balade#balade-soleil",
    image: "/images/vitrine/choices/balade-plage.webp",
    accent: "text-orange-700",
    wash: "from-orange-50 via-orange-50/85 to-transparent",
    border: "border-orange-100",
  },
  {
    eyebrow: "Toute l’année",
    title: "Cours & progression",
    text: "Du loisir à la compétition, avec des groupes adaptés.",
    href: "/activites?profil=cours#cours-loisir",
    image: "/images/vitrine/choices/cavalier-regulier.webp",
    accent: "text-blue-700",
    wash: "from-blue-50 via-blue-50/85 to-transparent",
    border: "border-blue-100",
  },
];

export default function ActivitesPage() {
  return (
    <>
      <Navbar />

      <section className="relative overflow-hidden bg-[linear-gradient(135deg,#07111f_0%,#12346b_58%,#2050a0_100%)] px-6 pb-28 pt-36 text-white sm:pb-32 sm:pt-40">
        <div className="pointer-events-none absolute -right-32 -top-48 h-[520px] w-[520px] rounded-full border border-white/[0.06] bg-white/[0.03]" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-60 w-60 rounded-full bg-gold-400/10 blur-3xl" />
        <div className="relative mx-auto max-w-[1120px]">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 py-2 font-body text-[10px] font-bold uppercase tracking-[0.17em] text-gold-300 backdrop-blur-md">
              <Sparkles size={14} /> Du premier contact au projet sportif
            </div>
            <h1 className="font-display text-4xl font-bold leading-[1.02] tracking-[-0.03em] text-white sm:text-5xl md:text-6xl">Une activité pour chaque âge, chaque niveau et chaque envie</h1>
            <p className="mt-6 max-w-2xl font-body text-base leading-relaxed text-white/65 sm:text-lg">Stages pendant les vacances, cours à l’année, balades sur la plage, compétition et moments à offrir. Utilisez les filtres ou laissez-vous guider.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#catalogue" className="inline-flex items-center gap-2 rounded-xl bg-gold-400 px-5 py-3.5 font-body text-sm font-bold text-blue-950 no-underline shadow-[0_10px_28px_rgba(240,160,16,0.2)] transition-transform hover:-translate-y-0.5">Explorer le catalogue <ArrowDown size={15} /></a>
              <Link href="/planning" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-5 py-3.5 font-body text-sm font-bold text-white no-underline hover:bg-white/10"><CalendarDays size={16} /> Voir les prochaines dates</Link>
            </div>
          </div>

          <div className="mt-12 grid gap-3 sm:grid-cols-3">
            {[
              { icon: ShieldCheck, title: "Casque fourni", text: "Tenue longue et chaussures fermées à prévoir" },
              { icon: Sparkles, title: "Groupes adaptés", text: "Par âge, niveau et objectifs" },
              { icon: Phone, title: "Un doute ?", text: "L’équipe vous conseille avant la réservation" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-sm">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-gold-300"><Icon size={17} /></div>
                  <div><div className="font-body text-sm font-bold text-white">{item.title}</div><div className="mt-1 font-body text-xs leading-relaxed text-white/45">{item.text}</div></div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative z-10 -mt-12 px-5 sm:px-6">
        <div className="mx-auto grid max-w-[1180px] gap-4 md:grid-cols-3">
          {universes.map((universe) => (
            <Link key={universe.title} href={universe.href} className={`group relative min-h-[275px] overflow-hidden rounded-[26px] border bg-white no-underline shadow-[0_18px_55px_rgba(12,26,46,0.1)] transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_28px_65px_rgba(12,26,46,0.16)] ${universe.border}`}>
              <img src={universe.image} alt="" aria-hidden="true" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.025]" />
              <div className={`absolute inset-0 bg-gradient-to-r ${universe.wash}`} />
              <div className="relative z-10 flex min-h-[275px] max-w-[68%] flex-col justify-end p-6">
                <div className={`font-body text-[10px] font-bold uppercase tracking-[0.16em] ${universe.accent}`}>{universe.eyebrow}</div>
                <h2 className="mt-2 font-display text-2xl font-bold leading-tight text-blue-950">{universe.title}</h2>
                <p className="mt-3 font-body text-sm leading-relaxed text-slate-600">{universe.text}</p>
                <div className="mt-5 inline-flex items-center gap-2 font-body text-xs font-bold text-blue-800">Explorer <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" /></div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div id="catalogue" className="scroll-mt-20"><Suspense fallback={null}><ActivitiesContent /></Suspense></div>

      <section className="bg-white px-6 py-20 text-center">
        <div className="mx-auto max-w-2xl">
          <div className="font-body text-xs font-bold uppercase tracking-[0.18em] text-gold-500">Besoin d’un conseil</div>
          <h2 className="mt-3 font-display text-3xl font-bold text-blue-950">Vous hésitez entre deux activités ?</h2>
          <p className="mx-auto mt-4 max-w-lg font-body text-base leading-relaxed text-slate-500">Indiquez-nous l’âge, l’expérience et ce que le cavalier aime. Nous vous orienterons vers le groupe le plus adapté.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="rounded-xl bg-blue-700 px-6 py-3.5 font-body text-sm font-bold text-white no-underline shadow-lg hover:bg-blue-600">Demander conseil</Link>
            <Link href="/espace-cavalier/reserver" className="rounded-xl border border-blue-200 bg-blue-50 px-6 py-3.5 font-body text-sm font-bold text-blue-700 no-underline hover:border-blue-300">Réserver en ligne</Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
