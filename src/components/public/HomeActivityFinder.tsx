import Link from "next/link";
import {
  ArrowRight,
  Baby,
  MoonStar,
  PartyPopper,
  Sparkles,
  Trophy,
  type LucideIcon,
} from "lucide-react";

type Choice = {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  text: string;
  href: string;
  image: string;
  imageAlt: string;
  card: string;
  wash: string;
  accent: string;
};

const choices: Choice[] = [
  {
    icon: Baby,
    eyebrow: "3 à 5 ans",
    title: "Premiers pas à poney",
    text: "Baby poney, histoires, jeux et découverte de la mini-ferme.",
    href: "/activites?profil=baby#baby",
    image: "/images/vitrine/choices/baby-poney.webp",
    imageAlt: "Un jeune enfant découvre un petit poney au centre équestre",
    card: "border-pink-100 bg-pink-50",
    wash: "from-pink-50 via-pink-50/90 to-pink-50/5",
    accent: "text-pink-600",
  },
  {
    icon: Sparkles,
    eyebrow: "6 à 10 ans",
    title: "Des vacances à poney",
    text: "Stages thématiques, autonomie et progression par petits groupes.",
    href: "/activites?profil=enfant#bronze",
    image: "/images/vitrine/choices/stages-enfants.webp",
    imageAlt: "Deux enfants profitent d'un stage à poney",
    card: "border-amber-100 bg-amber-50",
    wash: "from-amber-50 via-amber-50/90 to-amber-50/5",
    accent: "text-amber-600",
  },
  {
    icon: Trophy,
    eyebrow: "Cavalier régulier",
    title: "Progresser et se dépasser",
    text: "Cours à l’année, Galops d’Or, CSO, Pony Games et compétition.",
    href: "/activites?profil=confirme#or",
    image: "/images/vitrine/choices/cavalier-regulier.webp",
    imageAlt: "Une jeune cavalière franchit un obstacle avec son poney",
    card: "border-blue-100 bg-blue-50",
    wash: "from-blue-50 via-blue-50/90 to-blue-50/5",
    accent: "text-blue-700",
  },
  {
    icon: MoonStar,
    eyebrow: "Ados & adultes",
    title: "Galoper sur la plage",
    text: "Balades en journée ou au coucher du soleil, par groupes de niveau.",
    href: "/activites?profil=balade#balade-soleil",
    image: "/images/vitrine/choices/balade-plage.webp",
    imageAlt: "Une cavalière se promène à poney sur la plage d'Agon",
    card: "border-orange-100 bg-orange-50",
    wash: "from-orange-50 via-orange-50/90 to-orange-50/5",
    accent: "text-orange-600",
  },
  {
    icon: PartyPopper,
    eyebrow: "Anniversaire",
    title: "Fêter au milieu des poneys",
    text: "Jeux, activités à poney, mini-ferme et goûter pour une fête qui change de l’ordinaire.",
    href: "/activites/anniversaire",
    image: "/images/vitrine/choices/anniversaire-poney.webp",
    imageAlt: "Un anniversaire au club avec un enfant et un poney décoré",
    card: "border-emerald-100 bg-emerald-50",
    wash: "from-emerald-50 via-emerald-50/90 to-emerald-50/5",
    accent: "text-emerald-700",
  },
];

export default function HomeActivityFinder() {
  return (
    <section className="relative overflow-hidden bg-white px-5 py-20 sm:px-6 sm:py-24">
      <div className="pointer-events-none absolute -left-24 top-8 h-72 w-72 rounded-full bg-blue-50/70 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-gold-100/50 blur-3xl" />

      <div className="relative mx-auto max-w-[1180px]">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <div className="mb-3 font-body text-xs font-bold uppercase tracking-[0.2em] text-gold-500">Par où commencer ?</div>
          <h2 className="font-display text-3xl font-bold leading-tight text-blue-900 sm:text-4xl">Trouvez l’activité qui vous ressemble</h2>
          <p className="mt-4 font-body text-base leading-relaxed text-gray-500">Pas besoin de connaître les niveaux du club. Choisissez simplement l’âge, l’envie ou le projet.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-6">
          {choices.map((choice, index) => {
            const Icon = choice.icon;
            const span = index < 3 ? "xl:col-span-2" : "xl:col-span-3";

            return (
              <Link
                key={choice.title}
                href={choice.href}
                className={`group relative min-h-[340px] overflow-hidden rounded-[28px] border no-underline shadow-[0_12px_40px_rgba(12,26,46,0.055)] transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_24px_58px_rgba(12,26,46,0.13)] ${choice.card} ${span}`}
              >
                <img
                  src={choice.image}
                  alt={choice.imageAlt}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.025]"
                />
                <div className={`absolute inset-0 bg-gradient-to-r ${choice.wash}`} />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/20 via-transparent to-white/5" />

                <div className="relative z-10 flex min-h-[340px] max-w-[68%] flex-col p-6 sm:max-w-[62%] sm:p-7">
                  <div className={`mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/90 shadow-[0_7px_20px_rgba(12,26,46,0.08)] ring-1 ring-black/[0.035] backdrop-blur-sm ${choice.accent}`}>
                    <Icon size={23} />
                  </div>

                  <div className={`font-body text-[10px] font-bold uppercase tracking-[0.16em] ${choice.accent}`}>{choice.eyebrow}</div>
                  <h3 className="mt-2 font-display text-[25px] font-bold leading-[1.08] text-blue-950 sm:text-[27px]">{choice.title}</h3>
                  <p className="mt-4 flex-1 font-body text-sm leading-relaxed text-slate-600">{choice.text}</p>

                  <div className="mt-6 inline-flex items-center gap-2 font-body text-sm font-bold text-blue-800">
                    Découvrir <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1.5" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
