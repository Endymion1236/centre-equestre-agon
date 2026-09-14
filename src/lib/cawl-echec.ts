/**
 * src/lib/cawl-echec.ts
 *
 * Pourquoi un paiement CAWL n'a pas abouti, en français.
 *
 * Quand une carte est refusée, l'application ne gardait rien : un
 * `console.warn` dans les journaux Vercel, et la famille renvoyée sur son
 * espace client sans un mot. Le gérant voyait des liens « qui marchent » et
 * d'autres « rejetés », sans pouvoir dire si c'était la banque, un
 * abandon, ou la page de paiement elle-même.
 *
 * CAWL (Worldline) renvoie pourtant de quoi comprendre : le statut du
 * paiement (REJECTED, CANCELLED…), un `statusOutput` avec un code de statut
 * hérité (2 = autorisation refusée, 1 = annulé par le client…) et une liste
 * d'erreurs identifiées, et pour les cartes le résultat 3-D Secure et de la
 * lutte contre la fraude. Ce module lit tout ça et le résume. Module pur.
 */

import { moyenPaiementCawl } from "@/lib/cawl-moyen-paiement";

export interface ErreurCawl { id: string; code: string; message: string }

export interface ResumeEchecCawl {
  /** Statut CAWL du paiement : REJECTED, CANCELLED, REJECTED_CAPTURE, ou vide. */
  statut: string;
  /** Code de statut hérité Worldline (statusOutput.statusCode). */
  code: number | null;
  categorie: string;
  erreurs: ErreurCawl[];
  /** Résultat de l'authentification 3-D Secure, quand CAWL le renvoie. */
  authentification: string;
  fraude: string;
  moyen: string;
  montant: number;
  /** Phrase lisible, la même partout. */
  explication: string;
}

/**
 * Codes de statut hérités (Ingenico/Worldline), ceux qu'on voit dans le
 * back-office CAWL. Seuls les codes d'échec ou d'attente sont traduits.
 */
const CODES: Record<number, string> = {
  0: "Paiement invalide ou incomplet",
  1: "Paiement annulé par le client",
  2: "Autorisation refusée par la banque du client",
  4: "Paiement en attente de validation",
  46: "Authentification 3-D Secure en attente",
  52: "Autorisation incertaine",
  55: "Authentification 3-D Secure impossible",
  56: "Authentification 3-D Secure incertaine",
  57: "Authentification 3-D Secure échouée",
  59: "Autorisation à confirmer manuellement",
  91: "Paiement en cours de traitement",
  92: "Paiement incertain",
  93: "Paiement refusé",
};

const STATUTS: Record<string, string> = {
  REJECTED: "Paiement refusé",
  REJECTED_CAPTURE: "Encaissement refusé après autorisation",
  CANCELLED: "Paiement annulé par le client",
  PENDING_PAYMENT: "Paiement laissé en attente",
  REDIRECTED: "Client redirigé vers sa banque, paiement non terminé",
};

export function resumerEchecCawl(paymentCawl: any): ResumeEchecCawl {
  const p = paymentCawl || {};
  const so = p.statusOutput || {};
  const po = p.paymentOutput || {};
  const carte = po.cardPaymentMethodSpecificOutput || {};
  const statut = String(p.status || "").toUpperCase();
  const code = typeof so.statusCode === "number" ? so.statusCode : null;
  const erreurs: ErreurCawl[] = Array.isArray(so.errors)
    ? so.errors.map((e: any) => ({ id: String(e?.id || ""), code: String(e?.errorCode || e?.code || ""), message: String(e?.message || "") })).filter((e: ErreurCawl) => e.id || e.code || e.message)
    : [];
  const authentification = String(carte.threeDSecureResults?.authenticationStatus || "");
  const fraude = String(po.fraudResults?.fraudServiceResult || carte.fraudResults?.fraudServiceResult || "");
  const montant = (po.amountOfMoney?.amount || 0) / 100;
  const moyen = moyenPaiementCawl(po).libelle;

  const morceaux: string[] = [];
  if (code != null && CODES[code]) morceaux.push(CODES[code]);
  else if (STATUTS[statut]) morceaux.push(STATUTS[statut]);
  else morceaux.push(statut ? `Paiement non abouti (statut ${statut})` : "Paiement non abouti");
  if (/^(N|R|U)$/i.test(authentification)) morceaux.push(authentification.toUpperCase() === "N" ? "authentification 3-D Secure refusée" : authentification.toUpperCase() === "R" ? "authentification 3-D Secure rejetée par la banque" : "authentification 3-D Secure impossible");
  if (/^(challenged|denied|error)$/i.test(fraude)) morceaux.push(`contrôle anti-fraude : ${fraude.toLowerCase()}`);
  for (const e of erreurs.slice(0, 2)) {
    const lib = [e.id, e.message].filter(Boolean).join(" — ");
    if (lib) morceaux.push(lib);
  }
  const explication = morceaux.join(" · ") + (code != null ? ` (code ${code})` : "") + (moyen !== "Carte bancaire" ? ` · ${moyen}` : "");

  return { statut, code, categorie: String(so.statusCategory || ""), erreurs, authentification, fraude, moyen, montant, explication };
}

/** Ce que la famille lit après un refus : sans jargon, avec quoi faire. */
export function conseilApresEchec(r: Pick<ResumeEchecCawl, "code" | "statut" | "authentification">): string {
  if (r.code === 1 || r.statut === "CANCELLED") return "Le paiement a été interrompu avant la fin. Vous pouvez réessayer quand vous voulez : rien n'a été débité.";
  if (r.code === 57 || r.code === 55 || /^(N|U|R)$/i.test(r.authentification)) return "Votre banque n'a pas pu confirmer votre identité (validation 3-D Secure : application bancaire, SMS…). Réessayez en gardant l'application de votre banque à portée de main, ou essayez une autre carte.";
  return "Votre banque a refusé l'opération : plafond, carte expirée, paiement en ligne bloqué… Rien n'a été débité. Vous pouvez réessayer, essayer une autre carte, ou nous contacter.";
}
