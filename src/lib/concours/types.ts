// =============================================================================
// Module "Organisation de concours" — Modèle de données (v1)
// Emplacement cible dans le repo : src/lib/concours/types.ts
// -----------------------------------------------------------------------------
// Toute la suite (moteur de contraintes, page, affiche imprimable) se branche
// sur ces types. On part d'une saisie manuelle, mais chaque "id" pourra plus
// tard correspondre à un cavalier/une famille déjà en base Firestore.
// =============================================================================

/** Identifiant d'un terrain. Libre : "manege", "carriere", ou tout autre. */
export type TerrainId = string;

export interface Terrain {
  id: TerrainId;
  /** Libellé affiché : "Manège", "Carrière". */
  nom: string;
}

// -----------------------------------------------------------------------------
// LES RÔLES
// -----------------------------------------------------------------------------
// Ce qu'il faut pourvoir pendant qu'une équipe passe :
//   - coach      : coache l'équipe pendant son passage
//   - placeur    : remet le matériel en place (il en faut 2 en Pony Games)
//   - juge       : juge de ligne
//   - camion     : prépare les chevaux au camion (responsable = adulte)
//   - detente    : échauffe un cheval pour quelqu'un d'autre (suivi en v2,
//                  géré en note texte pour l'instant)
// -----------------------------------------------------------------------------
export type RoleType = "coach" | "placeur" | "juge" | "camion" | "detente";

/** Combien de personnes il faut par rôle, par défaut, pour un passage. */
export const BESOINS_PAR_DEFAUT: Record<RoleType, { nbRequis: number; optionnel: boolean }> = {
  coach: { nbRequis: 1, optionnel: false },
  placeur: { nbRequis: 2, optionnel: false },
  juge: { nbRequis: 1, optionnel: false },
  camion: { nbRequis: 1, optionnel: true }, // l'"aide camion" n'apparaît pas sur tous les passages
  detente: { nbRequis: 1, optionnel: true },
};

// -----------------------------------------------------------------------------
// LES PERSONNES
// -----------------------------------------------------------------------------
// Une même personne peut À LA FOIS concourir (être dans des équipes) ET tenir
// des rôles support entre ses passages. On ne sépare donc pas "cavalier" et
// "encadrant" : on décrit des capacités.
// -----------------------------------------------------------------------------
export type CategorieAge =
  | "poussin"
  | "benjamin"
  | "minime"
  | "cadet"
  | "junior"
  | "senior"
  | "adulte";

export interface Personne {
  id: string;
  prenom: string;
  nom?: string;
  categorieAge?: CategorieAge;

  // --- Éligibilité aux rôles (les "plus jeunes" : placeur OK, camion/coach non) ---
  /** Peut coacher une équipe (en pratique : encadrant adulte). */
  peutCoacher?: boolean;
  /** Peut être juge de ligne. */
  peutJuger?: boolean;
  /** Peut être RESPONSABLE de la préparation au camion (pas les plus jeunes). */
  peutResponsableCamion?: boolean;
  // Tout le monde peut être placeur par défaut, donc pas de flag dédié.

  /** Si la personne vient de la base cavaliers : id du cavalier (families/children) + sa famille. */
  cavalierId?: string;
  familyId?: string;
}

// -----------------------------------------------------------------------------
// LES CHEVAUX
// -----------------------------------------------------------------------------
// On les modélise dès la v1 (même si l'échauffement délégué reste en note
// texte), parce qu'un même poney passe dans plusieurs équipes et doit être
// échauffé à temps. Ça servira au moteur en v2.
// -----------------------------------------------------------------------------
export interface Cheval {
  id: string;
  nom: string; // "Milton", "Java", "Galaxy"...
  /** Si le poney vient de la base : id du document `equides`. */
  equideId?: string;
}

// -----------------------------------------------------------------------------
// UNE ÉQUIPE
// -----------------------------------------------------------------------------
// Un groupe nommé de cavaliers (avec leur poney). On crée l'équipe une fois,
// on la nomme, puis on l'affecte à un passage : le passage récupère le nom et
// la composition de l'équipe.
export interface MembreEquipe {
  personneId: string;
  chevalId?: string;
}

export interface Equipe {
  id: string;
  nom: string;
  membres: MembreEquipe[];
}

// -----------------------------------------------------------------------------
// UN PASSAGE (le cœur du planning)
// -----------------------------------------------------------------------------
export interface ParticipationPassage {
  personneId: string;
  /** Le poney monté pour ce passage (optionnel en v1). */
  chevalId?: string;
}

export interface RoleAssignation {
  type: RoleType;
  /** Une ou deux personnes assignées. Vide = trou à combler. */
  personneIds: string[];
  /** Combien il en faut (placeur : 2, sinon 1). */
  nbRequis: number;
  /** Rôle facultatif (ex. aide camion) : un trou n'est pas une erreur. */
  optionnel?: boolean;
}

export interface Passage {
  id: string;
  terrain: TerrainId;
  /** Ordre d'affichage sur le terrain : 1, 2, 3... */
  ordre: number;

  /** Heure "à cheval". Format "HH:MM" (ex. "09:00"). */
  heureACheval: string;
  /** Heure de passage en piste si distincte (ex. "09:30"). */
  heurePassage?: string;
  /** Heure de prépa au camion (ex. "08:30"). */
  heurePrepa?: string;
  /** Durée de détente avant le passage, en minutes (pour calculer l'occupation). */
  dureeDetenteMin?: number;

  /** Catégorie : "Paire découverte", "Équipe minime", "Paire indice 2"... */
  categorie: string;
  /** Nom de l'équipe : "Les Jamais 2 sans toi". */
  nomEquipe: string;
  /** Équipe affectée à ce passage (remplit nom + participants). Optionnel. */
  equipeId?: string;

  /** Cavaliers + poneys de l'équipe. */
  participants: ParticipationPassage[];
  /** Rôles support à pourvoir pendant ce passage. */
  roles: RoleAssignation[];

  /** Note de relais en texte libre ("Maëva échauffe Galaxy pour Zoé"). */
  noteRelais?: string;

  /** Passage spécial sans staff (ex. "Remise des prix"). */
  evenement?: boolean;
}

// -----------------------------------------------------------------------------
// LE DOCUMENT CONCOURS (racine — un document Firestore)
// -----------------------------------------------------------------------------
export interface Concours {
  id: string;
  titre: string; // "PONY GAMES AGON"
  sousTitre?: string; // "Finale Pieux 2026"
  date: string; // "2026-06-17" (ISO)

  terrains: Terrain[];
  personnes: Personne[];
  chevaux: Cheval[];
  equipes?: Equipe[];
  passages: Passage[];

  /** Rappels généraux affichés en bas de l'affiche (texte libre). */
  rappels?: string[];
}

// -----------------------------------------------------------------------------
// SORTIE DU MOTEUR DE CONTRAINTES (prochain fichier)
// -----------------------------------------------------------------------------
// On définit déjà la forme d'un conflit pour que la page sache l'afficher.
export type GraviteConflit = "erreur" | "alerte";

export interface Conflit {
  gravite: GraviteConflit;
  /** Personne concernée (si applicable). */
  personneId?: string;
  /** Passages en cause. */
  passageIds: string[];
  /** Explication lisible : "Julie est juge en carrière ET à cheval au manège à 10h00". */
  message: string;
}
