/**
 * src/lib/ligne-seance.ts — quelle ligne de commande correspond à CETTE
 * séance d'un cavalier ?
 *
 * Octobre 2026, Nicolas : « j'avais préinscrit Lisa MARTINET pour
 * aujourd'hui ; en confirmant, ça a annulé l'inscription et fait un avoir de
 * 26 € alors que rien n'avait été réglé ». La désinscription cherchait la
 * commande de la séance par le TITRE du cours : la préinscription n'en avait
 * pas, elle a pris celle d'une autre semaine du même cours, déjà réglée, en
 * a retiré la ligne et a créé un avoir. Le nettoyage qui suivait annulait
 * de même toute commande à régler contenant le même titre.
 *
 * Règle : une ligne qui porte un créneau ne correspond qu'à ce créneau-là.
 * Le titre ne sert que pour les lignes sans créneau (stages, ancien
 * format), et la date de la séance doit alors figurer dans les dates de la
 * ligne quand elle en a.
 *
 * Module pur, testé seul (tests/unit/ligne-seance.test.ts).
 */

export interface SeanceCible {
  childId: string;
  creneauId?: string | null;
  activityTitle: string;
  /** AAAA-MM-JJ de la séance. */
  date?: string | null;
}

const titreCorrespond = (i: any, t: string) =>
  i?.activityTitle === t || i?.stageKey === t ||
  (t.length > 3 && (String(i?.stageKey || "").includes(t) || String(i?.activityTitle || "").includes(t)));

/** La ligne correspond-elle à la séance ? */
export function ligneDeLaSeance(i: any, s: SeanceCible): boolean {
  if (!i || i.childId !== s.childId) return false;
  if (i.creneauId) return !!s.creneauId && i.creneauId === s.creneauId;
  if (Array.isArray(i.creneauIds) && i.creneauIds.length) return !!s.creneauId && i.creneauIds.includes(s.creneauId);
  if (!titreCorrespond(i, s.activityTitle)) return false;
  const dates: string[] = Array.isArray(i.stageDates) ? i.stageDates.map((d: any) => String(d?.date || "").slice(0, 10)).filter(Boolean) : [];
  if (s.date && dates.length) return dates.includes(s.date);
  if (s.date && i.date) return String(i.date).slice(0, 10) === s.date;
  return true;
}

/**
 * La commande et la ligne de la séance, ou null. Le créneau exact passe
 * avant tout, sur TOUTES les commandes (et non commande par commande, où un
 * titre trouvé dans une autre commande passait devant).
 */
export function trouverLigneLiee<T extends { id: string; status?: string; items?: any[] | null }>(
  commandes: T[],
  s: SeanceCible,
): { commande: T; item: any } | null {
  const vivantes = commandes.filter((p) => p?.status !== "cancelled");
  if (s.creneauId) {
    for (const p of vivantes) {
      const item = (p.items || []).find((i: any) => i?.childId === s.childId && i?.creneauId === s.creneauId);
      if (item) return { commande: p, item };
    }
  }
  for (const p of vivantes) {
    const item = (p.items || []).find((i: any) => ligneDeLaSeance(i, s));
    if (item) return { commande: p, item };
  }
  // Ancien format, sans cavalier sur la ligne : titre exact seulement.
  for (const p of vivantes) {
    const item = (p.items || []).find((i: any) => !i?.childId && !i?.creneauId && typeof i?.activityTitle === "string" && i.activityTitle === s.activityTitle);
    if (item) return { commande: p, item };
  }
  return null;
}
