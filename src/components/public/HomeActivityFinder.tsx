import Link from "next/link";
import { ArrowRight, Baby, Gift, MoonStar, Sparkles, Trophy } from "lucide-react";

const choices = [
  {
    icon: Baby,
    eyebrow: "3 à 5 ans",
    title: "Premiers pas à poney",
    text: "Baby poney, histoires, jeux et découverte de la mini-ferme.",
    href: "/activites?profil=baby#baby",
    tone: "from-pink-50 to-white border-pink-100 text-pink-600",
  },
  {
    icon: Sparkles,
    eyebrow: "6 à 10 ans",
    title: "Des vacances à poney",
    text: "Stages thématiques, autonomie et progression par petits groupes.",
    href: "/activites?profil=enfant#bronze",
    tone: "from-amber-50 to-white border-amber-100 text-amber-600",
  },
  {
    icon: Trophy,
    eyebrow: "Cavalier régulier",
    title: "Progresser et se dépasser",
    text: "Cours à l’année, Galops d’Or, CSO, Pony Games et compétition.",
    href: "/activites?profil=confirme#or",
    tone: "from-blue-50 to-white border-blue-100 text-blue-600",
  },
  {
    icon: MoonStar,
    eyebrow: "Ados & adultes",
    title: "Galoper sur la plage",
    text: "Balades en journée ou au coucher du soleil, par groupes de niveau.",
    href: "/activites?profil=balade#balade-soleil",
    tone: "from-orange-50 to-white border-orange-100 text-orange-600",
  },
  {
    icon: Gift,
    eyebrow: "Faire plaisir",
    title: "Offrir une expérience",
    text: "Un bon cadeau pour une balade, un stage ou un moment à cheval.",
    href: "/offrir-un-bon",
    tone: "from-emerald-50 to-white border-emerald-100 text-emerald-600",
  },
];

export default function HomeActivityFinder() {
  return (
    <section className="relative overflow-hidden bg-white px-6 py-20 sm:py-24">
      <div className="pointer-events-none absolute -left-24 top-8 h-72 w-72 rounded-full bg-blue-50/70 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-gold-100/50 blur-3xl" />
      <div className="relative mx-auto max-w-[1180px]">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <div className="mb-3 font-body text-xs font-bold uppercase tracking-[0.2em] text-gold-500">Par où commencer ?</div>
          <h2 className="font-display text-3xl font-bold leading-tight text-blue-900 sm:text-4xl">Trouvez l’activité qui vous ressemble</h2>
          <p className="mt-4 font-body text-base leading-relaxed text-gray-500">Pas besoin de connaître les niveaux du club. Choisissez simplement l’âge, l’envie ou le projet.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {choices.map((choice) => {
            const Icon = choice.icon;
            return (
              <Link
                key={choice.title}
                href={choice.href}
                className={`group flex min-h-[245px] flex-col rounded-[22px] border bg-gradient-to-br p-5 no-underline shadow-[0_10px_35px_rgba(12,26,46,0.045)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_45px_rgba(12,26,46,0.11)] ${choice.tone}`}
              >
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.03]">
                  <Icon size={23} />
                </div>
                <div className="font-body text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">{choice.eyebrow}</div>
                <h3 className="mt-2 font-display text-lg font-bold leading-snug text-blue-900">{choice.title}</h3>
                <p className="mt-2 flex-1 font-body text-sm leading-relaxed text-gray-500">{choice.text}</p>
                <div className="mt-5 flex items-center gap-2 font-body text-xs font-bold text-blue-700">
                  Découvrir <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
