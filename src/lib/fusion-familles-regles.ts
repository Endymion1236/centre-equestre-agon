/**
 * src/lib/fusion-familles-regles.ts — règles de fusion lisibles côté
 * navigateur.
 *
 * `fusion-familles.ts` importe firebase-admin (serveur) : un écran qui en
 * importe une fonction, même pure, casse la construction du site (Avoirs,
 * 19/10/2026 : « Can't resolve 'fs' », plus aucun déploiement). Ce qui doit
 * servir à un écran vit ici, sans aucun import.
 */

/**
 * Tous les identifiants sous lesquels une même famille a pu être enregistrée :
 * la fiche elle-même, celle qui l'a absorbée le cas échéant, et toutes celles
 * absorbées par l'une ou l'autre. Une commande, un avoir, une réservation
 * peut encore porter l'ancien identifiant ; chercher « les commandes de la
 * famille » doit regarder tous ces identifiants (COSTEGROSSE, 19/10/2026 :
 * l'avoir sur une fiche, la commande du stage sur l'autre, « aucune commande
 * à créditer »).
 */
export function identifiantsRattaches(
  familyId: string,
  fiches: { id: string; status?: string | null; mergedInto?: string | null }[],
): string[] {
  const parId = new Map(fiches.map((f) => [f.id, f]));
  // Remonter jusqu'à la fiche vivante.
  let racine = familyId;
  const vus = new Set<string>();
  while (!vus.has(racine)) {
    vus.add(racine);
    const f = parId.get(racine);
    if (f?.status === "merged" && f.mergedInto) racine = f.mergedInto;
    else break;
  }
  const ids = new Set<string>([familyId, racine]);
  // Puis toutes les fiches absorbées par la racine, de proche en proche.
  let ajout = true;
  while (ajout) {
    ajout = false;
    for (const f of fiches) {
      if (f.status === "merged" && f.mergedInto && ids.has(f.mergedInto) && !ids.has(f.id)) { ids.add(f.id); ajout = true; }
    }
  }
  return [...ids];
}

// ─── Un même cavalier présent deux fois dans une fiche ─────────────────────
// Novembre 2026 : après le rattachement de la fiche du bureau au compte Google
// d'une famille, sa fille unique (Cléa) figurait deux fois sur la fiche. La
// fusion reconnaît un même cavalier par prénom + date de naissance ; deux
// dates saisies différemment (ou décalées d'un jour par le fuseau horaire)
// donnaient deux cavaliers. Ces règles servent à les réunir après coup.

const normPrenom = (s: unknown) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Date de naissance en « AAAA-MM-JJ », lue en heure de Paris ; "" si absente ou illisible. */
export function dateNaissanceCle(b: unknown): string {
  if (!b) return "";
  if (typeof b === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.trim())) return b.trim();
  const v = b as { toDate?: () => Date; seconds?: number };
  const d = typeof v?.toDate === "function" ? v.toDate()
    : typeof v?.seconds === "number" ? new Date(v.seconds * 1000)
    : new Date(b as string | number | Date);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Écart en jours entre deux dates « AAAA-MM-JJ ». */
const ecartJours = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000;

/**
 * Deux fiches de cavalier désignent-elles la même personne ? Même prénom (sans
 * accents ni majuscules) et dates de naissance compatibles : identiques, à un
 * jour près (décalage de fuseau d'une date enregistrée à minuit), ou absentes
 * d'un côté. Deux dates nettement différentes = deux enfants (jumeaux exclus :
 * ils n'ont pas le même prénom).
 */
export function memeCavalier(a: { firstName?: unknown; birthDate?: unknown }, b: { firstName?: unknown; birthDate?: unknown }): boolean {
  const pa = normPrenom(a?.firstName), pb = normPrenom(b?.firstName);
  if (!pa || pa !== pb) return false;
  const da = dateNaissanceCle(a.birthDate), db = dateNaissanceCle(b.birthDate);
  return !da || !db || ecartJours(da, db) <= 1;
}

/** Les cavaliers d'une fiche qui apparaissent plusieurs fois : groupes d'ids (≥ 2), dans l'ordre de la fiche. */
export function cavaliersEnDouble(children: { id?: string; firstName?: unknown; birthDate?: unknown }[]): string[][] {
  const groupes: { id?: string; firstName?: unknown; birthDate?: unknown }[][] = [];
  for (const c of children || []) {
    if (!c?.id) continue;
    const g = groupes.find((x) => memeCavalier(x[0], c));
    if (g) g.push(c); else groupes.push([c]);
  }
  return groupes.filter((g) => g.length > 1).map((g) => g.map((c) => c.id!));
}

const vide = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

/** Le cavalier gardé, complété de ce que seul le doublon savait (date de naissance, niveau, santé…). */
export function completerCavalier<T extends Record<string, unknown>>(garde: T, doublon: Record<string, unknown>): T {
  const sortie: Record<string, unknown> = { ...garde };
  for (const [cle, valeur] of Object.entries(doublon || {})) {
    if (cle === "id" || vide(valeur)) continue;
    if (vide(sortie[cle])) sortie[cle] = valeur;
  }
  return sortie as T;
}

/**
 * Ce qui change dans un document (commande, carte, forfait, réservation…)
 * quand le doublon `ancienId` devient le cavalier `garde` : le champ
 * `childId`, les lignes `items[].childId` d'une commande, une liste
 * `childIds`. null : le document ne parle pas du doublon.
 */
export function repointerCavalier(
  data: { childId?: unknown; items?: unknown; childIds?: unknown },
  ancienId: string,
  garde: { id: string; nom: string },
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  if (data?.childId === ancienId) { patch.childId = garde.id; patch.childName = garde.nom; }
  if (Array.isArray(data?.items) && data.items.some((it: any) => it?.childId === ancienId)) {
    patch.items = data.items.map((it: any) => (it?.childId === ancienId ? { ...it, childId: garde.id, childName: garde.nom } : it));
  }
  if (Array.isArray(data?.childIds) && data.childIds.includes(ancienId)) {
    patch.childIds = [...new Set(data.childIds.map((x: unknown) => (x === ancienId ? garde.id : x)))];
  }
  return Object.keys(patch).length ? patch : null;
}

/**
 * Les places d'un créneau après la réunion des deux cavaliers. Si les deux
 * étaient inscrits au même créneau (une seule personne ne prend qu'une place),
 * la place du doublon est libérée et comptée dans `doublesRetires`.
 */
export function placesApresReunion(
  enrolled: any[],
  familyId: string,
  ancienId: string,
  garde: { id: string; nom: string },
): { enrolled: any[]; change: boolean; doublesRetires: number } {
  const liste = Array.isArray(enrolled) ? enrolled : [];
  if (!liste.some((e) => e?.familyId === familyId && e?.childId === ancienId)) return { enrolled: liste, change: false, doublesRetires: 0 };
  const dejaLa = liste.some((e) => e?.familyId === familyId && e?.childId === garde.id);
  let doublesRetires = 0;
  const sortie = liste.flatMap((e) => {
    if (e?.familyId !== familyId || e?.childId !== ancienId) return [e];
    if (dejaLa) { doublesRetires++; return []; }
    return [{ ...e, childId: garde.id, childName: garde.nom }];
  });
  return { enrolled: sortie, change: true, doublesRetires };
}
