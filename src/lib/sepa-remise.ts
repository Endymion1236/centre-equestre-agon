/**
 * src/lib/sepa-remise.ts — ce qu'une remise SEPA déposée fait à la commande.
 *
 * Le dépôt d'une remise recalculait le montant réglé de la commande à partir
 * des SEULS prélèvements : sur un forfait payé moitié par chèque du père et
 * moitié en dix prélèvements sur le compte de la mère, la part du père
 * disparaissait de la commande à chaque remise, puis la commande finissait
 * « payée » avec la seule moitié SEPA. Le journal des encaissements, lui,
 * était juste — c'est de lui qu'il faut repartir, comme le fait déjà le
 * traitement d'un rejet.
 *
 * Module pur, partagé avec les tests.
 */

export interface EtatCommandeApresRemise {
  status: "paid" | "sepa_scheduled" | "partial" | "pending";
  paidAmount: number;
}

/**
 * Statut et montant réglé d'une commande, d'après le journal.
 *   - tout est encaissé                        → payée ;
 *   - il reste des échéances SEPA à prélever   → planifiée en SEPA (hors impayés) ;
 *   - une partie encaissée, plus rien de prévu → partielle ;
 *   - rien encaissé, plus rien de prévu        → en attente.
 */
export function etatCommandeApresRemise(e: {
  totalTTC: number;
  /** Somme des encaissements du journal pour cette commande (contre-passations comprises). */
  totalEncaisse: number;
  /** Échéances SEPA encore en attente ou en remise non déposée. */
  echeancesRestantes: number;
}): EtatCommandeApresRemise {
  const paidAmount = Math.max(0, Math.round((Number(e.totalEncaisse) || 0) * 100) / 100);
  const total = Number(e.totalTTC) || 0;
  if (total > 0 && paidAmount >= total - 0.01) return { status: "paid", paidAmount };
  if (e.echeancesRestantes > 0) return { status: "sepa_scheduled", paidAmount };
  return { status: paidAmount > 0 ? "partial" : "pending", paidAmount };
}

/** Montants de chaque échéance : le reste d'arrondi va sur la dernière. */
export function montantsEcheances(total: number, nb: number): number[] {
  if (nb <= 0) return [];
  const cents = Math.round((Number(total) || 0) * 100);
  const base = Math.floor(cents / nb);
  return Array.from({ length: nb }, (_, i) => (i === nb - 1 ? cents - base * (nb - 1) : base) / 100);
}

/**
 * Répartition d'un échéancier entre deux mandats (compte du père, compte de
 * la mère) : le montant du second est saisi, le premier reçoit le reste.
 */
export function repartirEntreDeuxMandats(e: {
  montantTotal: number;
  montantMandat2: number;
}): { ok: true; montant1: number; montant2: number } | { ok: false; raison: string } {
  const total = Math.round((Number(e.montantTotal) || 0) * 100) / 100;
  const m2 = Math.round((Number(e.montantMandat2) || 0) * 100) / 100;
  if (total <= 0) return { ok: false, raison: "Montant total invalide." };
  if (!(m2 > 0)) return { ok: false, raison: "Indiquez le montant du second mandat." };
  if (m2 >= total) return { ok: false, raison: "Le second mandat ne peut pas porter la totalité : décochez la répartition." };
  return { ok: true, montant1: Math.round((total - m2) * 100) / 100, montant2: m2 };
}

/**
 * Ce qu'il reste à régler AUTREMENT que par les prélèvements déjà planifiés.
 *
 * Une commande planifiée en SEPA sortait entièrement des impayés, même
 * quand l'échéancier ne couvrait qu'une partie — la moitié de la mère en dix
 * fois, le père réglant sa part plus tard, autrement. Cette part restait
 * invisible. `sepaRestant` (montant des échéances non encore prélevées,
 * tenu à jour à la planification, au dépôt d'une remise et au rejet)
 * permet de la faire réapparaître.
 *
 * Une commande SEPA sans `sepaRestant` (planifiée avant ce champ) est
 * considérée entièrement couverte, comme avant.
 */
export function resteHorsSepa(payment: {
  totalTTC?: number; paidAmount?: number; sepaRestant?: number | null;
  paymentMode?: string; status?: string;
}): number {
  const solde = Math.round(((Number(payment?.totalTTC) || 0) - (Number(payment?.paidAmount) || 0)) * 100) / 100;
  const sepa = payment?.paymentMode === "prelevement_sepa" || payment?.status === "sepa_scheduled";
  if (!sepa) return Math.max(0, solde);
  const planifie = typeof payment?.sepaRestant === "number" ? payment.sepaRestant : solde;
  return Math.max(0, Math.round((solde - planifie) * 100) / 100);
}
