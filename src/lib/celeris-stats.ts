/**
 * src/lib/celeris-stats.ts — ce qu'un mois tenu dans Céleris apporte aux
 * statistiques : ventes facturées et règlements clients encaissés.
 *
 * Novembre 2026 : l'écran Statistiques ne lisait que l'application ; juillet
 * et août 2026 (avant la bascule) y comptaient pour zéro. Les écritures
 * importées (historiqueComptableCeleris, montants en CENTIMES) donnent :
 *   - facturé : le TTC du journal des ventes (411 au débit, journal VTE) ;
 *   - encaissé : ce qui solde les clients hors journal des ventes (411 au
 *     crédit), réparti par mode d'après le compte de trésorerie de la même
 *     pièce (comptes relevés sur les exports de juillet-août 2026).
 * Une remise en banque (5112 → 512) ne touche pas le 411 : jamais comptée.
 *
 * Pur, sans import, testé (tests/unit/celeris-stats.test.ts).
 */

export interface LigneCeleris { journal: string; compte: string; piece: string; date: string; debit: number; credit: number }

export interface ResumeCeleris {
  mois: string;
  /** Euros. */
  factureTTC: number;
  encaisse: number;
  parMode: Record<string, number>;
}

/** Mode de règlement d'après le compte de trésorerie de Céleris. */
export function modeDuCompteCeleris(compte: string): string {
  if (compte.startsWith("51125")) return "cb_terminal";
  if (compte.startsWith("51121")) return "cheque";
  if (compte.startsWith("51122")) return "cheque_vacances";
  if (compte.startsWith("531")) return "especes";
  if (compte.startsWith("58")) return "cb_online";
  if (compte.startsWith("512")) return "virement";
  return "autre";
}

const eur = (centimes: number) => Math.round(centimes) / 100;

export function resumeCelerisMois(mois: string, lignes: LigneCeleris[]): ResumeCeleris {
  let facture = 0, encaisse = 0;
  const parMode: Record<string, number> = {};
  const pieces = new Map<string, LigneCeleris[]>();
  for (const l of lignes || []) {
    if (l.journal === "VTE") {
      if (l.compte.startsWith("411")) facture += l.debit - l.credit;
      // Vente au comptant passée sans compte client : facturée ET encaissée.
      if (l.compte.startsWith("5")) {
        const m = l.debit - l.credit;
        facture += m; encaisse += m;
        const mode = modeDuCompteCeleris(l.compte);
        parMode[mode] = (parMode[mode] || 0) + m;
      }
      continue;
    }
    const cle = `${l.journal}|${l.piece}|${l.date}`;
    pieces.set(cle, [...(pieces.get(cle) || []), l]);
  }
  for (const ls of pieces.values()) {
    // Règlement client : le 411 est crédité (débité pour un remboursement).
    const regle = ls.filter((l) => l.compte.startsWith("411")).reduce((s, l) => s + l.credit - l.debit, 0);
    if (regle === 0) continue;
    encaisse += regle;
    const treso = ls.filter((l) => l.compte.startsWith("5"));
    const totalTreso = treso.reduce((s, l) => s + l.debit - l.credit, 0);
    if (!treso.length || totalTreso === 0) { parMode.autre = (parMode.autre || 0) + regle; continue; }
    // Réparti au prorata des comptes de trésorerie de la pièce.
    for (const l of treso) {
      const mode = modeDuCompteCeleris(l.compte);
      parMode[mode] = (parMode[mode] || 0) + (regle * (l.debit - l.credit)) / totalTreso;
    }
  }
  return { mois, factureTTC: eur(facture), encaisse: eur(encaisse), parMode: Object.fromEntries(Object.entries(parMode).map(([k, v]) => [k, eur(v)])) };
}

/** Somme des mois Céleris d'une année, et détail par mois (index 0 = janvier). */
export function celerisPourAnnee(resumes: ResumeCeleris[], annee: number) {
  const mois = (resumes || []).filter((r) => r.mois.startsWith(`${annee}-`));
  const factureParMois = Array.from({ length: 12 }, () => 0);
  const parMode: Record<string, number> = {};
  let facture = 0, encaisse = 0;
  for (const r of mois) {
    const k = Number(r.mois.slice(5, 7)) - 1;
    factureParMois[k] += r.factureTTC;
    facture += r.factureTTC; encaisse += r.encaisse;
    for (const [m, v] of Object.entries(r.parMode)) parMode[m] = Math.round(((parMode[m] || 0) + v) * 100) / 100;
  }
  return { mois: mois.map((r) => r.mois).sort(), factureParMois, facture: Math.round(facture * 100) / 100, encaisse: Math.round(encaisse * 100) / 100, parMode };
}
