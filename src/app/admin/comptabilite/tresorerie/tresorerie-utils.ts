export const MOIS_SAISON = ["09", "10", "11", "12", "01", "02", "03", "04", "05", "06", "07", "08"] as const;

export const NOMS_MOIS_TRESORERIE: Record<string, string> = {
  "09": "Septembre", "10": "Octobre", "11": "Novembre", "12": "Décembre",
  "01": "Janvier", "02": "Février", "03": "Mars", "04": "Avril",
  "05": "Mai", "06": "Juin", "07": "Juillet", "08": "Août",
};

/** "2026-03" → "2025-2026" (une saison court de septembre à août). */
export function saisonDe(mois: string): string {
  const [annee, numeroMois] = mois.split("-").map(Number);
  return numeroMois >= 9 ? `${annee}-${annee + 1}` : `${annee - 1}-${annee}`;
}

/** ("2025-2026", "03") → "2026-03". */
export function moisDe(saison: string, mm: string): string {
  const [anneeDebut, anneeFin] = saison.split("-");
  return `${Number(mm) >= 9 ? anneeDebut : anneeFin}-${mm}`;
}

export function indexerRelevesParMoisCompte<T extends { mois: string; compte: string }>(releves: T[]) {
  const index = new Map<string, T>();
  releves.forEach((releve) => index.set(`${releve.mois}|${releve.compte}`, releve));
  return index;
}

export function calculerTotauxTresorerieParMois<
  T extends { mois: string; compte: string; montant: number },
>(releves: T[], horsTotal: string[]) {
  const comptesExclus = new Set(horsTotal);
  const totaux = new Map<string, number>();

  releves.forEach((releve) => {
    if (comptesExclus.has(releve.compte)) return;
    totaux.set(releve.mois, (totaux.get(releve.mois) || 0) + Number(releve.montant || 0));
  });

  return totaux;
}

export function saisonsDisponiblesTresorerie<T extends { mois: string }>(
  releves: T[],
  maintenant: Date = new Date(),
) {
  const saisons = new Set(releves.map((releve) => saisonDe(releve.mois)));
  const moisCourant = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, "0")}`;
  saisons.add(saisonDe(moisCourant));
  return [...saisons].sort();
}

export function normaliserComptesTresorerie(lignes: Array<{ nom: string; compte: boolean }>) {
  const comptes = lignes
    .map((ligne) => ({ ...ligne, nom: ligne.nom.trim() }))
    .filter((ligne) => ligne.nom);

  if (comptes.length === 0) {
    return { comptes, erreur: "Au moins un compte" as string | null };
  }
  if (!comptes.some((ligne) => ligne.compte)) {
    return { comptes, erreur: "Au moins un compte doit compter dans le total" as string | null };
  }
  return { comptes, erreur: null as string | null };
}
