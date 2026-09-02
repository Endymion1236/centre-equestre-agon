export interface MoisResultat {
  mois: string;
  ca: number;
  masse: number;
  depenses: number;
}

export const REF_BILAN = { ca: 277163, personnel: 109330, ebe: 35990 } as const;
export const MOIS_EXERCICE = ["07", "08", "09", "10", "11", "12", "01", "02", "03", "04", "05", "06"] as const;
export const NOMS_MOIS: Record<string, string> = {
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

export function exercicesDisponibles(donnees: MoisResultat[], courant = moisCourant()): string[] {
  const exercices = new Set(donnees.map((ligne) => exerciceDe(ligne.mois)));
  exercices.add(exerciceDe(courant));
  return [...exercices].sort();
}

export interface LigneResultat {
  mois: string;
  mm: string;
  futur: boolean;
  ca: number;
  masse: number;
  depenses: number;
}

export function construireLignesResultat(
  donnees: MoisResultat[],
  exercice: string,
  courant = moisCourant(),
): LigneResultat[] {
  const parMois = new Map(donnees.map((ligne) => [ligne.mois, ligne]));
  return MOIS_EXERCICE.map((mm) => {
    const mois = moisDe(exercice, mm);
    const ligne = parMois.get(mois);
    return {
      mois,
      mm,
      futur: mois > courant,
      ca: Number(ligne?.ca || 0),
      masse: Number(ligne?.masse || 0),
      depenses: Number(ligne?.depenses || 0),
    };
  });
}

export function resumerResultat(lignes: LigneResultat[]) {
  const passees = lignes.filter((ligne) => !ligne.futur);
  const cumul = passees.reduce(
    (total, ligne) => ({
      ca: total.ca + ligne.ca,
      masse: total.masse + ligne.masse,
      depenses: total.depenses + ligne.depenses,
    }),
    { ca: 0, masse: 0, depenses: 0 },
  );
  const reste = cumul.ca - cumul.masse - cumul.depenses;
  const pctMasse = cumul.ca > 0 ? Math.round((cumul.masse / cumul.ca) * 100) : null;
  return { cumul, reste, pctMasse };
}

export function resultatMensuel(ligne: Pick<LigneResultat, "ca" | "masse" | "depenses">) {
  const reste = ligne.ca - ligne.masse - ligne.depenses;
  const pctMasse = ligne.ca > 0 ? Math.round((ligne.masse / ligne.ca) * 100) : null;
  return { reste, pctMasse };
}
