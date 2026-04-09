import { BadgeEuro } from "lucide-react";
import { TarifsContent } from "./TarifsContent";
import { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SectionHeader, Badge, Card } from "@/components/ui";

export const metadata: Metadata = {
  title: "Tarifs",
  description:
    "Tarifs des stages, balades, cours réguliers, compétitions et anniversaires. Paiement en ligne sécurisé, en 1x, 3x ou 10x sans frais.",
};

function PriceCard({
  title,
  subtitle,
  price,
  unit,
  features,
  highlight,
}: {
  title: string;
  subtitle: string;
  price: string;
  unit?: string;
  features: string[];
  highlight?: boolean;
}) {
  return (
    <div
      className={`
        rounded-2xl p-8 flex-1 min-w-[260px] transition-all duration-400
        ${
          highlight
            ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-xl shadow-blue-500/20 hover:shadow-2xl hover:shadow-blue-500/30 hover:-translate-y-1 relative overflow-hidden"
            : "bg-white border border-blue-500/8 hover:shadow-lg hover:shadow-blue-500/8 hover:-translate-y-1"
        }
      `}
    >
      {highlight && (
        <div className="absolute top-4 right-[-30px] bg-gold-400 text-blue-800 font-body text-[11px] font-bold px-10 py-1 rotate-45">
          POPULAIRE
        </div>
      )}
      <div
        className={`font-body text-xs font-bold uppercase tracking-wider mb-2 ${
          highlight ? "text-gold-300" : "text-gold-400"
        }`}
      >
        {subtitle}
      </div>
      <h3
        className={`font-display text-xl font-bold mb-4 ${
          highlight ? "text-white" : "text-blue-800"
        }`}
      >
        {title}
      </h3>
      <div className="mb-5">
        <span
          className={`font-body text-4xl font-bold ${
            highlight ? "text-white" : "text-blue-500"
          }`}
        >
          {price}
        </span>
        {unit && (
          <span
            className={`font-body text-sm ml-1 ${
              highlight ? "text-white/50" : "text-gray-400"
            }`}
          >
            {unit}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-3 mb-6">
        {features.map((f, i) => (
          <div
            key={i}
            className={`flex items-center gap-2.5 font-body text-sm ${
              highlight ? "text-white/80" : "text-gray-500"
            }`}
          >
            <span className={highlight ? "text-gold-300" : "text-gold-400"}>
              ✓
            </span>
            {f}
          </div>
        ))}
      </div>
      <a href="/espace-cavalier/reserver" className="no-underline w-full block">
        <button
          className={`
            w-full font-body text-sm font-semibold py-3.5 rounded-xl transition-all cursor-pointer
            ${
              highlight
                ? "bg-gold-400 text-blue-800 border-none hover:bg-gold-300"
                : "bg-transparent text-blue-500 border-2 border-blue-500 hover:bg-blue-500 hover:text-white"
            }
          `}
        >
          Réserver
        </button>
      </a>
    </div>
  );
}

export default function TarifsPage() {
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
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4"><BadgeEuro size={32} className="text-white/80" /></div>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
            Nos tarifs
          </h1>
          <p className="font-body text-lg text-white/65">
            Des formules adaptées à tous les budgets. Paiement sécurisé en
            ligne, en 1x, 3x ou 10x.
          </p>
        </div>
      </section>

      <TarifsContent />

      <Footer />
    </>
  );
}
