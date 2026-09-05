/**
 * src/app/admin/paiements/facturx-depot-utils.ts
 *
 * Quelles factures doivent partir sur la Plateforme Agréée (Cecurity) ?
 *
 * Tant que l'envoi n'est pas branché sur l'API de la plateforme, le dépôt
 * se fait à la main : on télécharge le PDF Factur-X et on le dépose sur le
 * portail. Ce module est la mémoire de ce qui reste à faire : une facture
 * définitive d'un client professionnel, non annulée, émise depuis le début
 * de la réforme, et pas encore marquée déposée.
 */

import { estCompteProfessionnel } from "@/lib/facturx";

/** Premier jour à partir duquel on suit les dépôts. Les factures plus
 *  anciennes n'ont jamais eu à transiter par la plateforme. */
export const DEBUT_DEPOT_FACTURX = "2026-09-01";

/** Délai de règlement par défaut d'une facture pro émise avant paiement. */
export const DELAI_ECHEANCE_JOURS = 30;

export interface DepotPaymentLike {
  id?: string;
  familyId?: string;
  familyName?: string;
  invoiceNumber?: string | null;
  invoiceDate?: unknown;
  date?: unknown;
  dueDate?: string | null;
  status?: string;
  totalTTC?: number;
  paidAmount?: number;
  facturxDeposeLe?: unknown;
  facturxDeposePar?: string | null;
}

export interface DepotFamilyLike {
  firestoreId?: string;
  id?: string;
  accountType?: unknown;
  parentName?: string;
}

export interface LigneDepot<P extends DepotPaymentLike = DepotPaymentLike, F extends DepotFamilyLike = DepotFamilyLike> {
  payment: P;
  family: F;
  /** Date d'émission normalisée (AAAA-MM-JJ). */
  dateEmission: string;
  deposee: boolean;
}

/** Timestamp Firestore / Date / ISO → AAAA-MM-JJ ("" si illisible). */
export function dateIso(d: unknown): string {
  if (!d) return "";
  let dt: Date | null = null;
  const anyD = d as any;
  if (typeof anyD?.toDate === "function") dt = anyD.toDate();
  else if (typeof anyD?.seconds === "number") dt = new Date(anyD.seconds * 1000);
  else if (d instanceof Date) dt = d;
  else if (typeof d === "string") dt = new Date(d);
  if (!dt || isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

/** Échéance par défaut : émission + DELAI_ECHEANCE_JOURS, en AAAA-MM-JJ. */
export function echeanceParDefaut(emission: Date = new Date(), jours: number = DELAI_ECHEANCE_JOURS): string {
  const d = new Date(Date.UTC(emission.getFullYear(), emission.getMonth(), emission.getDate()));
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

export function dateEmissionFacture(p: DepotPaymentLike): string {
  return dateIso(p.invoiceDate) || dateIso(p.date);
}

/**
 * Toutes les factures définitives de clients professionnels émises depuis
 * DEBUT_DEPOT_FACTURX, déposées ou non, les plus récentes d'abord.
 */
export function listerFacturesProfessionnelles<P extends DepotPaymentLike, F extends DepotFamilyLike>(
  payments: P[],
  families: F[],
  debut: string = DEBUT_DEPOT_FACTURX,
): LigneDepot<P, F>[] {
  const parId = new Map<string, F>();
  for (const f of families) {
    const id = f.firestoreId || f.id;
    if (id) parId.set(id, f);
  }
  const lignes: LigneDepot<P, F>[] = [];
  for (const p of payments) {
    if (!p.invoiceNumber || p.status === "cancelled" || !p.familyId) continue;
    const family = parId.get(p.familyId);
    if (!family || !estCompteProfessionnel(family)) continue;
    const dateEmission = dateEmissionFacture(p);
    if (!dateEmission || dateEmission < debut) continue;
    lignes.push({ payment: p, family, dateEmission, deposee: !!p.facturxDeposeLe });
  }
  return lignes.sort((a, b) => b.dateEmission.localeCompare(a.dateEmission));
}

export function resumerDepots<P extends DepotPaymentLike, F extends DepotFamilyLike>(
  payments: P[],
  families: F[],
  debut: string = DEBUT_DEPOT_FACTURX,
) {
  const toutes = listerFacturesProfessionnelles(payments, families, debut);
  return {
    aDeposer: toutes.filter((l) => !l.deposee),
    deposees: toutes.filter((l) => l.deposee),
  };
}

/** Une facture précise est-elle en attente de dépôt ? (pastille Historique) */
export function facturxEnAttente(p: DepotPaymentLike, family: DepotFamilyLike | undefined, debut: string = DEBUT_DEPOT_FACTURX): boolean {
  if (!family) return false;
  return listerFacturesProfessionnelles([p], [{ ...family, firestoreId: family.firestoreId || family.id || p.familyId }], debut)
    .some((l) => !l.deposee);
}
