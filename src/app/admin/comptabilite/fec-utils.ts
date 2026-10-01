import { ecartLignes, lignesAuTotal } from "@/lib/lignes-facture";

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
    /** Indices de ventilation, lus par compteDeLigne (lib/ventilation-comptable). */
    compteComptable?: string;
    category?: string;
    activityType?: string;
  }>;
}

export type ItemFec = NonNullable<PaiementFec["items"]>[number];

export interface OptionsFecVentes {
  /** Compte de produit d'une ligne. Absent : le compte historique unique. */
  compteProduit?: (item: ItemFec) => { compte: string; libelle: string };
  /**
   * TVA sur les encaissements (prestations de services) : la TVA de la
   * facture part au compte d'attente 44574000, et chaque règlement la vire
   * au 4457x du taux (fec-complet). Absent : TVA collectée dès la facture.
   */
  tvaEnAttente?: boolean;
  /** Premier numéro d'écriture, pour enchaîner plusieurs journaux dans un fichier. */
  premierNumero?: number;
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
/** Ce que le détail de la facture n'explique pas : à ventiler, jamais rangé d'office en produit. */
export const COMPTE_ATTENTE = { compte: "47100000", libelle: "Compte d'attente — à ventiler" };
/** TVA facturée, pas encore encaissée (TVA sur les encaissements). */
export const COMPTE_TVA_EN_ATTENTE = { compte: "44574000", libelle: "TVA collectée en attente d'encaissement" };
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

/**
 * Un montant signé posé du bon côté, toujours en positif : une remise (montant
 * négatif) qui réduit un produit passe AU DÉBIT de ce produit, pas au crédit
 * en négatif. Le FEC tolère les montants signés, mais les logiciels du cabinet
 * les importent mal.
 */
export function cote(centimesSignes: number, sensNaturel: "debit" | "credit"): { debit?: number; credit?: number } {
  const positif = centimesSignes >= 0;
  const sens = positif ? sensNaturel : sensNaturel === "debit" ? "credit" : "debit";
  return sens === "debit" ? { debit: Math.abs(centimesSignes) } : { credit: Math.abs(centimesSignes) };
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
  options: OptionsFecVentes = {},
): { contenu: string; anomalies: AnomalieFec[]; nbEcritures: number; lignes: string[] } {
  const lignes: string[] = [];
  const anomalies: AnomalieFec[] = [];
  const premier = options.premierNumero && options.premierNumero > 0 ? Math.floor(options.premierNumero) : 1;
  let numeroEcriture = premier;

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

    // Lignes ramenées au total de la facture (lib/lignes-facture) : la TVA de
    // la 1re échéance d'un forfait en 3×/10× se calculait sur le forfait entier.
    const lignesFacture = lignesAuTotal(paiement) as NonNullable<typeof paiement.items>;
    const compteDe = (item: ItemFec) => (options.compteProduit ? options.compteProduit(item) : COMPTE_PRODUIT);
    // Une remise sans compte reconnu réduit le produit qu'elle accompagne :
    // le compte de la plus grosse ligne de la facture, pas le compte d'attente.
    const principale = [...lignesFacture]
      .filter((l) => centimes(l.priceHT) > 0)
      .map((l) => ({ l, compte: compteDe(l) }))
      .filter((x) => x.compte.compte !== COMPTE_ATTENTE.compte)
      .sort((a, b) => centimes(b.l.priceHT) - centimes(a.l.priceHT))[0];
    lignesFacture.forEach((item) => {
      const htCentimes = centimes(item.priceHT);
      if (htCentimes !== 0) {
        let compte = compteDe(item);
        if (htCentimes < 0 && compte.compte === COMPTE_ATTENTE.compte && principale) compte = principale.compte;
        else if (htCentimes < 0 && compte.compte === COMPTE_ATTENTE.compte) {
          anomalies.push({ piece, familyName: paiement.familyName, ecart: 0, message: `Remise « ${item.activityTitle} » (${euros(-htCentimes)} € HT) sans ligne de produit reconnue sur la facture : passée au 47100000, à ventiler.` });
        }
        lignesEcriture.push(
          ligne({
            numero,
            dateEcriture,
            compte,
            piece,
            libelle: htCentimes < 0 ? `Remise — ${item.activityTitle}` : item.activityTitle,
            ...cote(htCentimes, "credit"),
          }),
        );
        creditsCentimes += htCentimes;
      }

      // TVA de la ligne, positive ou NÉGATIVE (remise) : une TVA de remise
      // oubliée déséquilibrait l'écriture, d'où les « écarts de ventilation ».
      const tvaCentimes = centimes(item.priceTTC) - htCentimes;
      if (tvaCentimes !== 0) {
        const taux = item.tva ?? 0;
        const compte = options.tvaEnAttente ? COMPTE_TVA_EN_ATTENTE : compteTvaCollectee(taux);
        lignesEcriture.push(
          ligne({
            numero,
            dateEcriture,
            compte,
            piece,
            libelle: `TVA ${taux}%${options.tvaEnAttente ? " — exigible à l'encaissement" : ""}${tvaCentimes < 0 ? " (remise)" : ""}`,
            ...cote(tvaCentimes, "credit"),
          }),
        );
        creditsCentimes += tvaCentimes;
      }
    });

    const debitCentimes = centimes(paiement.totalTTC);
    const ecart = debitCentimes - creditsCentimes;

    // Lignes saisies qui ne retombaient pas sur le total, mais qu'on a pu
    // ramener au prorata : l'écriture est juste, on le signale quand même
    // au comptable (remise globale, 1re échéance d'un 3×/10×…).
    const ecartSaisie = centimes(ecartLignes(paiement));
    if (ecart === 0 && ecartSaisie !== 0) {
      anomalies.push({
        piece,
        familyName: paiement.familyName,
        ecart: ecartSaisie / 100,
        message:
          `Le détail saisi (${euros(debitCentimes - ecartSaisie)} €) ne retombait pas sur le total ` +
          `de la facture : lignes ramenées au total au prorata (écart ${euros(ecartSaisie)} €).`,
      });
    }

    // Reste un écart seulement quand le détail est illisible (lignes sans
    // prix) : ce que la facture n'explique pas part au compte d'attente, à
    // ventiler par le cabinet — jamais rangé d'office dans un produit.
    if (ecart !== 0) {
      lignesEcriture.push(
        ligne({
          numero,
          dateEcriture,
          compte: COMPTE_ATTENTE,
          piece,
          libelle: "Détail de facture illisible — à ventiler",
          ...cote(ecart, "credit"),
        }),
      );
      anomalies.push({
        piece,
        familyName: paiement.familyName,
        ecart: ecart / 100,
        message:
          `Le détail des articles ne retombe pas sur le total de la facture ` +
          `(écart ${euros(ecart)} €) : l'écart est passé au 47100000, à ventiler.`,
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
        ...cote(debitCentimes, "debit"),
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

  return { contenu: ENTETE_FEC + "\n" + lignes.join("\n"), anomalies, nbEcritures: numeroEcriture - premier, lignes };
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
