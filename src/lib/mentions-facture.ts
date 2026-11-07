/**
 * src/lib/mentions-facture.ts — mentions obligatoires de paiement, écrites une fois.
 *
 * Novembre 2026 : le contrôle d'une plateforme agréée (règles françaises
 * BR-FR-05) refusait nos factures Factur-X faute de trois mentions : frais
 * de recouvrement, pénalités de retard, escompte. Ce sont aussi des mentions
 * obligatoires de toute facture (art. L441-9 du Code de commerce) — le point
 * C8 de l'audit du 17/09/2026 attendait les taux. Retenus par Nicolas le
 * 07/11/2026 : les valeurs usuelles ci-dessous.
 *
 * Elles vont dans les notes de la facture électronique (BG-1, codes PMT,
 * PMD, AAB) et en bas du PDF. Pur, testé (tests/unit/mentions-facture.test.ts).
 */

export interface MentionFacture {
  /** Code de sujet de la note (UNTDID 4451), exigé par BR-FR-05. */
  code: "PMT" | "PMD" | "AAB";
  texte: string;
}

export const MENTIONS_PAIEMENT: readonly MentionFacture[] = [
  { code: "PMT", texte: "Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 € (clients professionnels)." },
  { code: "PMD", texte: "Pénalités de retard : trois fois le taux d'intérêt légal." },
  { code: "AAB", texte: "Pas d'escompte pour paiement anticipé." },
];

/** Les trois mentions sur une ligne, pour le bas d'un PDF. */
export function mentionsPaiementTexte(): string {
  return MENTIONS_PAIEMENT.map((m) => m.texte).join(" ");
}
