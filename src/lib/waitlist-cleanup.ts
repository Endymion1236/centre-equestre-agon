/**
 * src/lib/waitlist-cleanup.ts
 *
 * Retrait des demandes de liste d'attente devenues sans objet : le stage
 * ou le cours a eu lieu, la place ne sera jamais liberee.
 *
 * Sans ce nettoyage, les compteurs 🔔 du planning continuent d'annoncer
 * des familles en attente sur des seances passees.
 *
 * ⚠️ La suppression est DEFINITIVE. Trois garde-fous, parce qu'effacer par
 * erreur une demande encore active la rend invisible pour tout le monde :
 * la famille attend un appel qui ne viendra jamais.
 *
 *   1. Une entree dont on ne peut pas determiner la date n'est JAMAIS
 *      supprimee — dans le doute, on garde.
 *   2. Pour un stage sur plusieurs jours, c'est la date de FIN qui compte,
 *      jamais celle du premier jour.
 *   3. Un delai de grace laisse le temps de reperer une anomalie avant que
 *      la donnee ne parte pour de bon.
 */

/** Jours apres la fin d'une seance avant suppression definitive. */
export const DELAI_GRACE_JOURS = 7;

export interface WaitlistEntry {
  id?: string;
  /** Date du creneau, ou premier jour pour un stage (YYYY-MM-DD). */
  date?: string;
  /** Dernier jour pour un stage multi-jours (YYYY-MM-DD). */
  dateFin?: string;
  status?: string;
  [k: string]: any;
}

/** Dernier jour concerne par la demande, ou null si indeterminable. */
export function dateDeFin(entry: WaitlistEntry): string | null {
  const brute = (entry?.dateFin || entry?.date || "").trim();
  // On exige le format YYYY-MM-DD : une valeur douteuse ne doit pas
  // conduire a supprimer quoi que ce soit.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(brute)) return null;
  return brute;
}

/**
 * La demande est-elle perimee — c'est-a-dire la seance est-elle passee ?
 * Sert a l'AFFICHAGE : effet immediat, aucune donnee touchee.
 */
export function estPerimee(entry: WaitlistEntry, aujourdhui: string): boolean {
  const fin = dateDeFin(entry);
  if (!fin) return false;              // date illisible → on garde
  return fin < aujourdhui;             // le jour meme reste actif
}

/**
 * La demande peut-elle etre SUPPRIMEE definitivement ?
 * Plus strict que `estPerimee` : impose le delai de grace.
 */
export function estSupprimable(
  entry: WaitlistEntry,
  aujourdhui: string,
  delaiJours: number = DELAI_GRACE_JOURS,
): boolean {
  const fin = dateDeFin(entry);
  if (!fin) return false;

  const limite = new Date(`${aujourdhui}T12:00:00`);
  if (Number.isNaN(limite.getTime())) return false;
  limite.setDate(limite.getDate() - delaiJours);

  const limiteISO = limite.toISOString().slice(0, 10);
  return fin < limiteISO;
}

/**
 * Trie les entrees en trois groupes, pour pouvoir rendre compte de ce qui
 * a ete fait plutot que de supprimer en silence.
 */
export function classerWaitlist(
  entries: WaitlistEntry[],
  aujourdhui: string,
  delaiJours: number = DELAI_GRACE_JOURS,
): { actives: WaitlistEntry[]; perimees: WaitlistEntry[]; aSupprimer: WaitlistEntry[] } {
  const actives: WaitlistEntry[] = [];
  const perimees: WaitlistEntry[] = [];
  const aSupprimer: WaitlistEntry[] = [];

  for (const entry of entries || []) {
    if (estSupprimable(entry, aujourdhui, delaiJours)) {
      aSupprimer.push(entry);
      perimees.push(entry);
    } else if (estPerimee(entry, aujourdhui)) {
      perimees.push(entry);
    } else {
      actives.push(entry);
    }
  }
  return { actives, perimees, aSupprimer };
}
