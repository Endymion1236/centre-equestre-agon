/**
 * src/app/admin/paiements/calculs-paiement.ts
 *
 * Les trois calculs de la page Paiements qui ne dépendent d'aucun état
 * d'écran : ce qui a réellement été encaissé sur une commande, combien de
 * commandes sont en retard de règlement, et comment couper un montant en
 * plusieurs parts.
 *
 * Pourquoi les isoler : ce sont les seules fonctions de la page dont le
 * résultat est vérifiable sans monter le composant. Tant qu'elles restaient
 * dans le corps de la page, la moindre vérification demandait de rejouer un
 * clic dans l'interface.
 */

/**
 * Montant réellement encaissé sur une commande.
 *
 * On additionne les écritures du journal (`encaissements`) plutôt que de
 * lire `paidAmount` sur la commande : le journal est la source de vérité
 * comptable, `paidAmount` n'en est qu'un cache recalculé après coup.
 */
export const totalEncaissePourPaiement = (encaissements: any[], payment: any) => {
  // Chercher dans la collection encaissements
  return encaissements
    .filter((e: any) => e.paymentId === payment.id)
    .reduce((s: number, e: any) => s + (e.montant || 0), 0);
};

/**
 * Nombre de commandes à relancer, affiché en pastille sur l'onglet Impayés.
 *
 * Une commande échelonnée (`echeancesTotal > 1`) ne compte QUE si son
 * échéance est passée : sinon toutes les mensualités à venir d'un forfait
 * annuel gonfleraient la pastille dès la signature, et le chiffre ne
 * voudrait plus rien dire.
 */
export const compterImpayes = (payments: any[], todayBadge: string) => {
  return payments.filter(p => {
    if (p.status === "cancelled" || p.status === "paid" || p.status === "sepa_scheduled") return false;
    if ((p.paidAmount || 0) >= (p.totalTTC || 0)) return false;
    if ((p as any).echeancesTotal > 1) return (p as any).echeanceDate && (p as any).echeanceDate < todayBadge;
    return true;
  }).length;
};

// Répartir un total en N parts égales (centimes bien distribués)
export const repartirEnParts = (total: number, n: number): number[] => {
  if (n <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const reste = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < reste ? 1 : 0)) / 100);
};
