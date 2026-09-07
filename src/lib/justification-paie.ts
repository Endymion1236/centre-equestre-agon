/**
 * src/lib/justification-paie.ts
 *
 * Salaires et cotisations sociales n'ont pas de « facture » : leur pièce est
 * le bulletin de paie ou l'appel de cotisations, déjà connus de l'écran
 * Masse salariale. Plutôt que d'associer 19 bulletins à la main chaque mois,
 * on reconnaît le débit d'après cet écran : même montant, mois voisin,
 * libellé cohérent. L'état obtenu (« justifiée ailleurs ») n'écrit rien : il
 * est recalculé à chaque lecture, comme l'écran Masse salariale évolue.
 *
 * Décalages admis : un salaire de M est viré fin M ou début M+1 ; une
 * cotisation de M est prélevée entre M et M+3 (MSA trimestrielle).
 */
import type { LigneMois } from "./bilan-justificatifs";

export interface LigneMasseSalariale {
  type: "salaire" | "charge";
  mois: string;
  salarie?: string;
  libelle?: string;
  net?: number | null;
  decaissement?: number | null;
  montant?: number | null;
}
export type JustificationAilleurs = { type: "masse-salariale"; detail: string };

const NOMS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const moisLong = (m: string) => /^\d{4}-\d{2}$/.test(m) ? `${NOMS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}` : m;
export function moisMoins(m: string, n: number): string {
  const [a, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(a, mm - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cents = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? null : Math.round(n * 100);
const RESSEMBLE_SALAIRE = /\b(vir|virement|salaire|salaires|paie|paye|remuneration|acompte)\b/;
const RESSEMBLE_COTISATION = /\b(msa|urssaf|cotis|cotisation|cotisations|tesa|caisse|prelevement|prlv|mutuelle|prevoyance|retraite)\b/;

function candidate(l: LigneMois) {
  return !l.piece && !l.justificatifReleve && !l.rapprochementExclu && !l.depensePersonnelle && Number.isFinite(l.montant) && l.montant > 0 && !!l.mois;
}

export function justifierParMasseSalariale(lignes: LigneMois[], masse: LigneMasseSalariale[]): Map<string, JustificationAilleurs> {
  const resultat = new Map<string, JustificationAilleurs>();
  for (const l of lignes) {
    if (!candidate(l)) continue;
    const montant = cents(l.montant)!;
    const lib = norm(l.fournisseur);
    const fenetreSalaires = [l.mois!, moisMoins(l.mois!, 1)];
    const fenetreCotisations = [0, 1, 2, 3].map(n => moisMoins(l.mois!, n));

    // 1. Le net d'un salarié.
    const salaires = masse.filter(s => s.type === "salaire" && fenetreSalaires.includes(s.mois) && cents(s.net) === montant && s.salarie);
    if (salaires.length) {
      const nommes = salaires.filter(s => norm(s.salarie).split(" ").some(t => t.length >= 3 && lib.includes(t)));
      const choix = nommes.length === 1 ? nommes[0] : nommes.length === 0 && salaires.length === 1 && RESSEMBLE_SALAIRE.test(lib) ? salaires[0] : null;
      if (choix) { resultat.set(l.id, { type: "masse-salariale", detail: `Net à payer de ${choix.salarie}, ${moisLong(choix.mois)}` }); continue; }
    }
    // 2. Tous les salaires du mois en un virement.
    if (RESSEMBLE_SALAIRE.test(lib) || /salaire/.test(norm(l.poste))) {
      const parMois = fenetreSalaires.map(m => {
        const nets = masse.filter(s => s.type === "salaire" && s.mois === m && cents(s.net) != null);
        return { m, n: nets.length, total: nets.reduce((t, s) => t + cents(s.net)!, 0) };
      }).filter(x => x.n >= 2 && x.total === montant);
      if (parMois.length === 1) { resultat.set(l.id, { type: "masse-salariale", detail: `Salaires nets de ${moisLong(parMois[0].m)} (${parMois[0].n} bulletins)` }); continue; }
    }
    // 3. Une cotisation (décaissement d'un organisme), ou toutes celles d'un mois.
    if (RESSEMBLE_COTISATION.test(lib) || /cotis|social/.test(norm(l.poste))) {
      const charges = masse.filter(c => c.type === "charge" && fenetreCotisations.includes(c.mois));
      const une = charges.filter(c => cents(c.decaissement ?? c.montant) === montant);
      if (une.length === 1) { resultat.set(l.id, { type: "masse-salariale", detail: `${une[0].libelle || "Cotisations"}, ${moisLong(une[0].mois)}` }); continue; }
      const parMois = fenetreCotisations.map(m => {
        const cs = charges.filter(c => c.mois === m && cents(c.decaissement ?? c.montant) != null);
        return { m, n: cs.length, total: cs.reduce((t, c) => t + cents(c.decaissement ?? c.montant)!, 0) };
      }).filter(x => x.n >= 2 && x.total === montant);
      if (parMois.length === 1) resultat.set(l.id, { type: "masse-salariale", detail: `Cotisations de ${moisLong(parMois[0].m)} (${parMois[0].n} organismes)` });
    }
  }
  return resultat;
}
