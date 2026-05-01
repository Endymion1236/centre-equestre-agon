// Types partagés du moteur de rapprochement bancaire
// Extraits depuis src/app/admin/comptabilite/page.tsx (lignes 13-23, 216, 873-913)

export interface BankLine {
  date: string;          // "DD/MM/YYYY"
  label: string;
  amount: number;        // toujours > 0 (crédits uniquement)
  matched: boolean;
  matchType: string;     // "" | "CB en ligne" | "CB terminal" | "Virement" | "Chèque" | "Espèces" | "Montant exact" | "Manuel" | "Ignoré"
  matchDetail: string;
  matchedEncs?: EncDetail[];
  manualPaymentId?: string;
  uncertain?: boolean;   // true uniquement pour le fallback "Montant exact"
}

export interface EncDetail {
  familyName: string;
  montant: number;
  date: string;          // "DD/MM/YYYY"
  activityTitle: string;
  mode: string;
}

export interface Encaissement {
  id: string;
  mode: string;          // "cb_terminal" | "cb_online" | "cb_cawl" | "cheque" | "especes" | "virement" | "sepa" | "prelevement_sepa" | ...
  modeLabel?: string;
  montant: number;
  date: { seconds: number; nanoseconds?: number } | null;
  familyName?: string;
  activityTitle?: string;
  ref?: string;
  reconciledByBank?: boolean;
  // ... d'autres champs Firestore non utilisés par le matching
  [k: string]: any;
}

export interface Remise {
  id: string;
  total?: number;
  encaissementIds?: string[];
  paymentMode?: string;
  mode?: string;
  pointee?: boolean;
  pointeeNote?: string;
  createdAt?: { seconds: number } | null;
  [k: string]: any;
}

export interface RemiseSepa {
  id: string;
  total?: number;
  paymentIds?: string[];
  pointee?: boolean;
  [k: string]: any;
}

export interface Payment {
  id: string;
  familyName: string;
  totalTTC: number;
  paymentMode: string;
  paymentRef?: string;
  status: string;
  date: { seconds: number } | null;
  reconciledByBank?: boolean;
  [k: string]: any;
}

/**
 * Contexte partagé entre tous les matchers.
 * Les Sets `usedXxxIds` sont MUTÉS par les matchers au fil de l'itération
 * sur les bankLines : une fois qu'un encaissement (ou une remise) a été
 * consommé par une ligne, il ne peut plus être consommé par une autre.
 */
export interface MatchContext {
  encs: Encaissement[];
  remises: Remise[];
  remisesSepa: RemiseSepa[];
  payments: Payment[];
  period: string;                  // "YYYY-MM"
  usedEncIds: Set<string>;
  usedRemiseIds: Set<string>;
  usedRemiseSepaIds: Set<string>;
  usedPaymentIds: Set<string>;
}

/**
 * Résultat retourné par un matcher.
 * `null` = la règle ne s'applique pas, l'orchestrateur passe à la suivante.
 */
export type MatchResult = {
  matchType: string;
  matchDetail: string;
  matchedEncs: EncDetail[];
  uncertain?: boolean;
  manualPaymentId?: string;
} | null;
