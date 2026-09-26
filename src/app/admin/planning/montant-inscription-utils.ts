/**
 * src/app/admin/planning/montant-inscription-utils.ts
 *
 * Corriger le montant d'une inscription depuis le panneau du planning.
 *
 * Septembre 2026 : un forfait inscrit en prélèvement SEPA en 10 fois, avec
 * un mauvais montant. Il fallait annuler les prélèvements dans l'écran SEPA,
 * retrouver la commande dans les impayés, la modifier, puis replanifier.
 * Ici, on corrige les lignes (forfait, licence, adhésion…) et la suite suit :
 *
 *   - commande simple (un seul règlement) : lignes et total mis à jour ;
 *   - prélèvement SEPA planifié : même chose, et les prélèvements à venir
 *     sont redistribués sur le nouveau total, aux mêmes dates et sur le même
 *     mandat ; la pré-notification redevient « à vérifier » (la famille doit
 *     connaître le nouveau montant avant le prélèvement) ;
 *   - paiement en plusieurs fois (une commande par échéance) : le reste dû
 *     est redécoupé sur le même nombre d'échéances (refaire-echeancier-utils).
 *
 * Refus : facture déjà émise ou règlement déjà reçu sur une commande simple
 * (la correction passe par un avoir), prélèvement déjà remis à la banque.
 * Module pur : aucune écriture ici.
 */

import { tauxTva } from "@/lib/tva-taux";
import { montantsEcheances } from "@/lib/sepa-remise";
import { verrouCommande } from "@/app/admin/paiements/commande-verrou";
import { estEcheance, estEcheanceSepa, todayIso } from "@/app/admin/paiements/echeances-utils";
import { MODES_ECHEANCIER, lignesDuResteDu, refaireEcheancier, type EcritureEcheancier } from "@/app/admin/paiements/refaire-echeancier-utils";

export interface LigneMontant {
  activityTitle: string;
  priceTTC: number;
  tva: number;
  [cle: string]: unknown;
}

export type FormeCommande = "simple" | "sepa" | "echeances";

export interface AnalyseMontant {
  possible: boolean;
  raison?: string;
  forme?: FormeCommande;
  /** Lignes à corriger, montants TTC en euros. */
  lignes: LigneMontant[];
  total: number;
  /** Déjà payé (échéances réglées). */
  paye: number;
}

const c = (n: unknown) => Math.round((Number(n) || 0) * 100);
const e = (centimes: number) => Math.round(centimes) / 100;

/** Quelle forme de paiement, et quelles lignes montrer. */
export function analyserMontantInscription(commandes: any[], echeancesSepa: any[] = []): AnalyseMontant {
  const vide = { lignes: [], total: 0, paye: 0 };
  const vivantes = commandes.filter((p) => p?.status !== "cancelled");
  if (!vivantes.length) return { possible: false, raison: "Aucune commande trouvée pour cette inscription (carte de séances, pré-inscription ou reprise Céleris ?).", ...vide };

  const echs = vivantes.filter(estEcheance);
  if (echs.length > 1 || (echs.length === 1 && vivantes.length === 1 && !estEcheanceSepa(echs[0]))) {
    const payees = echs.filter((x) => x.status === "paid");
    const total = echs.reduce((s, x) => s + c(x.totalTTC), 0);
    return {
      possible: true, forme: "echeances",
      lignes: lignesDuResteDu(echs, total).map(normaliser),
      total: e(total), paye: e(payees.reduce((s, x) => s + c(x.totalTTC), 0)),
    };
  }
  if (vivantes.length > 1) return { possible: false, raison: "Plusieurs commandes couvrent cette inscription : corrigez-les depuis Paiements → Impayés.", ...vide };

  const p = vivantes[0];
  if (estEcheanceSepa(p)) {
    const serie = echeancesSepa.filter((x) => x.paymentId === p.id || (!!p.orderId && x.orderId === p.orderId));
    const bloquantes = serie.filter((x) => x.status !== "pending");
    if (bloquantes.length) return { possible: false, raison: `${bloquantes.length} prélèvement(s) déjà remis à la banque : le montant ne se corrige plus d'ici. Passez par Prélèvements SEPA.`, ...vide };
    if (!serie.length) return { possible: false, raison: "Aucun prélèvement à venir retrouvé pour cette commande : vérifiez dans Prélèvements SEPA.", ...vide };
    if (c(p.paidAmount) > 0) return { possible: false, raison: "Un règlement a déjà été reçu : la correction passe par un avoir.", ...vide };
    return { possible: true, forme: "sepa", lignes: (p.items || []).map(normaliser), total: e(c(p.totalTTC)), paye: 0 };
  }

  const verrou = verrouCommande(p);
  if (verrou.verrouillee) return { possible: false, raison: `${verrou.titre}. ${verrou.explication}`, ...vide };
  return { possible: true, forme: "simple", lignes: (p.items || []).map(normaliser), total: e(c(p.totalTTC)), paye: 0 };
}

function normaliser(it: any): LigneMontant {
  return { ...it, activityTitle: String(it.activityTitle || it.label || "Ligne"), priceTTC: e(c(it.priceTTC ?? it.amount)), tva: tauxTva(it.tva ?? it.tvaTaux) };
}

/** Une ligne corrigée : TTC saisi, HT recalculé depuis le taux (0 % respecté). */
export function ligneCorrigee(l: LigneMontant, ttc: number): LigneMontant {
  const t = tauxTva(l.tva);
  const priceTTC = e(c(ttc));
  return { ...l, priceTTC, amount: priceTTC, priceHT: Math.round((priceTTC / (1 + t / 100)) * 100) / 100, tva: t };
}

export interface PlanMontant {
  possible: boolean;
  raison?: string;
  nouveauTotal: number;
  /** Commande(s) à mettre à jour. */
  miseAJour: EcritureEcheancier[];
  /** Échéances à créer (paiement en plusieurs fois). */
  creations: EcritureEcheancier[];
  /** Échéances annulées (paiement en plusieurs fois, plus besoin). */
  annulations: EcritureEcheancier[];
  /** Prélèvements SEPA à venir : nouveau montant de chacun. */
  prelevements: { id: string; montant: number }[];
  /** La pré-notification SEPA doit être revue avant le prochain prélèvement. */
  prenotificationARevoir: boolean;
}

export function planifierMontantInscription(
  analyse: AnalyseMontant,
  commandes: any[],
  lignes: LigneMontant[],
  echeancesSepa: any[] = [],
  today = todayIso(),
): PlanMontant {
  const refus = (raison: string): PlanMontant => ({ possible: false, raison, nouveauTotal: 0, miseAJour: [], creations: [], annulations: [], prelevements: [], prenotificationARevoir: false });
  if (!analyse.possible || !analyse.forme) return refus(analyse.raison || "Modification impossible.");
  if (lignes.some((l) => !Number.isFinite(Number(l.priceTTC)) || Number(l.priceTTC) < 0)) return refus("Un montant est invalide (négatif ou vide).");
  const totalC = lignes.reduce((s, l) => s + c(l.priceTTC), 0);
  if (totalC <= 0) return refus("Le nouveau total est nul : pour annuler l'inscription, désinscrivez le cavalier.");
  const nouveauTotal = e(totalC);
  const items = lignes.map((l) => ligneCorrigee(l, Number(l.priceTTC)));
  const vivantes = commandes.filter((p) => p?.status !== "cancelled");

  if (analyse.forme === "simple") {
    const p = vivantes[0];
    return { possible: true, nouveauTotal, miseAJour: [{ id: String(p.id), data: { items, totalTTC: nouveauTotal } }], creations: [], annulations: [], prelevements: [], prenotificationARevoir: false };
  }

  if (analyse.forme === "sepa") {
    const p = vivantes[0];
    const serie = echeancesSepa
      .filter((x) => (x.paymentId === p.id || (!!p.orderId && x.orderId === p.orderId)) && x.status === "pending")
      .sort((a, b) => String(a.dateEcheance || "").localeCompare(String(b.dateEcheance || "")));
    const montants = montantsEcheances(nouveauTotal, serie.length);
    return {
      possible: true, nouveauTotal,
      miseAJour: [{ id: String(p.id), data: { items, totalTTC: nouveauTotal, sepaRestant: nouveauTotal, prenotificationSepa: "a_verifier" } }],
      creations: [], annulations: [],
      prelevements: serie.map((x, i) => ({ id: String(x.id), montant: montants[i] })),
      prenotificationARevoir: true,
    };
  }

  // Paiement en plusieurs fois : même nombre d'échéances restantes, même mode, même départ.
  const echs = vivantes.filter(estEcheance).sort((a, b) => Number(a.echeance || 0) - Number(b.echeance || 0));
  const restantes = echs.filter((x) => x.status !== "paid");
  if (!restantes.length) return refus("Toutes les échéances sont déjà payées : la correction passe par un avoir.");
  const mode = MODES_ECHEANCIER.some((m) => m.id === restantes[0].paymentMode) ? restantes[0].paymentMode : "";
  if (!mode) return refus(`Échéances réglées par « ${restantes[0].paymentMode || "?"} » : modifiez-les depuis Paiements → Échéances.`);
  const depart = restantes[0].echeanceDate && /^\d{4}-\d{2}-\d{2}$/.test(restantes[0].echeanceDate) ? restantes[0].echeanceDate : today;
  const r = refaireEcheancier(echs, { nombre: restantes.length, mode, dateDepart: depart }, { lignes: items, totalTTC: nouveauTotal });
  if (!r.possible) return refus(r.raison || "Redécoupage impossible.");
  return { possible: true, nouveauTotal, miseAJour: r.miseAJour, creations: r.creations, annulations: r.annulations, prelevements: [], prenotificationARevoir: false };
}
