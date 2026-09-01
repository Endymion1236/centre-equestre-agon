export interface LigneFactureSynthese {
  priceHT?: number;
  priceTTC?: number;
  tva?: number;
}

export interface FactureSynthese {
  status?: string;
  totalTTC?: number;
  paymentMode: string;
  date?: { seconds?: number } | null;
  items?: LigneFactureSynthese[];
}

export interface EncaissementSynthese {
  montant?: number;
  mode?: string;
  date?: { seconds?: number } | null;
}

function periodeDe(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function filtrerFacturesPeriode<T extends FactureSynthese>(
  factures: T[],
  periode: string,
) {
  const statutsExclus = new Set(["cancelled", "pending", "draft"]);
  return factures.filter((facture) => {
    if (facture.status && statutsExclus.has(facture.status)) return false;
    const date = facture.date?.seconds ? new Date(facture.date.seconds * 1000) : null;
    return Boolean(date && periodeDe(date) === periode);
  });
}

export function calculerSyntheseFactures(factures: FactureSynthese[]) {
  let totalHT = 0;
  let totalTVA = 0;
  let totalTTC = 0;
  const tvaParTaux: Record<number, { ht: number; tva: number; ttc: number }> = {};
  const totauxParMode: Record<string, number> = {};

  factures.forEach((facture) => {
    totalTTC += facture.totalTTC || 0;
    totauxParMode[facture.paymentMode] = (totauxParMode[facture.paymentMode] || 0)
      + (facture.totalTTC || 0);

    (facture.items || []).forEach((ligne) => {
      const ht = ligne.priceHT || 0;
      const ttc = ligne.priceTTC || 0;
      const montantTva = ttc - ht;
      const taux = ligne.tva || 5.5;

      totalHT += ht;
      totalTVA += montantTva;
      if (!tvaParTaux[taux]) tvaParTaux[taux] = { ht: 0, tva: 0, ttc: 0 };
      tvaParTaux[taux].ht += ht;
      tvaParTaux[taux].tva += montantTva;
      tvaParTaux[taux].ttc += ttc;
    });
  });

  return {
    totalHT,
    totalTVA,
    totalTTC,
    tvaByRate: Object.entries(tvaParTaux)
      .sort(([tauxA], [tauxB]) => parseFloat(tauxA) - parseFloat(tauxB)),
    byMode: Object.entries(totauxParMode)
      .sort(([, totalA], [, totalB]) => totalB - totalA),
  };
}

export function calculerTotauxJournaliers(
  encaissements: EncaissementSynthese[],
  periode: string,
) {
  const totaux: Record<string, Record<string, number>> = {};

  encaissements.forEach((encaissement) => {
    const date = encaissement.date?.seconds
      ? new Date(encaissement.date.seconds * 1000)
      : null;
    if (!date || periodeDe(date) !== periode) return;

    const jour = date.toLocaleDateString("fr-FR");
    const mode = encaissement.mode || "autre";
    if (!totaux[jour]) totaux[jour] = {};
    totaux[jour][mode] = (totaux[jour][mode] || 0) + (encaissement.montant || 0);
  });

  return totaux;
}
