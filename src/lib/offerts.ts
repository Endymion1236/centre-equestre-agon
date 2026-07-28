// ═══════════════════════════════════════════════════════════════════
// MOTIFS DE SÉANCE OFFERTE — source unique.
//
// Toutes les séances offertes ne sont pas des cadeaux. Le champ
// `valorise` distingue le VRAI manque à gagner du reste :
//
//   • valorise: true  → le club renonce à une recette qu'il aurait pu
//     encaisser (essai, geste commercial). C'est un coût commercial.
//
//   • valorise: false → aucune recette perdue :
//       - Rattrapage    : la séance a DÉJÀ été payée, la rendre n'est
//                         pas un cadeau (sinon on la compte deux fois).
//       - Monte poney   : le cavalier travaille POUR le club en montant
//                         un jeune poney. Le club reçoit un service.
//       - Bénévole      : contrepartie d'un travail fourni, pas un don.
//       - Établissement : facturé séparément à la structure.
//
// Sans cette distinction, l'onglet « Offerts » additionnait tout et
// affichait un « manque à gagner » qui ne reflétait pas la réalité.
// ═══════════════════════════════════════════════════════════════════

export type MotifOffert = {
  value: string;
  label: string;
  /** true = compte comme un manque à gagner chiffré en €. */
  valorise: boolean;
};

export const MOTIFS_OFFERT: MotifOffert[] = [
  { value: "Établissement", label: "🏫 Établissement (facturé séparément)", valorise: false },
  { value: "Rattrapage", label: "Rattrapage (météo, absence moniteur...)", valorise: false },
  { value: "Essai", label: "Séance d'essai", valorise: true },
  { value: "Monte poney", label: "Monte d'un jeune poney", valorise: false },
  { value: "Geste commercial", label: "Geste commercial", valorise: true },
  { value: "Bénévole", label: "Contrepartie bénévolat", valorise: false },
  { value: "Autre", label: "Autre", valorise: true },
];

/** Motifs proposés dans le montoir (pas d'inscription « Établissement » ici). */
export const MOTIFS_OFFERT_MONTOIR = MOTIFS_OFFERT.filter(
  (m) => m.value !== "Établissement"
);

/**
 * Ce motif represente-t-il un manque à gagner réel ?
 *
 * Par défaut `true` pour un motif inconnu : mieux vaut surestimer le coût
 * commercial que le masquer. Un motif ancien ou saisi hors liste reste
 * ainsi visible dans les totaux plutôt que de disparaître silencieusement.
 */
export function estValorise(freeReason: string | null | undefined): boolean {
  if (!freeReason) return true;
  const m = MOTIFS_OFFERT.find((x) => x.value === freeReason);
  return m ? m.valorise : true;
}
