"use client";

import Link from "next/link";
import { Card } from "@/components/ui";
import { useVitrine } from "@/lib/use-vitrine";
import { useVitrineImages, type VitrineImageKey } from "@/hooks/useVitrineImages";

const CARDS: Array<{
  key: string;
  imageKey: VitrineImageKey;
  fallbackImage: string;
  title: string;
  desc: string;
  age: string;
  price?: string;
  href: string;
}> = [
  {
    key: "baby_poney",
    imageKey: "activite-baby",
    fallbackImage: "/images/vitrine/choices/stages-enfants.webp",
    title: "Stages vacances",
    desc: "Baby Poney, Galop de Bronze, d'Argent, d'Or… Semaines thématiques inoubliables.",
    age: "Dès 3 ans",
    price: "175",
    href: "/activites?profil=enfant",
  },
  {
    key: "balade",
    imageKey: "activite-balade-jour",
    fallbackImage: "/images/vitrine/choices/balade-plage.webp",
    title: "Balades plage",
    desc: "2h entre dunes, estuaire et plage. Au coucher du soleil, c'est magique.",
    age: "Dès 12 ans",
    price: "53",
    href: "/activites?profil=balade",
  },
  {
    key: "cours",
    imageKey: "activite-cours-loisir",
    fallbackImage: "/images/vitrine/choices/cavalier-regulier.webp",
    title: "Cours réguliers",
    desc: "Forfaits annuels, 1 ou 2 cours par semaine. Progressez toute l'année.",
    age: "Tous niveaux",
    href: "/activites?profil=cours",
  },
  {
    key: "anniversaires",
    imageKey: "activite-anniversaire",
    fallbackImage: "/images/vitrine/choices/anniversaire-poney.webp",
    title: "Anniversaires",
    desc: "Une fête au milieu des poneys ! Jeux, balade et goûter inclus.",
    age: "Dès 4 ans",
    href: "/activites/anniversaire",
  },
];

export function ActivityCards() {
  const { vitrine } = useVitrine();
  const { getImage } = useVitrineImages();

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {CARDS.map((activity) => {
        const act = (vitrine.activites as any)?.[activity.key];
        const image: string = act?.image || getImage(activity.imageKey) || activity.fallbackImage;
        const title = act?.title || activity.title;
        const desc = act?.description || activity.desc;

        return (
          <Link key={activity.key} href={activity.href} className="no-underline">
            <Card hover className="h-full overflow-hidden !p-0">
              <div className="relative h-44 overflow-hidden">
                <img
                  src={image}
                  alt={title}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.035]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-blue-950/58 via-transparent to-white/5" />
                {activity.price && (
                  <div className="absolute right-3 top-3 rounded-lg bg-white/95 px-3 py-1 font-body text-xs font-bold text-blue-700 shadow-sm backdrop-blur-sm">
                    dès {activity.price}€
                  </div>
                )}
                <div className="absolute bottom-3 left-3 rounded-md bg-blue-950/68 px-3 py-1 font-body text-xs font-semibold text-white backdrop-blur-sm">
                  {activity.age}
                </div>
              </div>
              <div className="p-5">
                <h3 className="mb-2 font-display text-lg font-bold text-blue-800">{title}</h3>
                <p className="mb-4 font-body text-sm leading-relaxed text-gray-500">{desc}</p>
                <span className="inline-flex items-center gap-1 font-body text-sm font-semibold text-blue-500">
                  En savoir plus <span>→</span>
                </span>
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
