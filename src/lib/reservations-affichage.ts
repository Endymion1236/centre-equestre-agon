/**
 * src/lib/reservations-affichage.ts
 *
 * Ce que l'espace famille doit montrer d'une réservation « pending_payment ».
 *
 * Au paiement en ligne, chaque ligne du panier crée une réservation en
 * « pending_payment ». Elle passe en « confirmed » quand la banque confirme
 * (webhook CAWL, retour de paiement). Deux cas laissent une réservation
 * bloquée dans cet état :
 *   - le panier a été abandonné : la réservation n'a jamais eu de paiement,
 *     elle s'affichait indéfiniment comme « à finaliser » ;
 *   - le paiement est bien reçu mais la confirmation n'a pas suivi (webhook
 *     manqué sur un déploiement de test, par exemple).
 *
 * La page « Mes paiements » lit les paiements ; la page « Mes réservations »
 * lisait les réservations seules. Une famille pouvait donc lire « paiement à
 * finaliser » d'un côté et « tout est à jour » de l'autre. On rapproche ici
 * les réservations des paiements de la famille, sans rien écrire en base :
 *   - un paiement dû couvre la réservation  → elle reste à finaliser ;
 *   - un paiement réglé la couvre           → elle s'affiche confirmée ;
 *   - aucun paiement ne la couvre           → panier abandonné, on l'écarte.
 *
 * Le rapprochement se fait sur (childId, creneauId), comme côté serveur dans
 * confirmReservationsForPayment.
 */

export interface ReservationAffichable {
  id: string;
  status: string;
  childId?: string;
  creneauId?: string;
  [cle: string]: any;
}

export interface PaiementCouverture {
  status?: string;
  totalTTC?: number;
  paidAmount?: number;
  items?: { childId?: string; creneauId?: string; creneauIds?: string[] }[];
}

function cle(childId?: string, creneauId?: string) {
  return childId && creneauId ? `${childId}|${creneauId}` : "";
}

function clesDuPaiement(payment: PaiementCouverture): string[] {
  const cles: string[] = [];
  for (const item of payment.items || []) {
    if (!item?.childId) continue;
    const ids = Array.isArray(item.creneauIds) && item.creneauIds.length > 0
      ? item.creneauIds
      : item.creneauId ? [item.creneauId] : [];
    for (const id of ids) cles.push(cle(item.childId, id));
  }
  return cles.filter(Boolean);
}

export function resteDu(payment: PaiementCouverture): number {
  return Math.round(((Number(payment.totalTTC) || 0) - (Number(payment.paidAmount) || 0)) * 100) / 100;
}

export interface ReservationsReconciliees<T extends ReservationAffichable> {
  /** Ce que la page affiche : les abandonnées en moins, les réglées confirmées. */
  reservations: T[];
  /** Les « pending_payment » qui ont bien un paiement dû derrière. */
  aFinaliser: T[];
  /** Les « pending_payment » sans aucun paiement : panier abandonné. */
  abandonnees: T[];
  /** Les « pending_payment » dont le paiement est réglé : affichées confirmées. */
  regleesSansConfirmation: T[];
}

export function reconcilierReservationsAvecPaiements<T extends ReservationAffichable>(
  reservations: T[],
  payments: PaiementCouverture[],
): ReservationsReconciliees<T> {
  const dues = new Set<string>();
  const reglees = new Set<string>();
  for (const payment of payments || []) {
    if (payment?.status === "cancelled") continue;
    const cible = resteDu(payment) > 0.009 ? dues : reglees;
    for (const k of clesDuPaiement(payment)) cible.add(k);
  }

  const resultat: T[] = [];
  const aFinaliser: T[] = [];
  const abandonnees: T[] = [];
  const regleesSansConfirmation: T[] = [];

  for (const reservation of reservations || []) {
    if (reservation.status !== "pending_payment") {
      resultat.push(reservation);
      continue;
    }
    const k = cle(reservation.childId, reservation.creneauId);
    if (k && dues.has(k)) {
      aFinaliser.push(reservation);
      resultat.push(reservation);
    } else if (k && reglees.has(k)) {
      const confirmee = { ...reservation, status: "confirmed" } as T;
      regleesSansConfirmation.push(confirmee);
      resultat.push(confirmee);
    } else {
      abandonnees.push(reservation);
    }
  }

  return { reservations: resultat, aFinaliser, abandonnees, regleesSansConfirmation };
}
