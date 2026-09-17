/**
 * Fichier des Écritures Comptables (FEC) — journal des ventes.
 *
 * Format imposé par l'art. A.47 A-1 du Livre des procédures fiscales :
 * 18 colonnes séparées par des tabulations, en-tête nominative.
 *
 * Règle structurante : une ÉCRITURE regroupe plusieurs LIGNES sous un même
 * EcritureNum, et la somme des débits doit égaler la somme des crédits. Une
 * écriture déséquilibrée fait rejeter le fichier entier — donc ici, un numéro
 * par facture, jamais par ligne.
 */

export interface PaiementFec {
  familyName: string;
  totalTTC: number;
  date?: { seconds?: number } | null;
  /** Numéro de facture réel. À défaut, une référence de rang est fabriquée. */
  invoiceNumber?: string | null;
  items?: Array<{
    activityTitle: string;
    priceHT: number;
    priceTTC: number;
    tva: number;
  }>;
}

/** Anomalie rencontrée à la construction, à montrer avant l'envoi au comptable. */
export interface AnomalieFec {
  piece: string;
  familyName: string;
  ecart: number;
  message: string;
}

export const ENTETE_FEC = "JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise";

const COMPTE_PRODUIT = { compte: "70611400", libelle: "Stages équitation" };
const COMPTE_CLIENT = { compte: "41100000", libelle: "Clients" };

/**
 * Compte de TVA collectée selon le taux, au plan comptable de la comptable.
 * Un taux inattendu part en compte d'attente plutôt que d'être rangé d'office
 * avec les 5,5 % : mieux vaut une ligne à régulariser qu'une TVA fausse.
 */
export function compteTvaCollectee(taux: number): { compte: string; libelle: string } {
  if (Math.abs(taux - 5.5) < 0.01) return { compte: "44571200", libelle: "TVA collectée 5.5%" };
  if (Math.abs(taux - 20) < 0.01) return { compte: "44571700", libelle: "TVA collectée 20%" };
  return { compte: "44575000", libelle: "TVA collectée à régulariser" };
}

// Le serveur tourne en UTC. Sans fuseau explicite, une vente du 1er septembre
// à 00h30 à Agon serait datée du 31 août — donc rattachée au mois précédent,
// déjà clôturé.
const JOUR_PARIS = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function partiesJour(date: Date): { annee: string; mois: string; jour: string } {
  const p = Object.fromEntries(
    JOUR_PARIS.formatToParts(date).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return { annee: p.year, mois: p.month, jour: p.day };
}

function dateFec(date: Date) {
  const { annee, mois, jour } = partiesJour(date);
  return `${annee}${mois}${jour}`;
}

function centimes(n: number): number {
  return Math.round((n || 0) * 100);
}

function euros(centimes: number): string {
  return (centimes / 100).toFixed(2);
}

function ligne(champs: {
  numero: number;
  dateEcriture: string;
  compte: { compte: string; libelle: string };
  piece: string;
  libelle: string;
  debit?: number;
  credit?: number;
  auxNum?: string;
  auxLib?: string;
}): string {
  const d = champs.debit === undefined ? "" : euros(champs.debit);
  const c = champs.credit === undefined ? "" : euros(champs.credit);
  return [
    "VE",
    "Ventes",
    String(champs.numero),
    champs.dateEcriture,
    champs.compte.compte,
    champs.compte.libelle,
    champs.auxNum || "",
    champs.auxLib || "",
    champs.piece,
    champs.dateEcriture,
    champs.libelle,
    d,
    c,
    "", // EcritureLet
    "", // DateLet
    champs.dateEcriture, // ValidDate
    "", // Montantdevise
    "", // Idevise
  ].join("\t");
}

/**
 * Construit le journal des ventes et signale les factures dont la ventilation
 * ne retombe pas sur le total.
 */
export function analyserFecVentes(
  paiements: PaiementFec[],
  maintenant: Date = new Date(),
): { contenu: string; anomalies: AnomalieFec[] } {
  const lignes: string[] = [];
  const anomalies: AnomalieFec[] = [];
  let numeroEcriture = 1;

  paiements.forEach((paiement, index) => {
    const date = paiement.date?.seconds
      ? new Date(paiement.date.seconds * 1000)
      : maintenant;
    const dateEcriture = dateFec(date);
    const piece =
      paiement.invoiceNumber ||
      `F${partiesJour(date).annee}-${String(index + 1).padStart(3, "0")}`;

    // Toutes les lignes d'une facture portent le MÊME numéro d'écriture.
    const numero = numeroEcriture;
    const lignesEcriture: string[] = [];
    let creditsCentimes = 0;

    (paiement.items || []).forEach((item) => {
      const htCentimes = centimes(item.priceHT);
      if (htCentimes !== 0) {
        lignesEcriture.push(
          ligne({
            numero,
            dateEcriture,
            compte: COMPTE_PRODUIT,
            piece,
            libelle: item.activityTitle,
            credit: htCentimes,
          }),
        );
        creditsCentimes += htCentimes;
      }

      const tvaCentimes = centimes(item.priceTTC) - htCentimes;
      if (tvaCentimes > 0) {
        const taux = item.tva ?? 0;
        const compte = compteTvaCollectee(taux);
        lignesEcriture.push(
          ligne({
            numero,
            dateEcriture,
            compte,
            piece,
            libelle: `TVA ${taux}%`,
            credit: tvaCentimes,
          }),
        );
        creditsCentimes += tvaCentimes;
      }
    });

    const debitCentimes = centimes(paiement.totalTTC);
    const ecart = debitCentimes - creditsCentimes;

    // Équilibrage : le fichier doit rester valide même quand le détail des
    // articles ne retombe pas sur le total (remise saisie sur la facture,
    // article sans prix…). L'écart part sur le compte de produit sous un
    // libellé qui le nomme, et remonte dans les anomalies pour être corrigé.
    if (ecart !== 0) {
      lignesEcriture.push(
        ligne({
          numero,
          dateEcriture,
          compte: COMPTE_PRODUIT,
          piece,
          libelle: "Écart de ventilation",
          credit: ecart > 0 ? ecart : undefined,
          debit: ecart < 0 ? -ecart : undefined,
        }),
      );
      anomalies.push({
        piece,
        familyName: paiement.familyName,
        ecart: ecart / 100,
        message:
          `Le détail des articles ne retombe pas sur le total de la facture ` +
          `(écart ${euros(ecart)} €). Une ligne « Écart de ventilation » a été ` +
          `ajoutée pour garder l'écriture équilibrée.`,
      });
    }

    // Contrepartie : la créance client, au débit.
    lignesEcriture.push(
      ligne({
        numero,
        dateEcriture,
        compte: COMPTE_CLIENT,
        piece,
        libelle: `Créance ${paiement.familyName}`,
        debit: debitCentimes,
        auxNum: paiement.familyName,
        auxLib: paiement.familyName,
      }),
    );

    // Une facture à zéro ne produit aucune ligne : on ne crée pas d'écriture
    // vide, et le numéro n'est pas consommé.
    if (debitCentimes === 0 && creditsCentimes === 0) return;

    lignes.push(...lignesEcriture);
    numeroEcriture++;
  });

  return { contenu: ENTETE_FEC + "\n" + lignes.join("\n"), anomalies };
}

/**
 * Construit le fichier des écritures de ventes.
 * La création du Blob et le téléchargement restent dans le composant client.
 */
export function construireFecVentes(
  paiements: PaiementFec[],
  maintenant: Date = new Date(),
): string {
  return analyserFecVentes(paiements, maintenant).contenu;
}
