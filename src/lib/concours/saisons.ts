// =============================================================================
// Saisons de Pony Games — logique pure (aucun accès Firestore ici)
// -----------------------------------------------------------------------------
// Une saison (« 2026/2027 ») est un dossier qui regroupe :
//   - les cavaliers engagés cette saison (saisis à la main) ;
//   - les équipes (nom, catégorie, indice, cavaliers) ;
//   - les résultats de chaque concours (rang et points de chaque équipe).
// Les chevaux n'y figurent pas : ils changent d'un concours à l'autre et se
// choisissent dans l'organisation de la journée.
// =============================================================================

export interface CavalierSaison {
  id: string;
  prenom: string;
  nom?: string;
}

export interface EquipeSaison {
  id: string;
  nom: string;
  /** « Poussin », « Benjamin », « Paire minime »… texte libre. */
  categorie: string;
  /** « Club 4 », « Club 2 », « Élite »… texte libre. */
  indice: string;
  cavalierIds: string[];
}

export interface ClassementEquipe {
  equipeId: string;
  /** Place obtenue (1 = premier). Absent : non classée ou pas encore saisie. */
  rang?: number;
  points?: number;
}

export interface ResultatConcours {
  id: string;
  nom: string;
  /** ISO « AAAA-MM-JJ ». */
  date: string;
  lieu?: string;
  classements: ClassementEquipe[];
}

export interface SaisonPonyGames {
  id: string;
  /** « 2026/2027 ». */
  nom: string;
  cavaliers: CavalierSaison[];
  equipes: EquipeSaison[];
  resultats: ResultatConcours[];
}

/** Suggestions proposées à la saisie ; toute autre valeur reste acceptée. */
export const CATEGORIES_SUGGEREES = [
  "Poussin", "Benjamin", "Minime", "Cadet", "Open", "Senior",
  "Paire poussin", "Paire benjamin", "Paire minime", "Paire cadet", "Paire open",
];
export const INDICES_SUGGERES = ["Club 4", "Club 3", "Club 2", "Club 1", "Club Élite", "Poney 2", "Poney 1", "Poney Élite"];

// ─── Nom de saison ─────────────────────────────────────────────────────────

/** « 2026/2027 » pour une saison commençant en 2026. */
export function nomSaison(anneeDebut: number): string {
  return `${anneeDebut}/${anneeDebut + 1}`;
}

/** Une saison va du 1er septembre au 31 août. `dateIso` : « AAAA-MM-JJ ». */
export function saisonDeLaDate(dateIso: string): string {
  const annee = Number(dateIso.slice(0, 4));
  const mois = Number(dateIso.slice(5, 7));
  return nomSaison(mois >= 9 ? annee : annee - 1);
}

/** Accepte « 2026/2027 », « 2026-2027 », « 2026 / 2027 » ; renvoie la forme canonique ou null. */
export function normaliserNomSaison(saisie: string): string | null {
  const m = saisie.trim().match(/^(\d{4})\s*[/\-–]\s*(\d{4})$/);
  if (!m) return null;
  const debut = Number(m[1]);
  if (Number(m[2]) !== debut + 1) return null;
  return nomSaison(debut);
}

/** Saison à proposer à la création : la saison en cours si elle n'existe pas, sinon la suivante libre. */
export function saisonAProposer(existantes: string[], aujourdhuiIso: string): string {
  let debut = Number(saisonDeLaDate(aujourdhuiIso).slice(0, 4));
  while (existantes.includes(nomSaison(debut))) debut++;
  return nomSaison(debut);
}

/** Plus récente d'abord. */
export function trierSaisons<T extends { nom: string }>(saisons: T[]): T[] {
  return [...saisons].sort((a, b) => b.nom.localeCompare(a.nom));
}

// ─── Modifications (chaque fonction renvoie une nouvelle saison) ───────────

/** Retire un cavalier de la saison et de toutes ses équipes. */
export function retirerCavalier(s: SaisonPonyGames, cavalierId: string): SaisonPonyGames {
  return {
    ...s,
    cavaliers: s.cavaliers.filter((c) => c.id !== cavalierId),
    equipes: s.equipes.map((e) => ({ ...e, cavalierIds: e.cavalierIds.filter((id) => id !== cavalierId) })),
  };
}

/** Retire une équipe et ses lignes dans les résultats. */
export function retirerEquipe(s: SaisonPonyGames, equipeId: string): SaisonPonyGames {
  return {
    ...s,
    equipes: s.equipes.filter((e) => e.id !== equipeId),
    resultats: s.resultats.map((r) => ({ ...r, classements: r.classements.filter((c) => c.equipeId !== equipeId) })),
  };
}

/** Pose le rang et/ou les points d'une équipe à un concours (crée la ligne si besoin, la retire si vide). */
export function saisirClassement(
  s: SaisonPonyGames,
  resultatId: string,
  equipeId: string,
  valeurs: { rang?: number; points?: number },
): SaisonPonyGames {
  return {
    ...s,
    resultats: s.resultats.map((r) => {
      if (r.id !== resultatId) return r;
      const autres = r.classements.filter((c) => c.equipeId !== equipeId);
      const ligne: ClassementEquipe = { equipeId };
      if (valeurs.rang !== undefined) ligne.rang = valeurs.rang;
      if (valeurs.points !== undefined) ligne.points = valeurs.points;
      const vide = ligne.rang === undefined && ligne.points === undefined;
      return { ...r, classements: vide ? autres : [...autres, ligne] };
    }),
  };
}

/** Lit un champ numérique saisi : vide ou invalide → undefined ; accepte la virgule. */
export function lireNombre(saisie: string): number | undefined {
  const t = saisie.trim().replace(",", ".");
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Concours dans l'ordre chronologique. */
export function resultatsTries(s: SaisonPonyGames): ResultatConcours[] {
  return [...s.resultats].sort((a, b) => a.date.localeCompare(b.date) || a.nom.localeCompare(b.nom, "fr"));
}

// ─── Bilan de la saison ────────────────────────────────────────────────────

export interface BilanEquipe {
  equipe: EquipeSaison;
  pointsTotal: number;
  nbConcours: number;
  meilleurRang?: number;
}

/**
 * Points cumulés par équipe, groupés par catégorie (ordre alphabétique),
 * et dans chaque catégorie du plus grand total au plus petit.
 */
export function bilanSaison(s: SaisonPonyGames): { categorie: string; equipes: BilanEquipe[] }[] {
  const bilans = s.equipes.map((equipe): BilanEquipe => {
    let pointsTotal = 0;
    let nbConcours = 0;
    let meilleurRang: number | undefined;
    for (const r of s.resultats) {
      const c = r.classements.find((x) => x.equipeId === equipe.id);
      if (!c) continue;
      nbConcours++;
      pointsTotal += c.points ?? 0;
      if (c.rang !== undefined && (meilleurRang === undefined || c.rang < meilleurRang)) meilleurRang = c.rang;
    }
    return { equipe, pointsTotal: Math.round(pointsTotal * 100) / 100, nbConcours, meilleurRang };
  });

  const parCategorie = new Map<string, BilanEquipe[]>();
  for (const b of bilans) {
    const cle = b.equipe.categorie.trim() || "Sans catégorie";
    parCategorie.set(cle, [...(parCategorie.get(cle) ?? []), b]);
  }
  return [...parCategorie.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "fr"))
    .map(([categorie, equipes]) => ({
      categorie,
      equipes: equipes.sort((a, b) => b.pointsTotal - a.pointsTotal || a.equipe.nom.localeCompare(b.equipe.nom, "fr")),
    }));
}

/** « Zoé Martin, Léo » — noms des cavaliers d'une équipe, dans l'ordre de l'équipe. */
export function nomsCavaliers(s: SaisonPonyGames, equipe: EquipeSaison): string[] {
  return equipe.cavalierIds
    .map((id) => s.cavaliers.find((c) => c.id === id))
    .filter((c): c is CavalierSaison => !!c)
    .map((c) => [c.prenom, c.nom].filter(Boolean).join(" "));
}

/** Équipes dont fait partie un cavalier (pour l'afficher dans la liste des cavaliers). */
export function equipesDuCavalier(s: SaisonPonyGames, cavalierId: string): EquipeSaison[] {
  return s.equipes.filter((e) => e.cavalierIds.includes(cavalierId));
}
