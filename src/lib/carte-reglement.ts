/**
 * src/lib/carte-reglement.ts — une carte de séances est-elle payée ?
 *
 * Une carte peut être remise sans encaissement : l'écran Cartes propose
 * explicitement « encaisser plus tard », et crée alors une commande en
 * attente. Rien ne le montrait ensuite sur la carte — elle s'affichait comme
 * les autres, et seule une visite aux impayés révélait qu'elle n'était pas
 * réglée. Or c'est une carte qui donne droit à dix séances tout de suite.
 *
 * La commande est retrouvée par `cardId`, posé à la création sur la commande
 * elle-même et sur sa ligne.
 */

export type EtatReglementCarte = "regle" | "partiel" | "impaye" | "inconnu";

export interface ReglementCarte {
  etat: EtatReglementCarte;
  /** Montant encaissé sur la carte. */
  regle: number;
  /** Prix de la carte, tel que porté par la commande. */
  total: number;
  /** Reste dû. */
  reste: number;
  /** Commande à ouvrir pour encaisser, quand il en existe une. */
  paymentId?: string;
  familyId?: string;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

export function reglementCarte(paiements: any[], carteId: string): ReglementCarte {
  const commandes = (paiements || []).filter((p) =>
    p?.status !== "cancelled" &&
    (p?.cardId === carteId || (p?.items || []).some((i: any) => i?.cardId === carteId)),
  );

  // Carte importée, ou créée avant que les cartes soient rattachées à une
  // commande : rien ne permet d'affirmer qu'elle n'est pas payée. On se tait
  // plutôt que d'alarmer à tort.
  if (commandes.length === 0) return { etat: "inconnu", regle: 0, total: 0, reste: 0 };

  const regle = arrondi(commandes.reduce((s: number, p: any) => s + (Number(p.paidAmount) || 0), 0));
  const total = arrondi(commandes.reduce((s: number, p: any) => s + (Number(p.totalTTC) || 0), 0));
  const reste = arrondi(Math.max(0, total - regle));
  const commune = { regle, total, reste, paymentId: commandes[0]?.id, familyId: commandes[0]?.familyId };

  if (commandes.some((p: any) => p.status === "paid") || (total > 0 && reste < 0.01)) {
    return { etat: "regle", ...commune };
  }
  if (regle > 0.009) return { etat: "partiel", ...commune };
  return { etat: "impaye", ...commune };
}
