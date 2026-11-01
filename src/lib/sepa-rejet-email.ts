/**
 * src/lib/sepa-rejet-email.ts — email « prélèvement rejeté » à la famille.
 *
 * Demande de Nicolas (01/11/2026) : quand la banque rejette un prélèvement,
 * prévenir la famille et lui demander quand il peut être représenté. Le texte
 * lui-même est le gabarit `rejetPrelevement` (modifiable dans Emails) ; ici,
 * seulement les variables qu'on y injecte, calculées une fois et testées.
 */

export interface EcheanceRejetee {
  id: string;
  familyId?: string | null;
  familyName?: string | null;
  montant?: number | null;
  dateEcheance?: string | null;   // YYYY-MM-DD
  description?: string | null;    // ex. « Forfait annuel 3/10 »
  reference?: string | null;
  status?: string | null;
  rejeteLe?: string | null;
  famillePrevenueLe?: string | null;
}

/** Type objet (pas interface) : accepté tel quel par loadTemplate(Record<string, string>). */
export type VariablesEmailRejet = {
  parentName: string;
  montant: string;
  dateEcheance: string;
  prestation: string;
  representation: string;
};

/** « 2026-10-30 » → « 30 octobre 2026 » ; autre chose rendu tel quel. */
export const jourLong = (iso: string | null | undefined): string => {
  const s = String(iso || "");
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  return new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });
};

/**
 * Variables du gabarit. `dateRepresentation` : la nouvelle échéance créée au
 * moment du rejet, s'il y en a une — la famille sait alors que, sans réponse
 * de sa part, le prélèvement repartira à cette date.
 */
export function variablesEmailRejet(
  ech: EcheanceRejetee,
  dateRepresentation?: string | null,
): VariablesEmailRejet {
  const montant = Math.round((Number(ech.montant) || 0) * 100) / 100;
  const prestation = String(ech.description || ech.reference || "").trim();
  return {
    parentName: String(ech.familyName || "").trim(),
    montant: montant.toFixed(2).replace(".", ","),
    dateEcheance: jourLong(ech.dateEcheance),
    prestation: prestation ? ` (${prestation})` : "",
    representation: dateRepresentation
      ? `Sans réponse de votre part, nous le représenterons le <strong>${jourLong(dateRepresentation)}</strong>.`
      : "",
  };
}

/** Peut-on prévenir la famille pour cette échéance ? Sinon, pourquoi. */
export function controleEnvoiRejet(
  ech: EcheanceRejetee | null | undefined,
  email: string | null | undefined,
): { ok: true } | { ok: false; raison: string } {
  if (!ech) return { ok: false, raison: "Échéance introuvable." };
  if (ech.status !== "rejete") return { ok: false, raison: "Cette échéance n'est pas marquée rejetée : enregistrez d'abord le rejet." };
  if (!(Number(ech.montant) > 0)) return { ok: false, raison: "Échéance sans montant." };
  if (!String(email || "").trim()) return { ok: false, raison: "La famille n'a pas d'adresse email sur sa fiche." };
  return { ok: true };
}
