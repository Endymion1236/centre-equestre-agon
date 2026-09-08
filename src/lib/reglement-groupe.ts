/**
 * src/lib/reglement-groupe.ts
 *
 * Un seul prélèvement, plusieurs factures.
 *
 * Le tableau ne connaissait que le cas inverse : une facture réglée en
 * plusieurs échéances. Or un fournisseur régulier — l'aliment, le matériel —
 * solde souvent plusieurs bons de livraison en un prélèvement mensuel
 * unique. Il fallait alors fusionner les factures dans un seul PDF et saisir
 * un total à la main : la lecture de chaque facture était perdue, son numéro
 * et sa TVA avec.
 *
 * Ici, chaque facture reste une pièce entière, avec son fournisseur, son
 * numéro et sa TVA. Ce qui les réunit, c'est le débit qu'elles justifient
 * ensemble.
 *
 * ── Le contrôle qui donne sa valeur au dispositif ─────────────────────────
 *
 * La somme des TTC doit tomber sur le montant du débit AU CENTIME. Sans
 * cette exigence, un règlement groupé mal composé — une facture oubliée, une
 * facture en trop — passerait inaperçu et fausserait la TVA déductible du
 * mois. On refuse donc l'écart, en disant lequel : c'est la seule façon de
 * savoir s'il manque une facture ou s'il y en a une de trop.
 *
 * ── Pourquoi la TVA se totalise ici, alors qu'elle ne se cumule pas pour
 *    un paiement fractionné ──────────────────────────────────────────────
 *
 * Une facture réglée en trois fois ne doit pas voir sa TVA comptée trois
 * fois : c'est pourquoi le tableau la met « à vérifier ». Ici la situation
 * est l'inverse et sans risque : chaque facture n'est payée qu'une fois, et
 * chacune apporte sa propre TVA. La somme est donc exacte — à condition que
 * toutes les pièces aient une TVA lue, sinon on n'annonce aucun total.
 *
 * Module pur : ni Firebase, ni React.
 */

import { alertesIdentification, type PieceExtraite } from "./justificatifs";

export type PieceDuGroupe = {
  id: string;
  nom?: string;
  extraction?: PieceExtraite | null;
  retire?: boolean;
  depenseId?: string | null;
  paiementsAssocies?: { id: string; montant: number }[];
};

export type VerdictGroupe = {
  ok: boolean;
  /** Somme des TTC des pièces retenues, en euros. */
  total: number;
  /** Total − débit : positif s'il y a une facture de trop, négatif s'il en manque. */
  ecart: number;
  /** Somme des TVA, ou null si l'une des pièces n'a pas de TVA lue. */
  tva: number | null;
  erreurs: string[];
};

const c = (n: number) => Math.round(n * 100) / 100;
const eur = (n: number) => `${n.toFixed(2)} €`;

/**
 * Ces pièces justifient-elles ensemble ce débit ?
 *
 * `debitId` sert à ne pas reprocher à une pièce d'être déjà associée… à ce
 * débit-là : recomposer un groupe existant doit rester possible.
 */
export function verifierReglementGroupe(pieces: PieceDuGroupe[], montantDebit: number, debitId?: string): VerdictGroupe {
  const erreurs: string[] = [];
  const vide = { ok: false, total: 0, ecart: 0, tva: null, erreurs };

  if (!Number.isFinite(montantDebit) || montantDebit <= 0) {
    erreurs.push("Le débit doit être un montant positif.");
    return vide;
  }
  if (pieces.length < 2) {
    erreurs.push("Un règlement groupé réunit au moins deux factures. Pour une seule, utilisez « Facture ou bulletin — paiement unique ».");
    return vide;
  }
  if (new Set(pieces.map(p => p.id)).size !== pieces.length) {
    erreurs.push("La même facture est présente deux fois dans le groupe.");
    return vide;
  }

  let total = 0, tva: number | null = 0;
  for (const p of pieces) {
    const nom = p.nom || "pièce";
    const e = p.extraction;
    if (p.retire) { erreurs.push(`${nom} : pièce archivée, restaurez-la ou retirez-la du groupe.`); continue; }
    if (p.depenseId && p.depenseId !== debitId) { erreurs.push(`${nom} : déjà rattachée à un autre paiement.`); continue; }
    if (p.paiementsAssocies?.some(a => a.id !== debitId)) { erreurs.push(`${nom} : déjà répartie sur des échéances, elle ne peut pas entrer dans un groupe.`); continue; }
    if (!e) { erreurs.push(`${nom} : pas encore lue, lancez sa lecture avant de la grouper.`); continue; }
    if (e.typeDocument !== "achat") { erreurs.push(`${nom} : lue comme « ${e.typeDocument || "inconnu"} », seules des factures d'achat se groupent.`); continue; }
    if (e.devise !== "EUR") { erreurs.push(`${nom} : facture en devise étrangère, à traiter séparément.`); continue; }
    const alertes = alertesIdentification(e);
    if (alertes.length) { erreurs.push(`${nom} : ${alertes[0]}`); continue; }
    if (e.ttc === null || e.ttc <= 0) { erreurs.push(`${nom} : montant TTC absent ou négatif.`); continue; }
    total = c(total + e.ttc);
    // Une seule TVA manquante et le total n'a plus de sens : on l'abandonne
    // plutôt que d'annoncer une somme incomplète.
    tva = tva === null || typeof e.tva !== "number" || !Number.isFinite(e.tva) ? null : c(tva + e.tva);
  }

  const ecart = c(total - montantDebit);
  if (!erreurs.length && Math.round(ecart * 100) !== 0) {
    erreurs.push(ecart > 0
      ? `Le total des factures dépasse le débit de ${eur(ecart)} : ${eur(total)} contre ${eur(montantDebit)}. Une facture est en trop, ou l'une d'elles n'appartient pas à ce règlement.`
      : `Il manque ${eur(Math.abs(ecart))} pour atteindre le débit : ${eur(total)} contre ${eur(montantDebit)}. Une facture du règlement n'a pas encore été importée, ou n'est pas sélectionnée.`);
  }
  return { ok: !erreurs.length, total, ecart, tva, erreurs };
}

/** Résumé affichable d'un groupe en cours de composition. */
export function resumeGroupe(v: VerdictGroupe, montantDebit: number): string {
  if (v.ok) return `${eur(v.total)} — le total correspond exactement au débit${v.tva !== null ? `, dont ${eur(v.tva)} de TVA` : " (TVA à compléter sur une des factures)"}.`;
  if (!v.total) return `Débit à justifier : ${eur(montantDebit)}.`;
  return `${eur(v.total)} sélectionnés sur ${eur(montantDebit)}.`;
}
