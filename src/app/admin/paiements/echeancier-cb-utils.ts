/**
 * src/app/admin/paiements/echeancier-cb-utils.ts
 *
 * Régler une commande en plusieurs fois par carte bancaire.
 *
 * La fenêtre Encaisser des impayés proposait le prélèvement SEPA en N fois,
 * mais pas la CB : une famille sans mandat qui voulait étaler son forfait
 * n'avait pas de solution (septembre 2026). Ici, la commande est découpée en
 * N échéances, comme le fait déjà la validation d'une déclaration en 3x/10x :
 *   - la commande d'origine devient l'échéance 1 (même identifiant) ;
 *   - les échéances 2..N ont un identifiant déterministe, `<id>-echeance-NN`,
 *     qu'une relance réécrit au lieu de doubler ;
 *   - chaque échéance porte sa part de chaque ligne de la commande, au
 *     centime près (construireEcheancier).
 * Elles se règlent ensuite une par une dans l'onglet Échéances : au terminal,
 * ou par lien de paiement — avec, au choix, le rappel de fin de mois.
 *
 * Refus : commande déjà facturée ou déjà en partie réglée (la découper
 * changerait un document déjà émis ou un encaissement déjà au journal),
 * commande déjà découpée, annulée ou planifiée en SEPA.
 */

import { construireEcheancier } from "@/lib/echeancier-paiement";
import { CHAMP_LIEN_CB } from "./echeances-utils";

export interface OptionsEcheancierCb {
  nombre: number;
  /** « AAAA-MM-JJ » : date de la première échéance ; les suivantes, de mois en mois. */
  dateDepart: string;
  /** Pose le repère du rappel de fin de mois (liens CB à envoyer). */
  lienCbMensuel: boolean;
}

export interface EcritureEcheance { id: string; data: Record<string, any> }

export interface PlanEcheancierCb {
  possible: boolean;
  raison?: string;
  /** L'échéance 1 (la commande d'origine), à mettre à jour. */
  premiere?: EcritureEcheance;
  /** Les échéances 2..N, à créer. */
  suivantes: EcritureEcheance[];
}

export function idEcheanceSuivante(paymentId: string, rang: number): string {
  return `${paymentId}-echeance-${String(rang).padStart(2, "0")}`;
}

export function preparerEcheancierCb(
  paymentId: string,
  payment: Record<string, any>,
  options: OptionsEcheancierCb,
): PlanEcheancierCb {
  const refus = (raison: string): PlanEcheancierCb => ({ possible: false, raison, suivantes: [] });
  const nombre = Math.floor(Number(options.nombre) || 0);
  if (nombre < 2 || nombre > 12) return refus("Choisissez entre 2 et 12 échéances.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.dateDepart || "")) return refus("Date de la première échéance invalide.");
  if (payment.invoiceNumber) return refus(`Facture ${payment.invoiceNumber} déjà émise : elle ne se découpe plus.`);
  if ((Number(payment.paidAmount) || 0) > 0) return refus("Un règlement a déjà été reçu sur cette commande : elle ne se découpe plus. Encaissez le reste en une fois, ou passez par un avoir.");
  if (Number(payment.echeancesTotal || 0) > 1) return refus("Cette commande est déjà une échéance d'un paiement en plusieurs fois.");
  if (payment.status === "cancelled") return refus("Commande annulée.");
  if (payment.status === "sepa_scheduled" || payment.paymentMode === "prelevement_sepa") return refus("Commande planifiée en prélèvement SEPA : annulez d'abord l'échéancier SEPA.");
  const total = Math.round((Number(payment.totalTTC) || 0) * 100) / 100;
  if (total <= 0) return refus("Commande sans montant.");

  const echeances = construireEcheancier({
    totalTTC: total,
    items: Array.isArray(payment.items) ? payment.items : [],
    nombre,
    dateDepart: options.dateDepart,
  });
  const forfaitRef = payment.forfaitRef
    || (Array.isArray(payment.items) ? payment.items.map((i: any) => i?.activityTitle).filter(Boolean).join(", ") : "")
    || "Paiement en plusieurs fois";
  const commun = {
    paymentMode: "cb_terminal",
    paymentPlan: `${nombre}x`,
    paymentRef: "",
    status: "pending",
    paidAmount: 0,
    sourcePaymentId: paymentId,
    forfaitRef,
    [CHAMP_LIEN_CB]: options.lienCbMensuel === true,
  };
  const { id: _id, ...sansId } = payment;
  return {
    possible: true,
    premiere: { id: paymentId, data: { ...echeances[0], ...commun } },
    suivantes: echeances.slice(1).map((e, i) => ({
      id: idEcheanceSuivante(paymentId, i + 2),
      data: { ...sansId, ...e, ...commun },
    })),
  };
}
