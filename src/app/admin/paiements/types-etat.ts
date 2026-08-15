/**
 * src/app/admin/paiements/types-etat.ts
 *
 * Formes des états d'ÉCRAN de la page Paiements : l'onglet courant, la
 * commande en cours d'annulation, la saisie de chèques différés, la liste
 * des familles cochées pour une diffusion concours…
 *
 * Pourquoi un fichier distinct de `types.ts` : celui-ci décrit ce qui est
 * STOCKÉ (une commande, un item de panier, un mode de paiement) et il est
 * partagé avec tous les onglets. Ce qui suit ne vit que le temps d'une
 * modale ouverte et n'est jamais écrit en base. Mélanger les deux laissait
 * croire qu'un `BroadcastRow` était un document Firestore, alors que c'est
 * une ligne de formulaire jetée à la fermeture de la modale.
 */

/** Onglets de la page, dans l'ordre de la barre. */
export type TabId =
  | "encaisser" | "journal" | "historique" | "echeances"
  | "impayes" | "offerts" | "declarations" | "cheques_differes";

/** Une famille cochée dans la modale de diffusion concours / coaching. */
export interface BroadcastRow {
  familyId: string;
  familyName: string;
  childId: string;
  childName: string;
  items: any[];
  totalTTC: number;
  /** Prix ajustés à la main, indexés par position dans `items`. */
  overrides: Record<number, number>;
}

/**
 * Une ligne de la grille « chèques différés » dans la modale Encaisser.
 * Les montants restent des chaînes : ce sont des champs de saisie, ils
 * doivent pouvoir être vides ou en cours de frappe.
 */
export interface ChequeDiffereSaisi {
  numero: string;
  banque: string;
  montant: string;
  dateEncaissementPrevue: string;
}

/** Commande en cours de duplication + étape atteinte dans la modale. */
export interface DuplicateTarget {
  payment: any;
  targetFamilyId: string;
  targetSearch: string;
  mode: "choose" | "other_family";
}

/** Commande dont on annule le règlement (répartition avoir / remboursement). */
export interface AnnulModalState {
  payment: any;
  encaisse: number;
  lignes: string[];
}

/** Plusieurs factures d'une même famille réglées d'un seul geste. */
export interface MultiEncaisserState {
  familyId: string;
  familyName: string;
  payments: any[];
}
