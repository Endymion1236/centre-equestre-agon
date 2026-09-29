/**
 * src/app/admin/montoir/seance-par-carte.ts
 *
 * À la clôture d'une reprise, un cavalier présent inscrit SANS carte, mais
 * qui en a une active depuis (carte vendue après l'inscription), voit la
 * séance décomptée de sa carte. La commande de la séance, elle, restait
 * dans les Impayés : 26 € réclamés en plus de la séance prise sur la carte
 * (question de Nicolas, septembre 2026).
 *
 * Règle :
 *   - séance déjà réglée par sa commande (encaissement reçu, même partiel,
 *     ou facture émise) → la carte n'est PAS débitée : la séance est payée ;
 *   - commande encore vierge (rien reçu, pas de facture) → la carte est
 *     débitée et la ligne de la séance quitte la commande ; une commande qui
 *     n'avait que cette ligne est annulée ;
 *   - aucune commande → la carte est débitée, comme avant.
 *
 * Module pur : il décide, le montoir écrit.
 */

export interface AjustementCommande {
  paymentId: string;
  /** Plus aucune ligne : la commande est annulée. */
  annuler: boolean;
  items: any[];
  totalTTC: number;
}

export type ReglementSeance =
  | { debiterCarte: false; raison: string }
  | { debiterCarte: true; ajustements: AjustementCommande[] };

const ligneDeLaSeance = (i: any, childId: string, creneauId: string) =>
  i?.childId === childId && i?.creneauId === creneauId;

export function reglementSeanceParCarte(commandes: any[], childId: string, creneauId: string): ReglementSeance {
  const concernees = commandes.filter(p =>
    p?.status !== "cancelled" && (p?.items || []).some((i: any) => ligneDeLaSeance(i, childId, creneauId)));

  const reglee = concernees.find(p =>
    p.status === "paid" || (Number(p.paidAmount) || 0) > 0.009 || !!p.invoiceNumber);
  if (reglee) {
    return {
      debiterCarte: false,
      raison: reglee.invoiceNumber && !((Number(reglee.paidAmount) || 0) > 0.009)
        ? `facture ${reglee.invoiceNumber} émise pour cette séance`
        : "séance déjà réglée par sa commande",
    };
  }

  const ajustements = concernees.map((p): AjustementCommande => {
    const items = (p.items || []).filter((i: any) => !ligneDeLaSeance(i, childId, creneauId));
    const totalTTC = Math.round(items.reduce((s: number, i: any) => s + (Number(i.priceTTC) || 0), 0) * 100) / 100;
    return { paymentId: p.id, annuler: items.length === 0, items, totalTTC };
  });
  return { debiterCarte: true, ajustements };
}
