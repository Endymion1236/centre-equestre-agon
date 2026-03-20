"use client";

import { useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { ChevronDown, ChevronUp, Clock, Users, Calendar, Award, Star } from "lucide-react";

interface Activity {
  id: string;
  category: string;
  icon: string;
  title: string;
  ages: string;
  schedule: string;
  description: string;
  features: string[];
  gradient: string;
  price?: string;
  level?: string;
}

const activities: Activity[] = [
  {
    id: "baby",
    category: "stages",
    icon: "baby",
    title: "Baby Poney",
    ages: "3 – 5 ans",
    schedule: "Lun–Ven · 10h–12h",
    description:
      "Une semaine magique pour les tout-petits ! Dans un univers imaginaire (pirates, fées, safari...), votre enfant découvre le poney en douceur. Maximum 6 enfants par groupe pour un encadrement optimal.",
    features: [
      "Approche ludique et sensorielle",
      "Max 6 enfants par groupe",
      "Thèmes variés chaque semaine",
      "Encadrement par Emmeline (BPJEPS)",
      "Découverte de la mini-ferme",
    ],
    gradient: "from-purple-500 to-purple-400",
    price: "175€ / semaine",
  },
  {
    id: "bronze",
    category: "stages",
    icon: "award",
    title: "Galop de Bronze",
    ages: "6 – 8 ans",
    schedule: "Lun–Ven · 10h–12h ou 14h–16h",
    description:
      "Semaines thématiques (Star Wars, Pokémon, Harry Potter...) mêlant jeux à poney, soins aux animaux et découverte de l'équitation. L'enfant développe sa confiance et son autonomie.",
    features: [
      "Semaines thématiques immersives",
      "Jeux et parcours ludiques",
      "Soins aux poneys",
      "Découverte mini-ferme",
      "Passage de galops possible",
    ],
    gradient: "from-amber-700 to-amber-600",
    price: "175€ / semaine",
  },
  {
    id: "argent",
    category: "stages",
    icon: "medal",
    title: "Galop d'Argent",
    ages: "8 – 10 ans",
    schedule: "Lun–Ven · 10h–12h ou 14h–16h",
    description:
      "Place à l'autonomie ! Les cavaliers approfondissent leur technique, apprennent à seller et brider seuls, et découvrent les bases du travail en carrière.",
    features: [
      "Travail en autonomie",
      "Technique aux 3 allures",
      "Sellage et bridage",
      "Initiation obstacles",
      "Sorties extérieures",
    ],
    gradient: "from-gray-500 to-gray-400",
    price: "175€ / semaine",
  },
  {
    id: "or",
    category: "stages",
    icon: "crown",
    title: "Galop d'Or",
    ages: "8+ ans (cavaliers de l'année ou Galop d'Argent validé)",
    schedule: "Lun–Ven · 10h–12h ou 14h–16h",
    description:
      "Multi-disciplines : CSO, dressage, Pony Games, cross... Un vrai perfectionnement technique pour les cavaliers réguliers du club.",
    features: [
      "Multi-disciplines",
      "CSO et dressage",
      "Pony Games",
      "Préparation galops FFE",
      "Cross et extérieur",
    ],
    gradient: "from-gold-400 to-gold-500",
    price: "175€ / semaine",
  },
  {
    id: "galop34",
    category: "stages",
    icon: "star",
    title: "Galop 3 – 4",
    ages: "10+ ans",
    schedule: "Lun–Ven · 10h–12h ou 14h–16h",
    description:
      "Stage intensif pour cavaliers confirmés. Travail technique poussé en CSO, dressage, cross. Objectif : préparer et valider les Galops 3 et 4 de la FFE.",
    features: [
      "Technique avancée",
      "CSO jusqu'à 80cm",
      "Dressage sur le plat",
      "Préparation examens FFE",
      "Vidéo et débriefing",
    ],
    gradient: "from-blue-500 to-blue-600",
    price: "175€ / semaine",
  },
  {
    id: "balade-soleil",
    category: "balades",
    icon: "compass",
    title: "Balade coucher de soleil",
    ages: "Dès 12 ans",
    schedule: "2h · Avr–Oct · Sur réservation",
    description:
      "La star de nos balades ! 2 heures entre dunes, estuaire de la baie de Sienne et plage d'Agon au coucher du soleil. Groupes par niveau (débutants, débrouillés, confirmés avec galop sur la plage).",
    features: [
      "2h de promenade",
      "3 niveaux de groupe",
      "Dunes, estuaire et plage",
      "Galop sur la plage (confirmés)",
      "D'avril à octobre",
    ],
    gradient: "from-orange-500 to-orange-400",
    price: "57€",
    level: "3 niveaux disponibles",
  },
  {
    id: "balade-jour",
    category: "balades",
    icon: "sun",
    title: "Promenade en journée",
    ages: "Dès 12 ans",
    schedule: "2h · Toute l'année · Sur réservation",
    description:
      "Profitez d'une balade de 2h dans un cadre naturel exceptionnel classé Natura 2000. Idéal pour un cadeau original ou une découverte de la région à cheval.",
    features: [
      "2h de balade",
      "Cadre Natura 2000",
      "Adapté aux débutants",
      "Bon cadeau disponible",
      "Toute l'année (selon météo)",
    ],
    gradient: "from-blue-400 to-blue-300",
    price: "53€",
  },
  {
    id: "balade-privee",
    category: "balades",
    icon: "heart",
    title: "Promenade romantique privatisée",
    ages: "Adultes",
    schedule: "2h · Sur demande",
    description:
      "Un moment rien que pour vous ! Promenade privatisée pour 2, accompagnée par un guide personnel. Parfait pour un anniversaire, une demande spéciale ou simplement se faire plaisir.",
    features: [
      "100% privatisée pour 2",
      "Guide personnel dédié",
      "Parcours personnalisé",
      "Idéal cadeau couple",
    ],
    gradient: "from-pink-500 to-pink-400",
    price: "250€",
  },
  {
    id: "randonnee-jeunes",
    category: "balades",
    icon: "map",
    title: "Randonnée jeunes 12–16 ans",
    ages: "12 – 16 ans",
    schedule: "Journée · Sur réservation",
    description:
      "Une aventure d'une journée complète pour les jeunes cavaliers. Randonnée à travers la campagne normande, pique-nique et galops sur la plage.",
    features: [
      "Journée complète",
      "Niveau intermédiaire requis",
      "Pique-nique inclus",
      "Campagne et plage",
    ],
    gradient: "from-green-500 to-green-400",
    price: "Sur demande",
  },
  {
    id: "cours-loisir",
    category: "cours",
    icon: "calendar",
    title: "Forfait Loisir",
    ages: "Tous âges, tous niveaux",
    schedule: "1 cours/semaine · Toute l'année",
    description:
      "Un cours par semaine toute l'année scolaire. Progressez à votre rythme dans une ambiance conviviale. Paiement en 1x, 3x ou 10x sans frais.",
    features: [
      "1h de cours hebdomadaire",
      "Groupes par niveau et âge",
      "Accès libre au club",
      "Paiement en 1x, 3x ou 10x",
      "Passage galops FFE",
    ],
    gradient: "from-blue-500 to-blue-400",
    price: "Tarif annuel",
  },
  {
    id: "cours-compet",
    category: "cours",
    icon: "trophy",
    title: "Forfait Compétition",
    ages: "Cavaliers motivés",
    schedule: "2 cours/semaine · Toute l'année",
    description:
      "Pour les cavaliers qui veulent se dépasser. 2 cours par semaine, entraînement compétition CSO et Pony Games, accès aux concours du club.",
    features: [
      "2 cours hebdomadaires",
      "Entraînement compétition",
      "CSO + Pony Games",
      "Accès concours du club",
      "Licence FFE facilitée",
    ],
    gradient: "from-gold-400 to-gold-500",
    price: "Tarif annuel",
  },
  {
    id: "cso",
    category: "competitions",
    icon: "medal",
    title: "Concours CSO interne",
    ages: "Galop 3+",
    schedule: "Mensuel",
    description:
      "Concours de saut d'obstacles organisés au club. Parcours adaptés du Club 4 au Club 1. Ambiance conviviale et formatrice.",
    features: [
      "Parcours Club 4 à Club 1",
      "Juges officiels",
      "Remise de prix",
      "Ouvert aux extérieurs",
    ],
    gradient: "from-blue-600 to-blue-500",
    price: "25€",
  },
  {
    id: "ponygames",
    category: "competitions",
    icon: "flag",
    title: "Pony Games",
    ages: "Tous niveaux",
    schedule: "Mensuel",
    description:
      "Notre spécialité ! Compétitions de Pony Games par équipes. Du débutant au niveau national. Préparation aux championnats de France à Lamotte-Beuvron.",
    features: [
      "Par équipes de 5",
      "Tous niveaux",
      "Préparation Lamotte-Beuvron",
      "Ambiance garantie",
    ],
    gradient: "from-green-500 to-green-400",
    price: "15€",
  },
  {
    id: "equifun",
    category: "competitions",
    icon: "party",
    title: "Challenge Équifun",
    ages: "Tous niveaux",
    schedule: "Trimestriel",
    description:
      "Parcours ludiques mêlant maniabilité, adresse et vitesse. Accessible à tous, y compris les débutants. Le fun avant tout !",
    features: [
      "Parcours ludiques",
      "Accessible débutants",
      "Système de points FFE",
      "Podium et récompenses",
    ],
    gradient: "from-purple-500 to-purple-400",
    price: "20€",
  },
  {
    id: "anniversaire",
    category: "autres",
    icon: "party",
    title: "Anniversaire au club",
    ages: "Dès 4 ans",
    schedule: "Demi-journée · Sur demande",
    description:
      "Une fête d'anniversaire unique ! Activités avec les poneys, jeux, découverte de la mini-ferme et goûter. Votre enfant et ses amis vivent une aventure inoubliable.",
    features: [
      "Activités poneys",
      "Jeux en groupe",
      "Visite mini-ferme",
      "Goûter inclus",
      "Personnalisable (thème, nombre...)",
    ],
    gradient: "from-red-400 to-orange-400",
    price: "Sur demande",
  },
  {
    id: "ponyride",
    category: "autres",
    icon: "heart",
    title: "Pony rides",
    ages: "Jusqu'à 7 ans",
    schedule: "Sur place · Aux heures d'ouverture",
    description:
      "Pour les tout-petits ! Une balade autour du club sur nos poneys les plus doux. Pas besoin de réserver, venez directement.",
    features: [
      "Sans réservation",
      "Tour du club accompagné",
      "Poneys sélectionnés",
      "Accessible dès 2 ans",
    ],
    gradient: "from-green-600 to-green-500",
    price: "Tarif sur place",
  },
];

const categories = [
  { id: "all", label: "Toutes", count: activities.length },
  { id: "stages", label: "Stages vacances", count: activities.filter((a) => a.category === "stages").length },
  { id: "balades", label: "Balades", count: activities.filter((a) => a.category === "balades").length },
  { id: "cours", label: "Cours réguliers", count: activities.filter((a) => a.category === "cours").length },
  { id: "competitions", label: "Compétitions", count: activities.filter((a) => a.category === "competitions").length },
  { id: "autres", label: "Autres", count: activities.filter((a) => a.category === "autres").length },
];

function ActivityCard({ activity }: { activity: Activity }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/8 hover:-translate-y-1">
      <div className="flex flex-col md:flex-row">
        {/* Visual */}
        <div
          className={`w-full md:w-48 h-40 md:h-auto bg-gradient-to-br ${activity.gradient} flex items-center justify-center flex-shrink-0`}
        >
          <Star size={64} className="text-white/25" strokeWidth={1} />
        </div>

        {/* Content */}
        <div className="flex-1 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="font-display text-xl font-bold text-blue-800 mb-1.5">
                {activity.title}
              </h3>
              <div className="flex flex-wrap gap-2">
                <Badge color="blue">{activity.ages}</Badge>
                {activity.level && <Badge color="purple">{activity.level}</Badge>}
              </div>
            </div>
            {activity.price && (
              <div className="font-body text-lg font-bold text-blue-500">
                {activity.price}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-4 mb-3 font-body text-sm text-gray-400">
            <span className="flex items-center gap-1.5">
              <Clock size={14} />
              {activity.schedule}
            </span>
          </div>

          <p className="font-body text-sm text-gray-500 leading-relaxed mb-4">
            {activity.description}
          </p>

          {/* Expandable features */}
          {expanded && (
            <div className="mb-4 pt-4 border-t border-blue-500/8">
              <div className="font-body text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                Ce qui est inclus
              </div>
              <div className="flex flex-wrap gap-2">
                {activity.features.map((f, i) => (
                  <span
                    key={i}
                    className="font-body text-sm text-gray-500 bg-sand px-3 py-1.5 rounded-lg"
                  >
                    ✓ {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
            <a href="/espace-cavalier/reserver" className="no-underline">
              <Button variant="primary" size="sm">
                Réserver
              </Button>
            </a>
            <button
              onClick={() => setExpanded(!expanded)}
              className="font-body text-sm font-medium text-blue-500 flex items-center gap-1 hover:text-blue-400 transition-colors bg-transparent border-none cursor-pointer"
            >
              {expanded ? (
                <>
                  Moins de détails <ChevronUp size={16} />
                </>
              ) : (
                <>
                  Plus de détails <ChevronDown size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ActivitiesContent() {
  const [filter, setFilter] = useState("all");
  const filtered =
    filter === "all" ? activities : activities.filter((a) => a.category === filter);

  return (
    <section className="py-12 px-6 max-w-[900px] mx-auto">
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 justify-center mb-10">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setFilter(cat.id)}
            className={`
              font-body text-sm font-medium px-5 py-2.5 rounded-full border transition-all cursor-pointer
              ${
                filter === cat.id
                  ? "bg-blue-500 text-white border-blue-500"
                  : "bg-white text-gray-500 border-gray-200 hover:border-blue-200"
              }
            `}
          >
            {cat.label}{" "}
            <span className="opacity-50 text-xs ml-1">{cat.count}</span>
          </button>
        ))}
      </div>

      {/* Activity cards */}
      <div className="flex flex-col gap-5">
        {filtered.map((activity) => (
          <ActivityCard key={activity.id} activity={activity} />
        ))}
      </div>

      {/* Dégressivité info */}
      <div className="mt-10 p-6 bg-blue-50 rounded-2xl border border-blue-500/8">
        <h3 className="font-display text-lg font-bold text-blue-800 mb-3">
          💡 Tarifs dégressifs
        </h3>
        <div className="font-body text-sm text-gray-500 leading-relaxed space-y-2">
          <p>
            <strong className="text-blue-800">Multi-stages :</strong> Réduction
            dès le 2ème stage consécutif pour le même enfant.
          </p>
          <p>
            <strong className="text-blue-800">Famille :</strong> Réduction à
            partir du 2ème enfant inscrit la même semaine.
          </p>
          <p>
            <strong className="text-blue-800">Cumul possible :</strong> Les
            deux réductions sont cumulables !
          </p>
          <p className="text-gray-400 italic">
            Les réductions sont appliquées automatiquement lors de la
            réservation en ligne.
          </p>
        </div>
      </div>
    </section>
  );
}
