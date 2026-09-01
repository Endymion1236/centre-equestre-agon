export type TypeExportComptable = "ventes" | "reglements" | "clients";

export interface PaiementExportComptable {
  familyName: string;
  totalTTC?: number;
  paidAmount?: number;
  paymentMode: string;
  paymentRef?: string;
  date?: { seconds?: number } | null;
  items?: Array<{
    activityTitle: string;
    priceHT?: number;
    priceTTC?: number;
    tva?: number;
  }>;
}

const SEPARATEUR = ";";

function dateFrancaise(paiement: PaiementExportComptable) {
  return paiement.date?.seconds
    ? new Date(paiement.date.seconds * 1000).toLocaleDateString("fr-FR")
    : "";
}

function exportVentes(paiements: PaiementExportComptable[]) {
  const lignes = ["Date;Client;Article;HT;TVA%;TVA;TTC;Mode"];
  paiements.forEach((paiement) => {
    const date = dateFrancaise(paiement);
    (paiement.items || []).forEach((article) => {
      lignes.push([
        date,
        paiement.familyName,
        article.activityTitle,
        (article.priceHT || 0).toFixed(2),
        article.tva || 5.5,
        ((article.priceTTC || 0) - (article.priceHT || 0)).toFixed(2),
        (article.priceTTC || 0).toFixed(2),
        paiement.paymentMode,
      ].join(SEPARATEUR));
    });
  });
  return lignes.join("\n") + "\n";
}

function exportReglements(paiements: PaiementExportComptable[]) {
  const lignes = ["Date;Client;Montant;Mode;Référence"];
  paiements.forEach((paiement) => {
    lignes.push([
      dateFrancaise(paiement),
      paiement.familyName,
      (paiement.totalTTC || 0).toFixed(2),
      paiement.paymentMode,
      paiement.paymentRef || "",
    ].join(SEPARATEUR));
  });
  return lignes.join("\n") + "\n";
}

function exportClients(paiements: PaiementExportComptable[]) {
  const clients: Record<string, { facture: number; paye: number }> = {};
  paiements.forEach((paiement) => {
    if (!clients[paiement.familyName]) clients[paiement.familyName] = { facture: 0, paye: 0 };
    clients[paiement.familyName].facture += paiement.totalTTC || 0;
    clients[paiement.familyName].paye += paiement.paidAmount || paiement.totalTTC || 0;
  });

  const lignes = ["Client;Total facturé;Total payé;Solde dû"];
  Object.entries(clients).forEach(([nom, compte]) => {
    lignes.push([
      nom,
      compte.facture.toFixed(2),
      compte.paye.toFixed(2),
      (compte.facture - compte.paye).toFixed(2),
    ].join(SEPARATEUR));
  });
  return lignes.join("\n") + "\n";
}

export function construireExportComptable(
  type: TypeExportComptable,
  facturesPeriode: PaiementExportComptable[],
  tousPaiements: PaiementExportComptable[],
) {
  if (type === "ventes") return exportVentes(facturesPeriode);
  if (type === "reglements") return exportReglements(facturesPeriode);
  return exportClients(tousPaiements);
}
