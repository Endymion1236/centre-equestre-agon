import { BadgeEuro } from "lucide-react";
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

      {/* Stages */}
      <section className="py-16 px-6 max-w-[1100px] mx-auto">
        <SectionHeader
          tag="Stages vacances"
          title="Tarifs des stages"
          subtitle="Du lundi au vendredi, 2h par jour. Tarifs identiques toutes périodes."
        />
        <div className="flex flex-wrap gap-5 justify-center">
          <PriceCard
            title="Baby Poney"
            subtitle="3 – 5 ans"
            price="175€"
            unit="/ semaine"
            features={[
              "10h de stage (2h/jour)",
              "Max 6 enfants",
              "Thèmes imaginaires",
              "Encadrement BPJEPS",
            ]}
          />
          <PriceCard
            title="Galop Bronze / Argent"
            subtitle="6 – 10 ans"
            price="175€"
            unit="/ semaine"
            highlight
            features={[
              "10h de stage (2h/jour)",
              "Semaines thématiques",
              "Soins aux poneys inclus",
              "Passage galops possible",
              "Goûter inclus",
            ]}
          />
          <PriceCard
            title="Galop d'Or / G3-4"
            subtitle="8+ ans"
            price="175€"
            unit="/ semaine"
            features={[
              "10h de stage (2h/jour)",
              "Multi-disciplines",
              "CSO, dressage, cross",
              "Préparation galops FFE",
            ]}
          />
        </div>
      </section>

      {/* Balades */}
      <section className="py-16 px-6">
        <div className="max-w-[700px] mx-auto bg-sand rounded-3xl p-8 md:p-10">
          <SectionHeader
            tag="Balades à la plage"
            title="Tarifs des promenades"
            subtitle="Toutes nos balades durent 2h. Groupes par niveau."
          />
          <div className="divide-y divide-blue-500/8">
            {[
              { label: "Promenade en journée", level: "Tous niveaux", price: "53€", note: "Dès 12 ans" },
              { label: "Coucher de soleil — débrouillés", level: "Galop 1-2", price: "57€", note: "Avril à octobre" },
              { label: "Coucher de soleil — confirmés", level: "Galop 3+", price: "57€", note: "Galop sur la plage" },
              { label: "Romantique privatisée", level: "Tous niveaux", price: "250€", note: "Pour 2, guide privé" },
              { label: "Randonnée jeunes", level: "Intermédiaire", price: "Sur demande", note: "12-16 ans, journée" },
            ].map((b, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-4 flex-wrap gap-2"
              >
                <div className="flex-1 min-w-[200px]">
                  <div className="font-body text-base font-semibold text-blue-800">
                    {b.label}
                  </div>
                  <div className="font-body text-xs text-gray-400">{b.note}</div>
                </div>
                <Badge color="blue">{b.level}</Badge>
                <span className="font-body text-xl font-bold text-blue-500 min-w-[80px] text-right">
                  {b.price}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compétitions */}
      <section className="py-16 px-6 max-w-[700px] mx-auto">
        <SectionHeader
          tag="Compétitions"
          title="Inscriptions concours"
          subtitle="Concours internes mensuels et trimestriels."
        />
        <div className="divide-y divide-blue-500/8 bg-white rounded-2xl border border-blue-500/8 overflow-hidden">
          {[
            { label: "Concours CSO interne", level: "Galop 3+", price: "25€", freq: "Mensuel" },
            { label: "Pony Games", level: "Tous niveaux", price: "15€", freq: "Mensuel" },
            { label: "Challenge Équifun", level: "Tous niveaux", price: "20€", freq: "Trimestriel" },
            { label: "Engagement concours FFE", level: "Licence requise", price: "Variable", freq: "Selon calendrier" },
          ].map((c, i) => (
            <div key={i} className="flex items-center justify-between px-6 py-4 flex-wrap gap-2">
              <div className="flex-1 min-w-[180px]">
                <div className="font-body text-sm font-semibold text-blue-800">{c.label}</div>
                <div className="font-body text-xs text-gray-400">{c.freq}</div>
              </div>
              <Badge color="blue">{c.level}</Badge>
              <span className="font-body text-lg font-bold text-blue-500 min-w-[70px] text-right">{c.price}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Forfaits */}
      <section className="py-16 px-6 max-w-[800px] mx-auto">
        <SectionHeader
          tag="Cours réguliers"
          title="Forfaits annuels"
          subtitle="Un cours par semaine toute l'année. Paiement en 1x, 3x ou 10x sans frais."
        />
        <div className="flex flex-wrap gap-5 justify-center">
          <PriceCard
            title="Forfait Loisir"
            subtitle="1 cours / semaine"
            price="—"
            unit="/ an"
            features={[
              "1h de cours hebdomadaire",
              "Accès libre au club",
              "Paiement en 1x, 3x ou 10x",
              "Annulation flexible",
            ]}
          />
          <PriceCard
            title="Forfait Compétition"
            subtitle="2 cours / semaine"
            price="—"
            unit="/ an"
            highlight
            features={[
              "2h de cours hebdomadaires",
              "Entraînement compétition",
              "Accès concours du club",
              "Paiement en 1x, 3x ou 10x",
              "Licence FFE facilitée",
            ]}
          />
        </div>
        <p className="text-center font-body text-sm text-gray-400 italic mt-6">
          Les tarifs des forfaits dépendent du niveau et du créneau choisi.
          Contactez-nous pour un devis personnalisé.
        </p>
      </section>

      {/* Bon à savoir */}
      <section className="py-4 px-6 max-w-[700px] mx-auto mb-16">
        <div className="bg-blue-50 rounded-2xl p-7 border border-blue-500/8">
          <h3 className="font-display text-lg font-bold text-blue-800 mb-4">
            Bon à savoir
          </h3>
          <div className="flex flex-col gap-2.5 font-body text-sm text-gray-500">
            <p>💳 Paiement en ligne sécurisé par carte bancaire</p>
            <p>🔄 Forfaits payables en 1x, 3x ou 10x sans frais</p>
            <p>❌ Annulation gratuite jusqu&apos;à 72h avant l&apos;activité</p>
            <p>⚠️ Au-delà de 72h, 50% du montant est retenu</p>
            <p>📋 Licence FFE et cotisation annuelle en supplément</p>
            <p>👨‍👩‍👧‍👦 Réductions famille dès le 2ème enfant inscrit</p>
            <p>🔁 Réduction multi-stages dès le 2ème stage consécutif</p>
            <p>🎁 Bons cadeaux disponibles (bientôt en ligne !)</p>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
