/**
 * src/lib/montant-regle.ts — combien a été réglé sur une commande.
 *
 * Octobre 2026 : la facture de Mme Buidine (180 €), téléchargée depuis la
 * fiche client, portait « Facture réglée » alors que rien n'était encaissé.
 * Le code écrivait `paidAmount || totalTTC` : un montant payé de 0 étant
 * « faux » en JavaScript, il était remplacé par le TOTAL. Même erreur dans le
 * total payé de la fiche client et l'export des clients.
 *
 * Règle : ce qui est payé, c'est `paidAmount`. Seule une commande marquée
 * « réglée » sans montant noté (anciennes commandes) compte pour son total.
 * Module pur.
 */
export function montantRegle(p: { status?: string | null; paidAmount?: number | null; totalTTC?: number | null } | null | undefined): number {
  if (!p) return 0;
  const paye = Number(p.paidAmount) || 0;
  if (paye > 0) return Math.round(paye * 100) / 100;
  return p.status === "paid" ? Math.round((Number(p.totalTTC) || 0) * 100) / 100 : 0;
}
