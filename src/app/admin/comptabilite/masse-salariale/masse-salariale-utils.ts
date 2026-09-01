export const MOIS_EXERCICE = ["07", "08", "09", "10", "11", "12", "01", "02", "03", "04", "05", "06"] as const;

export const NOMS_MOIS_MASSE: Record<string, string> = {
  "09": "Septembre", "10": "Octobre", "11": "Novembre", "12": "Décembre",
  "01": "Janvier", "02": "Février", "03": "Mars", "04": "Avril",
  "05": "Mai", "06": "Juin", "07": "Juillet", "08": "Août",
};

export const REF_JOURNAL_PAIE: Record<string, number> = {
  "07": 6363.70, "08": 5795.39, "09": 5015.90, "10": 5267.13, "11": 5150.41, "12": 2746.30,
  "01": 2375.88, "02": 4239.69, "03": 2641.46, "04": 3160.75, "05": 4381.50, "06": 5358.43,
};
export const REF_CHARGES_PERSONNEL_AN = 109330.29;
const REF_JOURNAL_TOTAL = Object.values(REF_JOURNAL_PAIE).reduce((s, v) => s + v, 0);

export function refBilanMois(mm: string): number {
  return (REF_JOURNAL_PAIE[mm] / REF_JOURNAL_TOTAL) * REF_CHARGES_PERSONNEL_AN;
}

export function exerciceDe(mois: string): string {
  const [annee, numeroMois] = mois.split("-").map(Number);
  return numeroMois >= 7 ? `${annee}-${annee + 1}` : `${annee - 1}-${annee}`;
}

export function moisDeExercice(exercice: string, mm: string): string {
  const [anneeDebut, anneeFin] = exercice.split("-");
  return `${Number(mm) >= 7 ? anneeDebut : anneeFin}-${mm}`;
}

export function moisCourantMasse(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

type LigneMasse = {
  type: "salaire" | "charge";
  mois: string;
  brut: number;
  coutEmployeur: number | null;
  montant: number | null;
};

export function calculerMasseParMois(lignes: LigneMasse[], mode: "brut" | "cout") {
  const totalParMois = new Map<string, number>();
  const moisPartiels = new Set<string>();

  lignes.forEach((ligne) => {
    if (ligne.type === "charge") {
      if (mode === "cout") {
        totalParMois.set(ligne.mois, (totalParMois.get(ligne.mois) || 0) + Number(ligne.montant || 0));
      }
      return;
    }

    const valeur = mode === "cout" ? (ligne.coutEmployeur ?? ligne.brut) : ligne.brut;
    totalParMois.set(ligne.mois, (totalParMois.get(ligne.mois) || 0) + Number(valeur || 0));
    if (mode === "cout" && ligne.coutEmployeur == null) moisPartiels.add(ligne.mois);
  });

  return { totalParMois, moisPartiels };
}

export function exercicesDisponiblesMasse<T extends { mois: string }>(
  lignes: T[],
  maintenant: Date = new Date(),
) {
  const exercices = new Set(lignes.map((ligne) => exerciceDe(ligne.mois)));
  exercices.add(exerciceDe(moisCourantMasse(maintenant)));
  return [...exercices].sort();
}

export function lignesSalaireDuMois<T extends { type: "salaire" | "charge"; mois: string; salarie: string }>(
  lignes: T[],
  mois: string,
) {
  return lignes
    .filter((ligne) => ligne.type !== "charge" && ligne.mois === mois)
    .sort((a, b) => a.salarie.localeCompare(b.salarie, "fr"));
}

export function lignesChargeDuMois<T extends { type: "salaire" | "charge"; mois: string; libelle: string }>(
  lignes: T[],
  mois: string,
) {
  return lignes
    .filter((ligne) => ligne.type === "charge" && ligne.mois === mois)
    .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"));
}
