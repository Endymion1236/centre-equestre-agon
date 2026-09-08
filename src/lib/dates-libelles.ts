/**
 * src/lib/dates-libelles.ts
 *
 * Retrouver la date d'une opération sans ressaisir le relevé.
 *
 * Des relevés importés sans dates laissent des centaines de lignes
 * inutilisables : le rapprochement ne peut pas vérifier ses délais, et la
 * liasse comptable réclame une date de règlement sur chaque écriture. Les
 * ressaisir une à une n'est pas envisageable — il y en a deux cent trente-cinq,
 * dont une majorité de commissions bancaires à quelques centimes.
 *
 * Or la banque écrit souvent la date dans le libellé lui-même :
 *
 *   « Paiement par carte X4673 UEP*U EXPRESS AGON C 01/09 »
 *   « Remboursement de prêt 10003551300 01/09/26 INTERETS »
 *   « CB U EXPRESS AGON 28/07 »
 *
 * On la lit donc là où elle se trouve. Ce n'est pas une estimation : c'est la
 * date que la banque a inscrite.
 *
 * ── Ce qui reste sans date ────────────────────────────────────────────────
 *
 * « Com Carte », « Prlv GHN », « Facture Crédit Agricole » ne portent aucune
 * date. Pour ces lignes, la seule convention défendable est le dernier jour
 * du mois — c'est d'ailleurs celle du relevé qui les justifie. Elle est
 * proposée à part, jamais confondue avec une date lue, et marquée comme
 * estimée dans la base.
 *
 * Module pur : ni Firebase, ni React.
 */

import { dateValide } from "./justificatifs";

export type LigneSansDate = { id: string; fournisseur?: string; mois?: string; dateOperation?: string; note?: string };

export type DateTrouvee = {
  id: string;
  fournisseur?: string;
  date: string;
  /** « libelle » : lue dans le texte du relevé. « fin-de-mois » : convention. */
  origine: "libelle" | "fin-de-mois";
};

/** Dernier jour du mois AAAA-MM. */
export function finDuMois(mois: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) return "";
  const a = Number(mois.slice(0, 4)), m = Number(mois.slice(5, 7));
  // Le jour 0 du mois suivant est le dernier jour de celui-ci.
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

/**
 * Date inscrite par la banque dans le libellé, ramenée au mois de l'opération.
 *
 * On n'accepte que les dates dont le MOIS correspond à celui de la ligne :
 * un « 28/07 » sur une opération d'août est la date de l'achat, pas celle du
 * débit, et la placer telle quelle rendrait la ligne incohérente avec son
 * mois. Ces cas-là restent à traiter autrement.
 */
export function dateDepuisLibelle(libelle: unknown, mois: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) return "";
  const texte = String(libelle ?? "");
  const annee = mois.slice(0, 4), moisNum = mois.slice(5, 7);
  // Jour et mois, éventuellement suivis d'une année sur deux ou quatre
  // chiffres. Les séparateurs vus sur les relevés : « / », « . », « - ».
  for (const m of texte.matchAll(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?\b/g)) {
    const jour = m[1].padStart(2, "0"), mo = m[2].padStart(2, "0");
    if (mo !== moisNum) continue;
    if (m[3]) {
      const an = m[3].length === 2 ? `20${m[3]}` : m[3];
      if (an !== annee) continue;
    }
    const candidate = `${annee}-${mo}-${jour}`;
    // `dateValide` refuse un 31 avril ou un 30 février : la lecture d'un
    // libellé ne doit pas produire une date qui n'existe pas.
    if (dateValide(candidate)) return candidate;
  }
  return "";
}

/**
 * Ce qu'on peut compléter, et comment.
 *
 * Les deux origines sont séparées pour que le gérant accepte la première les
 * yeux fermés et décide de la seconde en connaissance de cause.
 */
export function planifierCompletionDates(lignes: LigneSansDate[]): { lues: DateTrouvee[]; finDeMois: DateTrouvee[]; sansSolution: LigneSansDate[] } {
  const lues: DateTrouvee[] = [], finDeMois: DateTrouvee[] = [], sansSolution: LigneSansDate[] = [];
  for (const l of lignes) {
    if (dateValide(l.dateOperation)) continue; // déjà datée : on n'y touche pas
    const mois = String(l.mois || "");
    const lue = dateDepuisLibelle(l.fournisseur, mois) || dateDepuisLibelle(l.note, mois);
    if (lue) { lues.push({ id: l.id, fournisseur: l.fournisseur, date: lue, origine: "libelle" }); continue; }
    const fin = finDuMois(mois);
    if (fin) { finDeMois.push({ id: l.id, fournisseur: l.fournisseur, date: fin, origine: "fin-de-mois" }); continue; }
    sansSolution.push(l);
  }
  return { lues, finDeMois, sansSolution };
}
