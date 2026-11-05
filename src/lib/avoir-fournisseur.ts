/**
 * src/lib/avoir-fournisseur.ts — l'avoir d'un fournisseur, joint au
 * remboursement reçu sur le relevé.
 *
 * Octobre 2026 : AVEM (21,12 €), Prusa (57,21 €) et Bricomarché (109,90 €)
 * ont remboursé le club. Le FEC rangeait l'argent au compte du fournisseur
 * et demandait l'avoir à la comptable : la charge et la TVA déductible de
 * l'achat restaient entières. Nicolas joint maintenant l'avoir (PDF ou
 * photo) au crédit classé « Remboursement fournisseur » dans le
 * Rapprochement. Le FEC passe alors :
 *   HA (date de l'avoir) : 401 fournisseur au débit, la charge et la TVA
 *      déductible au crédit — l'achat est annulé pour sa part ;
 *   BQ (date du relevé)  : 512 au débit, 401 au crédit, lettrés avec l'avoir.
 * La TVA de l'avoir vient en moins de la TVA déductible du mois.
 *
 * L'avoir est une pièce du dépôt des justificatifs (collection
 * `justificatifs`) qui porte `avoirFournisseur` : le mois et la clé du
 * crédit du relevé (même format que `cleLigneBancaire` du rapprochement),
 * la catégorie de l'achat annulé. Jamais effacée : retirée au besoin.
 *
 * Sans import, testé (tests/unit/avoir-fournisseur.test.ts).
 */

/** Catégorie d'immobilisation (lib/tableau-depenses) : sa TVA va en case 19. */
const IMMOBILISATION = "Immobilisation — à amortir";

/** Ce que porte la pièce : le rattachement décidé par le gérant. */
export interface RattachementAvoir {
  mois: string;
  /** Clé du crédit du relevé : « JJ/MM/AAAA|libellé|montant », comme `cleLigneBancaire`. */
  cle: string;
  /** Catégorie de l'achat annulé (liste du tableau des opérations). */
  poste: string;
}

export interface AvoirFournisseur {
  pieceId: string;
  mois: string;
  cle: string;
  poste: string;
  fournisseur: string;
  numero: string;
  /** AAAA-MM-JJ lu sur l'avoir, vide si illisible. */
  dateIso: string;
  /** Montant de l'avoir TTC, positif (euros). */
  ttc: number;
  /** TVA de l'avoir, positive (euros) ; 0 si non lue. */
  tva: number;
  immobilisation: boolean;
}

/** Même format que `cleLigneBancaire` (admin/comptabilite/rapprochement-utils). */
export const cleCreditReleve = (c: { date: string; label: string; amount: number }) => `${c.date}|${c.label}|${Number(c.amount).toFixed(2)}`;

const nombre = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(Math.abs(v) * 100) / 100 : null);

/** Les avoirs rattachés à un crédit du mois, lisibles (montant connu), hors pièces retirées. */
export function avoirsDuMois(
  pieces: { id: string; retire?: boolean; extraction?: Record<string, unknown> | null; avoirFournisseur?: RattachementAvoir | null }[],
  mois: string,
): AvoirFournisseur[] {
  const sortie: AvoirFournisseur[] = [];
  for (const p of pieces) {
    const r = p.avoirFournisseur;
    if (!r || p.retire || r.mois !== mois || !r.cle) continue;
    const e = p.extraction || {};
    const ttc = nombre(e.ttc);
    if (!ttc) continue;
    const date = String(e.date || "");
    sortie.push({
      pieceId: p.id, mois: r.mois, cle: r.cle, poste: r.poste || "",
      fournisseur: String(e.fournisseur || ""), numero: String(e.numero || ""),
      dateIso: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
      ttc, tva: Math.min(nombre(e.tva) ?? 0, ttc),
      immobilisation: r.poste === IMMOBILISATION,
    });
  }
  return sortie;
}

/** TVA des avoirs du mois, à retirer de la TVA déductible (cases 19 et 20 de la CA3). */
export function tvaAvoirsDuMois(avoirs: AvoirFournisseur[]): { immobilisations: number; autresBiensServices: number } {
  const ct = (n: number) => Math.round(n * 100);
  let immo = 0, autres = 0;
  for (const a of avoirs) (a.immobilisation ? (immo += ct(a.tva)) : (autres += ct(a.tva)));
  return { immobilisations: immo / 100, autresBiensServices: autres / 100 };
}

/** Le contrôle d'un rattachement avant de l'enregistrer : null si tout va bien, sinon le message. */
export function controleRattachementAvoir(p: { mois: unknown; cle: unknown; poste: unknown; postesPermis: string[]; ttcLu: unknown; montantCredit: number }): string | null {
  if (typeof p.mois !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(p.mois)) return "Mois invalide.";
  if (typeof p.cle !== "string" || !/^\d{2}\/\d{2}\/\d{4}\|.{0,300}\|\d+\.\d{2}$/.test(p.cle)) return "Ligne du relevé invalide.";
  if (typeof p.poste !== "string" || !p.postesPermis.includes(p.poste)) return "Choisissez la catégorie de l'achat annulé.";
  const ttc = nombre(p.ttcLu);
  if (!ttc) return "Le montant de l'avoir n'a pas été lu : corrigez-le avant de rattacher.";
  if (ttc > p.montantCredit * 1.5 + 1) return `L'avoir (${ttc.toFixed(2)} €) dépasse nettement le remboursement reçu (${p.montantCredit.toFixed(2)} €) : est-ce la bonne pièce ?`;
  return null;
}
