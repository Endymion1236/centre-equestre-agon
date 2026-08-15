/**
 * src/app/admin/planning/enroll-types.ts
 *
 * Types du panneau d'inscription (EnrollPanel) et de ses sous-composants.
 *
 * Pourquoi un fichier à part : EnrollPanel est l'écran qui crée de vrais
 * paiements et de vraies factures. Chaque bloc qui en a été extrait (récap
 * stage, forfait annuel, liste des inscrits…) doit décrire ses entrées avec
 * exactement les mêmes formes de données que l'orchestrateur, sinon on
 * réintroduit par la porte de service les incohérences que le découpage
 * cherchait à rendre visibles. Ces types sont donc la référence partagée —
 * ils ne changent rien au comportement, ils le documentent.
 *
 * Les formes réellement libres (lignes de paiement Firestore, documents
 * `enrolled` hétérogènes accumulés au fil des versions) restent volontairement
 * en `any` : les typer aujourd'hui reviendrait à décrire un idéal que les
 * documents existants ne respectent pas, et ferait échouer le build sur des
 * données pourtant valides en production.
 */

import type { Creneau, EnrolledChild } from "./types";
import type { Family } from "@/types";

/** Famille telle que la manipule le panneau : le doc Firestore + son id. */
export type FamilleAvecId = Family & { firestoreId: string };

/** Créneau tel que le manipule le panneau : toujours avec son id résolu. */
export type CreneauAvecId = Creneau & { id: string };

/**
 * Note pédagogique d'une séance.
 *
 * Chaque note enregistre le texte + un snapshot du plan de séance courant
 * au moment de l'enregistrement (URL/path/type). Permet de retrouver
 * l'historique des notes ET des plans utilisés au fil des séances.
 */
export type NoteSeance = {
  id: string;
  creneauId: string;
  texte: string;
  planSeanceUrl?: string | null;
  planSeancePath?: string | null;
  planSeanceType?: string | null;
  createdAt?: any;
  createdByEmail?: string | null;
  createdByName?: string | null;
  creneauDate?: string;
  creneauActivityTitle?: string;
  creneauMonitor?: string;
};

/** Verdict du contrôle de mandat SEPA remonté par SepaWarning. */
export type StatutSepa = "loading" | "ok" | "missing";

/** Règle de réduction famille (settings/degressivite). */
export type RegleReductionFamille = { nth: number; discount: number };

/**
 * État du panneau « inscrire aussi dans d'autres jours ? » proposé après une
 * inscription en mode jour sur un stage multi-jours.
 */
export type AjoutJoursStage = {
  familyId: string;
  enfants: { childId: string; childName: string }[];
  joursRestants: { id: string; date: string; label: string }[];
  totalJoursStage: number;
  joursInscrits: number;
  stageTitle: string;
  creneauRef: any;
};

/** Options acceptées par la fonction d'inscription fournie par le planning. */
export type OptionsEnroll = {
  skipPayment?: boolean;
  skipEmail?: boolean;
  freeReason?: string;
  rattrapageId?: string;
  skipRefresh?: boolean;
};

/** Signature de l'inscription déléguée à la page planning. */
export type FonctionEnroll = (
  id: string,
  c: EnrolledChild,
  payMode?: string,
  options?: OptionsEnroll,
) => Promise<boolean | void>;

/** Propriétés du panneau d'inscription. */
export type EnrollPanelProps = {
  creneau: CreneauAvecId;
  families: FamilleAvecId[];
  allCreneaux: CreneauAvecId[];
  payments: any[];
  allCartes: any[];
  allForfaits: any[];
  onClose: () => void;
  onEnroll: FonctionEnroll;
  onUnenroll: (id: string, childId: string) => Promise<void>;
  // Optionnel : si fourni, appele apres une boucle d'inscriptions (annuel)
  // pour rafraichir creneaux + forfaits une seule fois au lieu de N fois.
  onRefresh?: () => Promise<void>;
};
