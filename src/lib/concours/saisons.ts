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
  /**
   * Quand un cavalier enchaîne deux sessions avec des poneys différents : qui
   * prépare et échauffe son poney de cette session à sa place.
   * Clé = cavalier qui monte ; valeur = cavalier qui prépare (ou « X »).
   */
  preparateurs?: Record<string, string>;
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
  /**
   * Catégorie et indice dans lesquels une équipe a couru CE concours, quand
   * ils diffèrent de ceux de sa fiche (équipe changée de catégorie en cours de
   * saison). Clé = id de l'équipe. Absent : la catégorie de la fiche.
   */
  categoriesFigees?: Record<string, CategorieCourue>;
}

/** Catégorie et indice d'une équipe à un concours donné. */
export interface CategorieCourue {
  categorie: string;
  indice: string;
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
              const { roles: anciens, ...sansRoles } = g;
              const roles = anciens ? rolesSansCavalier(anciens, cavalierId) : undefined;
              return roles ? { ...sansRoles, poneys, roles } : { ...sansRoles, poneys };
            }),
          }
        : r,
    ),
  };
}

/** Rôles d'un passage sans ce cavalier (placeur, remplaçant, préparateur ou préparé) ; undefined s'il ne reste rien. */
function rolesSansCavalier(roles: RolesPassage, cavalierId: string): RolesPassage | undefined {
  const { placeurs, cavalierRemplacant, preparateurs, ...autres } = roles;
  const restants = (placeurs ?? []).filter((id) => id !== cavalierId);
  const prep = Object.fromEntries(
    Object.entries(preparateurs ?? {}).filter(([monte, prepare]) => monte !== cavalierId && prepare !== cavalierId),
  );
  const out: RolesPassage = {
    ...autres,
    ...(restants.length ? { placeurs: restants } : {}),
    ...(cavalierRemplacant && cavalierRemplacant !== cavalierId ? { cavalierRemplacant } : {}),
    ...(Object.keys(prep).length ? { preparateurs: prep } : {}),
  };
  return Object.keys(out).length ? out : undefined;
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
      ...(r.categoriesFigees ? { categoriesFigees: sansCle(r.categoriesFigees, equipeId) } : {}),
    })),
  };
}

function sansCle<T>(o: Record<string, T>, cle: string): Record<string, T> {
  const { [cle]: _retire, ...reste } = o;
  return reste;
}

// ─── Catégorie courue à chaque concours ───────────────────────────────────
// Une équipe peut changer de catégorie en cours de saison (Fred et Nico :
// « Paire découverte » au premier concours, « Club 2 » ensuite). Les concours
// déjà courus gardent la catégorie d'alors, pour que le classement de fin de
// saison range chaque point dans la catégorie où il a été gagné.

/** L'équipe a couru (ou est engagée à) ce concours. */
export function participeAuConcours(r: ResultatConcours, equipeId: string): boolean {
  return r.classements.some((c) => c.equipeId === equipeId) || (r.engagements ?? []).some((g) => g.equipeId === equipeId);
}

/** Catégorie et indice de l'équipe à ce concours : ceux figés pour lui, sinon ceux de la fiche. */
export function categorieAuConcours(r: ResultatConcours, equipe: EquipeSaison): CategorieCourue {
  const f = r.categoriesFigees?.[equipe.id];
  return f ? { categorie: f.categorie, indice: f.indice } : { categorie: equipe.categorie, indice: equipe.indice };
}

/** L'équipe telle qu'elle a couru ce concours (catégorie et indice d'alors). */
export function equipeAuConcours(r: ResultatConcours, equipe: EquipeSaison): EquipeSaison {
  return { ...equipe, ...categorieAuConcours(r, equipe) };
}

/** Pose la catégorie courue à un concours ; identique à la fiche (ou null) → retirée. */
export function poserCategorieAuConcours(
  s: SaisonPonyGames,
  resultatId: string,
  equipeId: string,
  valeur: CategorieCourue | null,
): SaisonPonyGames {
  const equipe = s.equipes.find((e) => e.id === equipeId);
  if (!equipe) return s;
  const v = valeur && { categorie: valeur.categorie.trim(), indice: valeur.indice.trim() };
  const commeLaFiche = !v || (v.categorie === equipe.categorie.trim() && v.indice === equipe.indice.trim());
  return {
    ...s,
    resultats: s.resultats.map((r) => {
      if (r.id !== resultatId) return r;
      const autres = sansCle(r.categoriesFigees ?? {}, equipeId);
      return { ...r, categoriesFigees: commeLaFiche ? autres : { ...autres, [equipeId]: v! } };
    }),
  };
}

/**
 * Remplace la fiche d'une équipe. Si sa catégorie ou son indice change, les
 * concours déjà passés (date antérieure à aujourd'hui) où elle a couru gardent
 * l'ancienne catégorie ; ceux d'aujourd'hui et à venir prennent la nouvelle.
 */
export function modifierEquipe(s: SaisonPonyGames, apres: EquipeSaison, aujourdhuiIso: string): SaisonPonyGames {
  const avant = s.equipes.find((e) => e.id === apres.id);
  const equipes = s.equipes.map((e) => (e.id === apres.id ? apres : e));
  if (!avant) return { ...s, equipes };
  const change = avant.categorie.trim() !== apres.categorie.trim() || avant.indice.trim() !== apres.indice.trim();
  if (!change) return { ...s, equipes };
  return {
    ...s,
    equipes,
    resultats: s.resultats.map((r) => {
      const figee = r.categoriesFigees?.[apres.id];
      if (figee) {
        // Déjà figée : la retirer si elle redevient celle de la fiche.
        const pareil = figee.categorie.trim() === apres.categorie.trim() && figee.indice.trim() === apres.indice.trim();
        return pareil ? { ...r, categoriesFigees: sansCle(r.categoriesFigees!, apres.id) } : r;
      }
      if (!(r.date < aujourdhuiIso) || !participeAuConcours(r, apres.id)) return r;
      return {
        ...r,
        categoriesFigees: { ...(r.categoriesFigees ?? {}), [apres.id]: { categorie: avant.categorie.trim(), indice: avant.indice.trim() } },
      };
    }),
  };
}

/** Concours passés où l'équipe a couru dans une autre catégorie que celle de sa fiche. */
export function concoursAutreCategorie(s: SaisonPonyGames, equipe: EquipeSaison): { concours: ResultatConcours; categorie: CategorieCourue }[] {
  return resultatsTries(s)
    .filter((r) => r.categoriesFigees?.[equipe.id] && participeAuConcours(r, equipe.id))
    .map((r) => ({ concours: r, categorie: categorieAuConcours(r, equipe) }));
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
  /** L'équipe avec la catégorie et l'indice de cette ligne du classement. */
  equipe: EquipeSaison;
  pointsTotal: number;
  nbConcours: number;
  meilleurRang?: number;
  /** Concours comptés sur cette ligne (une équipe changée de catégorie a une ligne par catégorie courue). */
  concoursIds: string[];
}

const SANS_CATEGORIE = "Sans catégorie";
const trierBilans = (l: BilanEquipe[]) =>
  l.sort((a, b) => b.pointsTotal - a.pointsTotal || a.equipe.nom.localeCompare(b.equipe.nom, "fr") || a.equipe.indice.localeCompare(b.equipe.indice, "fr"));
const grouper = (bilans: BilanEquipe[]) => {
  const parCategorie = new Map<string, BilanEquipe[]>();
  for (const b of bilans) {
    const cle = b.equipe.categorie.trim() || SANS_CATEGORIE;
    parCategorie.set(cle, [...(parCategorie.get(cle) ?? []), b]);
  }
  return [...parCategorie.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "fr"))
    .map(([categorie, equipes]) => ({ categorie, equipes: trierBilans(equipes) }));
};

/**
 * Classement de la saison : points cumulés groupés par catégorie (ordre
 * alphabétique), du plus grand total au plus petit. Chaque concours compte
 * dans la catégorie où l'équipe l'a couru : une équipe passée de « Paire
 * découverte » à « Club 2 » a une ligne dans chacune, avec ses points de
 * chacune. Une équipe figure toujours dans sa catégorie actuelle, à 0 si elle
 * n'y a pas encore couru.
 */
export function bilanSaison(s: SaisonPonyGames): { categorie: string; equipes: BilanEquipe[] }[] {
  const bilans: BilanEquipe[] = [];
  for (const equipe of s.equipes) {
    const lignes = new Map<string, BilanEquipe>();
    const ligne = (c: CategorieCourue) => {
      const cle = `${c.categorie.trim()}|${c.indice.trim()}`;
      let b = lignes.get(cle);
      if (!b) {
        b = { equipe: { ...equipe, categorie: c.categorie, indice: c.indice }, pointsTotal: 0, nbConcours: 0, concoursIds: [] };
        lignes.set(cle, b);
      }
      return b;
    };
    for (const r of resultatsTries(s)) {
      const c = r.classements.find((x) => x.equipeId === equipe.id);
      if (!c) continue;
      const b = ligne(categorieAuConcours(r, equipe));
      b.nbConcours++;
      b.concoursIds.push(r.id);
      b.pointsTotal = Math.round((b.pointsTotal + (c.points ?? 0)) * 100) / 100;
      if (c.rang !== undefined && (b.meilleurRang === undefined || c.rang < b.meilleurRang)) b.meilleurRang = c.rang;
    }
    ligne({ categorie: equipe.categorie, indice: equipe.indice });
    bilans.push(...lignes.values());
  }
  return grouper(bilans);
}

/**
 * Les équipes rangées par leur catégorie ACTUELLE (fiche), une ligne par
 * équipe, avec tous les points de la saison : liste des équipes, choix des
 * équipes à engager.
 */
export function equipesParCategorie(s: SaisonPonyGames): { categorie: string; equipes: BilanEquipe[] }[] {
  return grouper(s.equipes.map((equipe): BilanEquipe => {
    const b: BilanEquipe = { equipe, pointsTotal: 0, nbConcours: 0, concoursIds: [] };
    for (const r of s.resultats) {
      const c = r.classements.find((x) => x.equipeId === equipe.id);
      if (!c) continue;
      b.nbConcours++;
      b.concoursIds.push(r.id);
      b.pointsTotal = Math.round((b.pointsTotal + (c.points ?? 0)) * 100) / 100;
      if (c.rang !== undefined && (b.meilleurRang === undefined || c.rang < b.meilleurRang)) b.meilleurRang = c.rang;
    }
    return b;
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
