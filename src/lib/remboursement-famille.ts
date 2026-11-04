/**
 * src/lib/remboursement-famille.ts — un virement rendu à une famille, vu du
 * relevé bancaire.
 *
 * Septembre 2026 : « Virement émis WEB besse fanny » et « VIR INST vers
 * gautier thierry - remboursement promenade non effectuee » (57 € chacun)
 * partaient au 47100000 « débit non classé ». Ce ne sont pas des dépenses :
 * c'est de l'argent rendu à un client, au 41100000.
 *
 * Deux cas :
 *  - le remboursement est aussi enregistré dans l'application (annulation
 *    d'une commande, mode « remboursement_virement » ou « _cheque ») : le
 *    journal des règlements a déjà sorti l'argent de la banque (411 / 512),
 *    le débit du relevé n'est pas repris ;
 *  - il ne l'est pas : le débit passe 411 / 512 avec le nom lu sur le
 *    relevé, et une remarque invite à le rattacher à la commande.
 *
 * Sans import, testé (tests/unit/remboursement-famille.test.ts).
 */

/** La catégorie du tableau des opérations (Dépenses). */
export const CATEGORIE_REMBOURSEMENT_FAMILLE = "Remboursement à une famille";

/** Modes d'un remboursement enregistré dans l'application qui sortent par la banque. */
const MODES_PAR_LA_BANQUE = new Set(["remboursement_virement", "remboursement_cheque"]);

export interface RemboursementEnregistre {
  id: string;
  /** Positif. */
  montant: number;
  /** AAAA-MM-JJ */
  dateIso: string;
  familyName?: string;
}

/** Les remboursements par virement ou chèque du journal des encaissements, hors ceux annulés. */
export function remboursementsDuJournal(encaissements: any[], dateDe: (e: any) => string | null): RemboursementEnregistre[] {
  const annules = new Set(encaissements.filter((e) => e?.correctionDe).map((e) => String(e.correctionDe)));
  return encaissements
    .filter((e) => e?.id && MODES_PAR_LA_BANQUE.has(String(e.mode || "")) && Number(e.montant) < 0 && !e.correctionDe && !annules.has(String(e.id)))
    .map((e) => ({ id: String(e.id), montant: Math.abs(Number(e.montant)), dateIso: dateDe(e) || "", familyName: e.familyName }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.dateIso));
}

const norm = (s: unknown) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Le nom de la famille dans un libellé de virement émis : « Virement émis WEB besse fanny » → « besse fanny ». */
export function nomDuVirementEmis(libelle: unknown): string {
  const t = String(libelle || "").split(/\s+-\s+/)[0];
  // Mots de la banque, autant de fois qu'ils se suivent : « Virement émis VIR INST vers … ».
  return t.replace(/^\s*(?:(?:virement|vir|[ée]mis|web|inst|sepa|vers)\s+)+/i, "").replace(/\s+/g, " ").trim();
}

/**
 * Chaque débit « remboursement » retrouve au plus un remboursement du journal :
 * même montant, 15 jours au plus, le nom de la famille d'abord, la date la plus proche ensuite.
 */
export function apparierRemboursements(
  debits: { id: string; montant: number; dateOperation?: string; fournisseur?: string }[],
  remboursements: RemboursementEnregistre[],
  joursMax = 15,
): Map<string, RemboursementEnregistre | null> {
  const ct = (n: number) => Math.round(n * 100);
  const jours = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000;
  const pris = new Set<string>();
  const resultat = new Map<string, RemboursementEnregistre | null>();
  for (const d of debits) {
    const nom = norm(nomDuVirementEmis(d.fournisseur));
    const memeNom = (r: RemboursementEnregistre) => {
      const mots = norm(r.familyName).split(" ").filter((m) => m.length >= 3);
      return mots.length > 0 && mots.some((m) => nom.split(" ").includes(m));
    };
    const candidats = remboursements
      .filter((r) => !pris.has(r.id) && ct(r.montant) === ct(d.montant) && d.dateOperation && jours(r.dateIso, d.dateOperation) <= joursMax)
      .sort((a, b) => Number(memeNom(b)) - Number(memeNom(a)) || jours(a.dateIso, d.dateOperation!) - jours(b.dateIso, d.dateOperation!));
    const r = candidats[0] || null;
    if (r) pris.add(r.id);
    resultat.set(d.id, r);
  }
  return resultat;
}
