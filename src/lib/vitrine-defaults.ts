// Textes par défaut du site vitrine — servent de fallback si Firestore n'a pas encore de données

export const vitrineDefaults = {
  // ── Activités ──────────────────────────────────────────────────────────────
  activites: {
    baby_poney: {
      title: "Baby Poney",
      ages: "3 – 5 ans",
      schedule: "Lun–Ven · 10h–12h",
      price: "175€ / semaine",
      description: "Une semaine magique pour les tout-petits ! Dans un univers imaginaire (pirates, fées, safari...), votre enfant découvre le poney en douceur. Maximum 6 enfants par groupe pour un encadrement optimal.",
    },
    galop_bronze: {
      title: "Galop de Bronze",
      ages: "6 – 8 ans",
      schedule: "Lun–Ven · 10h–12h ou 14h–16h",
      price: "175€ / semaine",
      description: "Semaines thématiques (Star Wars, Pokémon, Harry Potter...) mêlant jeux à poney, soins aux animaux et découverte de l'équitation. L'enfant développe sa confiance et son autonomie.",
    },
    galop_argent: {
      title: "Galop d'Argent",
      ages: "8 – 10 ans",
      schedule: "Lun–Ven · 10h–12h ou 14h–16h",
      price: "175€ / semaine",
      description: "Place à l'autonomie ! Les cavaliers approfondissent leur technique, apprennent à seller et brider seuls, et découvrent les bases du travail en carrière.",
    },
    galop_or: {
      title: "Galop d'Or",
      ages: "8+ ans (cavaliers de l'année ou Galop d'Argent validé)",
      schedule: "Lun–Ven · 10h–12h ou 14h–16h",
      price: "175€ / semaine",
      description: "Multi-disciplines : CSO, dressage, Pony Games, cross... Un vrai perfectionnement technique pour les cavaliers réguliers du club.",
    },
    balade: {
      title: "Balades à la plage",
      schedule: "Sur réservation · Toute l'année",
      description: "2h entre dunes, estuaire et plage. Découverte du littoral normand à cheval, au coucher du soleil c'est magique.",
    },
    cours: {
      title: "Cours réguliers",
      schedule: "Toute l'année · Planning hebdomadaire",
      description: "Forfaits annuels, 1 ou 2 cours par semaine selon votre niveau. Progressez toute l'année avec nos moniteurs diplômés.",
    },
  },

  // ── Tarifs ──────────────────────────────────────────────────────────────────
  tarifs: {
    stages: {
      baby_poney: "175",
      galop_bronze_argent: "175",
      galop_or: "175",
    },
    balades: [
      { label: "Promenade en journée", level: "Tous niveaux", price: "53", note: "Dès 12 ans" },
      { label: "Coucher de soleil — débrouillés", level: "Galop 1-2", price: "57", note: "Avril à octobre" },
      { label: "Coucher de soleil — confirmés", level: "Galop 3+", price: "57", note: "Galop sur la plage" },
      { label: "Romantique privatisée", level: "Tous niveaux", price: "250", note: "Pour 2, guide privé" },
    ],
    competitions: [
      { label: "Concours CSO interne", level: "Galop 3+", price: "25", freq: "Mensuel" },
      { label: "Pony Games", level: "Tous niveaux", price: "15", freq: "Mensuel" },
      { label: "Challenge Équifun", level: "Tous niveaux", price: "20", freq: "Trimestriel" },
    ],
    forfaits_note: "Les tarifs des forfaits dépendent du niveau et du créneau choisi.",
    paiement_note: "Paiement sécurisé en ligne, en 1x, 3x ou 10x sans frais.",
  },

  // ── Infos pratiques ──────────────────────────────────────────────────────────
  infos: {
    adresse: "56 Charrière du Commerce, 50230 Agon-Coutainville",
    telephone: "02 44 84 99 96",
    telephone_secondaire: "",
    email: "ceagon50@gmail.com",
    horaires_bureau: "Lun–Ven 9h–19h · Sam 9h–17h",
    presentation: "Centre équestre familial à 800m de la mer, spécialisé dans les stages enfants et les balades sur la plage.",
  },
};

export type VitrineData = typeof vitrineDefaults;
