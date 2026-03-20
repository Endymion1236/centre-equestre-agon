import { Star } from "lucide-react";
import { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SectionHeader } from "@/components/ui";
import { ActivitiesContent } from "./content";

export const metadata: Metadata = {
  title: "Nos activités",
  description:
    "Stages vacances dès 3 ans, balades à cheval sur la plage, cours réguliers, anniversaires et mini-ferme. Découvrez toutes nos activités équestres à Agon-Coutainville.",
};

export default function ActivitesPage() {
  return (
    <>
      <Navbar />

      {/* Hero */}
      <section className="relative bg-hero pt-32 pb-20 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_30%,rgba(240,160,16,0.08)_0%,transparent_50%)]" />
        <svg
          className="absolute bottom-0 left-0 w-full h-12"
          viewBox="0 0 1440 50"
          preserveAspectRatio="none"
        >
          <path d="M0,30 C480,50 960,10 1440,35 L1440,50 L0,50Z" className="fill-cream" />
        </svg>
        <div className="relative z-10 max-w-2xl mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4"><Star size={32} className="text-white/80" /></div>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
            Nos activités
          </h1>
          <p className="font-body text-lg text-white/65 leading-relaxed">
            Stages, balades, cours, anniversaires... il y en a pour tous les
            âges et tous les niveaux.
          </p>
        </div>
      </section>

      <ActivitiesContent />

      {/* CTA */}
      <section className="py-20 px-6 text-center bg-cream">
        <h2 className="font-display text-3xl font-bold text-blue-800 mb-4">
          Une question ? Un doute sur le niveau ?
        </h2>
        <p className="font-body text-lg text-gray-500 mb-8 max-w-lg mx-auto">
          Appelez-nous au 02 44 84 99 96, on vous conseillera l&apos;activité
          parfaite pour votre enfant.
        </p>
        <a
          href="/contact"
          className="inline-block font-body text-base font-semibold text-white bg-blue-500 px-8 py-4 rounded-xl hover:bg-blue-400 transition-all no-underline"
        >
          Nous contacter
        </a>
      </section>

      <Footer />
    </>
  );
}
