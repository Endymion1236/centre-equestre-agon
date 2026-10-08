// Recherche d'un équidé dans la cavalerie : par surnom, nom officiel, SIRE,
// puce ou race, sans tenir compte des majuscules ni des accents
// (« eclair » trouve « Éclair »).

export function simplifierRecherche(s: unknown): string {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function equideCorrespond(
  e: { name?: string; surnom?: string; sire?: string; puce?: string; race?: string },
  recherche: string,
): boolean {
  const q = simplifierRecherche(recherche);
  if (!q) return true;
  return [e.surnom, e.name, e.sire, e.puce, e.race].some((champ) => simplifierRecherche(champ).includes(q));
}
