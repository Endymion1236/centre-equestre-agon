import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Heart, PawPrint, Sparkles, TreePine } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import MiniFermeAnimals from "./MiniFermeAnimals";

export const metadata: Metadata = {
  title: "La mini-ferme pédagogique",
  description: "Découvrez les cochons Kune Kune, chèvres, poules et animaux de la mini-ferme du Centre Équestre d’Agon-Coutainville.",
  alternates: { canonical: "/mini-ferme" },
};

export default function MiniFermePage() {
  return (
    <>
      <Navbar />
      <main className="bg-cream">
        <section className="relative overflow-hidden bg-[linear-gradient(135deg,#06130e_0%,#174c36_55%,#277353_100%)] px-5 pb-24 pt-36 text-white sm:px-6 sm:pb-28 sm:pt-40">
          <div className="pointer-events-none absolute -right-32 -top-48 h-[520px] w-[520px] rounded-full border border-white/[0.06] bg-white/[0.03]" />
          <div className="relative mx-auto grid max-w-[1120px] gap-10 lg:grid-cols-[1fr_0.86fr] lg:items-center">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-3 py-2 font-body text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200"><TreePine size={14} /> Découvrir le vivant</div>
              <h1 className="font-display text-4xl font-bold leading-tight text-white sm:text-5xl md:text-6xl">La mini-ferme fait partie de l’aventure équestre</h1>
              <p className="mt-6 max-w-2xl font-body text-base leading-relaxed text-white/66 sm:text-lg">Cochons Kune Kune, chèvres, poules et autres pensionnaires permettent aux enfants d’observer, de toucher, de comprendre et d’apprendre à prendre soin.</p>

              <div className="mt-9 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {[
                  { icon: Heart, title: "Respect du vivant", text: "Comprendre les besoins et les émotions des animaux" },
                  { icon: PawPrint, title: "Découverte sensorielle", text: "Observer, nourrir et approcher avec douceur" },
                  { icon: Sparkles, title: "Intégrée aux stages", text: "Un temps calme et pédagogique dans l’aventure" },
                ].map((item) => {
                  const Icon = item.icon;
                  return <div key={item.title} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm"><div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-emerald-200"><Icon size={19} /></div><div><div className="font-body text-sm font-bold text-white">{item.title}</div><div className="mt-1 font-body text-xs leading-relaxed text-white/45">{item.text}</div></div></div>;
                })}
              </div>
            </div>

            <div className="relative min-h-[390px] overflow-hidden rounded-[32px] border border-white/12 bg-white/[0.06] shadow-[0_30px_85px_rgba(0,0,0,0.22)]">
              <img src="/images/vitrine/choices/baby-poney.webp" alt="Un jeune enfant découvre un poney avec douceur" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/54 via-transparent to-white/5" />
              <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/14 bg-emerald-950/56 p-5 backdrop-blur-md">
                <div className="font-body text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200">Pour les petits comme les grands</div>
                <div className="mt-2 font-display text-2xl font-bold text-white">Approcher un animal, observer et apprendre à prendre soin</div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-[1080px]">
            <div className="mx-auto mb-10 max-w-2xl text-center"><div className="font-body text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Nos pensionnaires</div><h2 className="mt-3 font-display text-3xl font-bold text-blue-950 sm:text-4xl">Rencontrez les animaux de la ferme</h2><p className="mt-4 font-body text-base leading-relaxed text-slate-500">Les portraits ci-dessous sont alimentés directement depuis la gestion du centre pour rester à jour.</p></div>
            <MiniFermeAnimals />
          </div>
        </section>

        <section className="bg-white px-6 py-20 sm:py-24">
          <div className="mx-auto grid max-w-[1050px] gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
            <div>
              <div className="font-body text-xs font-bold uppercase tracking-[0.18em] text-gold-500">Une pédagogie concrète</div>
              <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-blue-950 sm:text-4xl">Apprendre à s’occuper d’un animal, c’est déjà grandir</h2>
              <p className="mt-5 font-body text-base leading-relaxed text-slate-600">La mini-ferme complète le travail autour des poneys. Les enfants découvrent des comportements différents, apprennent à se déplacer calmement, à observer avant d’agir et à adapter leurs gestes.</p>
              <p className="mt-4 font-body text-base leading-relaxed text-slate-600">Pour les plus jeunes, c’est aussi un espace de respiration pendant les stages, particulièrement apprécié après une activité dynamique à poney.</p>
              <div className="mt-7 flex flex-wrap gap-2">
                {["Patience", "Douceur", "Autonomie", "Responsabilité", "Confiance"].map((value) => <span key={value} className="rounded-full border border-emerald-100 bg-emerald-50 px-4 py-2 font-body text-xs font-bold text-emerald-700">{value}</span>)}
              </div>
            </div>
            <div className="rounded-[26px] bg-[linear-gradient(145deg,#07111f,#12346b)] p-7 text-white shadow-[0_22px_60px_rgba(12,26,46,0.14)] sm:p-9">
              <PawPrint size={29} className="text-gold-300" />
              <h3 className="mt-5 font-display text-2xl font-bold text-white">Et les poneys ?</h3>
              <p className="mt-4 font-body text-sm leading-relaxed text-white/58">La cavalerie possède maintenant sa propre page, avec les poneys mis en avant directement depuis leur fiche de gestion.</p>
              <Link href="/equipe" className="group mt-7 inline-flex items-center gap-2 rounded-xl bg-gold-400 px-5 py-3.5 font-body text-sm font-bold text-blue-950 no-underline transition-transform hover:-translate-y-0.5">Découvrir l’équipe et les poneys <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" /></Link>
            </div>
          </div>
        </section>

        <section className="bg-sand px-6 py-20 text-center">
          <Heart size={27} className="mx-auto text-emerald-600" />
          <h2 className="mt-4 font-display text-3xl font-bold text-blue-950">La mini-ferme se découvre pendant les activités</h2>
          <p className="mx-auto mt-4 max-w-xl font-body text-sm leading-relaxed text-slate-500">Elle est notamment intégrée à de nombreux stages enfants et peut être visitée selon l’organisation du centre.</p>
          <Link href="/activites?profil=enfant" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-6 py-3.5 font-body text-sm font-bold text-white no-underline">Voir les stages enfants <ArrowRight size={15} /></Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
