/**
 * Onglet Échéances : les prélèvements SEPA à venir, à côté des échéances
 * CB / chèque.
 *
 * L'onglet ne suivait que les échéances réglées au club ; celles d'un forfait
 * en prélèvement vivaient seules dans Prélèvements SEPA › Échéancier, et
 * Nicolas ne retrouvait pas un échéancier qu'il venait de créer (septembre
 * 2026). Elles y apparaissent en lecture : elles se règlent par la remise
 * bancaire, pas au guichet.
 *
 * Un prélèvement « en attente » dont la date est passée n'a pas été mis en
 * remise : il est signalé, sinon il ne serait jamais prélevé.
 */

export interface PrelevementSepa {
  id: string;
  familyId?: string;
  familyName?: string;
  mandatId?: string;
  montant?: number;
  dateEcheance?: string;
  status?: string;
  description?: string;
  echeance?: number;
  echeancesTotal?: number;
}

export interface FamillePrelevee {
  familyId: string;
  familyName: string;
  lignes: (PrelevementSepa & { nonRemis: boolean })[];
  total: number;
  prochaineDate: string | null;
  nbNonRemis: number;
  mandats: string[];
}

export interface StatsPrelevements {
  totalCeMois: number;
  countCeMois: number;
  totalNonRemis: number;
  countNonRemis: number;
  total: number;
  nbFamilles: number;
}

const A_VENIR = new Set(["pending", "remis"]);
const arrondi = (n: number) => Math.round(n * 100) / 100;

export function grouperPrelevementsSepa(
  echeances: PrelevementSepa[],
  opts: { search?: string; today: string },
): { familles: FamillePrelevee[]; stats: StatsPrelevements } {
  const mois = opts.today.slice(0, 7);
  const aVenir = echeances.filter(e => A_VENIR.has(String(e.status || "")));

  const parFamille = new Map<string, FamillePrelevee>();
  for (const e of aVenir) {
    const cle = e.familyId || e.familyName || "?";
    let f = parFamille.get(cle);
    if (!f) {
      f = { familyId: e.familyId || "", familyName: e.familyName || "Famille inconnue", lignes: [], total: 0, prochaineDate: null, nbNonRemis: 0, mandats: [] };
      parFamille.set(cle, f);
    }
    const nonRemis = e.status === "pending" && !!e.dateEcheance && e.dateEcheance < opts.today;
    f.lignes.push({ ...e, nonRemis });
  }

  const stats: StatsPrelevements = { totalCeMois: 0, countCeMois: 0, totalNonRemis: 0, countNonRemis: 0, total: 0, nbFamilles: parFamille.size };
  for (const f of parFamille.values()) {
    f.lignes.sort((a, b) => String(a.dateEcheance || "").localeCompare(String(b.dateEcheance || "")));
    f.total = arrondi(f.lignes.reduce((s, l) => s + (Number(l.montant) || 0), 0));
    f.prochaineDate = f.lignes[0]?.dateEcheance || null;
    f.nbNonRemis = f.lignes.filter(l => l.nonRemis).length;
    f.mandats = [...new Set(f.lignes.map(l => l.mandatId).filter((m): m is string => !!m))];
    for (const l of f.lignes) {
      const m = Number(l.montant) || 0;
      stats.total += m;
      if (l.nonRemis) { stats.totalNonRemis += m; stats.countNonRemis++; }
      if (String(l.dateEcheance || "").startsWith(mois)) { stats.totalCeMois += m; stats.countCeMois++; }
    }
  }
  stats.total = arrondi(stats.total);
  stats.totalCeMois = arrondi(stats.totalCeMois);
  stats.totalNonRemis = arrondi(stats.totalNonRemis);

  const q = (opts.search || "").trim().toLowerCase();
  const familles = [...parFamille.values()]
    .filter(f => !q || f.familyName.toLowerCase().includes(q))
    // Les oubliés de remise d'abord, puis par prochaine date.
    .sort((a, b) => (b.nbNonRemis > 0 ? 1 : 0) - (a.nbNonRemis > 0 ? 1 : 0)
      || String(a.prochaineDate || "").localeCompare(String(b.prochaineDate || "")));

  return { familles, stats };
}
