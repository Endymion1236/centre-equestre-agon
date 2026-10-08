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

/** Une équipe engagée à un concours : son horaire et les poneys de la journée. */
export interface EngagementConcours {
  equipeId: string;
  /** Heure de passage « HH:MM ». */
  heure?: string;
  /** Poney (surnom) monté par chaque cavalier : cavalierId → poney. */
  poneys: Record<string, string>;
  /** Poney remplaçant de l'équipe (équipes de 4 et paires). */
  remplacant?: string;
  /** Durée du passage en minutes, quand elle diffère de la durée habituelle (paire 30, équipe 45). */
  duree?: number;
  /** Qui fait quoi autour de ce passage (tableau de la journée). */
  roles?: RolesPassage;
}

/** Rôles autour d'un passage. Les noms sont libres (cavalier de la saison, parent, coach…). */
export interface RolesPassage {
  /** Responsable de la préparation des poneys (30 min, avant l'échauffement). */
  respPrepa?: string;
  /** Responsable de l'échauffement (30 min avant le passage). */
  respEchauffement?: string;
  /** 2e responsable de l'échauffement, facultatif. */
  respEchauffement2?: string;
  /** Placeurs de matériel : 1 à 2 cavaliers de la saison (ids). */
  placeurs?: string[];
  juge?: string;
  facteur?: string;
  /** Coach de l'équipe pendant le passage (nom libre). */
  coach?: string;
  /** 2e coach, facultatif. */
  coach2?: string;
  /** Cavalier (id) qui s'occupe du poney remplaçant : préparation, échauffement et passage. */
  cavalierRemplacant?: string;
}

/** Un concours de la saison : son organisation puis ses résultats. */
export interface ResultatConcours {
  id: string;
  nom: string;
  /** ISO « AAAA-MM-JJ ». */
  date: string;
  lieu?: string;
  /** Heure du premier passage, point de départ des horaires automatiques. */
  heureDebut?: string;
  /** Équipes engagées, dans l'ordre de passage. */
  engagements?: EngagementConcours[];
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
  "Découverte", "Poussin", "Benjamin", "Minime", "Cadet", "Junior", "Open", "Senior",
  "Paire découverte", "Paire poussin", "Paire benjamin", "Paire minime", "Paire cadet", "Paire junior", "Paire open",
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
    resultats: s.resultats.map((r) =>
      r.engagements
        ? {
            ...r,
            engagements: r.engagements.map((g) => {
              const { [cavalierId]: _retire, ...poneys } = g.poneys;
              const placeurs = g.roles?.placeurs ?? [];
              if (!placeurs.includes(cavalierId) && g.roles?.cavalierRemplacant !== cavalierId) return { ...g, poneys };
              const { placeurs: _p, cavalierRemplacant, ...autresRoles } = g.roles!;
              const restants = placeurs.filter((id) => id !== cavalierId);
              const roles = {
                ...autresRoles,
                ...(restants.length ? { placeurs: restants } : {}),
                ...(cavalierRemplacant && cavalierRemplacant !== cavalierId ? { cavalierRemplacant } : {}),
              };
              const { roles: _r, ...sansRoles } = g;
              return Object.keys(roles).length ? { ...sansRoles, poneys, roles } : { ...sansRoles, poneys };
            }),
          }
        : r,
    ),
  };
}

/** Retire une équipe et ses lignes dans les résultats. */
export function retirerEquipe(s: SaisonPonyGames, equipeId: string): SaisonPonyGames {
  return {
    ...s,
    equipes: s.equipes.filter((e) => e.id !== equipeId),
    resultats: s.resultats.map((r) => ({
      ...r,
      classements: r.classements.filter((c) => c.equipeId !== equipeId),
      ...(r.engagements ? { engagements: r.engagements.filter((g) => g.equipeId !== equipeId) } : {}),
    })),
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

// ─── Message d'erreur ──────────────────────────────────────────────────────

/** Explique un échec Firestore : un refus d'accès vient de la règle Firebase non publiée. */
export function messageErreurSaison(e: unknown, action: string): string {
  const code = String((e as any)?.code ?? "");
  const msg = String((e as any)?.message ?? "");
  if (code.includes("permission-denied") || /permission/i.test(msg)) {
    return `${action} : Firebase refuse l'accès. La règle « saisons-pony-games » doit être publiée dans la console Firebase (Firestore › Règles).`;
  }
  return `${action}${msg ? ` : ${msg}` : ""}`;
}
