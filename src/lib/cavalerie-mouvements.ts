/**
 * src/lib/cavalerie-mouvements.ts — entrées et sorties des équidés
 * (registre d'élevage, onglet « Mouvements » de la cavalerie).
 *
 * Trois questions, sans base ni écran :
 *   - où en est chaque équidé d'après ses mouvements (présent, parti pour un
 *     temps, sorti pour de bon) ;
 *   - quelles sorties temporaires attendent encore un retour, et lesquelles
 *     sont en retard ;
 *   - ce qu'un mouvement change sur la fiche de l'équidé (statut, dates), pour
 *     que la fiche et le registre racontent la même histoire.
 *
 * Testé seul : tests/unit/cavalerie-mouvements.test.ts.
 */

export interface MouvementLike {
  id?: string;
  equideId: string;
  equideName?: string;
  type: "entree" | "sortie";
  /** Timestamp Firestore, Date ou « AAAA-MM-JJ ». */
  date: any;
  motif?: string;
  temporaire?: boolean;
  dateRetour?: any;
  destination?: string;
  provenance?: string;
}

export interface EquideLike {
  id: string;
  name?: string;
  status?: string;
  dateArrivee?: any;
}

/** « AAAA-MM-JJ » d'un Timestamp Firestore, d'une Date ou d'une chaîne. */
export function dateISO(d: any): string {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  if (typeof d?.toDate === "function") return d.toDate().toISOString().slice(0, 10);
  const s = Number(d?.seconds ?? d?._seconds);
  if (s) return new Date(s * 1000).toISOString().slice(0, 10);
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
}

/** Du plus ancien au plus récent ; à date égale, l'ordre de saisie. */
export function trierMouvements<T extends MouvementLike>(mouvements: T[]): T[] {
  return mouvements
    .map((m, i) => ({ m, i }))
    .sort((a, b) => dateISO(a.m.date).localeCompare(dateISO(b.m.date)) || a.i - b.i)
    .map((x) => x.m);
}

export type EtatPresence = "present" | "sorti_temporaire" | "sorti";

export interface SituationEquide {
  equideId: string;
  etat: EtatPresence;
  /** Le mouvement qui fixe l'état (le dernier), s'il y en a un. */
  dernier: MouvementLike | null;
  /** Sortie temporaire : date de retour prévue, et retard par rapport à `aujourdhui`. */
  retourPrevu: string;
  enRetard: boolean;
}

/** L'état de chaque équidé d'après son dernier mouvement. Sans mouvement : présent. */
export function situationEquides(equides: EquideLike[], mouvements: MouvementLike[], aujourdhui: string): Map<string, SituationEquide> {
  const parEquide = new Map<string, MouvementLike[]>();
  for (const m of trierMouvements(mouvements)) {
    if (!m?.equideId) continue;
    const l = parEquide.get(m.equideId) || [];
    l.push(m);
    parEquide.set(m.equideId, l);
  }
  const resultat = new Map<string, SituationEquide>();
  const ids = new Set<string>([...equides.map((e) => e.id), ...parEquide.keys()]);
  for (const id of ids) {
    const liste = parEquide.get(id) || [];
    const dernier = liste.length ? liste[liste.length - 1] : null;
    let etat: EtatPresence = "present";
    let retourPrevu = "";
    let enRetard = false;
    if (dernier?.type === "sortie") {
      if (dernier.temporaire) {
        etat = "sorti_temporaire";
        retourPrevu = dateISO(dernier.dateRetour);
        enRetard = !!retourPrevu && retourPrevu < aujourdhui;
      } else {
        etat = "sorti";
      }
    }
    resultat.set(id, { equideId: id, etat, dernier, retourPrevu, enRetard });
  }
  return resultat;
}

/** Les sorties temporaires qui n'ont pas encore été suivies d'une entrée. */
export function sortiesTemporairesEnCours(mouvements: MouvementLike[]): MouvementLike[] {
  const situation = situationEquides([], mouvements, "9999-12-31");
  return [...situation.values()]
    .filter((s) => s.etat === "sorti_temporaire" && s.dernier)
    .map((s) => s.dernier as MouvementLike);
}

/** Le motif d'entrée qui répond à un motif de sortie temporaire. */
export function motifRetour(motifSortie: string | undefined): string {
  switch (motifSortie) {
    case "Prêt extérieur": return "Retour de prêt";
    case "Concours": return "Retour concours";
    case "Pension extérieure": return "Retour pension";
    default: return "Autre";
  }
}

/**
 * Ce qu'un mouvement change sur la fiche de l'équidé.
 *  - sortie définitive : statut « sorti » (« deces » pour un décès, « retraite »
 *    pour une retraite), date et motif de sortie ;
 *  - sortie temporaire : rien sur la fiche (l'indisponibilité, elle, se
 *    déclare dans son onglet) ;
 *  - entrée : date d'arrivée si la fiche n'en a pas, retour à « actif » si
 *    l'équidé était sorti, et la sortie précédente effacée.
 */
export function champsEquideApresMouvement(equide: EquideLike, m: MouvementLike): Record<string, unknown> {
  const jour = dateISO(m.date);
  if (m.type === "sortie") {
    if (m.temporaire) return {};
    const status = m.motif === "Décès" ? "deces" : m.motif === "Retraite" ? "retraite" : "sorti";
    return { status, dateSortie: jour || null, motifSortie: m.motif || null, available: false };
  }
  const champs: Record<string, unknown> = { dateSortie: null, motifSortie: null };
  if (!dateISO(equide.dateArrivee)) champs.dateArrivee = jour || null;
  if (equide.status === "sorti" || equide.status === "deces" || equide.status === "retraite") {
    champs.status = "actif";
    champs.available = true;
  }
  return champs;
}
