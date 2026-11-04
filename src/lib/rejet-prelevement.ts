/**
 * src/lib/rejet-prelevement.ts — un prélèvement rejeté ne sort qu'une fois de
 * la banque dans le FEC.
 *
 * Novembre 2026 : le solde de banque du FEC ne correspondait pas au relevé.
 * Un prélèvement SEPA rejeté (relevé : « Impayé Prel Mr Samson Mickael »,
 * 55 €) sortait deux fois du 512 : par l'annulation de l'encaissement
 * (bouton « Rejeté » de l'écran SEPA, journal RG : 411 au débit, 512 au
 * crédit) ET par la ligne du relevé reprise au journal BQ comme une
 * dépense. La ligne du relevé est désormais reconnue : si le rejet est
 * enregistré dans l'application, elle n'est pas reprise (l'annulation porte
 * déjà la sortie de banque) ; sinon elle part au 47100000 avec la consigne
 * d'enregistrer le rejet. Sans import, testé (tests/unit/rejet-prelevement.test.ts).
 */

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** « Impayé Prel Mr Samson Mickael », « REJET PRLV SEPA … » : un prélèvement revenu impayé. */
export function estRejetPrelevement(libelle: unknown): boolean {
  const l = norm(libelle);
  return /\b(IMPAYE|IMPAYES|REJET|REJETE)\b/.test(l) && /\b(PREL|PRLV|PRELEVEMENT|SEPA)\b/.test(l);
}

/** Un rejet enregistré dans l'application : la contre-passation de l'écran SEPA. */
export interface RejetEnregistre {
  id: string;
  montant: number; // positif
  dateIso: string; // AAAA-MM-JJ
  familyName?: string;
}

/** Les rejets du journal : écritures négatives qui annulent un prélèvement (raison « Rejet bancaire… »). */
export function rejetsDuJournal(encaissements: any[], dateIso: (e: any) => string | null): RejetEnregistre[] {
  return (encaissements || [])
    .filter((e) => e?.correctionDe && Number(e.montant) < 0
      && (/rejet bancaire/i.test(String(e.raison || "")) || /^(prelevement_sepa|sepa)$/.test(String(e.mode || ""))))
    .map((e) => ({ id: String(e.id || ""), montant: Math.round(Math.abs(Number(e.montant)) * 100) / 100, dateIso: dateIso(e) || "", familyName: e.familyName || "" }))
    .filter((r) => r.montant > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.dateIso));
}

const jours = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000;

/**
 * Associe chaque ligne « impayé » du relevé au rejet enregistré du même
 * montant, le plus proche en date (60 jours au plus : on enregistre le rejet
 * quand on le découvre). Un rejet ne sert qu'une fois.
 */
export function apparierRejets(
  lignes: { id: string; montant: number; dateOperation?: string }[],
  rejets: RejetEnregistre[],
): Map<string, RejetEnregistre | null> {
  const pris = new Set<string>();
  const res = new Map<string, RejetEnregistre | null>();
  for (const l of [...lignes].sort((a, b) => String(a.dateOperation || "").localeCompare(String(b.dateOperation || "")))) {
    const m = Math.round(Math.abs(Number(l.montant)) * 100) / 100;
    const candidats = rejets
      .filter((r) => !pris.has(r.id) && Math.abs(r.montant - m) < 0.01 && (!l.dateOperation || jours(r.dateIso, l.dateOperation) <= 60))
      .sort((a, b) => (l.dateOperation ? jours(a.dateIso, l.dateOperation) - jours(b.dateIso, l.dateOperation) : 0));
    const r = candidats[0] || null;
    if (r) pris.add(r.id);
    res.set(l.id, r);
  }
  return res;
}
