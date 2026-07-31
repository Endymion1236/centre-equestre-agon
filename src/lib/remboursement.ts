/**
 * src/lib/remboursement.ts
 *
 * Repartition d'une annulation entre AVOIR et REMBOURSEMENT.
 *
 * Les CGV prevoient trois issues selon la date et le justificatif :
 *   - remboursement integral (annulation anticipee) ;
 *   - rien du tout (annulation tardive sans justificatif) ;
 *   - acompte en avoir + le reste rembourse (certificat medical).
 *
 * Le dernier cas impose de scinder une somme deja encaissee en deux parts.
 * C'est du calcul financier : une erreur ici se traduit par de l'argent
 * rendu en trop ou en moins, et un ecart comptable que personne ne verra
 * avant la cloture.
 *
 * ⚠️ Ce module NE DECLENCHE AUCUN mouvement d'argent. Le virement ou le
 * remboursement carte reste fait a la main (back-office Worldline, banque) ;
 * on n'enregistre que ce qui a ete decide, pour en garder la trace.
 */

import { STAGE_ACOMPTE_EUROS } from "./cgv-clauses";

/** Acompte stage, converti en avoir en cas de certificat medical. */
export const ACOMPTE_STAGE = STAGE_ACOMPTE_EUROS;

export type ModeRemboursement = "cb" | "cheque" | "virement" | "especes";

export const MODES_REMBOURSEMENT: { id: ModeRemboursement; label: string; aide: string }[] = [
  { id: "cb", label: "Carte bancaire", aide: "À faire dans le back-office Worldline" },
  { id: "virement", label: "Virement", aide: "À faire depuis votre banque" },
  { id: "cheque", label: "Chèque", aide: "Chèque remis à la famille" },
  { id: "especes", label: "Espèces", aide: "Sortie de caisse" },
];

export interface RepartitionAnnulation {
  /** Somme deja encaissee, donc reellement disponible. */
  encaisse: number;
  /** Part convertie en avoir (credit chez le club). */
  avoir: number;
  /** Part rendue a la famille. */
  rembourse: number;
}

export interface ValidationRepartition {
  valide: boolean;
  /** Part encaissee qui n'est ni rendue ni creditee — reste acquise au club. */
  conserve: number;
  erreur?: string;
}

const arrondi = (v: number) => Math.round(v * 100) / 100;

/**
 * Repartition proposee par defaut, selon le motif d'annulation.
 *
 * @param encaisse somme deja encaissee
 * @param motif    ce que prevoient les CGV
 */
export function repartitionParDefaut(
  encaisse: number,
  motif: "anticipee" | "certificat" | "tardive",
): RepartitionAnnulation {
  const total = arrondi(Math.max(0, encaisse));

  if (motif === "anticipee") {
    // Plus de 3 semaines avant : tout est rendu, acompte compris.
    return { encaisse: total, avoir: 0, rembourse: total };
  }
  if (motif === "tardive") {
    // Sans justificatif : rien n'est rendu.
    return { encaisse: total, avoir: 0, rembourse: 0 };
  }

  // Certificat medical : l'acompte devient un avoir, le reste est rendu.
  // Si la famille a verse moins que l'acompte, tout passe en avoir — on ne
  // peut pas crediter plus que ce qui a ete encaisse.
  const avoir = arrondi(Math.min(ACOMPTE_STAGE, total));
  return { encaisse: total, avoir, rembourse: arrondi(total - avoir) };
}

/**
 * La repartition saisie est-elle acceptable ?
 *
 * On refuse tout ce qui distribuerait plus que l'encaisse : rendre de
 * l'argent jamais recu passerait inapercu jusqu'au rapprochement bancaire.
 * En revanche, distribuer MOINS est licite — c'est le cas de l'annulation
 * tardive, ou le club conserve la somme.
 */
export function validerRepartition(r: RepartitionAnnulation): ValidationRepartition {
  const { encaisse, avoir, rembourse } = r;

  if (!Number.isFinite(avoir) || !Number.isFinite(rembourse)) {
    return { valide: false, conserve: 0, erreur: "Montant invalide." };
  }
  if (avoir < 0 || rembourse < 0) {
    return { valide: false, conserve: 0, erreur: "Les montants ne peuvent pas être négatifs." };
  }
  if (encaisse <= 0) {
    return { valide: false, conserve: 0, erreur: "Aucune somme encaissée à répartir." };
  }

  const distribue = arrondi(avoir + rembourse);
  // Tolerance d'un centime : les arrondis de saisie ne doivent pas bloquer.
  if (distribue > arrondi(encaisse) + 0.01) {
    return {
      valide: false,
      conserve: 0,
      erreur: `Le total réparti (${distribue.toFixed(2)} €) dépasse la somme encaissée (${encaisse.toFixed(2)} €).`,
    };
  }

  return { valide: true, conserve: arrondi(encaisse - distribue) };
}

/** Resume lisible, affiche avant validation pour eviter les mauvaises surprises. */
export function resumeRepartition(r: RepartitionAnnulation): string {
  const v = validerRepartition(r);
  if (!v.valide) return v.erreur || "Répartition invalide";

  const parts: string[] = [];
  if (r.rembourse > 0) parts.push(`${r.rembourse.toFixed(2)} € remboursés`);
  if (r.avoir > 0) parts.push(`${r.avoir.toFixed(2)} € en avoir`);
  if (v.conserve > 0) parts.push(`${v.conserve.toFixed(2)} € conservés par le centre`);

  return parts.length > 0 ? parts.join(" · ") : "Aucun mouvement";
}
