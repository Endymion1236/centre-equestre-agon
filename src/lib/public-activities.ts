import type { VitrineImageKey } from "@/hooks/useVitrineImages";

export type PublicActivityCategory = "stages" | "balades" | "cours" | "competitions" | "autres";

export interface PublicActivity {
  id: string;
  category: PublicActivityCategory;
  title: string;
  shortTitle?: string;
  ages: string;
  schedule: string;
  description: string;
  intro: string;
  features: string[];
  practical: string[];
  gradient: string;
  imageKey: VitrineImageKey;
  price?: string;
  level?: string;
  bookingLabel?: string;
  vitrineKeys: string[];
  featured?: boolean;
}

export const CATEGORY_LABELS: Record<PublicActivityCategory, string> = {
  stages: "Stages vacances",
  balades: "Balades à la plage",
  cours: "Cours réguliers",
  competitions: "Compétitions",
  autres: "Autres expériences",
};

export const PUBLIC_ACTIVITIES: PublicActivity[] = [
  {
    id: "baby",
    category: "stages",
    title: "Baby Poney",
    ages: "3 – 5 ans",
    schedule: "Du lundi au vendredi · 2h par jour",
    description: "Une semaine imaginaire pour découvrir le poney en douceur, jouer, prendre confiance et rencontrer les animaux de la mini-ferme.",
    intro: "À cet âge, on apprend surtout en vivant des histoires. Chaque semaine devient une aventure où le poney est un partenaire de jeu, de découverte et d’autonomie.",
    features: ["Approche ludique et sensorielle", "Petits groupes", "Thèmes variés chaque semaine", "Découverte de la mini-ferme", "Soins et premiers gestes autour du poney"],
    practical: ["Tenue longue et chaussures fermées", "Casque fourni par le centre", "Prévoir une gourde", "Accueil quelques minutes avant le début"],
    gradient: "from-purple-500 to-pink-400",
    imageKey: "activite-baby-v2",
    price: "175€ / semaine",
    level: "Aucune expérience nécessaire",
    vitrineKeys: ["baby_poney", "baby"],
    featured: true,
  },
  {
    id: "bronze",
    category: "stages",
    title: "Galop de Bronze",
    ages: "6 – 8 ans",
    schedule: "Du lundi au vendredi · matin ou après-midi",
    description: "Des semaines thématiques mêlant jeux à poney, soins, mini-ferme et découverte de l’équitation.",
    intro: "Le Galop de Bronze donne envie d’apprendre sans transformer les vacances en cours magistral. Les enfants progressent au fil d’une histoire et deviennent peu à peu acteurs autour de leur poney.",
    features: ["Semaines thématiques immersives", "Jeux et parcours ludiques", "Soins aux poneys", "Découverte de la mini-ferme", "Progression vers les premiers galops"],
    practical: ["Tenue longue et chaussures fermées", "Casque fourni", "Gourde indispensable", "Groupes organisés par âge et aisance"],
    gradient: "from-amber-700 to-amber-500",
    imageKey: "activite-bronze",
    price: "175€ / semaine",
    level: "Débutants bienvenus",
    vitrineKeys: ["galop_bronze", "bronze"],
    featured: true,
  },
  {
    id: "argent",
    category: "stages",
    title: "Galop d’Argent",
    ages: "8 – 10 ans",
    schedule: "Du lundi au vendredi · matin ou après-midi",
    description: "Place à l’autonomie : préparer son poney, progresser aux trois allures et découvrir de nouvelles disciplines.",
    intro: "Les cavaliers prennent davantage de responsabilités et comprennent comment leurs gestes influencent le poney. Le stage alterne technique, jeux et sorties pour garder une progression vivante.",
    features: ["Travail en autonomie", "Technique aux trois allures", "Sellage et bridage", "Initiation à l’obstacle", "Sorties extérieures"],
    practical: ["Avoir déjà une première expérience est conseillé", "Tenue longue et chaussures fermées", "Casque fourni", "Niveau ajusté par l’équipe"],
    gradient: "from-slate-500 to-slate-400",
    imageKey: "activite-argent",
    price: "175€ / semaine",
    level: "Cavaliers déjà à l’aise",
    vitrineKeys: ["galop_argent", "argent"],
  },
  {
    id: "or",
    category: "stages",
    title: "Galop d’Or",
    ages: "8+ ans",
    schedule: "Du lundi au vendredi · matin ou après-midi",
    description: "Un stage multi-disciplines pour les cavaliers réguliers : CSO, dressage, Pony Games, cross et extérieur.",
    intro: "Le Galop d’Or s’adresse aux cavaliers qui veulent progresser sans renoncer au plaisir de varier les disciplines. Chaque semaine combine objectifs techniques et défis collectifs.",
    features: ["Multi-disciplines", "CSO et dressage", "Pony Games", "Préparation aux galops FFE", "Cross et extérieur"],
    practical: ["Galop d’Argent validé ou cavalier régulier du club", "Tenue adaptée aux disciplines", "Casque fourni", "Objectifs individualisés"],
    gradient: "from-gold-400 to-amber-500",
    imageKey: "activite-or",
    price: "175€ / semaine",
    level: "Cavaliers réguliers",
    vitrineKeys: ["galop_or", "or"],
    featured: true,
  },
  {
    id: "galop34",
    category: "stages",
    title: "Stage Galop 3 – 4",
    ages: "10+ ans",
    schedule: "Du lundi au vendredi · matin ou après-midi",
    description: "Un stage technique pour consolider le travail sur le plat, l’obstacle, le cross et préparer les examens fédéraux.",
    intro: "Le programme s’adapte aux acquis du groupe. Il permet de renforcer les fondamentaux et de préparer un passage de galop lorsque le niveau est déjà suffisamment construit.",
    features: ["Technique avancée", "CSO jusqu’à 80 cm selon le niveau", "Dressage sur le plat", "Préparation aux examens FFE", "Vidéo et débriefing selon les séances"],
    practical: ["Galop 2 acquis ou niveau équivalent", "Matériel personnel conseillé", "Objectifs confirmés avec l’équipe", "Passage d’examen non automatique"],
    gradient: "from-blue-600 to-indigo-500",
    imageKey: "activite-galop34",
    price: "175€ / semaine",
    level: "Galop 2 acquis minimum",
    vitrineKeys: ["galop_34", "galop34", "g3_4"],
  },
  {
    id: "balade-soleil",
    category: "balades",
    title: "Balade coucher de soleil",
    ages: "Dès 12 ans",
    schedule: "2h · d’avril à octobre · sur réservation",
    description: "Deux heures entre dunes, estuaire et plage d’Agon, avec des groupes séparés selon le niveau.",
    intro: "La lumière descend sur la côte, les dunes s’ouvrent et la plage devient un immense terrain d’évasion. Les groupes débutants, débrouillés et confirmés suivent un rythme adapté à leur aisance.",
    features: ["Deux heures de promenade", "Groupes par niveau", "Dunes, estuaire et plage", "Galop sur la plage pour les confirmés", "Casque fourni"],
    practical: ["Âge minimum 12 ans", "Poids maximum 85 kg", "Pantalon long et chaussures fermées", "Niveau déclaré avec honnêteté pour la sécurité"],
    gradient: "from-orange-600 to-amber-400",
    imageKey: "activite-balade-soleil",
    price: "57€",
    level: "Débutant, débrouillé ou confirmé",
    bookingLabel: "Voir les balades disponibles",
    vitrineKeys: ["balade_soleil", "balade_coucher_soleil", "balade"],
    featured: true,
  },
  {
    id: "balade-jour",
    category: "balades",
    title: "Promenade en journée",
    ages: "Dès 12 ans",
    schedule: "2h · selon calendrier et météo",
    description: "Une découverte à cheval du littoral d’Agon-Coutainville, entre chemins, dunes et plage.",
    intro: "Une formule idéale pour découvrir la région autrement. Le parcours et le rythme sont adaptés au niveau du groupe et aux conditions du jour.",
    features: ["Deux heures de balade", "Cadre naturel remarquable", "Groupes par niveau", "Bon cadeau disponible", "Casque fourni"],
    practical: ["Âge minimum 12 ans", "Poids maximum 85 kg", "Pantalon long et chaussures fermées", "Maintien selon les conditions météo"],
    gradient: "from-sky-500 to-blue-300",
    imageKey: "activite-balade-jour",
    price: "53€",
    level: "Tous niveaux selon les créneaux",
    bookingLabel: "Réserver une promenade",
    vitrineKeys: ["balade_jour", "promenade_jour", "balade"],
  },
  {
    id: "balade-privee",
    category: "balades",
    title: "Promenade privatisée",
    ages: "Adultes",
    schedule: "2h · sur demande",
    description: "Une promenade rien que pour vous deux, accompagnée par un guide dédié.",
    intro: "Pour célébrer un anniversaire, une demande particulière ou simplement profiter d’un moment à deux, le départ est réservé au couple et le parcours est ajusté au niveau des cavaliers.",
    features: ["Privatisation pour deux personnes", "Guide dédié", "Rythme adapté au couple", "Parcours selon la météo et les conditions", "Idéal à offrir"],
    practical: ["Sur demande et selon disponibilités", "Âge minimum 12 ans", "Poids maximum 85 kg", "Échange préalable sur les niveaux"],
    gradient: "from-pink-600 to-rose-400",
    imageKey: "activite-balade-privee",
    price: "250€",
    level: "Tous niveaux selon conditions",
    bookingLabel: "Demander une privatisation",
    vitrineKeys: ["balade_privee", "promenade_privee"],
  },
  {
    id: "randonnee-jeunes",
    category: "balades",
    title: "Randonnée jeunes 12–16 ans",
    ages: "12 – 16 ans",
    schedule: "Journée · dates ponctuelles",
    description: "Une journée d’aventure à cheval entre campagne normande, pique-nique et plage.",
    intro: "Pensée pour les jeunes cavaliers déjà autonomes, cette randonnée donne le temps de voyager, de gérer son cheval et de partager une vraie journée de groupe.",
    features: ["Journée complète", "Campagne et plage", "Pique-nique", "Groupe de jeunes cavaliers", "Rythme adapté au niveau annoncé"],
    practical: ["Niveau intermédiaire requis", "Tenue adaptée à la météo", "Prévoir gourde et affaires personnelles", "Dates annoncées dans le planning"],
    gradient: "from-emerald-600 to-green-400",
    imageKey: "activite-randonnee-jeunes",
    price: "Sur demande",
    level: "Intermédiaire minimum",
    vitrineKeys: ["randonnee_jeunes", "rando_jeunes"],
  },
  {
    id: "cours-loisir",
    category: "cours",
    title: "Forfait Loisir",
    ages: "Tous âges · tous niveaux",
    schedule: "Un cours par semaine · année scolaire",
    description: "Un rendez-vous hebdomadaire pour progresser à son rythme et découvrir plusieurs disciplines.",
    intro: "Les groupes sont construits selon l’âge et le niveau. La progression s’inscrit dans la durée, avec une place importante accordée à l’autonomie, au plaisir et à la compréhension du poney.",
    features: ["Un cours hebdomadaire", "Groupes par âge et niveau", "Approche multi-disciplines", "Suivi dans l’espace famille", "Passage des galops FFE selon progression"],
    practical: ["Inscription annuelle", "Licence FFE selon formule", "Paiement échelonné possible", "Réinscriptions ouvertes en priorité aux cavaliers du club"],
    gradient: "from-blue-600 to-blue-400",
    imageKey: "activite-cours-loisir",
    price: "Tarif annuel",
    level: "Du débutant au confirmé",
    bookingLabel: "Voir les cours disponibles",
    vitrineKeys: ["cours_loisir", "cours"],
    featured: true,
  },
  {
    id: "cours-compet",
    category: "cours",
    title: "Forfait Compétition",
    ages: "Cavaliers motivés",
    schedule: "Deux cours par semaine · année scolaire",
    description: "Un programme renforcé pour les cavaliers qui souhaitent s’entraîner en CSO ou en Pony Games et participer aux concours.",
    intro: "Le forfait compétition associe davantage de temps à cheval, un suivi technique plus régulier et la vie d’équipe autour des objectifs de la saison.",
    features: ["Deux cours hebdomadaires", "Entraînement compétition", "CSO et Pony Games", "Préparation des sorties", "Suivi des objectifs"],
    practical: ["Admission selon niveau et projet", "Licence compétition selon participation", "Frais de concours en supplément", "Engagement sur l’année scolaire"],
    gradient: "from-gold-500 to-amber-400",
    imageKey: "activite-cours-compet",
    price: "Tarif annuel",
    level: "Projet sportif",
    vitrineKeys: ["cours_compet", "forfait_competition"],
  },
  {
    id: "cso",
    category: "competitions",
    title: "Concours CSO interne",
    ages: "Selon niveau",
    schedule: "Dates annoncées dans le planning",
    description: "Des parcours adaptés pour apprendre à enchaîner, gérer son trac et se faire plaisir dans une ambiance de club.",
    intro: "Les concours internes permettent de découvrir la compétition dans un cadre connu. Les hauteurs et les objectifs sont adaptés au niveau des cavaliers engagés.",
    features: ["Parcours adaptés", "Reconnaissance accompagnée", "Ambiance formatrice", "Remise des prix", "Ouverture selon le règlement de l’épreuve"],
    practical: ["Inscription préalable", "Niveau minimum indiqué sur chaque date", "Tenue et équipement conformes", "Horaires publiés avant l’épreuve"],
    gradient: "from-blue-700 to-blue-500",
    imageKey: "activite-cso",
    price: "Selon l’épreuve",
    level: "Niveau précisé à chaque concours",
    vitrineKeys: ["cso", "concours_cso"],
  },
  {
    id: "ponygames",
    category: "competitions",
    title: "Pony Games",
    ages: "Tous niveaux selon équipes",
    schedule: "Entraînements et rencontres dans l’année",
    description: "La spécialité historique du club : vitesse, précision, esprit d’équipe et une énergie incomparable.",
    intro: "Les Pony Games développent l’aisance, la coordination et la confiance. Les cavaliers apprennent à agir vite tout en restant précis et attentifs à leur poney et à leurs coéquipiers.",
    features: ["Jeux par équipes", "Progression technique ludique", "Rencontres et compétitions", "Préparation aux championnats de France", "Esprit de club"],
    practical: ["Équipes constituées par niveau", "Entraînements intégrés aux cours ou annoncés", "Déplacements selon calendrier", "Projet sportif présenté aux familles"],
    gradient: "from-emerald-600 to-green-400",
    imageKey: "activite-ponygames",
    price: "Selon l’événement",
    level: "Du loisir au niveau national",
    vitrineKeys: ["ponygames", "pony_games"],
    featured: true,
  },
  {
    id: "equifun",
    category: "competitions",
    title: "Challenge Équifun",
    ages: "Tous niveaux",
    schedule: "Dates ponctuelles",
    description: "Des parcours ludiques où maniabilité, adresse et vitesse se rencontrent.",
    intro: "L’Équifun permet de découvrir le goût du défi sans être un grand cavalier. Les contrats sont adaptés et la réussite passe autant par la précision que par la vitesse.",
    features: ["Parcours ludiques", "Accessible aux débutants", "Contrats adaptés", "Classement et récompenses", "Ambiance conviviale"],
    practical: ["Inscription sur les dates publiées", "Niveau indiqué par épreuve", "Tenue d’équitation habituelle", "Reconnaissance avant le départ"],
    gradient: "from-violet-600 to-purple-400",
    imageKey: "activite-equifun",
    price: "Selon l’épreuve",
    level: "Accessible à tous",
    vitrineKeys: ["equifun", "challenge_equifun"],
  },
  {
    id: "anniversaire",
    category: "autres",
    title: "Anniversaire au club",
    ages: "Dès 4 ans",
    schedule: "Demi-journée · sur demande",
    description: "Une fête au milieu des poneys avec des jeux, une activité équestre, la mini-ferme et un goûter.",
    intro: "L’anniversaire est construit comme une petite aventure de groupe. Le contenu peut être ajusté à l’âge des enfants, au nombre d’invités et au thème choisi.",
    features: ["Activités avec les poneys", "Jeux en groupe", "Visite de la mini-ferme", "Goûter", "Personnalisation du thème"],
    practical: ["Sur réservation", "Nombre de participants à confirmer", "Tenue longue et chaussures fermées", "Organisation précisée lors de la demande"],
    gradient: "from-red-500 to-orange-400",
    imageKey: "activite-anniversaire",
    price: "Sur demande",
    level: "Aucune expérience nécessaire",
    bookingLabel: "Préparer un anniversaire",
    vitrineKeys: ["anniversaires", "anniversaire"],
  },
  {
    id: "ponyride",
    category: "autres",
    title: "Pony rides",
    ages: "Jusqu’à 7 ans",
    schedule: "Sur place · selon ouverture",
    description: "Un petit tour accompagné sur un poney doux pour goûter aux premières sensations.",
    intro: "Une formule simple pour les plus jeunes qui souhaitent monter quelques minutes sans s’inscrire à un stage. La disponibilité dépend de l’activité du centre et des poneys.",
    features: ["Petit tour accompagné", "Poneys sélectionnés", "Première découverte", "Sans niveau requis"],
    practical: ["Disponibilité à vérifier sur place", "Chaussures fermées", "Casque fourni", "Adulte accompagnateur présent"],
    gradient: "from-green-700 to-emerald-400",
    imageKey: "activite-ponyride",
    price: "Tarif sur place",
    level: "Première découverte",
    vitrineKeys: ["ponyride", "pony_rides"],
  },
];

export function getPublicActivity(slug: string) {
  return PUBLIC_ACTIVITIES.find((activity) => activity.id === slug);
}

export function getVitrineActivityOverride(activity: PublicActivity, vitrineActivities: Record<string, unknown> | undefined) {
  if (!vitrineActivities) return null;
  for (const key of activity.vitrineKeys) {
    const candidate = vitrineActivities[key];
    if (candidate && typeof candidate === "object") return candidate as Record<string, unknown>;
  }
  return null;
}

const REMOVED_TEST_IMAGES = ["baby_poney_1779800873646_pepita_web.jpg"];

export function getVitrineActivityImage(override: Record<string, unknown> | null | undefined) {
  const image = typeof override?.image === "string" ? override.image.trim() : "";
  if (!image || REMOVED_TEST_IMAGES.some((testImage) => image.includes(testImage))) return undefined;
  return image;
}
