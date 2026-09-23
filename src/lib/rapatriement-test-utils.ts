/**
 * src/lib/rapatriement-test-utils.ts — rapatrier en production le travail
 * fait sur la préversion test : justificatifs, dépenses lues sur les relevés,
 * tableau des opérations. Module pur, sans Firebase : il reçoit ce que lit la
 * route et rend ce qu'il faut créer.
 *
 * Pourquoi : jusqu'au 23/09/2026, justificatifs et relevés n'existaient que
 * sur test. Nicolas y a importé toutes ses pièces, dont une partie n'est dans
 * aucun dossier Drive. La copie production → test existe ; ceci est le seul
 * chemin inverse, borné à ces collections.
 *
 * Règles :
 *   - on ne crée QUE ce qui n'existe pas en production, au même identifiant.
 *     Une pièce a pour identifiant l'empreinte de son fichier, une dépense lue
 *     sur un relevé une empreinte du relevé : ils coïncident d'une base à
 *     l'autre, ce qui rend l'opération rejouable sans doublon ;
 *   - rien n'est jamais modifié ni effacé en production ;
 *   - une association pièce ↔ dépense n'est recréée que si toutes ses pièces
 *     arrivent avec ce rapatriement et que la dépense existe au bout. Sinon la
 *     pièce arrive détachée : un lien vers une dépense absente, ou vers une
 *     dépense déjà liée à une autre pièce en production, serait faux ;
 *   - les dépenses qui ressemblent à une dépense déjà en production (même
 *     mois, même montant, même fournisseur, autre identifiant) sont créées
 *     mais signalées : l'écran des doublons les départagera.
 */

export const COLLECTIONS_RAPATRIEES = [
  "justificatifs",
  "justificatifs-liens",
  "depenses",
  "mouvements-rapprochement",
  "fournisseurs-alias",
  "depenses-doublons-archives",
  "depenses-doublons-lots",
  "depenses-doublons-historique",
  "doublons-ignores",
  "imports-bancaires-liens",
  "imports-bancaires-historique",
  "tableau-depenses-historique",
] as const;

export type CollectionRapatriee = (typeof COLLECTIONS_RAPATRIEES)[number];

export interface DocSimple { id: string; data: Record<string, any> }

/** Champs d'une pièce qui décrivent son rattachement à une dépense. */
export const CHAMPS_ASSOCIATION = ["depenseId", "modeRattachement", "associationMode", "associationEcart", "associationDevise"] as const;

export interface DoublonProbable {
  idTest: string;
  idProd: string;
  mois: string;
  montant: number;
  fournisseur: string;
}

export interface PlanRapatriement {
  aCreer: Record<CollectionRapatriee, DocSimple[]>;
  dejaPresents: Record<CollectionRapatriee, number>;
  /** Pièces créées sans leur association (lien impossible à reproduire). */
  piecesDetachees: string[];
  liensIgnores: number;
  doublonsProbables: DoublonProbable[];
}

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const centimes = (n: unknown) => Math.round(Number(n || 0) * 100);

/** Les identifiants de pièces d'un lien : `pieceIds` pour un règlement groupé, sinon `pieceId`. */
export function piecesDuLien(lien: Record<string, any>): string[] {
  if (Array.isArray(lien.pieceIds) && lien.pieceIds.length) return lien.pieceIds.map(String);
  return lien.pieceId ? [String(lien.pieceId)] : [];
}

export function planifierRapatriement(params: {
  test: Partial<Record<CollectionRapatriee, DocSimple[]>>;
  idsProd: Partial<Record<CollectionRapatriee, Set<string>>>;
  /** Dépenses déjà en production, pour signaler les ressemblances. */
  depensesProd: DocSimple[];
}): PlanRapatriement {
  const aCreer = {} as Record<CollectionRapatriee, DocSimple[]>;
  const dejaPresents = {} as Record<CollectionRapatriee, number>;
  for (const c of COLLECTIONS_RAPATRIEES) {
    const prod = params.idsProd[c] || new Set<string>();
    const docs = params.test[c] || [];
    aCreer[c] = docs.filter((d) => !prod.has(d.id));
    dejaPresents[c] = docs.length - aCreer[c].length;
  }

  // ── Associations ─────────────────────────────────────────────────────
  const piecesNouvelles = new Set(aCreer.justificatifs.map((d) => d.id));
  const depensesAuBout = new Set([
    ...(params.idsProd.depenses || []),
    ...aCreer.depenses.map((d) => d.id),
  ]);
  const liensGardes: DocSimple[] = [];
  let liensIgnores = 0;
  for (const lien of aCreer["justificatifs-liens"]) {
    const pieces = piecesDuLien(lien.data);
    const ok = pieces.length > 0 && pieces.every((id) => piecesNouvelles.has(id)) && depensesAuBout.has(lien.id);
    if (ok) liensGardes.push(lien); else liensIgnores++;
  }
  aCreer["justificatifs-liens"] = liensGardes;

  // Une pièce qui se dit rattachée doit l'être par un lien créé ici.
  const rattacheesOk = new Set<string>();
  for (const lien of liensGardes) for (const id of piecesDuLien(lien.data)) rattacheesOk.add(`${id}|${lien.id}`);
  const piecesDetachees: string[] = [];
  aCreer.justificatifs = aCreer.justificatifs.map((piece) => {
    const depenseId = piece.data.depenseId;
    if (!depenseId || rattacheesOk.has(`${piece.id}|${depenseId}`)) return piece;
    piecesDetachees.push(piece.id);
    const data = { ...piece.data };
    for (const champ of CHAMPS_ASSOCIATION) data[champ] = null;
    return { id: piece.id, data };
  });

  // ── Ressemblances avec la production ─────────────────────────────────
  const cle = (d: Record<string, any>) => `${d.mois}|${centimes(d.montant)}|${norm(d.fournisseur)}`;
  const prodParCle = new Map<string, string>();
  for (const d of params.depensesProd) if (d.data.mois) prodParCle.set(cle(d.data), d.id);
  const doublonsProbables: DoublonProbable[] = [];
  for (const d of aCreer.depenses) {
    const idProd = prodParCle.get(cle(d.data));
    if (idProd && idProd !== d.id) {
      doublonsProbables.push({ idTest: d.id, idProd, mois: String(d.data.mois), montant: centimes(d.data.montant) / 100, fournisseur: String(d.data.fournisseur || "") });
    }
  }

  return { aCreer, dejaPresents, piecesDetachees, liensIgnores, doublonsProbables };
}

/** Les fichiers de pièces à copier : présents en test, absents en production. */
export function fichiersACopier(nomsTest: string[], nomsProd: string[], piecesProd: Set<string>): string[] {
  const prod = new Set(nomsProd);
  return nomsTest.filter((n) => !prod.has(n) && piecesProd.has(n.replace(/^justificatifs-prives\//, "")));
}
