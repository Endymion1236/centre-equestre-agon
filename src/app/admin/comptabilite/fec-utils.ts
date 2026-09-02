export interface PaiementFec {
  familyName: string;
  totalTTC: number;
  date?: { seconds?: number } | null;
  items?: Array<{
    activityTitle: string;
    priceHT: number;
    priceTTC: number;
    tva: number;
  }>;
}

export const ENTETE_FEC = "JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise";

function dateFec(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Construit le fichier des écritures de ventes.
 * La création du Blob et le téléchargement restent dans le composant client.
 */
export function construireFecVentes(
  paiements: PaiementFec[],
  maintenant: Date = new Date(),
) {
  const lignes: string[] = [];
  let numeroEcriture = 1;

  paiements.forEach((paiement, index) => {
    const date = paiement.date?.seconds
      ? new Date(paiement.date.seconds * 1000)
      : maintenant;
    const dateEcriture = dateFec(date);
    const piece = `F${date.getFullYear()}-${String(index + 1).padStart(3, "0")}`;

    (paiement.items || []).forEach((item) => {
      lignes.push(
        `VE\tVentes\t${numeroEcriture}\t${dateEcriture}\t70611400\tStages équitation\t\t\t${piece}\t${dateEcriture}\t${item.activityTitle}\t\t${(item.priceHT || 0).toFixed(2)}\t\t\t${dateEcriture}\t\t`,
      );
      numeroEcriture++;

      const montantTva = (item.priceTTC || 0) - (item.priceHT || 0);
      if (montantTva > 0) {
        lignes.push(
          `VE\tVentes\t${numeroEcriture}\t${dateEcriture}\t44571\tTVA collectée\t\t\t${piece}\t${dateEcriture}\tTVA ${item.tva || 5.5}%\t\t${montantTva.toFixed(2)}\t\t\t${dateEcriture}\t\t`,
        );
        numeroEcriture++;
      }
    });

    lignes.push(
      `VE\tVentes\t${numeroEcriture}\t${dateEcriture}\t411000\tClients\t${paiement.familyName}\t${paiement.familyName}\t${piece}\t${dateEcriture}\tCréance ${paiement.familyName}\t${(paiement.totalTTC || 0).toFixed(2)}\t\t\t\t${dateEcriture}\t\t`,
    );
    numeroEcriture++;
  });

  return ENTETE_FEC + "\n" + lignes.join("\n");
}
