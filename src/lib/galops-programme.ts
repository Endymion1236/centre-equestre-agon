// ═══ Programme officiel FFE ═══
// Galops® Poneys (01/03/2019) + Galops® Cavaliers 1 à 7 (01/09/2012)
// Galops Poneys couvrent les niveaux G1-G2 → on intègre G3 à G7 uniquement

export type Domaine = "pratique_cheval" | "pratique_pied" | "soins" | "connaissances";

export interface Competence {
  id: string;
  label: string;
  domaine: Domaine;
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

// ─── Helpers ────────────────────────────────────────────────────────────────
const c = (id: string, label: string, domaine: Domaine): Competence => ({ id, label, domaine });

// ─── CYCLE 1 : Galops Poneys (3–6 ans) ───────────────────────────────────────
const PONEY_BRONZE: NiveauGalop = {
  id: "poney_bronze", label: "Poney de Bronze", labelCourt: "P🥉",
  color: "#CD7F32", cycle: "poneys_1",
  description: "Je découvre le poney et le poney-club",
  competences: [
    c("pb_01", "Reconnaître le moniteur et dire son prénom", "connaissances"),
    c("pb_02", "Mettre mon casque", "connaissances"),
    c("pb_03", "Montrer le filet et les rênes", "connaissances"),
    c("pb_04", "Montrer la selle", "connaissances"),
    c("pb_05", "Brosser le corps", "soins"),
    c("pb_06", "Brosser la queue", "soins"),
    c("pb_07", "Ranger la brosse", "soins"),
    c("pb_08", "Ranger le filet", "soins"),
    c("pb_09", "Retenir le nom de mon poney", "connaissances"),
    c("pb_10", "Reconnaître mon poney parmi les autres", "connaissances"),
    c("pb_11", "Montrer les principales parties du corps du poney", "connaissances"),
    c("pb_12", "Aborder un poney attaché, capter son attention", "pratique_pied"),
    c("pb_13", "Me positionner près d'un poney attaché et le caresser", "pratique_pied"),
    c("pb_14", "Amener le poney en filet sur le terrain avec aide", "pratique_pied"),
    c("pb_15", "Monter et descendre avec aide", "pratique_cheval"),
    c("pb_16", "Être assis au pas", "pratique_cheval"),
    c("pb_17", "Caresser", "pratique_cheval"),
    c("pb_18", "Prendre les rênes", "pratique_cheval"),
    c("pb_19", "Lâcher les rênes et lever les mains", "pratique_cheval"),
    c("pb_20", "Me coucher sur l'encolure, toucher les oreilles, toucher la queue", "pratique_cheval"),
  ],
};

const PONEY_ARGENT: NiveauGalop = {
  id: "poney_argent", label: "Poney d'Argent", labelCourt: "P🥈",
  color: "#C0C0C0", cycle: "poneys_1",
  description: "Je me familiarise avec le comportement du poney et la vie au poney-club",
  competences: [
    c("pa_01", "Connaître la sellerie, dire son lieu et son rôle", "connaissances"),
    c("pa_02", "Connaître le manège ou la carrière, dire son lieu et son rôle", "connaissances"),
    c("pa_03", "Montrer la piste", "connaissances"),
    c("pa_04", "Montrer le mors, la têtière et le frontal sur le filet", "connaissances"),
    c("pa_05", "Montrer le licol", "connaissances"),
    c("pa_06", "Reconnaître la paille", "connaissances"),
    c("pa_07", "Détacher une boucle (sous gorge, muserolle ou croupière)", "soins"),
    c("pa_08", "Enlever un licol", "soins"),
    c("pa_09", "Ranger la selle et le tapis avec aide", "soins"),
    c("pa_10", "Observer mon poney : les oreilles", "connaissances"),
    c("pa_11", "Reconnaître quand le poney mange, boit, se repose", "connaissances"),
    c("pa_12", "Reconnaître quand le poney urine, quand il fait un crottin", "connaissances"),
    c("pa_13", "Nommer une robe", "connaissances"),
    c("pa_14", "Amener seul le poney en filet sur le terrain", "pratique_pied"),
    c("pa_15", "Changer de côté en passant sous l'encolure", "pratique_pied"),
    c("pa_16", "Faire le tour du poney", "pratique_pied"),
    c("pa_17", "Me mettre à poney avec ou sans montoir avec aide", "pratique_cheval"),
    c("pa_18", "Diriger au pas sur des courbes simples", "pratique_cheval"),
    c("pa_19", "Arrêter et repartir au pas", "pratique_cheval"),
    c("pa_20", "Lâcher et reprendre les rênes — Descendre seul", "pratique_cheval"),
  ],
};

const PONEY_OR: NiveauGalop = {
  id: "poney_or", label: "Poney d'Or", labelCourt: "P🥇",
  color: "#FFD700", cycle: "poneys_1",
  description: "Je suis en confiance avec le poney et au poney-club",
  competences: [
    c("po_01", "Décrire la tenue d'équitation", "connaissances"),
    c("po_02", "Pourquoi on ne joue pas avec la nourriture des poneys", "connaissances"),
    c("po_03", "Différencier paille et foin", "connaissances"),
    c("po_04", "Identifier les espaces du poney-club", "connaissances"),
    c("po_05", "Expliquer l'activité promenade", "connaissances"),
    c("po_06", "Enlever la selle, la ranger seul avec le tapis", "soins"),
    c("po_07", "Utiliser brosse et étrille sur l'ensemble du corps", "soins"),
    c("po_08", "Montrer le cure-pieds — Prendre et curer les antérieurs", "soins"),
    c("po_09", "Reconnaître un poney au pas, au trot", "connaissances"),
    c("po_10", "Montrer le toupet, les naseaux, les flancs, le dos, les sabots", "connaissances"),
    c("po_11", "Montrer les antérieurs et les postérieurs", "connaissances"),
    c("po_12", "Différencier poney et poulain", "connaissances"),
    c("po_13", "Déplacer les hanches d'un poney attaché", "pratique_pied"),
    c("po_14", "Marcher près de mon poney au même rythme, varier la vitesse", "pratique_pied"),
    c("po_15", "Mener en main sur un tracé simple avec courbes et arrêt", "pratique_pied"),
    c("po_16", "Tenir correctement les rênes à 2 mains", "pratique_cheval"),
    c("po_17", "Tenir correctement les rênes dans une seule main", "pratique_cheval"),
    c("po_18", "Prendre et poser un objet sur un support", "pratique_cheval"),
    c("po_19", "Diriger au pas assis dans une bonne posture sur un enchaînement de courbes", "pratique_cheval"),
    c("po_20", "Trotter quelques foulées", "pratique_cheval"),
  ],
};

// ─── CYCLE 2 : Galops Poneys (7–10 ans) ──────────────────────────────────────
const GALOP_BRONZE: NiveauGalop = {
  id: "galop_bronze", label: "Galop de Bronze", labelCourt: "G🥉",
  color: "#CD7F32", cycle: "poneys_2",
  description: "Je comprends les bases de la communication avec le poney",
  competences: [
    c("gb_01", "Connaître les aides naturelles", "connaissances"),
    c("gb_02", "Connaître les parties du licol", "connaissances"),
    c("gb_03", "Connaître les parties du filet", "connaissances"),
    c("gb_04", "Connaître le comportement du poney et les principales règles de sécurité", "connaissances"),
    c("gb_05", "Dessiner un cercle, une diagonale, un doubler", "connaissances"),
    c("gb_06", "Connaître 2 disciplines", "connaissances"),
    c("gb_07", "Aborder au boxe", "soins"),
    c("gb_08", "Desseller", "soins"),
    c("gb_09", "Enlever le filet", "soins"),
    c("gb_10", "Rincer le mors et ranger le filet", "soins"),
    c("gb_11", "Citer et reconnaître 2 robes", "connaissances"),
    c("gb_12", "Reconnaître et nommer les 3 allures", "connaissances"),
    c("gb_13", "Connaître le paragraphe respect du poney de la Charte du Cavalier FFE", "connaissances"),
    c("gb_14", "Éloigner le poney de moi", "pratique_pied"),
    c("gb_15", "Déplacer les hanches du poney en main", "pratique_pied"),
    c("gb_16", "Faire faire demi-tour au poney dans un cercle", "pratique_pied"),
    c("gb_17", "Faire baisser la tête du poney", "pratique_pied"),
    c("gb_18", "Ajuster et varier la longueur des rênes — Accélérer et ralentir le pas", "pratique_cheval"),
    c("gb_19", "Passer de l'arrêt au pas et au trot — Franchir des barres au sol au pas", "pratique_cheval"),
    c("gb_20", "Utiliser la voix — Compter le rythme du trot assis", "pratique_cheval"),
    c("gb_21", "Conduire au trot", "pratique_cheval"),
    c("gb_22", "Galoper quelques foulées", "pratique_cheval"),
  ],
};

const GALOP_ARGENT: NiveauGalop = {
  id: "galop_argent", label: "Galop d'Argent", labelCourt: "G🥈",
  color: "#C0C0C0", cycle: "poneys_2",
  description: "Je fais des choix en fonction de mes sensations et des réactions du poney",
  competences: [
    c("ga_01", "Connaître la fédération, la licence", "connaissances"),
    c("ga_02", "Connaître 4 métiers liés au poney-club", "connaissances"),
    c("ga_03", "Connaître les distances de sécurité à poney", "connaissances"),
    c("ga_04", "Entretenir la selle", "soins"),
    c("ga_05", "Mettre un licol", "soins"),
    c("ga_06", "Reproduire un nœud d'attache", "soins"),
    c("ga_07", "Prendre et curer les postérieurs", "soins"),
    c("ga_08", "Utiliser étrille, bouchon et brosse douce", "soins"),
    c("ga_09", "Connaître les caractéristiques principales du comportement des poneys", "connaissances"),
    c("ga_10", "Différencier poney et ponette", "connaissances"),
    c("ga_11", "Connaître les 5 robes de base", "connaissances"),
    c("ga_12", "Reconnaître des attitudes spécifiques du poney", "connaissances"),
    c("ga_13", "Connaître les principales parties du corps du poney", "connaissances"),
    c("ga_14", "Connaître l'alimentation distribuée dans mon poney-club", "connaissances"),
    c("ga_15", "Faire reculer le poney", "pratique_pied"),
    c("ga_16", "Faire trotter le poney quelques foulées en ligne droite", "pratique_pied"),
    c("ga_17", "Ajuster ma position près de mon poney en fonction des situations", "pratique_pied"),
    c("ga_18", "Me mettre seul en selle — Descendre au pas", "pratique_cheval"),
    c("ga_19", "Ressangler en selle avec aide", "pratique_cheval"),
    c("ga_20", "Franchir un parcours de barres au sol au trot en alternant équilibre et assis", "pratique_cheval"),
    c("ga_21", "Enchaîner un parcours alternant courbes et transitions", "pratique_cheval"),
    c("ga_22", "Accélérer et ralentir le trot", "pratique_cheval"),
    c("ga_23", "Partir au galop, conserver le galop et repasser au trot", "pratique_cheval"),
  ],
};

const GALOP_OR: NiveauGalop = {
  id: "galop_or", label: "Galop d'Or", labelCourt: "G🥇",
  color: "#FFD700", cycle: "poneys_2",
  description: "J'ai atteint un premier stade d'autonomie avec le poney et dans son environnement",
  competences: [
    c("go_01", "Connaître les règles de priorité en manège ou en carrière", "connaissances"),
    c("go_02", "Connaître les principales parties de la selle", "connaissances"),
    c("go_03", "Connaître les principaux types de chevaux et de poneys", "connaissances"),
    c("go_04", "Connaître les principaux types de logement des poneys", "connaissances"),
    c("go_05", "Aborder un poney en stabulation ou au pré", "soins"),
    c("go_06", "Effectuer seul un pansage élémentaire complet", "soins"),
    c("go_07", "Seller", "soins"),
    c("go_08", "Mettre le filet", "soins"),
    c("go_09", "Lâcher un poney au pré", "soins"),
    c("go_10", "Décrire les 5 sens du poney", "connaissances"),
    c("go_11", "Décrire la bouche du poney et comment il s'alimente", "connaissances"),
    c("go_12", "Connaître le comportement et les besoins alimentaires des poneys", "connaissances"),
    c("go_13", "Reconnaître et citer les aliments de base", "connaissances"),
    c("go_14", "Connaître les principales parties de la tête", "connaissances"),
    c("go_15", "Montrer les principales parties des membres", "connaissances"),
    c("go_16", "Mener en main sur un tracé précis alternant lignes droites et courbes", "pratique_pied"),
    c("go_17", "Déplacer la tête du poney à droite, gauche, haut et bas", "pratique_pied"),
    c("go_18", "Déplacer les épaules et les hanches à partir de l'arrêt", "pratique_pied"),
    c("go_19", "Ressangler seul, en selle ou à pied", "pratique_cheval"),
    c("go_20", "Circuler en respectant les distances de sécurité", "pratique_cheval"),
    c("go_21", "Diriger au pas et au trot sur un tracé défini (cercle, volte, diagonale, doubler)", "pratique_cheval"),
    c("go_22", "Trotter enlevé sans étriers", "pratique_cheval"),
    c("go_23", "Trotter et galoper assis dans une posture stable", "pratique_cheval"),
    c("go_24", "Enchaîner 2 obstacles sur la piste au trot et au galop", "pratique_cheval"),
  ],
};

// ─── GALOPS CAVALIERS G3 à G7 (programme officiel 01/09/2012) ────────────────
const G3: NiveauGalop = {
  id: "G3", label: "Galop 3", labelCourt: "G3",
  color: "#2050A0", cycle: "cavaliers",
  description: "Conduite, contrôle et saut",
  competences: [
    // Pratique à cheval — module 1
    c("g3_01", "Trotter enlevé sur un diagonal défini et en changer à volonté", "pratique_cheval"),
    c("g3_02", "Déchausser et rechausser ses étriers au trot et au galop", "pratique_cheval"),
    c("g3_03", "Être stable en équilibre sur ses étriers au trot", "pratique_cheval"),
    c("g3_04", "Être assis au trot et au galop en conservant une bonne posture", "pratique_cheval"),
    c("g3_05", "Changer d'allure sur des transitions simples en un point précis", "pratique_cheval"),
    c("g3_06", "Partir au galop sur le bon pied du pas ou du trot sur une courbe", "pratique_cheval"),
    c("g3_07", "Accélérer et ralentir aux trois allures", "pratique_cheval"),
    c("g3_08", "Diriger au trot sur un tracé précis avec courbes serrées", "pratique_cheval"),
    c("g3_09", "Sauter un obstacle isolé de 60 cm en contrôlant allure et direction", "pratique_cheval"),
    c("g3_10", "Enchaîner des obstacles isolés de 50 cm sur un tracé simple", "pratique_cheval"),
    c("g3_11", "Sauter des dispositifs rapprochés d'environ 60 cm dans une bonne posture", "pratique_cheval"),
    c("g3_12", "Aller en extérieur et en terrain varié", "pratique_cheval"),
    c("g3_13", "Réaliser un parcours type Galop 3", "pratique_cheval"),
    // Pratique à pied — module 2
    c("g3_14", "Mener en main en enchaînant des courbes serrées au pas des deux côtés", "pratique_pied"),
    c("g3_15", "Reculer droit sur quelques foulées", "pratique_pied"),
    c("g3_16", "Déplacer les épaules ou les hanches sur plusieurs pas", "pratique_pied"),
    // Soins — module 2
    c("g3_17", "Effectuer un pansage complet", "soins"),
    c("g3_18", "Curer les pieds postérieurs", "soins"),
    c("g3_19", "Doucher les membres", "soins"),
    c("g3_20", "Graisser les pieds", "soins"),
    c("g3_21", "Entretenir la litière", "soins"),
    c("g3_22", "Entretenir l'abreuvoir", "soins"),
    c("g3_23", "Ajuster le harnachement", "soins"),
    c("g3_24", "Démonter, remonter et entretenir un filet", "soins"),
    // Connaissances — modules 1 & 3
    c("g3_25", "Expliquer les aides pour tourner", "connaissances"),
    c("g3_26", "Expliquer comment partir au galop par aides diagonales", "connaissances"),
    c("g3_27", "Expliquer les conditions du bon abord d'un obstacle (tracé, vitesse, équilibre)", "connaissances"),
    c("g3_28", "Dessiner et nommer la demi-volte et la demi-volte renversée", "connaissances"),
    c("g3_29", "Décrire la posture du cavalier assis et expliquer l'assiette", "connaissances"),
    c("g3_30", "Expliquer le mécanisme du pas et du trot", "connaissances"),
    c("g3_31", "Nommer et situer les parties extérieures du cheval et du sabot", "connaissances"),
    c("g3_32", "Expliquer le rôle de l'entretien des pieds et de la ferrure", "connaissances"),
    c("g3_33", "Reconnaître et nommer les marques blanches (liste, en tête, balzane)", "connaissances"),
    c("g3_34", "Reconnaître et nommer les différentes déclinaisons de robes", "connaissances"),
    c("g3_35", "Nommer et reconnaître 3 races de poneys et 3 races de chevaux", "connaissances"),
    c("g3_36", "Identifier quelques disciplines équestres et leurs caractéristiques", "connaissances"),
  ],
};

const G4: NiveauGalop = {
  id: "G4", label: "Galop 4", labelCourt: "G4",
  color: "#183878", cycle: "cavaliers",
  description: "Le brevet de cavalier",
  competences: [
    // Pratique à cheval — module 1
    c("g4_01", "Trotter enlevé dans une bonne posture lors de changements de direction ou d'amplitude", "pratique_cheval"),
    c("g4_02", "Être stable en équilibre sur les étriers au galop et sur des dispositifs de sauts rapprochés (~80 cm)", "pratique_cheval"),
    c("g4_03", "Trotter, galoper et enchaîner des mouvements simples assis dans une bonne posture", "pratique_cheval"),
    c("g4_04", "Prendre et conserver un contact permanent et moelleux avec la bouche aux trois allures", "pratique_cheval"),
    c("g4_05", "Évoluer sans contact avec la bouche aux trois allures", "pratique_cheval"),
    c("g4_06", "Partir au galop du pas sur le bon pied en ligne droite", "pratique_cheval"),
    c("g4_07", "Varier la vitesse (l'amplitude) au trot enlevé et au galop", "pratique_cheval"),
    c("g4_08", "Maintenir une vitesse régulière sur un enchaînement de courbes et lignes droites au galop", "pratique_cheval"),
    c("g4_09", "Diriger sur des courbes aux trois allures avec un pli interne", "pratique_cheval"),
    c("g4_10", "Déplacer les épaules de son cheval d'un quart de tour au pas", "pratique_cheval"),
    c("g4_11", "Déplacer les hanches de son cheval d'un quart de tour au pas", "pratique_cheval"),
    c("g4_12", "Contrôler allure, vitesse et direction sur un enchaînement de sauts isolés (~70 cm)", "pratique_cheval"),
    c("g4_13", "Contrôler allure, vitesse et direction en terrain varié", "pratique_cheval"),
    c("g4_14", "Réaliser une reprise combinée ou CSO de niveau Club 4", "pratique_cheval"),
    c("g4_15", "Effectuer une sortie en extérieur aux trois allures", "pratique_cheval"),
    // Pratique à pied — modules 1 & 2
    c("g4_16", "Marcher en main en conservant un contact moelleux et permanent sur les deux rênes", "pratique_pied"),
    c("g4_17", "Faire reculer son cheval en restant à distance", "pratique_pied"),
    c("g4_18", "Faire venir le cheval vers soi", "pratique_pied"),
    c("g4_19", "Obtenir une flexion latérale de l'encolure des deux côtés", "pratique_pied"),
    c("g4_20", "Trotter en main sur des lignes droites et des courbes larges", "pratique_pied"),
    c("g4_21", "Franchir des embûches simples au pas (flaques, bâches, plans inclinés...)", "pratique_pied"),
    // Soins
    c("g4_22", "Mettre et enlever des protections de travail (protège-boulets, guêtres, cloches)", "soins"),
    c("g4_23", "Mettre et enlever des protections de transport", "soins"),
    c("g4_24", "Inspecter et soigner les membres avant et après le travail", "soins"),
    // Connaissances
    c("g4_25", "Décrire la posture du cavalier à cheval à l'obstacle", "connaissances"),
    c("g4_26", "Nommer et reconnaître les mors de filet usuels", "connaissances"),
    c("g4_27", "Expliquer l'accord des aides", "connaissances"),
    c("g4_28", "Expliquer les règles de sécurité en aire de travail et à l'extérieur", "connaissances"),
    c("g4_29", "Expliquer ce qu'est un pli et l'incurvation", "connaissances"),
    c("g4_30", "Expliquer le mécanisme du galop à droite et à gauche", "connaissances"),
    c("g4_31", "Décrire les besoins du cheval en fourrages, concentrés et minéraux", "connaissances"),
    c("g4_32", "Citer et expliquer les soins périodiques obligatoires (vaccination) et recommandés", "connaissances"),
    c("g4_33", "Citer les principales normes physiologiques du cheval (température, rythme cardiaque)", "connaissances"),
    c("g4_34", "Procéder à une identification de base : sexe, robe, marques, épis", "connaissances"),
  ],
};

const G5: NiveauGalop = {
  id: "G5", label: "Galop 5", labelCourt: "G5",
  color: "#183878", cycle: "cavaliers",
  description: "Incurvation, cadence et cession à la jambe",
  competences: [
    // Pratique à cheval — module 1
    c("g5_01", "Être stable et décontracté sans étriers aux 3 allures", "pratique_cheval"),
    c("g5_02", "Rechercher l'incurvation de son cheval dans les courbes", "pratique_cheval"),
    c("g5_03", "Effectuer des développements progressifs d'allure en maintenant une cadence régulière", "pratique_cheval"),
    c("g5_04", "Être assis dans une bonne posture aux trois allures et dans les transitions", "pratique_cheval"),
    c("g5_05", "Prendre le galop du pas et du trot en un point précis", "pratique_cheval"),
    c("g5_06", "Diriger avec précision sur des serpentines et des cercles (12 m au pas, 15 m au trot)", "pratique_cheval"),
    c("g5_07", "Varier l'amplitude au pas", "pratique_cheval"),
    c("g5_08", "Réaliser une cession à la jambe au pas des deux côtés", "pratique_cheval"),
    c("g5_09", "Être stable et liant au galop et sur des dispositifs de sauts rapprochés (~90 cm)", "pratique_cheval"),
    c("g5_10", "Galoper dans la bonne cadence et vitesse en enchaînant des sauts sur un parcours à 75 cm", "pratique_cheval"),
    c("g5_11", "Contrôler le galop en enchaînant des sauts et des combinaisons", "pratique_cheval"),
    c("g5_12", "Évoluer en équilibre sur ses étriers avec stabilité aux trois allures en extérieur", "pratique_cheval"),
    c("g5_13", "Présenter une reprise Galop 5 (Club 3) et un parcours CSO ou Hunter Club 3", "pratique_cheval"),
    // Pratique à pied — module 2
    c("g5_14", "Présenter seul un cheval en main au pas et au trot", "pratique_pied"),
    c("g5_15", "Longer un cheval détendu au pas, au trot et à l'arrêt", "pratique_pied"),
    c("g5_16", "Utiliser les longues rênes sur le cercle au pas", "pratique_pied"),
    c("g5_17", "Embarquer un cheval dans un camion ou dans un van", "pratique_pied"),
    // Soins
    c("g5_18", "Poser des bandes de repos, les enlever et les rouler", "soins"),
    // Connaissances
    c("g5_19", "Définir la cession à la jambe et ses critères de jugement", "connaissances"),
    c("g5_20", "Définir les transitions, qualités, défauts", "connaissances"),
    c("g5_21", "Reconnaître et nommer les principaux mors de filet", "connaissances"),
    c("g5_22", "Donner l'emplacement des lettres de la carrière de dressage", "connaissances"),
    c("g5_23", "Citer les noms des principaux obstacles de CSO", "connaissances"),
    c("g5_24", "Connaître les grands principes d'apprentissage du cheval (habituation, renforcements...)", "connaissances"),
    c("g5_25", "Identifier les principales parties du squelette et les grands groupes musculaires", "connaissances"),
    c("g5_26", "Expliquer les grandes particularités de la digestion du cheval", "connaissances"),
    c("g5_27", "Expliquer le numéro SIRE et la puce d'identification", "connaissances"),
  ],
};

const G6: NiveauGalop = {
  id: "G6", label: "Galop 6", labelCourt: "G6",
  color: "#0A1F5C", cycle: "cavaliers",
  description: "Déplacements latéraux au trot et parcours Club 2",
  competences: [
    // Pratique à cheval — module 1
    c("g6_01", "Incurver son cheval aux trois allures sur des courbes larges", "pratique_cheval"),
    c("g6_02", "Maintenir une cadence régulière aux 3 allures", "pratique_cheval"),
    c("g6_03", "Réaliser des courbes aux trois allures en pli externe", "pratique_cheval"),
    c("g6_04", "Effectuer des transitions montantes énergiques et descendantes nettes et fluides", "pratique_cheval"),
    c("g6_05", "Effectuer l'échauffement (détente) de son cheval en autonomie", "pratique_cheval"),
    c("g6_06", "Être assis dans une posture juste aux trois allures, dans les déplacements latéraux et l'incurvation", "pratique_cheval"),
    c("g6_07", "Varier l'amplitude du trot au trot assis", "pratique_cheval"),
    c("g6_08", "Réaliser des cercles et des serpentines (10 m au pas, 12 m au trot) en cherchant l'incurvation", "pratique_cheval"),
    c("g6_09", "Obtenir une extension d'encolure au trot enlevé sur un cercle", "pratique_cheval"),
    c("g6_10", "S'arrêter à partir du trot et reculer de quelques pas", "pratique_cheval"),
    c("g6_11", "Réaliser une cession à la jambe au trot des deux côtés", "pratique_cheval"),
    c("g6_12", "Réaliser un contre changement de main au galop", "pratique_cheval"),
    c("g6_13", "Pouvoir monter avec 4 rênes", "pratique_cheval"),
    c("g6_14", "Être stable et liant sur des dispositifs de sauts rapprochés (~1 m)", "pratique_cheval"),
    c("g6_15", "Enchaîner des sauts à 90 cm dans une cadence régulière", "pratique_cheval"),
    c("g6_16", "Enchaîner des obstacles de cross à 80 cm en terrain varié", "pratique_cheval"),
    c("g6_17", "Présenter une reprise Galop 6 (Club 2) et un parcours CSO ou Hunter Club 2", "pratique_cheval"),
    // Pratique à pied — module 2
    c("g6_18", "Longer aux trois allures un cheval détendu", "pratique_pied"),
    c("g6_19", "Déplacer le cercle à la longe", "pratique_pied"),
    c("g6_20", "Faire sauter un petit obstacle à la longe", "pratique_pied"),
    c("g6_21", "Marcher et trotter aux longues rênes sur le cercle et changer de main", "pratique_pied"),
    // Soins
    c("g6_22", "Toiletter et tresser un cheval pour une compétition", "soins"),
    c("g6_23", "Prodiguer les soins après le travail", "soins"),
    // Connaissances
    c("g6_24", "Expliquer les critères de jugement d'une reprise de dressage Club", "connaissances"),
    c("g6_25", "Expliquer les allures artificielles ou défectueuses", "connaissances"),
    c("g6_26", "Définir la mise sur la main et l'impulsion", "connaissances"),
    c("g6_27", "Définir le galop à faux et ses qualités", "connaissances"),
    c("g6_28", "Citer les principaux enrênements de travail monté", "connaissances"),
    c("g6_29", "Citer les noms des principaux obstacles de Cross", "connaissances"),
    c("g6_30", "Décrire le pied et la ferrure", "connaissances"),
    c("g6_31", "Lister les principales maladies du cheval et leurs symptômes", "connaissances"),
    c("g6_32", "Évaluer l'état corporel d'un cheval (embonpoint, maigreur)", "connaissances"),
    c("g6_33", "Expliquer les grandes étapes de la reproduction de la saillie au sevrage", "connaissances"),
    c("g6_34", "Expliquer le mécanisme du reculer", "connaissances"),
  ],
};

const G7: NiveauGalop = {
  id: "G7", label: "Galop 7", labelCourt: "G7",
  color: "#0A1F5C", cycle: "cavaliers",
  description: "Cheval sur la main, épaule en dedans et parcours Club 1",
  competences: [
    // Pratique à cheval — module 1
    c("g7_01", "Avoir son cheval sur la main aux trois allures", "pratique_cheval"),
    c("g7_02", "Mettre son cheval rond et bas au pas et au trot", "pratique_cheval"),
    c("g7_03", "Incurver son cheval sur les courbes et des inversions de courbes", "pratique_cheval"),
    c("g7_04", "Varier l'amplitude aux 3 allures et enchaîner des transitions", "pratique_cheval"),
    c("g7_05", "Effectuer l'échauffement de son cheval en respectant les consignes de l'enseignant", "pratique_cheval"),
    c("g7_06", "Être assis dans une posture juste et dynamique dans les enchaînements", "pratique_cheval"),
    c("g7_07", "Réaliser des cercles et des serpentines de 10 m au trot dans l'incurvation", "pratique_cheval"),
    c("g7_08", "Réaliser des cercles de 10 à 15 m au galop dans l'incurvation", "pratique_cheval"),
    c("g7_09", "Effectuer des transitions galop-pas-galop", "pratique_cheval"),
    c("g7_10", "Partir au contre galop à partir du pas", "pratique_cheval"),
    c("g7_11", "Réaliser des courbes de 20 m au contre galop", "pratique_cheval"),
    c("g7_12", "Effectuer une épaule en dedans ou contre épaule en dedans au pas et au trot", "pratique_cheval"),
    c("g7_13", "Reculer de 3 à 5 pas en repartant immédiatement", "pratique_cheval"),
    c("g7_14", "Pouvoir monter en bride", "pratique_cheval"),
    c("g7_15", "Être stable sur des dispositifs variés de sauts rapprochés (~1,10 m)", "pratique_cheval"),
    c("g7_16", "Galoper dans une cadence et vitesse adaptées en enchaînant des sauts à 100 cm", "pratique_cheval"),
    c("g7_17", "Adapter l'amplitude des foulées en fonction de l'enchaînement et du tracé", "pratique_cheval"),
    c("g7_18", "Changer de pied dans le mouvement sur la courbe", "pratique_cheval"),
    c("g7_19", "Enchaîner des obstacles de cross à 90 cm avec combinaisons", "pratique_cheval"),
    c("g7_20", "Présenter une reprise Galop 7 (Club 1) et un parcours CSO ou Hunter Club 1", "pratique_cheval"),
    // Pratique à pied — modules 1 & 2
    c("g7_21", "Travailler à la longe un cheval enrêné aux trois allures", "pratique_pied"),
    c("g7_22", "Utiliser les longues rênes au pas et au trot en cercle, ligne droite et changer de main", "pratique_pied"),
    c("g7_23", "Marcher et trotter en main dans une mise en main élémentaire", "pratique_pied"),
    // Soins
    c("g7_24", "Démonter, remonter et ajuster une bride", "soins"),
    c("g7_25", "Poser des bandes de polo", "soins"),
    // Connaissances
    c("g7_26", "Définir l'épaule en dedans, qualités et défauts d'exécution", "connaissances"),
    c("g7_27", "Connaître le rôle et l'effet de la bride", "connaissances"),
    c("g7_28", "Expliquer ce qu'est la rectitude", "connaissances"),
    c("g7_29", "Identifier et nommer les défauts d'aplombs principaux des membres", "connaissances"),
    c("g7_30", "Lire un livret et vérifier le signalement d'un cheval", "connaissances"),
    c("g7_31", "Expliquer l'impact des transports sur la santé et le bien-être des chevaux", "connaissances"),
    c("g7_32", "Connaître les principaux enrênements du travail en longe : but, effets", "connaissances"),
  ],
};

// ─── Export ───────────────────────────────────────────────────────────────────
export const GALOPS_PROGRAMME: NiveauGalop[] = [
  PONEY_BRONZE, PONEY_ARGENT, PONEY_OR,
  GALOP_BRONZE, GALOP_ARGENT, GALOP_OR,
  G3, G4, G5, G6, G7,
];

export const DOMAINE_LABELS: Record<Domaine, string> = {
  pratique_cheval: "🐴 Pratique à cheval",
  pratique_pied:   "🚶 Pratique à pied",
  soins:           "🧹 Soins & matériel",
  connaissances:   "📚 Connaissances",
};

export function getNiveauById(id: string): NiveauGalop | undefined {
  return GALOPS_PROGRAMME.find(n => n.id === id);
}
