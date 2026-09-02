export interface Depense {
  id: string;
  mois: string;
  poste: string;
  fournisseur: string;
  montant: number;
  note: string;
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
