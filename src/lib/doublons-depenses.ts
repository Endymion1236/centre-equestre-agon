import type { DepenseCandidate } from "./justificatifs";
import { dateValide } from "./justificatifs";
const nom = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// « Carte », « Prlv », « Vir »… décrivent le moyen de paiement, pas le
// fournisseur : la même échéance Groupama arrive une fois « Groupama Centre
// Manche » et une fois « Prlv Groupama Centre Manche » selon la lecture. On
// retire ces préfixes, autant de fois qu'ils se répètent, sans rapprochement
// approximatif sur le reste.
const PREFIXES = /^(?:(?:prlv|prelevement|prelvt|vir|virement|sepa|cb|carte|paiement|fact|facture|echeance|ech|chq|cheque)\s+)+/;
export const fournisseurNormalise = (s: string) => nom(s).replace(PREFIXES, "");
const fournisseur = fournisseurNormalise;

/**
 * Deux libellés désignent-ils le même commerçant ?
 *
 * L'égalité stricte ne voyait pas les doublons les plus courants du club :
 * le même relevé importé deux fois, une fois par CSV et une fois par PDF,
 * arrive avec des libellés TRONQUÉS À DES LONGUEURS DIFFÉRENTES —
 * « Anthropic San Franci » et « Anthropic San Francisco », « Elevenlabs.io »
 * et « Elevenlabs.io New Yo », « Lemonde.fr » et « Lemonde.fr Paris ». Le
 * gérant les voyait à l'œil nu, l'écran de contrôle non.
 *
 * On accepte donc qu'un libellé soit le début de l'autre, ou que les deux
 * partagent deux mots significatifs (« Action Coutance » et « Action 4307
 * Coutance »), ou encore que leurs premiers mots se répondent en étant
 * coupés au milieu d'un mot — « Dhl Intern Vad Le Bo » et « Dhl
 * International » : le second débit DHL du même jour, au même montant,
 * échappait au contrôle parce que « Intern » n'est ni « International » ni
 * le début de tout le libellé. Cela reste un SIGNALEMENT : rien n'est
 * supprimé sans décision, et la reprise automatique garde ses propres
 * conditions, bien plus strictes.
 */
const motsCles = (s: string) => s.split(" ").filter(m => m.length >= 4 && !/^\d+$/.test(m));

/** Le même mot, ou l'un coupé au début de l'autre (« Intern » / « International »). */
const memeMot = (a: string, b: string) =>
  a === b || (a.length >= 4 && b.startsWith(a)) || (b.length >= 4 && a.startsWith(b));

/**
 * Les libellés commencent-ils par les mêmes mots, chacun pouvant être
 * tronqué ? On aligne mot à mot depuis le début ; il faut au moins DEUX
 * mots qui se répondent, formant un tronc d'au moins huit caractères. Un
 * seul mot ne suffit pas : « Groupama Centre Manche » et « Groupama Sud »
 * sont deux contrats, pas un doublon.
 */
const memeDebut = (x: string, y: string) => {
  const ta = x.split(" "), tb = y.split(" ");
  let i = 0;
  while (i < ta.length && i < tb.length && memeMot(ta[i], tb[i])) i++;
  return i >= 2 && ta.slice(0, i).join(" ").length >= 8;
};

export function memeCommercant(a: string, b: string): boolean {
  const x = fournisseur(a), y = fournisseur(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // Troncature : l'un commence l'autre, sur une longueur qui nomme vraiment
  // quelqu'un (« Uep » ou « Sarl » ne suffiraient pas).
  const court = x.length < y.length ? x : y, long = court === x ? y : x;
  if (court.length >= 8 && long.startsWith(court)) return true;
  // Premiers mots communs, même coupés : « Dhl Intern Vad Le Bo » / « Dhl International ».
  if (memeDebut(x, y)) return true;
  // Libellés remaniés autour des mêmes mots : « Action 4307 Coutance ».
  const ma = motsCles(x), mb = motsCles(y);
  return ma.filter(m => mb.includes(m)).length >= 2;
}
export function doublonPossible(a: DepenseCandidate, b: DepenseCandidate): boolean {
  if (a.operationsDistinctesDe?.includes(b.id) || b.operationsDistinctesDe?.includes(a.id)) return false;
  return a.id !== b.id && a.source === "releve-bancaire" && b.source === a.source && !!a.mois && a.mois === b.mois
    && Number.isFinite(a.montant) && Number.isFinite(b.montant) && Math.round(a.montant * 100) === Math.round(b.montant * 100)
    && memeCommercant(a.fournisseur || "", b.fournisseur || "")
    && (!a.compte || !b.compte || a.compte === b.compte)
    && (!a.dateOperation || !b.dateOperation || a.dateOperation === b.dateOperation);
}

export type PropositionDoublon = { conserver: DepenseCandidate; ecarter: DepenseCandidate };
const releve = (s: string) => nom(s.replace(/\s*\(\d+\)(?=\.pdf\s*$)/i, ""));
/** Un couple unique de deux copies nommées du même relevé ; aucune décision sur les groupes répétés. */
export function preparerLotDoublons(lignes: DepenseCandidate[], lies: Set<string>) {
  const propositions: PropositionDoublon[] = [];
  const groupes = groupesDoublons(lignes);
  for (const g of groupes) {
    if (g.length !== 2 || !doublonPossible(g[0], g[1])) continue;
    const [a, b] = g;
    if (!a.note || !b.note || a.note === b.note || !/\.pdf\s*$/i.test(a.note) || !/\.pdf\s*$/i.test(b.note) || releve(a.note) !== releve(b.note)) continue;
    // Garder la ligne datée, sans perdre un compte connu ni une association.
    const candidats = g.filter(x => dateValide(x.dateOperation));
    if (candidats.length !== 1) continue;
    const conserver = candidats[0], ecarter = conserver.id === a.id ? b : a;
    if (lies.has(ecarter.id) || (ecarter.compte && !conserver.compte)) continue;
    propositions.push({ conserver, ecarter });
  }
  propositions.sort((a, b) => a.ecarter.id.localeCompare(b.ecarter.id));
  return { propositions, groupesManuels: groupes.length - propositions.length };
}
export function groupesDoublons(lignes: DepenseCandidate[]) {
  const groupes = new Map<string, DepenseCandidate[]>();
  for (const l of lignes) {
    if (l.source !== "releve-bancaire") continue;
    // On ne groupe plus sur le libellé : deux troncatures différentes
    // tomberaient dans deux groupes distincts et ne se rencontreraient
    // jamais. Le montant et le mois suffisent à former des lots courts, que
    // `doublonPossible` départage ensuite libellé par libellé.
    const cle = JSON.stringify([l.mois, Math.round(l.montant * 100)]);
    groupes.set(cle, [...(groupes.get(cle) || []), l]);
  }
  // Un groupe peut réunir deux commerçants sans rapport au même montant : on
  // ne garde que les lignes qui ont vraiment un jumeau.
  return [...groupes.values()]
    .map(g => g.filter(a => g.some(b => doublonPossible(a, b))))
    .filter(g => g.length > 1);
}
