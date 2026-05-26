"use client";
import Link from "next/link";
import { Card } from "@/components/ui";
import { Star, Compass, CalendarDays, PartyPopper, type LucideIcon } from "lucide-react";
import { useVitrine } from "@/lib/use-vitrine";
import { useVitrineImages, type VitrineImageKey } from "@/hooks/useVitrineImages";

// Lien entre les 4 vignettes accueil et les activités stockées dans Firestore.
// Sources d'image (par priorité) :
//   1. vitrine.activites.<key>.image  → uploadé depuis l'admin Contenu
//   2. useVitrineImages(imageKey)     → uploadé via le mode édition du site
//   3. Fallback sur l'icône SVG
const CARDS: {
  key: string;
  imageKey: VitrineImageKey;
  icon: LucideIcon;
  title: string;
  desc: string;
  age: string;
  price?: string;
  gradient: string;
  href: string;
}[] = [
  { key: "baby_poney",    imageKey: "activite-baby",         icon: Star,        title: "Stages vacances", desc: "Baby Poney, Galop de Bronze, d'Argent, d'Or… Semaines thématiques inoubliables.", age: "Dès 3 ans",   price: "175", gradient: "from-blue-500 to-blue-400",   href: "/activites" },
  { key: "balade",        imageKey: "activite-balade-jour",  icon: Compass,     title: "Balades plage",   desc: "2h entre dunes, estuaire et plage. Au coucher du soleil, c'est magique.",          age: "Dès 12 ans",  price: "53",  gradient: "from-orange-500 to-orange-400", href: "/activites" },
  { key: "cours",         imageKey: "activite-cours-loisir", icon: CalendarDays,title: "Cours réguliers", desc: "Forfaits annuels, 1 ou 2 cours par semaine. Progressez toute l'année.",            age: "Tous niveaux",              gradient: "from-gold-400 to-gold-300",     href: "/activites" },
  { key: "anniversaires", imageKey: "activite-anniversaire", icon: PartyPopper, title: "Anniversaires",   desc: "Une fête au milieu des poneys ! Jeux, balade et goûter inclus.",                   age: "Dès 4 ans",                 gradient: "from-red-400 to-orange-400",    href: "/contact"   },
];

export function ActivityCards() {
  const { vitrine } = useVitrine();
  const { getImage } = useVitrineImages();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {CARDS.map((activity, i) => {
        const act = (vitrine.activites as any)?.[activity.key];
        // Priorité : admin Contenu > mode édition > icône
        const image: string = act?.image || getImage(activity.imageKey) || "";
        // Si l'admin a customisé titre/desc on les utilise en priorité
        const title = act?.title || activity.title;
        const desc = act?.description || activity.desc;
        const Icon = activity.icon;
        return (
          <Link key={i} href={activity.href} className="no-underline">
            <Card hover className="overflow-hidden !p-0 h-full">
              <div className={`h-44 relative flex items-center justify-center overflow-hidden ${image ? "" : `bg-gradient-to-br ${activity.gradient}`}`}>
                {image ? (
                  <img src={image} alt={title} className="w-full h-full object-cover" />
                ) : (
                  <Icon size={64} className="text-white/25" strokeWidth={1} />
                )}
                {activity.price && (
                  <div className="absolute top-3 right-3 bg-white/95 rounded-lg px-3 py-1 font-body text-xs font-bold text-blue-500 shadow-sm">
                    dès {activity.price}€
                  </div>
                )}
                <div className="absolute bottom-3 left-3 font-body text-xs font-semibold text-white bg-blue-500/75 backdrop-blur-sm px-3 py-1 rounded-md">
                  {activity.age}
                </div>
              </div>
              <div className="p-5">
                <h3 className="font-display text-lg font-bold text-blue-800 mb-2">{title}</h3>
                <p className="font-body text-sm text-gray-500 leading-relaxed mb-4">{desc}</p>
                <span className="font-body text-sm font-semibold text-blue-500 inline-flex items-center gap-1">
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
