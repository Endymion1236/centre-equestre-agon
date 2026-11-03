/**
 * src/lib/echeances-ordre.ts — dans quel ordre se règlent les échéances d'un
 * échéancier (forfait payé en 3 ou 10 fois, une commande par échéance).
 *
 * Novembre 2026, GAGNARD : l'échéance 1/10 restait due alors que la 10/10
 * (juin 2027) était réglée. L'espace famille listait les échéances de la plus
 * récente à la plus ancienne, toutes datées du jour de l'inscription et
 * presque toutes intitulées « Échéance k/10 » : la famille payait la
 * première carte affichée, c'est-à-dire la dernière échéance. L'argent était
 * bien reçu, mais sur la mauvaise ligne, et la 1/10 partait en relance.
 *
 * Règle, une fois : on règle d'abord l'échéance la plus ancienne encore due
 * d'une même série. Module sans import, lisible par les écrans comme par le
 * serveur (testé : tests/unit/echeances-ordre.test.ts).
 */

export interface EcheanceLike {
  id: string;
  familyId?: string | null;
  forfaitRef?: string | null;
  orderId?: string | null;
  echeance?: number | null;
  echeancesTotal?: number | null;
  echeanceDate?: string | null;
  status?: string | null;
  totalTTC?: number | null;
  paidAmount?: number | null;
}

/** Une échéance d'un paiement en plusieurs fois (et pas une commande ordinaire). */
export const estEcheanceDeSerie = (p: EcheanceLike | null | undefined): boolean =>
  !!p && Number(p.echeancesTotal) > 1 && Number(p.echeance) >= 1;

/**
 * Clé de la série : même famille, même forfait (créneau), même nombre
 * d'échéances. Les commandes d'un échéancier n'ont pas d'identifiant commun
 * (chaque échéance a son propre numéro de commande).
 */
export const cleSerie = (p: EcheanceLike): string =>
  `${p.familyId || ""}|${p.forfaitRef || ""}|${Number(p.echeancesTotal) || 0}`;

const centimes = (n: unknown) => Math.round((Number(n) || 0) * 100);

/** Reste-t-il quelque chose à régler sur cette échéance ? */
export const echeanceDue = (p: EcheanceLike): boolean =>
  p.status !== "cancelled" && p.status !== "paid" && centimes(p.totalTTC) - centimes(p.paidAmount) > 0;

/**
 * Les échéances de la même série, plus anciennes, encore dues — triées de la
 * plus ancienne à la plus récente. Vide pour une commande ordinaire.
 */
export function echeancesAnterieuresDues<T extends EcheanceLike>(echeance: EcheanceLike, toutes: T[]): T[] {
  if (!estEcheanceDeSerie(echeance)) return [];
  const cle = cleSerie(echeance);
  const rang = Number(echeance.echeance);
  return toutes
    .filter((x) => x.id !== echeance.id && estEcheanceDeSerie(x) && cleSerie(x) === cle
      && Number(x.echeance) < rang && echeanceDue(x))
    .sort((a, b) => Number(a.echeance) - Number(b.echeance));
}

/**
 * Ordre d'affichage des commandes à régler dans l'espace famille : les
 * échéances par date prévue (la plus ancienne d'abord, c'est elle qu'on
 * règle), puis par rang ; les autres commandes par date, la plus ancienne
 * d'abord aussi. `dateSecondes` : date de la commande, en secondes.
 */
export function trierARegler<T extends EcheanceLike>(commandes: T[], dateSecondes: (c: T) => number): T[] {
  const cleDate = (c: T): string => {
    if (estEcheanceDeSerie(c) && /^\d{4}-\d{2}-\d{2}/.test(String(c.echeanceDate || ""))) return String(c.echeanceDate).slice(0, 10);
    const s = dateSecondes(c);
    return s > 0 ? new Date(s * 1000).toISOString().slice(0, 10) : "9999-12-31";
  };
  return [...commandes].sort((a, b) =>
    cleDate(a).localeCompare(cleDate(b))
    || (Number(a.echeance) || 0) - (Number(b.echeance) || 0)
    || dateSecondes(a) - dateSecondes(b));
}

/** Phrase à montrer quand une échéance plus ancienne doit passer d'abord. */
export function messageReglerDabord(anterieures: EcheanceLike[]): string {
  if (anterieures.length === 0) return "";
  const premiere = anterieures[0];
  const reste = (centimes(premiere.totalTTC) - centimes(premiere.paidAmount)) / 100;
  return `Réglez d'abord l'échéance ${premiere.echeance}/${premiere.echeancesTotal} (${reste.toFixed(2).replace(".", ",")} €)`
    + (anterieures.length > 1 ? `, puis les ${anterieures.length - 1} suivante${anterieures.length > 2 ? "s" : ""} encore due${anterieures.length > 2 ? "s" : ""}.` : ".");
}
