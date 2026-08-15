/**
 * src/app/admin/planning/enroll-constantes.ts
 *
 * Valeurs par défaut et tables de libellés du panneau d'inscription.
 *
 * Pourquoi les sortir du composant : ces valeurs sont des REPLIS, pas des
 * tarifs. Les vrais montants viennent de Firestore (settings/inscription) ;
 * ceux d'ici ne servent que le temps du chargement, ou quand le document de
 * réglages n'existe pas encore. Noyées au milieu de 4000 lignes de JSX, elles
 * se lisaient comme la grille tarifaire officielle — et une relecture rapide
 * pouvait faire croire qu'un forfait 1×/semaine « coûte 650 € » alors que ce
 * n'est que la valeur affichée avant réponse du serveur.
 *
 * Les tables de libellés (niveaux de galop, jours abrégés) sont ici pour la
 * même raison : elles étaient dupliquées à deux endroits du fichier, avec le
 * risque classique de n'en corriger qu'une.
 */

/**
 * Repli des paramètres d'inscription, écrasé par settings/inscription dès que
 * Firestore répond. Sert aussi de source du type ParametresInscription.
 */
export const PARAMS_INSCRIPTION_DEFAUT = {
  forfait1x: 650, forfait2x: 1100, forfait3x: 1400,
  adhesion1: 60, adhesion2: 40, adhesion3: 20, adhesion4plus: 0,
  licenceMoins18: 25, licencePlus18: 36,
  totalSessionsSaison: 35, dateFinSaison: "2026-06-30",
  assuranceOccasionnelle: 10,
};

/** Forme des paramètres d'inscription manipulés par le panneau. */
export type ParametresInscription = typeof PARAMS_INSCRIPTION_DEFAUT;

/**
 * Jours abrégés indexés par `Date.getDay()` — donc dimanche EN PREMIER.
 * À ne pas confondre avec `dayNames` de ./types, qui commence un lundi :
 * les deux tables coexistent parce qu'elles répondent à deux questions
 * différentes (index JS d'un côté, ordre d'affichage d'une semaine de l'autre).
 */
export const JOURS_COURTS_DEPUIS_DIMANCHE = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

/**
 * Niveaux proposés à l'ajout rapide d'un cavalier dans une famille existante.
 * Liste volontairement courte (galops numérotés seulement) : ce formulaire
 * sert à dépanner en pleine inscription, la fiche cavalier complète permet
 * ensuite d'affiner.
 */
export const NIVEAUX_GALOP_RAPIDE = ["—", "Galop 1", "Galop 2", "Galop 3", "Galop 4", "Galop 5", "Galop 6", "Galop 7"];

/** Niveaux proposés à la création d'une famille (galops poney inclus). */
export const NIVEAUX_GALOP_COMPLET = ["—", "Poney Bronze", "Poney Argent", "Poney Or", "Bronze", "Argent", "Or", "G1", "G2", "G3", "G4", "G5", "G6", "G7"];

/** Fléchage d'une nouvelle famille : à quoi vient-elle au club. */
export const OPTIONS_FLECHAGE = [
  { id: "cavalier_annee", label: "🏇 À l'année" },
  { id: "stage", label: "🎯 Stages" },
  { id: "passage", label: "👋 Passage" },
];
