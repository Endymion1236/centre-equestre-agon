/**
 * src/lib/sepa-unique.ts — une commande réglée par UN prélèvement SEPA.
 *
 * Octobre 2026, Nicolas : « dans les inscriptions en concours pony games
 * j'ai indiqué paiement SEPA mais ça m'a encore marqué réglé au journal sans
 * me créer d'échéance SEPA ». Le planning traitait « SEPA » comme un mode
 * d'encaissement immédiat : commande « réglée » le jour même, rien dans le
 * module SEPA, donc rien de prélevé.
 *
 * Même règle que la caisse (ModaleEncaisser) et le forfait annuel : la
 * commande passe « sepa_scheduled » (ni réglée, ni dans les impayés), une
 * échéance part dans le module SEPA sur le mandat le plus récent, et
 * l'encaissement n'est écrit qu'au passage de la remise. La pré-notification
 * est à vérifier avant envoi (prenotificationSepa « a_verifier »).
 *
 * Module pur, testé seul (tests/unit/sepa-unique.test.ts).
 */

export const MODE_SEPA = "prelevement_sepa";

export const estModeSepa = (mode: unknown) => mode === MODE_SEPA;

/** Le mandat actif le plus récent : un ancien RIB non révoqué ferait rejeter le prélèvement. */
export function mandatLePlusRecent<T extends { createdAt?: { seconds?: number } | null; status?: string }>(mandats: T[]): T | null {
  const actifs = mandats.filter((m) => !m.status || m.status === "active");
  return [...actifs].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0] || null;
}

const arrondi = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Champs de la commande programmée en un prélèvement. */
export function champsCommandeSepaUnique(montant: number, mandatId: string) {
  return {
    paymentMode: MODE_SEPA,
    paymentRef: `1× SEPA · ${mandatId}`,
    status: "sepa_scheduled",
    sepaRestant: arrondi(montant),
    paidAmount: 0,
    prenotificationSepa: "a_verifier",
  };
}

/** L'échéance unique, rattachée à la commande. */
export function echeanceSepaUnique(p: {
  familyId: string; familyName: string; mandatId: string; montant: number;
  description: string; paymentId: string; orderId?: string; dateEcheance: string;
}) {
  return {
    familyId: p.familyId,
    familyName: p.familyName,
    mandatId: p.mandatId,
    montant: arrondi(p.montant),
    dateEcheance: p.dateEcheance,
    reference: `Paiement ${p.paymentId}`,
    description: `${p.description} — 1/1`,
    status: "pending",
    remiseId: null,
    paymentId: p.paymentId,
    ...(p.orderId ? { orderId: p.orderId } : {}),
    echeance: 1,
    echeancesTotal: 1,
  };
}
