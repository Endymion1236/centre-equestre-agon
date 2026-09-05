export interface Depense {
  id: string;
  mois: string;
  poste: string;
  fournisseur: string;
  montant: number;
  note: string;
  /** "saisie" (à la main) ou "releve-bancaire" (débit lu sur un relevé). */
  source?: string;
  /** Date de l'opération telle que lue sur le relevé (absente sur les saisies). */
  dateOperation?: string;
}

/* ── Doublons ──────────────────────────────────────────────────────────────
 * Le même relevé PDF déposé deux fois dans Trésorerie renvoyait deux fois
 * chaque débit vers ici : la matrice doublait sans prévenir. Une dépense est
 * identifiée par (mois, libellé normalisé, montant) — le poste n'en fait pas
 * partie, une recatégorisation ne crée pas une nouvelle dépense. */

/** "  EDF - Prélèvement  " → "edf prelevement" (accents, casse, ponctuation). */
export function normaliserLibelle(libelle: unknown): string {
  return String(libelle ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface DepenseCle {
  mois: string;
  fournisseur?: string;
  montant: number | string;
}

export function empreinteDepense(d: DepenseCle): string {
  const montant = Math.round((Number(String(d.montant).replace(",", ".")) || 0) * 100) / 100;
  return `${d.mois}|${normaliserLibelle(d.fournisseur)}|${montant.toFixed(2)}`;
}

/**
 * Garde-fou d'import : ne retient du lot que les lignes qui ne sont pas déjà
 * enregistrées. Compte par empreinte : deux pleins identiques le même mois
 * restent possibles (le lot en porte deux, la base une → une seule ajoutée),
 * mais un relevé déjà importé ne repasse pas.
 */
export function filtrerNouvellesLignes<T extends DepenseCle>(
  existantes: DepenseCle[],
  lot: T[],
): { aAjouter: T[]; doublons: T[] } {
  const restantes = new Map<string, number>();
  for (const e of existantes) {
    const k = empreinteDepense(e);
    restantes.set(k, (restantes.get(k) || 0) + 1);
  }
  const aAjouter: T[] = [];
  const doublons: T[] = [];
  for (const l of lot) {
    const k = empreinteDepense(l);
    const n = restantes.get(k) || 0;
    if (n > 0) {
      restantes.set(k, n - 1);
      doublons.push(l);
    } else {
      aAjouter.push(l);
    }
  }
  return { aAjouter, doublons };
}

export interface GroupeDoublons {
  empreinte: string;
  mois: string;
  fournisseur: string;
  montant: number;
  /** Toutes les lignes du groupe, la plus ancienne (id) d'abord. */
  lignes: Depense[];
  /** Celles à retirer pour n'en garder qu'une. */
  enTrop: Depense[];
  /** Postes rencontrés (un relevé réimporté peut avoir été recatégorisé). */
  postes: string[];
}

/** Lignes déjà en base qui se répètent (mois, libellé, montant) — doublons
 *  probables d'un double import. Le montant zéro et les lignes sans
 *  fournisseur sont ignorés : trop ambigus pour être proposés au retrait. */
export function trouverDoublons(depenses: Depense[]): GroupeDoublons[] {
  const parEmpreinte = new Map<string, Depense[]>();
  for (const d of depenses) {
    if (!normaliserLibelle(d.fournisseur) || !(Number(d.montant) > 0)) continue;
    const k = empreinteDepense(d);
    const g = parEmpreinte.get(k);
    if (g) g.push(d); else parEmpreinte.set(k, [d]);
  }
  const groupes: GroupeDoublons[] = [];
  for (const [empreinte, lignes] of parEmpreinte) {
    if (lignes.length < 2) continue;
    const triees = [...lignes].sort((a, b) => a.id.localeCompare(b.id));
    groupes.push({
      empreinte,
      mois: triees[0].mois,
      fournisseur: triees[0].fournisseur,
      montant: Number(triees[0].montant) || 0,
      lignes: triees,
      enTrop: triees.slice(1),
      postes: [...new Set(triees.map((l) => l.poste))],
    });
  }
  return groupes.sort((a, b) => b.mois.localeCompare(a.mois) || b.montant - a.montant);
}

/** Montant qui disparaîtrait de la matrice si l'on retirait les lignes en trop. */
export function totalEnTrop(groupes: GroupeDoublons[]): number {
  return groupes.reduce((t, g) => t + g.enTrop.reduce((s, l) => s + (Number(l.montant) || 0), 0), 0);
}

export interface PosteDepense {
  nom: string;
  ref: number | null;
}

export const MOIS_EXERCICE = ["07", "08", "09", "10", "11", "12", "01", "02", "03", "04", "05", "06"] as const;

export const NOMS_MOIS: Record<string, string> = {
  "07": "Juil", "08": "Août", "09": "Sept", "10": "Oct", "11": "Nov", "12": "Déc",
  "01": "Janv", "02": "Févr", "03": "Mars", "04": "Avr", "05": "Mai", "06": "Juin",
};

export const NOMS_MOIS_LONGS: Record<string, string> = {
  "07": "Juillet", "08": "Août", "09": "Septembre", "10": "Octobre", "11": "Novembre", "12": "Décembre",
  "01": "Janvier", "02": "Février", "03": "Mars", "04": "Avril", "05": "Mai", "06": "Juin",
};

export function exerciceDe(mois: string): string {
  const [annee, numeroMois] = mois.split("-").map(Number);
  return numeroMois >= 7 ? `${annee}-${annee + 1}` : `${annee - 1}-${annee}`;
}

export function moisDe(exercice: string, mm: string): string {
  const [anneeDebut, anneeFin] = exercice.split("-");
  return `${Number(mm) >= 7 ? anneeDebut : anneeFin}-${mm}`;
}

export function moisCourant(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function formaterEuros(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
}

export function exercicesDisponibles(depenses: Depense[], courant = moisCourant()): string[] {
  const exercices = new Set(depenses.map((depense) => exerciceDe(depense.mois)));
  exercices.add(exerciceDe(courant));
  return [...exercices].sort();
}

export function construirePostes(
  postesDefaut: PosteDepense[],
  depenses: Depense[],
  postesPerso: string[],
): PosteDepense[] {
  const connus = new Set(postesDefaut.map((poste) => poste.nom));
  const extra = [...new Set([...depenses.map((depense) => depense.poste), ...postesPerso])]
    .filter((poste) => poste && !connus.has(poste))
    .sort((a, b) => a.localeCompare(b, "fr"));
  return [...postesDefaut, ...extra.map((nom) => ({ nom, ref: null }))];
}

export function facturesDe(depenses: Depense[], poste: string, mois: string): Depense[] {
  return depenses.filter((depense) => depense.poste === poste && depense.mois === mois);
}

export function totalDe(depenses: Depense[], poste: string, mois: string): number {
  return facturesDe(depenses, poste, mois).reduce((total, facture) => total + Number(facture.montant || 0), 0);
}

export function nombreMoisEcoules(exercice: string, courant = moisCourant()): number {
  return MOIS_EXERCICE.filter((mm) => moisDe(exercice, mm) <= courant).length;
}

export function attenduAdate(referenceAnnuelle: number | null, moisEcoules: number): number | null {
  return referenceAnnuelle == null ? null : referenceAnnuelle * moisEcoules / 12;
}

export function posteEnDepassement(cumul: number, attendu: number | null, seuil = 1.1): boolean {
  return attendu != null && cumul > attendu * seuil;
}

export function cumulPoste(depenses: Depense[], poste: string, exercice: string): number {
  return MOIS_EXERCICE.reduce((total, mm) => total + totalDe(depenses, poste, moisDe(exercice, mm)), 0);
}

export function totalMois(depenses: Depense[], postes: PosteDepense[], exercice: string, mm: string): number {
  const mois = moisDe(exercice, mm);
  return postes.reduce((total, poste) => total + totalDe(depenses, poste.nom, mois), 0);
}
