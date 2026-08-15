/**
 * src/app/admin/boite/types.ts
 *
 * Formes des états manipulés par la boîte de réception assistée : ce que
 * l'API Gmail renvoie à l'écran, la fiche de famille pré-remplie par l'IA, et
 * le suivi des inscriptions en 1 clic.
 *
 * Pourquoi un fichier à part : ces objets circulent maintenant entre la page
 * (qui les détient) et cinq sous-composants (qui les affichent), plus les
 * fonctions d'appel API. Écrire leur forme une seule fois évite qu'un
 * sous-composant se mette à lire un champ qui n'existe pas — le contenu vient
 * d'API externes (Gmail, l'assistant IA), donc TypeScript est le seul endroit
 * où l'on peut poser ce contrat.
 *
 * Les messages Gmail eux-mêmes restent volontairement en `any` : leur forme
 * dépend de l'API et du parsing serveur, et la page ne lit que quelques
 * champs (`id`, `from`, `subject`, `snippet`, `audioAttachmentId`…). Les
 * typer à moitié donnerait une fausse garantie.
 */

/** Panneau Gmail : état de connexion + page de messages courante. */
export interface EtatGmail {
  loading: boolean;
  configured: boolean;
  connected: boolean;
  messages: any[];
  error: string;
  /** Adresse REELLEMENT connectee (renvoyee par l'API, jamais devinee). */
  email?: string | null;
  /** Jeton de page suivante Gmail, null si fin de liste. */
  nextPageToken?: string | null;
}

/** Action en cours sur la boîte (désactive les boutons concernés). */
export type ActionBoite = "" | "trash" | "forward";

/** Message de retour affiché sous une action (succès ou échec). */
export interface StatutAction {
  ok: boolean;
  text: string;
}

/** Un enfant de la fiche pré-remplie, avant création de la famille. */
export interface EnfantFiche {
  firstName: string;
  lastName: string;
  birthDate: string;
  galopLevel: string;
  /** Âge mentionné dans le mail, s'il y en avait un : aide à la relecture. */
  ageHint: number | null;
}

/** Fiche famille proposée par l'IA, relue et corrigée par l'admin. */
export interface FicheFamille {
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  flechage: string;
  children: EnfantFiche[];
}

/** Famille réellement créée en base : c'est sur elle qu'on inscrit ensuite. */
export interface NouvelleFamille {
  familyId: string;
  familyName: string;
  children: { id: string; firstName: string }[];
}

/**
 * Suivi de l'inscription 1-clic d'une suggestion.
 * `orderWarn` existe séparément de `error` : l'inscription peut réussir alors
 * que la commande associée a échoué — il faut le dire sans laisser croire que
 * l'enfant n'est pas inscrit.
 */
export interface EtatInscription {
  busy?: boolean;
  done?: boolean;
  error?: string;
  orderMsg?: string;
  orderWarn?: string;
}
