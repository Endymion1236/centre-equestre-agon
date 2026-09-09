/**
 * src/lib/lien-paiement-regles.ts
 *
 * Règles pures autour des liens de paiement CAWL — sans accès Firestore, pour
 * être testées seules (tests/unit/lien-paiement.test.ts).
 *
 * Contexte (septembre 2026). Deux liens partis par mégarde pour la même
 * commande : l'un de 30 €, l'autre de 60 €. Impossible de « rappeler » un lien
 * côté CAWL — la page de paiement hébergée ne connaît que « créer » et
 * « consulter », pas « supprimer ». Le lien meurt seul au bout de 2 heures.
 *
 * Ce que l'application peut faire, et que ce module décrit :
 *   1. Suivre chaque lien envoyé (validité, annulation par l'admin).
 *   2. Reconnaître un encaissement qui n'aurait pas dû arriver — commande déjà
 *      soldée, lien annulé, cumul au-delà du total — pour le signaler au club
 *      au lieu de l'ignorer en silence : l'argent, lui, a bien été débité.
 *   3. Calculer le montant du lien d'acompte à partir de la COMMANDE, pas de
 *      l'inscription du moment, pour qu'il colle à la lettre de confirmation.
 */

/**
 * Durée de vie d'un lien envoyé : 7 jours.
 *
 * Le lien mène sur NOTRE site (/payer/<jeton>), pas directement chez CAWL.
 * C'est au clic que la page de paiement CAWL est ouverte — elle, ne vit que
 * 2 heures, mais la famille est justement en train de payer. Le montant est
 * relu sur la commande à ce moment-là : un lien ancien ne peut pas faire
 * payer deux fois, et un lien annulé ne mène plus nulle part.
 */
export const DUREE_VALIDITE_LIEN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Une page CAWL déjà ouverte pour ce lien est réutilisée tant qu'elle est
 * fraîche : la famille qui clique deux fois retombe sur la MÊME session, et
 * ne peut donc pas payer deux fois. Marge sous les 2 h de CAWL.
 */
export const FRAICHEUR_CHECKOUT_MS = 100 * 60 * 1000;

/** Tolérance d'arrondi, en euros. */
const EPSILON = 0.02;

const arrondi = (n: number) => Math.round(n * 100) / 100;

export type StatutLien = "sent" | "cancelled" | "paid";

export interface LienPaiementDoc {
  status?: StatutLien | string;
  /** ISO ou epoch ms ; les documents Firestore arrivent avec un Timestamp converti en amont. */
  sentAt?: string | number | Date | null;
  expiresAt?: string | number | Date | null;
}

export type EtatLien = "valide" | "expire" | "annule" | "paye";

const enMs = (v: string | number | Date | null | undefined): number => {
  if (v == null) return 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return Date.parse(v) || 0;
};

/**
 * État lisible d'un lien envoyé : encore utilisable, mort de vieillesse,
 * annulé par le club, ou déjà réglé.
 */
export function etatLien(lien: LienPaiementDoc, maintenant: number = Date.now()): EtatLien {
  if (lien.status === "paid") return "paye";
  if (lien.status === "cancelled") return "annule";
  const expire = enMs(lien.expiresAt) || (enMs(lien.sentAt) ? enMs(lien.sentAt) + DUREE_VALIDITE_LIEN_MS : 0);
  if (expire && expire <= maintenant) return "expire";
  return "valide";
}

/** Heure d'expiration d'un lien envoyé à `sentAt`. */
export function expirationLien(sentAt: number | Date): Date {
  return new Date(enMs(sentAt) + DUREE_VALIDITE_LIEN_MS);
}

export type MotifInattendu = "deja_solde" | "lien_annule" | "trop_percu";

export interface EncaissementInattendu {
  motif: MotifInattendu;
  /** Somme en trop, à rembourser (euros). 0 pour un lien annulé réglé sans excédent. */
  exces: number;
}

/**
 * Un encaissement CAWL vient d'aboutir : est-il attendu ?
 *
 * - `deja_solde` : la commande était déjà réglée en totalité. L'argent n'est
 *   pas crédité une seconde fois (comportement historique), mais il faut le
 *   dire au club : la famille a payé deux liens, elle doit être remboursée.
 * - `trop_percu` : le cumul dépasse le total dû (deux liens partiels réglés).
 * - `lien_annule` : le lien avait été annulé par l'admin, la famille l'a tout
 *   de même utilisé avant son expiration. Le règlement reste dû, il est
 *   crédité ; on le signale seulement pour vérification.
 *
 * `null` quand tout est normal.
 */
export function detecterEncaissementInattendu(e: {
  statutCommande: string | undefined;
  totalTTC: number;
  dejaPaye: number;
  montant: number;
  lienAnnule: boolean;
}): EncaissementInattendu | null {
  const total = e.totalTTC || 0;
  const deja = e.dejaPaye || 0;
  const montant = e.montant || 0;

  if (e.statutCommande === "paid" || (total > 0 && deja >= total - EPSILON)) {
    return { motif: "deja_solde", exces: arrondi(montant) };
  }
  const cumul = arrondi(deja + montant);
  if (total > 0 && cumul > total + EPSILON) {
    return { motif: "trop_percu", exces: arrondi(cumul - total) };
  }
  if (e.lienAnnule) return { motif: "lien_annule", exces: 0 };
  return null;
}

/**
 * Montant du lien de paiement à envoyer avec la confirmation d'inscription.
 *
 * Lu sur la COMMANDE au moment de l'envoi : l'acompte de la commande entière
 * (30 € par enfant, recalculé quand un enfant s'y ajoute) moins ce qui a déjà
 * été réglé. Sans acompte, c'est le reste dû. Jamais plus que le reste dû.
 *
 * C'est ce qui évite le scénario « lien de 30 €, puis lien de 60 € » : un seul
 * lien part, une fois les inscriptions de la famille regroupées.
 */
export function montantLienAcompte(commande: {
  totalTTC?: number;
  paidAmount?: number;
  acompteAmount?: number;
}): number {
  const total = commande.totalTTC || 0;
  const paye = commande.paidAmount || 0;
  const resteDu = arrondi(Math.max(0, total - paye));
  const acompte = typeof commande.acompteAmount === "number" && commande.acompteAmount > 0
    ? commande.acompteAmount
    : total;
  return arrondi(Math.min(resteDu, Math.max(0, acompte - paye)));
}

/**
 * Montants annoncés par la lettre de confirmation.
 *
 * La lettre additionnait les montants figés stage par stage à l'inscription.
 * Or la commande, elle, recalcule l'acompte à chaque enfant ajouté (30 € par
 * enfant) : la lettre disait « acompte 199,20 € », le lien réclamait 60 €.
 *
 * Quand la commande porte les mêmes lignes que la lettre (même total), c'est
 * elle qui fait foi. Sinon — commande plus large que les stages annoncés, ou
 * introuvable — on garde les sommes de la lettre.
 */
export function montantsConfirmationDepuisCommande(
  lettre: { totalTTC: number; aRegler: number; solde: number },
  commande: { totalTTC?: number; paidAmount?: number; acompteAmount?: number } | null,
): { aRegler: number; solde: number; dejaRegle: number; source: "commande" | "lettre" } {
  const dejaRegleLettre = Math.min(commande?.paidAmount || 0, lettre.totalTTC);
  if (!commande || typeof commande.totalTTC !== "number" || commande.totalTTC <= 0) {
    return {
      aRegler: arrondi(Math.max(0, lettre.aRegler - dejaRegleLettre)),
      solde: arrondi(lettre.solde),
      dejaRegle: arrondi(dejaRegleLettre),
      source: "lettre",
    };
  }
  if (Math.abs(commande.totalTTC - lettre.totalTTC) > EPSILON) {
    return {
      aRegler: arrondi(Math.max(0, lettre.aRegler - dejaRegleLettre)),
      solde: arrondi(lettre.solde),
      dejaRegle: arrondi(dejaRegleLettre),
      source: "lettre",
    };
  }
  const total = commande.totalTTC;
  const paye = Math.min(commande.paidAmount || 0, total);
  const acompte = typeof commande.acompteAmount === "number" && commande.acompteAmount > 0
    ? Math.min(commande.acompteAmount, total)
    : total;
  return {
    aRegler: arrondi(Math.max(0, acompte - paye)),
    solde: arrondi(Math.max(0, total - acompte)),
    dejaRegle: arrondi(paye),
    source: "commande",
  };
}

/**
 * Montant à faire payer quand la famille ouvre le lien : ce que le lien
 * demandait, jamais plus que ce que la commande doit encore. 0 → plus rien
 * à régler, le lien est mort de sa belle mort.
 */
export function montantOuvertureLien(
  montantLien: number,
  commande: { totalTTC?: number; paidAmount?: number },
): number {
  const resteDu = arrondi(Math.max(0, (commande.totalTTC || 0) - (commande.paidAmount || 0)));
  if (resteDu <= EPSILON) return 0;
  return arrondi(Math.min(Math.max(0, montantLien || 0), resteDu));
}

/** La page CAWL déjà ouverte pour ce lien peut-elle resservir ? */
export function checkoutReutilisable(
  checkout: { url?: string; createdAt?: string | number | Date | null; amount?: number } | null | undefined,
  montant: number,
  maintenant: number = Date.now(),
): boolean {
  if (!checkout?.url) return false;
  const cree = enMs(checkout.createdAt);
  if (!cree || maintenant - cree > FRAICHEUR_CHECKOUT_MS) return false;
  return Math.abs((checkout.amount || 0) - montant) <= EPSILON;
}
