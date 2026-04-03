// ═══ Programme officiel Galops® Poneys FFE — Version 01/03/2019 ═══
// + Galops cavaliers 1 à 7 (résumé pédagogique)

export interface Competence {
  id: string;
  label: string;
  domaine: "pratique_poney" | "pratique_pied" | "soins" | "connaissances";
}

export interface NiveauGalop {
  id: string;
  label: string;
  labelCourt: string;
  color: string;
  cycle: "poneys_1" | "poneys_2" | "cavaliers";
  description: string;
  competences: Competence[];
}

export const GALOPS_PROGRAMME: NiveauGalop[] = [
  // ── CYCLE 1 PONEYS ──────────────────────────────────────────────────────────
  {
    id: "poney_bronze",
    label: "Poney de Bronze",
    labelCourt: "P🥉",
    color: "#CD7F32",
    cycle: "poneys_1",
    description: "Je découvre le poney et le poney-club",
    competences: [
      { id: "pb_01", label: "Reconnaître le moniteur et dire son prénom", domaine: "connaissances" },
      { id: "pb_02", label: "Mettre mon casque", domaine: "connaissances" },
      { id: "pb_03", label: "Montrer le filet et les rênes", domaine: "connaissances" },
      { id: "pb_04", label: "Montrer la selle", domaine: "connaissances" },
      { id: "pb_05", label: "Brosser le corps", domaine: "soins" },
      { id: "pb_06", label: "Brosser la queue", domaine: "soins" },
      { id: "pb_07", label: "Ranger la brosse", domaine: "soins" },
      { id: "pb_08", label: "Ranger le filet", domaine: "soins" },
      { id: "pb_09", label: "Retenir le nom de mon poney", domaine: "connaissances" },
      { id: "pb_10", label: "Reconnaître mon poney parmi les autres", domaine: "connaissances" },
      { id: "pb_11", label: "Montrer les principales parties du corps du poney", domaine: "connaissances" },
      { id: "pb_12", label: "Aborder un poney attaché, capter son attention", domaine: "pratique_pied" },
      { id: "pb_13", label: "Me positionner près d'un poney attaché et le caresser", domaine: "pratique_pied" },
      { id: "pb_14", label: "Amener le poney en filet sur le terrain avec aide", domaine: "pratique_pied" },
      { id: "pb_15", label: "Monter et descendre avec aide", domaine: "pratique_poney" },
      { id: "pb_16", label: "Être assis au pas", domaine: "pratique_poney" },
      { id: "pb_17", label: "Caresser", domaine: "pratique_poney" },
      { id: "pb_18", label: "Prendre les rênes", domaine: "pratique_poney" },
      { id: "pb_19", label: "Lâcher les rênes et lever les mains", domaine: "pratique_poney" },
      { id: "pb_20", label: "Me coucher sur l'encolure, toucher les oreilles, toucher la queue", domaine: "pratique_poney" },
    ],
  },
  {
    id: "poney_argent",
    label: "Poney d'Argent",
    labelCourt: "P🥈",
    color: "#C0C0C0",
    cycle: "poneys_1",
    description: "Je me familiarise avec le comportement du poney et la vie au poney-club",
    competences: [
      { id: "pa_01", label: "Connaître la sellerie, dire son lieu et son rôle", domaine: "connaissances" },
      { id: "pa_02", label: "Connaître le manège ou la carrière, dire son lieu et son rôle", domaine: "connaissances" },
      { id: "pa_03", label: "Montrer la piste", domaine: "connaissances" },
      { id: "pa_04", label: "Montrer le mors, la têtière et le frontal sur le filet", domaine: "connaissances" },
      { id: "pa_05", label: "Montrer le licol", domaine: "connaissances" },
      { id: "pa_06", label: "Reconnaître la paille", domaine: "connaissances" },
      { id: "pa_07", label: "Détacher une boucle (sous gorge, muserolle ou croupière)", domaine: "soins" },
      { id: "pa_08", label: "Enlever un licol", domaine: "soins" },
      { id: "pa_09", label: "Ranger la selle et le tapis avec aide", domaine: "soins" },
      { id: "pa_10", label: "Observer mon poney : les oreilles", domaine: "connaissances" },
      { id: "pa_11", label: "Reconnaître quand le poney mange, boit, se repose", domaine: "connaissances" },
      { id: "pa_12", label: "Reconnaître quand le poney urine, quand il fait un crottin", domaine: "connaissances" },
      { id: "pa_13", label: "Nommer une robe", domaine: "connaissances" },
      { id: "pa_14", label: "Amener seul le poney en filet sur le terrain", domaine: "pratique_pied" },
      { id: "pa_15", label: "Changer de côté en passant sous l'encolure", domaine: "pratique_pied" },
      { id: "pa_16", label: "Faire le tour du poney", domaine: "pratique_pied" },
      { id: "pa_17", label: "Me mettre à poney avec ou sans montoir avec aide", domaine: "pratique_poney" },
      { id: "pa_18", label: "Diriger au pas sur des courbes simples", domaine: "pratique_poney" },
      { id: "pa_19", label: "Arrêter et repartir au pas", domaine: "pratique_poney" },
      { id: "pa_20", label: "Lâcher et reprendre les rênes — Descendre seul", domaine: "pratique_poney" },
    ],
  },
  {
    id: "poney_or",
    label: "Poney d'Or",
    labelCourt: "P🥇",
    color: "#FFD700",
    cycle: "poneys_1",
    description: "Je suis en confiance avec le poney et au poney-club",
    competences: [
      { id: "po_01", label: "Décrire la tenue d'équitation", domaine: "connaissances" },
      { id: "po_02", label: "Pourquoi on ne joue pas avec la nourriture des poneys", domaine: "connaissances" },
      { id: "po_03", label: "Différencier paille et foin", domaine: "connaissances" },
      { id: "po_04", label: "Identifier les espaces du poney-club", domaine: "connaissances" },
      { id: "po_05", label: "Expliquer l'activité promenade", domaine: "connaissances" },
      { id: "po_06", label: "Enlever la selle, la ranger seul avec le tapis", domaine: "soins" },
      { id: "po_07", label: "Utiliser brosse et étrille sur l'ensemble du corps", domaine: "soins" },
      { id: "po_08", label: "Montrer le cure-pieds — Prendre et curer les antérieurs", domaine: "soins" },
      { id: "po_09", label: "Reconnaître un poney au pas, au trot", domaine: "connaissances" },
      { id: "po_10", label: "Montrer le toupet, les naseaux, les flancs, le dos, les sabots", domaine: "connaissances" },
      { id: "po_11", label: "Montrer les antérieurs et les postérieurs", domaine: "connaissances" },
      { id: "po_12", label: "Différencier poney et poulain", domaine: "connaissances" },
      { id: "po_13", label: "Déplacer les hanches d'un poney attaché", domaine: "pratique_pied" },
      { id: "po_14", label: "Marcher près de mon poney au même rythme, varier la vitesse", domaine: "pratique_pied" },
      { id: "po_15", label: "Mener en main sur un tracé simple avec courbes et arrêt", domaine: "pratique_pied" },
      { id: "po_16", label: "Tenir correctement les rênes à 2 mains", domaine: "pratique_poney" },
      { id: "po_17", label: "Tenir correctement les rênes dans une seule main", domaine: "pratique_poney" },
      { id: "po_18", label: "Prendre et poser un objet sur un support", domaine: "pratique_poney" },
      { id: "po_19", label: "Diriger au pas assis dans une bonne posture sur un enchaînement de courbes", domaine: "pratique_poney" },
      { id: "po_20", label: "Trotter quelques foulées", domaine: "pratique_poney" },
    ],
  },

  // ── CYCLE 2 PONEYS ──────────────────────────────────────────────────────────
  {
    id: "galop_bronze",
    label: "Galop de Bronze",
    labelCourt: "G🥉",
    color: "#CD7F32",
    cycle: "poneys_2",
    description: "Je comprends les bases de la communication avec le poney",
    competences: [
      { id: "gb_01", label: "Connaître les aides naturelles", domaine: "connaissances" },
      { id: "gb_02", label: "Connaître les parties du licol", domaine: "connaissances" },
      { id: "gb_03", label: "Connaître les parties du filet", domaine: "connaissances" },
      { id: "gb_04", label: "Connaître le comportement du poney et les principales règles de sécurité", domaine: "connaissances" },
      { id: "gb_05", label: "Dessiner un cercle, une diagonale, un doubler", domaine: "connaissances" },
      { id: "gb_06", label: "Connaître 2 disciplines", domaine: "connaissances" },
      { id: "gb_07", label: "Aborder au boxe", domaine: "soins" },
      { id: "gb_08", label: "Desseller", domaine: "soins" },
      { id: "gb_09", label: "Enlever le filet", domaine: "soins" },
      { id: "gb_10", label: "Rincer le mors et ranger le filet", domaine: "soins" },
      { id: "gb_11", label: "Citer et reconnaître 2 robes", domaine: "connaissances" },
      { id: "gb_12", label: "Reconnaître et nommer les 3 allures", domaine: "connaissances" },
      { id: "gb_13", label: "Connaître le paragraphe respect du poney de la Charte du Cavalier FFE", domaine: "connaissances" },
      { id: "gb_14", label: "Éloigner le poney de moi", domaine: "pratique_pied" },
      { id: "gb_15", label: "Déplacer les hanches du poney en main", domaine: "pratique_pied" },
      { id: "gb_16", label: "Faire faire demi-tour au poney dans un cercle", domaine: "pratique_pied" },
      { id: "gb_17", label: "Faire baisser la tête du poney", domaine: "pratique_pied" },
      { id: "gb_18", label: "Ajuster et varier la longueur des rênes — Accélérer et ralentir le pas", domaine: "pratique_poney" },
      { id: "gb_19", label: "Passer de l'arrêt au pas et au trot — Franchir des barres au sol au pas", domaine: "pratique_poney" },
      { id: "gb_20", label: "Utiliser la voix — Compter le rythme du trot assis", domaine: "pratique_poney" },
      { id: "gb_21", label: "Conduire au trot", domaine: "pratique_poney" },
      { id: "gb_22", label: "Galoper quelques foulées", domaine: "pratique_poney" },
    ],
  },
  {
    id: "galop_argent",
    label: "Galop d'Argent",
    labelCourt: "G🥈",
    color: "#C0C0C0",
    cycle: "poneys_2",
    description: "Je fais des choix en fonction de mes sensations et des réactions du poney",
    competences: [
      { id: "ga_01", label: "Connaître la fédération, la licence", domaine: "connaissances" },
      { id: "ga_02", label: "Connaître 4 métiers liés au poney-club", domaine: "connaissances" },
      { id: "ga_03", label: "Connaître les distances de sécurité à poney", domaine: "connaissances" },
      { id: "ga_04", label: "Entretenir la selle", domaine: "soins" },
      { id: "ga_05", label: "Mettre un licol", domaine: "soins" },
      { id: "ga_06", label: "Reproduire un nœud d'attache", domaine: "soins" },
      { id: "ga_07", label: "Prendre et curer les postérieurs", domaine: "soins" },
      { id: "ga_08", label: "Utiliser étrille, bouchon et brosse douce", domaine: "soins" },
      { id: "ga_09", label: "Connaître les caractéristiques principales du comportement des poneys", domaine: "connaissances" },
      { id: "ga_10", label: "Différencier poney et ponette", domaine: "connaissances" },
      { id: "ga_11", label: "Connaître les 5 robes de base", domaine: "connaissances" },
      { id: "ga_12", label: "Reconnaître des attitudes spécifiques du poney", domaine: "connaissances" },
      { id: "ga_13", label: "Connaître les principales parties du corps du poney", domaine: "connaissances" },
      { id: "ga_14", label: "Connaître l'alimentation distribuée dans mon poney-club", domaine: "connaissances" },
      { id: "ga_15", label: "Faire reculer le poney", domaine: "pratique_pied" },
      { id: "ga_16", label: "Faire trotter le poney quelques foulées en ligne droite", domaine: "pratique_pied" },
      { id: "ga_17", label: "Ajuster ma position près de mon poney en fonction des situations", domaine: "pratique_pied" },
      { id: "ga_18", label: "Me mettre seul en selle — Descendre au pas", domaine: "pratique_poney" },
      { id: "ga_19", label: "Ressangler en selle avec aide", domaine: "pratique_poney" },
      { id: "ga_20", label: "Franchir un parcours simple de barres au sol au trot en alternant équilibre et assis", domaine: "pratique_poney" },
      { id: "ga_21", label: "Enchaîner un parcours alternant courbes et transitions", domaine: "pratique_poney" },
      { id: "ga_22", label: "Accélérer et ralentir le trot", domaine: "pratique_poney" },
      { id: "ga_23", label: "Partir au galop, conserver le galop et repasser au trot", domaine: "pratique_poney" },
    ],
  },
  {
    id: "galop_or",
    label: "Galop d'Or",
    labelCourt: "G🥇",
    color: "#FFD700",
    cycle: "poneys_2",
    description: "J'ai atteint un premier stade d'autonomie avec le poney et dans son environnement",
    competences: [
      { id: "go_01", label: "Connaître les règles de priorité en manège ou en carrière", domaine: "connaissances" },
      { id: "go_02", label: "Connaître les principales parties de la selle", domaine: "connaissances" },
      { id: "go_03", label: "Connaître les principaux types de chevaux et de poneys", domaine: "connaissances" },
      { id: "go_04", label: "Connaître les principaux types de logement des poneys", domaine: "connaissances" },
      { id: "go_05", label: "Aborder un poney en stabulation ou au pré", domaine: "soins" },
      { id: "go_06", label: "Effectuer seul un pansage élémentaire complet", domaine: "soins" },
      { id: "go_07", label: "Seller", domaine: "soins" },
      { id: "go_08", label: "Mettre le filet", domaine: "soins" },
      { id: "go_09", label: "Lâcher un poney au pré", domaine: "soins" },
      { id: "go_10", label: "Décrire les 5 sens du poney", domaine: "connaissances" },
      { id: "go_11", label: "Décrire la bouche du poney et comment il s'alimente", domaine: "connaissances" },
      { id: "go_12", label: "Connaître le comportement et les besoins alimentaires des poneys", domaine: "connaissances" },
      { id: "go_13", label: "Reconnaître et citer les aliments de base", domaine: "connaissances" },
      { id: "go_14", label: "Connaître les principales parties de la tête", domaine: "connaissances" },
      { id: "go_15", label: "Montrer les principales parties des membres", domaine: "connaissances" },
      { id: "go_16", label: "Mener en main sur un tracé précis alternant lignes droites et courbes", domaine: "pratique_pied" },
      { id: "go_17", label: "Déplacer la tête du poney à droite, gauche, haut et bas", domaine: "pratique_pied" },
      { id: "go_18", label: "Déplacer les épaules et les hanches à partir de l'arrêt", domaine: "pratique_pied" },
      { id: "go_19", label: "Ressangler seul, en selle ou à pied", domaine: "pratique_poney" },
      { id: "go_20", label: "Circuler en respectant les distances de sécurité", domaine: "pratique_poney" },
      { id: "go_21", label: "Diriger au pas et au trot sur un tracé défini (cercle, volte, diagonale, doubler)", domaine: "pratique_poney" },
      { id: "go_22", label: "Trotter enlevé sans étriers", domaine: "pratique_poney" },
      { id: "go_23", label: "Trotter et galoper assis dans une posture stable", domaine: "pratique_poney" },
      { id: "go_24", label: "Enchaîner 2 obstacles sur la piste au trot et au galop", domaine: "pratique_poney" },
    ],
  },

  // ── GALOPS CAVALIERS ────────────────────────────────────────────────────────
  {
    id: "G1", label: "Galop 1", labelCourt: "G1", color: "#2050A0", cycle: "cavaliers",
    description: "Premiers acquis à cheval",
    competences: [
      { id: "g1_01", label: "Aborder le cheval et le panser", domaine: "soins" },
      { id: "g1_02", label: "Amener sur le montoir", domaine: "soins" },
      { id: "g1_03", label: "Se mettre en selle et descendre", domaine: "pratique_poney" },
      { id: "g1_04", label: "Conduire au pas", domaine: "pratique_poney" },
      { id: "g1_05", label: "Trotter assis et enlevé", domaine: "pratique_poney" },
      { id: "g1_06", label: "S'arrêter", domaine: "pratique_poney" },
    ],
  },
  {
    id: "G2", label: "Galop 2", labelCourt: "G2", color: "#2050A0", cycle: "cavaliers",
    description: "Autonomie de base",
    competences: [
      { id: "g2_01", label: "Effectuer un pansage complet", domaine: "soins" },
      { id: "g2_02", label: "Seller et brider", domaine: "soins" },
      { id: "g2_03", label: "Déplacer la croupe et les épaules en main", domaine: "pratique_pied" },
      { id: "g2_04", label: "Trotter enlevé en autonomie", domaine: "pratique_poney" },
      { id: "g2_05", label: "Galoper", domaine: "pratique_poney" },
      { id: "g2_06", label: "Franchir des barres au sol", domaine: "pratique_poney" },
    ],
  },
  {
    id: "G3", label: "Galop 3", labelCourt: "G3", color: "#183878", cycle: "cavaliers",
    description: "Maîtrise des allures",
    competences: [
      { id: "g3_01", label: "Entretien courant du matériel", domaine: "soins" },
      { id: "g3_02", label: "Longer un cheval", domaine: "pratique_pied" },
      { id: "g3_03", label: "Galoper assis", domaine: "pratique_poney" },
      { id: "g3_04", label: "Sauter un obstacle isolé", domaine: "pratique_poney" },
      { id: "g3_05", label: "Réaliser un parcours simple", domaine: "pratique_poney" },
      { id: "g3_06", label: "Trotter et galoper en extérieur", domaine: "pratique_poney" },
    ],
  },
  {
    id: "G4", label: "Galop 4", labelCourt: "G4", color: "#183878", cycle: "cavaliers",
    description: "Engagement et précision",
    competences: [
      { id: "g4_01", label: "Soins vétérinaires de base", domaine: "soins" },
      { id: "g4_02", label: "Transport du cheval", domaine: "connaissances" },
      { id: "g4_03", label: "Enchaîner obstacles à 80 cm", domaine: "pratique_poney" },
      { id: "g4_04", label: "Incurvation aux 3 allures", domaine: "pratique_poney" },
      { id: "g4_05", label: "Transitions dans le calme", domaine: "pratique_poney" },
      { id: "g4_06", label: "Galoper en extérieur varié", domaine: "pratique_poney" },
    ],
  },
  {
    id: "G5", label: "Galop 5", labelCourt: "G5", color: "#183878", cycle: "cavaliers",
    description: "Cheval et cavalier en harmonie",
    competences: [
      { id: "g5_01", label: "Soins et prévention des pathologies courantes", domaine: "soins" },
      { id: "g5_02", label: "Travailler un cheval à la longe", domaine: "pratique_pied" },
      { id: "g5_03", label: "Galoper assis et enlevé", domaine: "pratique_poney" },
      { id: "g5_04", label: "Enchaîner obstacles à 90 cm", domaine: "pratique_poney" },
      { id: "g5_05", label: "Réaliser un parcours de cross simple", domaine: "pratique_poney" },
      { id: "g5_06", label: "Conduire en extérieur sur terrain varié", domaine: "pratique_poney" },
    ],
  },
  {
    id: "G6", label: "Galop 6", labelCourt: "G6", color: "#0A1F5C", cycle: "cavaliers",
    description: "Autonomie et polyvalence",
    competences: [
      { id: "g6_01", label: "Connaissance approfondie de l'alimentation et de la santé", domaine: "connaissances" },
      { id: "g6_02", label: "Préparer un cheval pour la compétition", domaine: "soins" },
      { id: "g6_03", label: "Débuter le travail sur deux pistes", domaine: "pratique_poney" },
      { id: "g6_04", label: "Obstacles à 1m", domaine: "pratique_poney" },
      { id: "g6_05", label: "Parcours de cross avec variations", domaine: "pratique_poney" },
      { id: "g6_06", label: "Autonomie en extérieur", domaine: "pratique_poney" },
    ],
  },
  {
    id: "G7", label: "Galop 7", labelCourt: "G7", color: "#0A1F5C", cycle: "cavaliers",
    description: "Niveau confirmé",
    competences: [
      { id: "g7_01", label: "Maîtrise complète des soins et de la gestion du cheval", domaine: "soins" },
      { id: "g7_02", label: "Débourrage et travail jeune cheval", domaine: "pratique_pied" },
      { id: "g7_03", label: "Travail sur deux pistes confirmé", domaine: "pratique_poney" },
      { id: "g7_04", label: "Obstacles à 1m10+", domaine: "pratique_poney" },
      { id: "g7_05", label: "Compétition en autonomie", domaine: "pratique_poney" },
      { id: "g7_06", label: "Initiation à l'enseignement", domaine: "connaissances" },
    ],
  },
];

export const DOMAINE_LABELS: Record<string, string> = {
  pratique_poney: "🐴 Pratique à poney",
  pratique_pied: "🚶 Pratique à pied",
  soins: "🧹 Soins & matériel",
  connaissances: "📚 Connaissances",
};

// Map galopLevel (stocké sur le cavalier) → id du programme
export const GALOP_LEVEL_TO_ID: Record<string, string> = {
  "—": "poney_bronze",
  "Poney Bronze": "poney_bronze",
  "Poney Argent": "poney_argent",
  "Poney Or": "poney_or",
  "Bronze": "galop_bronze",
  "Argent": "galop_argent",
  "Or": "galop_or",
  "G1": "G1", "G2": "G2", "G3": "G3", "G4": "G4",
  "G5": "G5", "G6": "G6", "G7": "G7",
};

export function getNiveauById(id: string): NiveauGalop | undefined {
  return GALOPS_PROGRAMME.find(n => n.id === id);
}

export function getNiveauByGalopLevel(level: string): NiveauGalop | undefined {
  const id = GALOP_LEVEL_TO_ID[level];
  return id ? getNiveauById(id) : undefined;
}
