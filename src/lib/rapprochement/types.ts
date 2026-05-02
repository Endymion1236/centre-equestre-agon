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
  uncertain?: boolean;   // true pour les fallbacks incertains (Montant exact, Virement nom-seul, Virement montant-seul)
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
  date?: { seconds: number } | null;     // Date d'enregistrement de la remise (utilisée par les matchers chèque/espèces)
  nbPaiements?: number;                  // Nombre de paiements dans la remise (info affichage)
  [k: string]: any;
}

export interface RemiseSepa {
  id: string;
  total?: number;
  paymentIds?: string[];
  pointee?: boolean;
  montantTotal?: number;                 // Synonyme de `total` côté SEPA (vérifier lequel utilise le code, page.tsx:1049)
  datePrelevement?: string;              // ISO "YYYY-MM-DD"
  numero?: string | number;              // Numéro de remise SEPA
  nbTransactions?: number;               // Nombre de transactions groupées dans la remise
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
 *
 * IMPORTANT : un matcher retourne UNIQUEMENT ce résultat, PAS la BankLine
 * complète. C'est l'orchestrateur (engine.ts, Task 9) qui applique le résultat
 * sur la BankLine via `{ ...bl, matched: true, ...result }`. Ne PAS copier
 * le pattern inline de page.tsx qui retourne `{ ...bl, matched: true, ... }`
 * directement depuis la règle — ce pattern est obsolète dans la nouvelle archi.
 */
export type MatchResult = {
  matchType: string;
  matchDetail: string;
  matchedEncs?: EncDetail[];      // optionnel : certains sous-blocs (Virement b.2/d, Remise SEPA groupée) n'attachent pas d'encaissement direct (ils utilisent manualPaymentId ou n'attachent rien). page.tsx 870-1000 ne le set pas dans ces cas, on conserve le comportement.
  uncertain?: boolean;
  manualPaymentId?: string;
} | null;
