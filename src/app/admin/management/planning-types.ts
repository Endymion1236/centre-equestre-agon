/**
 * src/app/admin/management/planning-types.ts
 *
 * Les formes de données que le semainier d'équipe se passe entre son
 * orchestrateur (TabPlanning) et ses sous-vues : contenu des formulaires
 * d'ajout et d'édition, aperçus en attente de validation, conflits détectés.
 *
 * Pourquoi séparé de `types.ts` : ce dernier décrit ce qui est STOCKÉ dans
 * Firestore (tâches, salariés, modèles) et sert à tout l'onglet Management.
 * Ici, rien n'est persisté : ce sont des états d'écran, valables le temps
 * d'une modale. Les mélanger ferait croire à des champs de base de données.
 */

import type { JourSemaine, ModelePlanning, TacheModele, TachePlanifiee } from "./types";

/** Cellule (salarié × jour) dans laquelle le formulaire d'ajout est ouvert. */
export interface AddCell {
  salarieId: string;
  jour: JourSemaine;
}

/**
 * Formulaire d'ajout d'une tâche.
 * binomeIds : si la tache est marquée binomeRequis, contient les ids des salariés
 * additionnels à assigner sur le même créneau. La tache du salarié principal +
 * une tache identique pour chaque binôme sont créées en une fois.
 */
export interface AddForm {
  tacheTypeId: string;
  heureDebut: string;
  dureeMinutes: number;
  joursSelectionnes: JourSemaine[];
  enchainer: boolean;
  binomeIds: string[];
}

/** Formulaire d'édition d'une tâche existante (modale). */
export interface EditForm {
  tacheTypeId: string;
  heureDebut: string;
  dureeMinutes: number;
  notes: string;
  salarieId: string;
}

/** Aperçu du découpage automatique avant application (chevauchements détectés). */
export interface ApercuDecoupage {
  newTasks: any[];
  decoupes: any[];
}

/**
 * Contenu de la modale de gestion des conflits lors de l'application d'un
 * modèle : les doublons repérés et les tâches réellement nouvelles.
 */
export interface DialogueConflitsModele {
  modele: ModelePlanning;
  duplicates: { existante: TachePlanifiee; nouvelle: TacheModele }[];
  nouvelles: TacheModele[]; // tâches du modèle qui ne sont pas en doublon
}

/** Un jour de la semaine affichée, avec sa date réelle et son libellé de colonne. */
export interface JourDate {
  jour: JourSemaine;
  date: Date;
  label: string;
}

/** Deux tâches d'une même personne, le même jour, qui se chevauchent. */
export interface Conflit {
  salarieName: string;
  salarieId: string;
  jour: JourSemaine;
  tache1: TachePlanifiee;
  tache2: TachePlanifiee;
}
