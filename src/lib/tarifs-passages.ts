/**
 * src/lib/tarifs-passages.ts — compétition (challenge interne…) au tarif par
 * nombre de passages.
 *
 * Novembre 2026, demande de Nicolas : un challenge interne n'avait qu'un tarif
 * unique ; le prix dépend pourtant du nombre de passages (1, 2 ou 3). Le
 * créneau porte `prixPassages` = [prix 1 passage, prix 2, prix 3] (0 = non
 * proposé). Son `priceTTC` reste le plus petit tarif : c'est le « à partir
 * de » affiché et le plancher du contrôle des prix au paiement.
 *
 * Pur, sans import, testé (tests/unit/tarifs-passages.test.ts).
 */

export const MAX_PASSAGES = 3;

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Saisie de l'écran → tableau de 3 prix (0 = non proposé) ; [] si aucun. */
export function nettoyerPrixPassages(saisie: unknown): number[] {
  const brut = Array.isArray(saisie) ? saisie : [];
  const prix = Array.from({ length: MAX_PASSAGES }, (_, k) => {
    const v = Number(String(brut[k] ?? "").replace(",", "."));
    return Number.isFinite(v) && v > 0 ? arrondi(v) : 0;
  });
  return prix.some((p) => p > 0) ? prix : [];
}

/** Formules proposées : nombre de passages et prix, du plus petit au plus grand. */
export function offrePassages(creneau: { prixPassages?: unknown } | null | undefined): { n: number; prix: number }[] {
  return nettoyerPrixPassages(creneau?.prixPassages)
    .map((prix, k) => ({ n: k + 1, prix }))
    .filter((o) => o.prix > 0);
}

/** Prix « à partir de » du créneau : le plus petit tarif proposé, sinon null. */
export function prixMinimumPassages(prixPassages: number[]): number | null {
  const offerts = prixPassages.filter((p) => p > 0);
  return offerts.length ? Math.min(...offerts) : null;
}

export const libellePassages = (n: number) => `${n} passage${n > 1 ? "s" : ""}`;

/** Titre de la ligne de commande : « Challenge interne — 2 passages ». */
export function titreAvecPassages(titre: string, n: number): string {
  const base = String(titre || "").replace(/ — \d passages?$/, "");
  return `${base} — ${libellePassages(n)}`;
}

/** Le bloc « Tarif selon le nombre de passages » s'affiche-t-il sur ce créneau ? */
export function proposerPrixPassages(c: { activityType?: string; activityTitle?: string; prixPassages?: unknown }): boolean {
  return c.activityType === "competition"
    || offrePassages(c).length > 0
    || /challenge|concours|comp[ée]t/i.test(String(c.activityTitle || ""));
}
