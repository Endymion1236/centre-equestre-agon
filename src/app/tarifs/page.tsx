import type { Metadata } from "next";
import { BadgeEuro, CheckCircle2 } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { TarifsContent } from "./TarifsContent";

export const metadata: Metadata = {
  title: "Tarifs",
  description: "Tarifs des stages, balades, cours réguliers, compétitions et anniversaires. Paiement en ligne sécurisé, en 1x, 3x ou 10x sans frais.",
  alternates: { canonical: "/tarifs" },
};

export default function TarifsPage() {
  return (
    <>
      <Navbar />

      <section className="relative overflow-hidden bg-[linear-gradient(135deg,#07111f_0%,#12346b_58%,#2050a0_100%)] px-5 pb-24 pt-36 text-white sm:px-6 sm:pb-28 sm:pt-40">
        <div className="pointer-events-none absolute -left-28 bottom-0 h-72 w-72 rounded-full bg-gold-400/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-[1120px] gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 py-2 font-body text-[10px] font-bold uppercase tracking-[0.18em] text-gold-300"><BadgeEuro size={14} /> Des formules pour chaque projet</div>
            <h1 className="font-display text-4xl font-bold leading-tight text-white sm:text-5xl md:text-6xl">Des tarifs clairs pour choisir sereinement</h1>
            <p className="mt-6 max-w-2xl font-body text-base leading-relaxed text-white/65 sm:text-lg">Stages, balades, forfaits annuels et compétitions : retrouvez les principales formules, puis consultez les dates réellement ouvertes dans la réservation.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {["Paiement sécurisé", "Échéanciers selon la formule", "Réductions appliquées automatiquement"].map((item) => (
                <div key={item} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 font-body text-xs font-semibold text-white/72"><CheckCircle2 size={14} className="text-gold-300" />{item}</div>
              ))}
            </div>
          </div>

          <div className="relative min-h-[330px] overflow-hidden rounded-[30px] border border-white/12 bg-white/[0.06] shadow-[0_28px_75px_rgba(0,0,0,0.2)]">
            <img src="/images/vitrine/choices/stages-enfants.webp" alt="Des enfants profitent d'un stage à poney" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-blue-950/48 via-transparent to-white/5" />
            <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/14 bg-blue-950/55 p-4 backdrop-blur-md">
              <div className="font-body text-[10px] font-bold uppercase tracking-[0.15em] text-gold-300">Réserver au bon moment</div>
              <div className="mt-1 font-display text-xl font-bold text-white">Les places et horaires à jour sont dans le planning</div>
            </div>
          </div>
        </div>
      </section>

      <TarifsContent />
      <Footer />
    </>
  );
}
