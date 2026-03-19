import { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SectionHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Galerie photos",
  description:
    "Découvrez en images le Centre Équestre d'Agon-Coutainville : balades sur la plage, stages, compétitions, mini-ferme et plus encore.",
};

const categories = [
  { id: "balades", label: "Balades plage", emoji: "🌅", count: 0 },
  { id: "stages", label: "Stages", emoji: "🏇", count: 0 },
  { id: "competitions", label: "Compétitions", emoji: "🏆", count: 0 },
  { id: "miniferme", label: "Mini-ferme", emoji: "🐷", count: 0 },
  { id: "club", label: "Vie du club", emoji: "🤝", count: 0 },
];

export default function GaleriePage() {
  return (
    <>
      <Navbar />

      {/* Hero */}
      <section className="relative bg-hero pt-32 pb-20 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_30%,rgba(240,160,16,0.08)_0%,transparent_50%)]" />
        <svg className="absolute bottom-0 left-0 w-full h-12" viewBox="0 0 1440 50" preserveAspectRatio="none">
          <path d="M0,30 C480,50 960,10 1440,35 L1440,50 L0,50Z" className="fill-cream" />
        </svg>
        <div className="relative z-10 max-w-2xl mx-auto">
          <span className="text-5xl mb-4 block">📷</span>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
            Galerie photos
          </h1>
          <p className="font-body text-lg text-white/65">
            Les plus beaux moments du centre en images.
          </p>
        </div>
      </section>

      {/* Categories */}
      <section className="py-16 px-6 max-w-[1000px] mx-auto">
        <SectionHeader
          tag="Albums"
          title="Parcourez nos albums"
          subtitle="Balades, stages, compétitions, mini-ferme... revivez l'ambiance du club."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="card !p-0 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer"
            >
              <div className="h-44 bg-gradient-to-br from-blue-500/20 to-blue-400/10 flex items-center justify-center">
                <span className="text-6xl opacity-50">{cat.emoji}</span>
              </div>
              <div className="p-5 text-center">
                <h3 className="font-display text-lg font-bold text-blue-800 mb-1">
                  {cat.label}
                </h3>
                <p className="font-body text-sm text-gray-400">
                  Photos à venir
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Coming soon message */}
        <div className="mt-12 text-center bg-gold-50 rounded-2xl p-8 border border-gold-400/15">
          <span className="text-4xl block mb-4">📸</span>
          <h3 className="font-display text-xl font-bold text-blue-800 mb-3">
            Galerie en cours de construction
          </h3>
          <p className="font-body text-sm text-gray-500 leading-relaxed max-w-lg mx-auto mb-4">
            Nous préparons une belle galerie photos pour vous montrer
            l&apos;ambiance unique du centre. En attendant, retrouvez nos photos
            sur nos réseaux sociaux !
          </p>
          <div className="flex gap-3 justify-center">
            <a
              href="https://www.facebook.com/ceagon50230"
              target="_blank"
              rel="noopener noreferrer"
              className="font-body text-sm font-semibold text-white bg-[#1877F2] px-6 py-2.5 rounded-lg no-underline"
            >
              Facebook
            </a>
            <a
              href="#"
              className="font-body text-sm font-semibold text-white bg-[#E4405F] px-6 py-2.5 rounded-lg no-underline"
            >
              Instagram
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
