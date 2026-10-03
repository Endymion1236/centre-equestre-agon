/**
 * src/app/admin/paiements/regroupement-commande.ts — ajouter le panier à la
 * commande en attente de la famille, pour UNE facture et UN encaissement.
 *
 * Octobre 2026 : une carte de séances se vend depuis l'écran Cartes, qui
 * crée sa commande « à régler » ; l'adhésion s'ajoutait ensuite dans
 * l'onglet Encaisser, qui créait une DEUXIÈME commande. Deux factures, deux
 * lignes au journal, pour un seul passage de carte de 307 €.
 *
 * Une commande en attente ne reçoit le panier que si elle est encore
 * modifiable (commande-verrou : ni facture émise, ni encaissement) et que
 * son règlement n'est pas déjà organisé (prélèvement SEPA, chèques
 * différés, échéancier). Module pur.
 */
import { verrouCommande } from "./commande-verrou";

export interface CommandeAttente {
  id?: string;
  familyId?: string;
  status?: string;
  paymentMode?: string;
  invoiceNumber?: string | null;
  paidAmount?: number | null;
  totalTTC?: number | null;
  items?: any[];
  [cle: string]: unknown;
}

/** Commandes de la famille auxquelles le panier peut être ajouté. */
export function commandesRegroupables<T extends CommandeAttente>(
  payments: T[],
  encaissements: { paymentId?: string }[],
  familyId: string,
  estPrelevementSepa: (p: T) => boolean,
): T[] {
  return payments.filter((p) =>
    !!p.id && p.familyId === familyId && p.status === "pending"
    && !verrouCommande(p as any).verrouillee
    && Math.round((Number(p.totalTTC) || 0) * 100) > 0
    && p.paymentMode !== "cheque_differe" && !estPrelevementSepa(p)
    && !Object.keys(p).some((k) => /^echeance/i.test(k))
    && !encaissements.some((e) => e.paymentId === p.id));
}

/** La commande en attente, panier ajouté : lignes à la suite, total additionné. */
export function commandeAvecPanier(
  commande: CommandeAttente,
  panier: any[],
  totalPanier: number,
): { items: any[]; totalTTC: number } {
  return {
    items: [...(commande.items || []), ...panier],
    totalTTC: Math.round(((Number(commande.totalTTC) || 0) + totalPanier) * 100) / 100,
  };
}

/** Texte de la question posée avant d'encaisser. */
export function questionRegroupement(commande: CommandeAttente, totalPanier: number): string {
  const lib = (commande.items || []).map((i: any) => i.activityTitle).filter(Boolean).join(", ") || "commande en attente";
  const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  const total = (Number(commande.totalTTC) || 0) + totalPanier;
  return `Cette famille a une commande en attente : ${lib} (${eur(Number(commande.totalTTC) || 0)}).\n\n`
    + `OK = l'ajouter à ce panier : UNE facture et UN encaissement de ${eur(total)}.\n`
    + `Annuler = deux commandes séparées (deux factures).`;
}
