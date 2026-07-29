/**
 * src/app/admin/montoir/horse-history.ts
 *
 * Historique des derniers poneys montes par cavalier.
 *
 * Pourquoi deux sources : l'historique se lisait uniquement dans les notes
 * pedagogiques (`child.peda.notes`). Or ces notes etaient reecrites en bloc
 * a chaque cloture depuis un instantane React parfois perime — une note
 * pouvait donc disparaitre, et le poney avec elle.
 *
 * Les affectations, elles, restent inscrites dans le creneau lui-meme
 * (`creneau.enrolled[].horseName`) et ne sont jamais reecrites en bloc.
 * En croisant les deux, l'historique redevient fiable, y compris pour les
 * seances dont la note a ete perdue.
 */

export interface MonteHistorique {
  horseName: string;
  date: string;       // ISO
  creneauId?: string;
  source: "note" | "creneau";
}

/** Cle de dedoublonnage : un meme creneau ne doit compter qu'une fois. */
const cleMonte = (m: MonteHistorique): string =>
  m.creneauId ? `c:${m.creneauId}` : `d:${m.date.slice(0, 10)}|${m.horseName.toLowerCase()}`;

/**
 * Construit l'historique par cavalier, du plus recent au plus ancien.
 *
 * @param families   familles telles que chargees par le montoir
 * @param creneauxHistorique creneaux des dernieres semaines (hors jour courant)
 * @param max        nombre de montes conservees par cavalier
 */
export function construireHistoriquePoneys(params: {
  families: any[];
  creneauxHistorique: any[];
  max?: number;
}): Record<string, MonteHistorique[]> {
  const { families, creneauxHistorique, max = 4 } = params;
  const parEnfant: Record<string, MonteHistorique[]> = {};

  const pousser = (childId: string, monte: MonteHistorique) => {
    if (!childId || !monte.horseName) return;
    (parEnfant[childId] ||= []).push(monte);
  };

  // ── Source 1 : notes pedagogiques ──────────────────────────────────
  for (const famille of families) {
    for (const enfant of famille.children || []) {
      for (const note of enfant.peda?.notes || []) {
        if (!note?.horseName || !note?.date) continue;
        pousser(enfant.id, {
          horseName: String(note.horseName),
          date: String(note.date),
          creneauId: note.creneauId,
          source: "note",
        });
      }
    }
  }

  // ── Source 2 : affectations inscrites dans les creneaux ────────────
  for (const creneau of creneauxHistorique) {
    if (!creneau?.date) continue;
    for (const inscrit of creneau.enrolled || []) {
      if (!inscrit?.horseName) continue;
      // Un absent n'a pas monte : on ne l'inscrit pas a l'historique.
      if (inscrit.presence === "absent" || inscrit.presence === "absent_nonjustified") continue;
      pousser(inscrit.childId, {
        horseName: String(inscrit.horseName),
        // Midi local : evite qu'un fuseau fasse basculer la date d'un jour.
        date: `${creneau.date}T12:00:00`,
        creneauId: creneau.id,
        source: "creneau",
      });
    }
  }

  // ── Tri, dedoublonnage, troncature ─────────────────────────────────
  const resultat: Record<string, MonteHistorique[]> = {};
  for (const [childId, montes] of Object.entries(parEnfant)) {
    const triees = montes
      .filter((m) => !Number.isNaN(new Date(m.date).getTime()))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Meme creneau vu par les deux sources : on ne le garde qu'une fois.
    const vusCreneaux = new Set<string>();
    const sansDoublon: MonteHistorique[] = [];
    for (const monte of triees) {
      const cle = cleMonte(monte);
      if (vusCreneaux.has(cle)) continue;
      vusCreneaux.add(cle);
      sansDoublon.push(monte);
    }

    // Un cavalier qui remonte le meme poney deux jours de suite : on garde
    // la monte la plus recente, pour afficher des poneys DIFFERENTS.
    const vusPoneys = new Set<string>();
    const final: MonteHistorique[] = [];
    for (const monte of sansDoublon) {
      const clePoney = monte.horseName.toLowerCase();
      if (vusPoneys.has(clePoney)) continue;
      vusPoneys.add(clePoney);
      final.push(monte);
      if (final.length >= max) break;
    }

    resultat[childId] = final;
  }

  return resultat;
}

/** Etiquette courte pour l'affichage : « lun. », « mar. »… */
export function libelleJourCourt(dateISO: string): string {
  const d = new Date(dateISO);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");
}
