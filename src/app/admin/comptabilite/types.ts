/**
 * src/app/admin/comptabilite/types.ts
 *
 * Formes de données manipulées par l'écran Comptabilité.
 *
 * Pourquoi un fichier à part : ces trois formes (une facture, une ligne de
 * relevé bancaire, un onglet) circulent entre la page, les modules de calcul
 * (rapprochement, FEC) et les sous-composants d'affichage. Tant qu'elles
 * étaient déclarées en ligne dans page.tsx, chaque extraction obligeait à
 * recopier la structure — avec le risque classique de deux définitions qui
 * divergent en silence. Ici, une seule source de vérité.
 *
 * ⚠️ Ces types décrivent ce qui existe RÉELLEMENT en base, pas ce qu'on
 * aimerait y trouver : les documents Firestore historiques n'ont pas tous les
 * mêmes champs, d'où les `any` et les optionnels assumés.
 */

/** Une facture (collection `payments`). */
export interface Payment {
  id: string;
  familyName: string;
  items: { activityTitle: string; priceHT: number; tva: number; priceTTC: number }[];
  totalTTC: number;
  paymentMode: string;
  paymentRef: string;
  status: string;
  paidAmount: number;
  date: any;
  reconciledByBank?: boolean;
}

/**
 * Un encaissement tel qu'il est ré-affiché sous une ligne bancaire rapprochée.
 * C'est une photo figée (on stocke le libellé, pas l'id) : elle est écrite dans
 * `rapprochements/{YYYY-MM}` et doit rester lisible même si l'encaissement
 * d'origine est modifié ou supprimé plus tard.
 */
export interface MatchedEnc {
  familyName: string;
  montant: number;
  date: string;
  activityTitle: string;
  mode: string;
}

/**
 * Une ligne du relevé bancaire, importée depuis le CSV puis enrichie par le
 * rapprochement. `matched` dit qu'elle est traitée, `matchType` dit comment
 * (auto, "Manuel", "Ignoré"), et `uncertain` marque les rapprochements fondés
 * sur le seul montant — ceux qu'il faut aller vérifier à l'œil.
 */
export interface BankLine {
  date: string;
  label: string;
  amount: number;
  matched: boolean;
  matchType: string;
  matchDetail: string;
  matchedEncs?: MatchedEnc[];
  missingAmounts?: number[];
  manualPaymentId?: string;
  uncertain?: boolean;
}

/** Onglet actif de l'écran Comptabilité. */
export type TabId = "journal" | "tva" | "rapprochement" | "rapprochement_ignores" | "remise" | "fec" | "export";

/** Palette d'un onglet — voir `tabClasses` dans constants.ts. */
export type TabColor = "blue" | "purple" | "green" | "indigo" | "slate" | "rose" | "amber";

/**
 * Aperçu produit par la modale « Détail CA » : ce qu'on a réussi à relier aux
 * encaissements enregistrés (`found`), ce qui manque à l'appel (`missing`, des
 * montants sans encaissement correspondant) et le total collé.
 */
export interface CaDetailPreview {
  found: any[];
  missing: number[];
  total: number;
}
