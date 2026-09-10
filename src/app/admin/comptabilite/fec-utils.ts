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
/**
 * Compte de TVA collectée du cabinet selon le taux : 44571200 pour le taux
 * réduit agricole 5,5 %, 44571700 pour le taux normal 20 % (plan comptable
 * API Expertises). Un autre taux tombe sur le compte de régularisation.
 */
export function compteTvaCollectee(taux: number): { compte: string; libelle: string } {
  if (Math.abs(taux - 5.5) < 0.01) return { compte: "44571200", libelle: "TVA collectée 5.5%" };
  if (Math.abs(taux - 20) < 0.01) return { compte: "44571700", libelle: "TVA collectée 20%" };
  return { compte: "44575000", libelle: "TVA collectée à régulariser" };
}

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
        const taux = item.tva || 5.5;
        const { compte: compteTva, libelle: libelleTva } = compteTvaCollectee(taux);
        lignes.push(
          `VE\tVentes\t${numeroEcriture}\t${dateEcriture}\t${compteTva}\t${libelleTva}\t\t\t${piece}\t${dateEcriture}\tTVA ${taux}%\t\t${montantTva.toFixed(2)}\t\t\t${dateEcriture}\t\t`,
        );
        numeroEcriture++;
      }
    });

    lignes.push(
      `VE\tVentes\t${numeroEcriture}\t${dateEcriture}\t41100000\tClients\t${paiement.familyName}\t${paiement.familyName}\t${piece}\t${dateEcriture}\tCréance ${paiement.familyName}\t${(paiement.totalTTC || 0).toFixed(2)}\t\t\t\t${dateEcriture}\t\t`,
    );
    numeroEcriture++;
  });

  return ENTETE_FEC + "\n" + lignes.join("\n");
}
