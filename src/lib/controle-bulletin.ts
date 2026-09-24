/**
 * src/lib/controle-bulletin.ts
 *
 * Le coût employeur lu sur une fiche de paie, contrôlé avant d'être proposé.
 *
 * Septembre 2026 : bulletin d'apprentie, brut 697,16 €, « Coût Global »
 * 714,11 € (charges patronales 16,95 € après exonérations). La lecture
 * proposait 1 411,11 € : le brut ajouté une seconde fois au coût global.
 * Les charges patronales dépassent rarement la moitié du brut ; un coût au-delà
 * de 1,6 fois le brut, ou en dessous du brut, ne peut pas être juste.
 *
 * Ordre de confiance : le coût imprimé sur le bulletin (« Coût global »,
 * « Coût total employeur »…) s'il est cohérent, sinon brut + charges
 * patronales lues, sinon rien — le gérant saisit, on ne devine pas.
 * Module pur.
 */

const PLAFOND_COUT_SUR_BRUT = 1.6;
const c = (n: number) => Math.round(n * 100) / 100;
const nombre = (v: unknown): number | null => (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

export function controlerCoutEmployeur(lu: {
  brut: unknown;
  /** Montant imprimé à côté de « Coût global », « Coût total employeur »… */
  coutImprime?: unknown;
  /** Total des charges patronales, exonérations déduites. */
  chargesPatronales?: unknown;
}): { coutEmployeur: number | null; alerte: string | null } {
  const brut = nombre(lu.brut);
  const imprime = nombre(lu.coutImprime);
  const charges = nombre(lu.chargesPatronales);
  if (brut === null || brut <= 0) return { coutEmployeur: imprime, alerte: null };
  const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  const plausible = (x: number) => x >= brut - 0.01 && x <= brut * PLAFOND_COUT_SUR_BRUT;
  const parCharges = charges !== null && charges >= 0 ? c(brut + charges) : null;

  if (imprime !== null && plausible(imprime)) {
    if (parCharges !== null && Math.abs(parCharges - imprime) > 1) {
      return { coutEmployeur: c(imprime), alerte: `Coût lu ${eur(imprime)}, mais brut + charges patronales = ${eur(parCharges)} : vérifiez sur le bulletin.` };
    }
    return { coutEmployeur: c(imprime), alerte: null };
  }
  if (parCharges !== null && plausible(parCharges)) {
    return {
      coutEmployeur: parCharges,
      alerte: imprime !== null ? `Le coût lu (${eur(imprime)}) n'est pas cohérent avec le brut ; retenu brut + charges patronales = ${eur(parCharges)}. Vérifiez sur le bulletin.` : null,
    };
  }
  if (imprime !== null) {
    return { coutEmployeur: null, alerte: `Coût lu ${eur(imprime)} incohérent avec un brut de ${eur(brut)} : saisissez le « coût global » du bulletin.` };
  }
  return { coutEmployeur: null, alerte: null };
}
