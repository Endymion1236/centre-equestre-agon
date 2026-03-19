import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button, SectionHeader, Card } from "@/components/ui";
import { SITE_CONFIG } from "@/lib/config";

export default function HomePage() {
  return (
    <>
      <Navbar />

      {/* ═══ HERO ═══ */}
      <section className="relative min-h-screen flex items-center bg-hero overflow-hidden">
        {/* Photo overlay — remplacer par une vraie photo plus tard */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-800/50 via-blue-500/20 to-blue-600/35" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,rgba(240,160,16,0.1)_0%,transparent_50%)]" />

        {/* Wave bottom */}
        <svg
          className="absolute bottom-0 left-0 w-full h-20"
          viewBox="0 0 1440 80"
          preserveAspectRatio="none"
        >
          <path
            d="M0,40 C360,75 720,10 1440,50 L1440,80 L0,80Z"
            className="fill-cream/40"
          />
          <path
            d="M0,55 C480,25 960,70 1440,40 L1440,80 L0,80Z"
            className="fill-cream"
          />
        </svg>

        <div className="relative z-10 max-w-[1180px] mx-auto px-6 pt-36 pb-28 w-full">
          {/* Badge */}
          <div className="inline-flex items-center gap-2.5 bg-gold-400/15 border border-gold-400/25 rounded-full px-5 py-2 mb-7 animate-fade-in-up">
            <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.4)]" />
            <span className="font-body text-sm font-medium text-white/90">
              Réservations ouvertes — Stages Pâques 2026
            </span>
          </div>

          {/* Title */}
          <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold text-white leading-none tracking-tighter max-w-3xl mb-6 animate-fade-in-up animate-delay-100 [text-shadow:0_2px_40px_rgba(0,0,0,0.3)]">
            L&apos;équitation
            <br />
            <span className="text-gradient-gold">les pieds dans le sable</span>
          </h1>

          {/* Subtitle */}
          <p className="font-body text-lg md:text-xl text-white/75 leading-relaxed max-w-xl mb-10 animate-fade-in-up animate-delay-200">
            Stages, balades au coucher du soleil, cours toute l&apos;année et
            mini-ferme pédagogique. À {SITE_CONFIG.distanceToBeach} de la mer, à{" "}
            {SITE_CONFIG.address.city}.
          </p>

          {/* CTAs */}
          <div className="flex gap-4 flex-wrap animate-fade-in-up animate-delay-300">
            <Button variant="primary" size="lg">
              Réserver un stage
            </Button>
            <button className="glass px-10 py-4 rounded-xl font-body text-base font-medium text-white hover:bg-white/18 transition-all cursor-pointer">
              Découvrir nos balades
            </button>
          </div>

          {/* Stats */}
          <div className="flex gap-12 mt-16 flex-wrap animate-fade-in-up animate-delay-400">
            {[
              { value: `Depuis ${SITE_CONFIG.since}`, label: "au service des cavaliers" },
              { value: SITE_CONFIG.distanceToBeach, label: "de la plage" },
              { value: "3 – 77 ans", label: "pour tous les âges" },
            ].map((stat, i) => (
              <div key={i}>
                <div className="font-display text-xl font-bold text-gold-300 [text-shadow:0_1px_10px_rgba(0,0,0,0.2)]">
                  {stat.value}
                </div>
                <div className="font-body text-sm text-white/45">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ ACTIVITÉS ═══ */}
      <section className="py-24 px-6 max-w-[1180px] mx-auto">
        <SectionHeader
          tag="Nos activités"
          title="Une aventure pour chaque cavalier"
          subtitle="Du baby poney dès 3 ans aux balades au galop sur la plage, trouvez l'activité qui vous correspond."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            {
              emoji: "🏇",
              title: "Stages Vacances",
              desc: "Baby Poney, Galop de Bronze, d'Argent, d'Or... Des semaines thématiques inoubliables.",
              age: "Dès 3 ans",
              price: "175",
              color: "from-blue-500 to-blue-400",
            },
            {
              emoji: "🌅",
              title: "Balades Plage",
              desc: "2h entre dunes, estuaire et plage. Au coucher du soleil, c'est magique.",
              age: "Dès 12 ans",
              price: "53",
              color: "from-blue-400 to-blue-300",
            },
            {
              emoji: "📅",
              title: "Cours Réguliers",
              desc: "Forfaits annuels avec cours hebdomadaires. Progressez toute l'année.",
              age: "Tous niveaux",
              color: "from-gold-400 to-gold-300",
            },
            {
              emoji: "🎂",
              title: "Anniversaires",
              desc: "Une fête au milieu des poneys ! Jeux, balade et goûter inclus.",
              age: "Dès 4 ans",
              color: "from-orange-500 to-orange-400",
            },
          ].map((activity, i) => (
            <Card key={i} hover className="overflow-hidden !p-0">
              {/* Image zone */}
              <div
                className={`h-44 bg-gradient-to-br ${activity.color} relative flex items-center justify-center`}
              >
                <span className="text-5xl opacity-30">{activity.emoji}</span>
                {activity.price && (
                  <div className="absolute top-3 right-3 bg-white/95 rounded-lg px-3 py-1 font-body text-xs font-bold text-blue-500 shadow-sm">
                    dès {activity.price}€
                  </div>
                )}
                <div className="absolute bottom-3 left-3 font-body text-xs font-semibold text-white bg-blue-500/75 backdrop-blur-sm px-3 py-1 rounded-md">
                  {activity.age}
                </div>
              </div>
              {/* Content */}
              <div className="p-5">
                <h3 className="font-display text-lg font-bold text-blue-800 mb-2">
                  {activity.title}
                </h3>
                <p className="font-body text-sm text-gray-500 leading-relaxed mb-4">
                  {activity.desc}
                </p>
                <span className="font-body text-sm font-semibold text-blue-500 inline-flex items-center gap-1 group">
                  En savoir plus
                  <span className="transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </span>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* ═══ CTA FINAL ═══ */}
      <section className="py-24 px-6 text-center bg-cream">
        <div className="max-w-lg mx-auto">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-blue-800 leading-tight mb-5">
            Prêt à vivre
            <br />
            l&apos;aventure équestre ?
          </h2>
          <p className="font-body text-lg text-gray-500 leading-relaxed mb-9">
            Réservez en ligne, paiement sécurisé,
            <br />
            confirmation immédiate.
          </p>
          <Button variant="primary" size="lg">
            Réserver maintenant
          </Button>
        </div>
      </section>

      <Footer />
    </>
  );
}
