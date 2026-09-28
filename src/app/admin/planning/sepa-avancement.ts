/**
 * src/app/admin/planning/sepa-avancement.ts
 *
 * Où en est le prélèvement SEPA d'une commande : combien de mois prélevés,
 * sur combien de prévus.
 *
 * Septembre 2026 : dans un même créneau, « forfait 1/10 SEPA » pour les uns,
 * « forfait SEPA 10× » pour d'autres dont le premier prélèvement était
 * pourtant passé. Le planning ne lisait que les commandes : un échéancier
 * créé depuis le planning y porte son nombre d'échéances, un échéancier posé
 * depuis Encaisser non — et le compteur se déduisait de l'argent reçu, qui
 * peut aussi venir d'un acompte. Le module SEPA, lui, sait exactement quels
 * prélèvements sont passés.
 *
 * Un mois compte une fois, même réparti sur deux mandats (père / mère) : on
 * compte les numéros d'échéance, pas les lignes.
 *
 * Module pur.
 */

export interface AvancementSepa {
  /** Mois dont le prélèvement est passé. */
  passes: number;
  /** Mois prévus au total. */
  total: number;
}

const numeroMois = (e: any): string =>
  e?.echeance != null ? `n${e.echeance}` : `d${String(e?.dateEcheance || "").slice(0, 7)}`;

/** Les commandes, chacune complétée de `sepaAvancement` quand des prélèvements lui sont rattachés. */
export function avecAvancementSepa<T extends { id: string; orderId?: string | null }>(
  payments: T[],
  echeances: any[],
): (T & { sepaAvancement?: AvancementSepa })[] {
  const parPaiement = new Map<string, any[]>();
  const parCommande = new Map<string, any[]>();
  for (const e of echeances) {
    if (e?.paymentId) {
      if (!parPaiement.has(e.paymentId)) parPaiement.set(e.paymentId, []);
      parPaiement.get(e.paymentId)!.push(e);
    } else if (e?.orderId) {
      if (!parCommande.has(e.orderId)) parCommande.set(e.orderId, []);
      parCommande.get(e.orderId)!.push(e);
    }
  }
  return payments.map(p => {
    const liees = [...(parPaiement.get(p.id) || []), ...(p.orderId ? parCommande.get(p.orderId) || [] : [])];
    if (liees.length === 0) return p;
    // Un rejet est représenté par une nouvelle échéance au même numéro : la
    // ligne rejetée ne compte ni comme prévue, ni comme passée.
    const vivantes = liees.filter(e => e?.status !== "rejete");
    const total = new Set(vivantes.map(numeroMois)).size;
    const passes = new Set(vivantes.filter(e => e?.status === "preleve").map(numeroMois)).size;
    return total > 0 ? { ...p, sepaAvancement: { passes, total } } : p;
  });
}
