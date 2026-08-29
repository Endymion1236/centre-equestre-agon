/**
 * src/types/argent.ts — les documents Firestore du domaine « argent ».
 *
 * Le dépôt compte 2 021 annotations `: any`, et les documents de paiement en
 * étaient. Ce n'est pas un défaut en soi, c'est ce qui rend les autres coûteux
 * à corriger : les divergences entre `/api/cawl/status` et `/api/cawl/webhook`
 * (référentiel du montant, cumul de `paidAmount`, numéro de facture jamais
 * attribué) sont exactement ce qu'un type partagé rend visible à la relecture
 * — audit 29/08/2026, Q5.
 *
 * Périmètre volontairement restreint aux trois documents qui portent de
 * l'argent. Les champs sont largement optionnels : ces documents ont été
 * écrits par plusieurs générations de code et tous ne portent pas tout.
 */

/** Statut d'une vente. */
export type StatutPaiement =
  | "pending"        // créée, rien encaissé
  | "partial"        // acompte ou règlement partiel encaissé
  | "paid"           // intégralement réglée
  | "cancelled"
  | "sepa_scheduled";

/** Mode de règlement effectif. */
export type ModePaiement =
  | "cb_online"      // CAWL (checkout ou prélèvement MIT)
  | "cb"
  | "cheque"
  | "cheque_differe"
  | "especes"
  | "virement"
  | "sepa"
  | "avoir"
  | "ancv"
  | "cheque_vacances"
  | "pass_sport";

/** Une ligne de commande. Porte les créneaux : c'est ce qui permet à
 *  confirmerPlacesTenues() de lever les places tenues au bon moment. */
export interface LignePaiement {
  childId?: string;
  childName?: string;
  activityTitle?: string;
  activityType?: string;
  /** Stage multi-jours : tous les créneaux de la semaine. */
  creneauIds?: string[];
  /** Cours à l'unité : le créneau. */
  creneauId?: string;
  date?: string;
  priceTTC?: number;
  priceHT?: number;
  priceInCents?: number;
  tva?: number;
  quantity?: number;
  label?: string;
  amount?: number;
  /** Horaires affichés dans l'email de confirmation de stage. */
  stageSchedule?: string;
}

export interface Paiement {
  id?: string;
  familyId: string;
  familyName?: string;
  familyEmail?: string;
  childId?: string;
  childName?: string;

  items?: LignePaiement[];
  /** Total dû de la vente. Référentiel du « soldé / pas soldé ». */
  totalTTC: number;
  /** Cumul réellement encaissé. S'ADDITIONNE — ne jamais l'écraser. */
  paidAmount?: number;
  /** Acompte attendu, quand la vente se règle en deux fois. */
  acompteAmount?: number;
  soldeAmount?: number;

  status: StatutPaiement;
  paymentMode?: ModePaiement;
  paymentRef?: string;

  /** Numéro séquentiel définitif (F-AAAA-NNNN). Absent = proforma.
   *  Attribué UNIQUEMENT par attribuerNumeroFacture() — jamais à la main. */
  invoiceNumber?: string;
  invoiceDate?: unknown;

  // ── CAWL ──────────────────────────────────────────────────────────────
  cawlRef?: string;
  cawlHostedCheckoutId?: string;
  cawlInitiatedAt?: unknown;
  /** Card On File : permet le prélèvement automatique du solde (MIT). */
  cofToken?: string;
  cofSchemeTransactionId?: string;
  cofInitialPaymentId?: string;
  cawlTokenizedAt?: unknown;

  // ── Contrôle de cohérence des montants ────────────────────────────────
  amountMismatch?: boolean;
  amountPaidReported?: number;
  amountExpected?: number;
  needsReview?: boolean;

  // ── Stage ─────────────────────────────────────────────────────────────
  stageDate?: string;
  stageTitle?: string;
  isStageCart?: boolean;
  /** Anti-doublon du prélèvement de solde J-7. */
  soldeReminderSentAt?: unknown;
  soldeRelanceJ5SentAt?: unknown;

  /** Inscription annuelle réglée par carte : forfaits à créer côté serveur
   *  une fois l'encaissement confirmé (les règles Firestore réservent
   *  l'écriture des forfaits au staff). */
  forfaitPayloads?: unknown[];
  /** Inscription annuelle : la vente est suivie hors du parcours de paiement. */
  skipPayment?: boolean;
  awaitingValidation?: boolean;
  type?: string;
  label?: string;
  source?: string;
  paymentPlan?: string;
  echeancesTotal?: number;
  echeanceDate?: string;
  forfaitRef?: string;
  sourcePaymentId?: string;

  createdAt?: unknown;
  updatedAt?: unknown;
  /** Les documents `payments` ont été écrits par plusieurs générations de code :
   *  cette échappatoire évite de bloquer sur un champ historique non listé.
   *  À NE PAS utiliser pour ajouter de nouveaux champs — les déclarer ci-dessus. */
  [autreChamp: string]: unknown;
}

/**
 * Écriture d'encaissement — INALTÉRABLE une fois créée.
 *
 * Loi anti-fraude TVA 2018 / NF525 / CGI art. 286-I-3°bis : les règles
 * Firestore interdisent update et delete sur les champs comptables. Une
 * correction se fait par contre-passation, jamais par modification.
 */
export interface Encaissement {
  id?: string;
  paymentId?: string;
  familyId?: string;
  familyName?: string;
  montant: number;
  mode: ModePaiement;
  modeLabel?: string;
  ref?: string;
  activityTitle?: string;
  date?: unknown;
  /** Contre-passation : identifiant de l'écriture corrigée. */
  correctionDe?: string;
  raison?: string;
  // ── Rapprochement bancaire — les SEULS champs modifiables après coup ──
  remiseId?: string;
  reconciledByBank?: boolean;
  reconciledAt?: unknown;
}

/**
 * Session de paiement CAWL (collection `cawl_sessions`).
 *
 * Écrite au checkout, relue au retour navigateur ET par le webhook. C'est
 * elle qui porte le RETURNMAC (authenticité du retour) et le montant DEMANDÉ
 * — référentiel du contrôle de cohérence, qui gère nativement les liens de
 * paiement partiels.
 */
export interface SessionCawl {
  hostedCheckoutId: string;
  /** Secret partagé avec CAWL. Comparaison en temps constant obligatoire. */
  returnMac?: string;
  merchantRef?: string;
  familyId?: string | null;
  paymentId?: string | null;
  /** Montant demandé à la création, en CENTIMES. */
  totalCents?: number;
  isDeposit?: boolean;
  depositPercent?: number;
  /** Achat public d'un bon cadeau (sans compte). */
  bonCadeau?: boolean;
  montant?: number;
  beneficiaire?: string;
  message?: string;
  acheteurNom?: string;
  acheteurEmail?: string;
  /** Idempotence du traitement d'un bon cadeau. */
  bonTraite?: boolean;
  createdAt?: unknown;
  expiresAt?: Date;
}
