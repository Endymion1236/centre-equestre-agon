/**
 * Collections à valeur fiscale : ce qui ne s'efface JAMAIS en production.
 *
 * Pourquoi ce module existe
 * -------------------------
 * Trois routes d'administration (reset-compta, reset-donnees, delete-family)
 * pouvaient supprimer définitivement des encaissements, des avoirs, des
 * clôtures de caisse et le journal d'audit des factures. Or :
 *
 *   - art. 286-I-3° bis du CGI (dispositif « ISCA ») : les données de recette
 *     doivent être Inaltérables, Sécurisées, Conservées et Archivées. La simple
 *     EXISTENCE d'une fonction d'effacement en masse suffit à ruiner la
 *     présomption d'inaltérabilité lors d'un contrôle, même inutilisée.
 *   - art. L102 B du LPF : conservation 6 ans.
 *   - art. L123-22 du Code de commerce : livres et pièces justificatives 10 ans.
 *
 * L'attestation d'éditeur (rétablie par l'art. 125 de la loi de finances pour
 * 2026, modèle BOI-LETTRE-000242) engage la responsabilité du signataire sur
 * ces points. Elle ne peut pas être signée tant qu'un tel effacement est
 * possible.
 *
 * Principe retenu
 * ---------------
 * Ces routes restent utilisables telles quelles sur la base de TEST — c'est
 * leur seul usage légitime : repartir d'un jeu de données propre. En
 * PRODUCTION, les collections listées ici sont retirées du périmètre
 * d'effacement par construction, sans phrase de déblocage possible. Un
 * garde-fou qu'on peut contourner n'est pas un garde-fou.
 *
 * Pour une demande RGPD d'effacement, la réponse n'est pas la suppression des
 * écritures (l'obligation fiscale prime, cf. art. 17-3-b du RGPD) mais
 * l'anonymisation des données personnelles qu'elles portent : cf.
 * anonymisationComptable().
 */

/**
 * Collections portant des pièces à valeur fiscale ou probatoire.
 * Toute collection ajoutée ici devient ineffaçable en production.
 */
export const COLLECTIONS_FISCALES = [
  "encaissements",        // recettes — cœur du dispositif ISCA
  "avoirs",               // avoirs = factures, même régime
  "payments",             // factures et commandes
  "paiements",            // idem, nommage historique
  "payment_declarations", // déclarations d'espèces et de chèques
  "cloturesJournalieres", // clôtures de caisse (équivalent ticket Z)
  "fondsDeCaisse",        // fonds de caisse ouvrant/fermant
  "mouvements_registre",  // registre des mouvements d'espèces
  "invoice_audit",        // journal d'audit de la numérotation des factures
  "remises",              // bordereaux de remise chèques / CB / espèces
  "remises-sepa",         // remises de prélèvements
  "cheques-differes",     // chèques encaissables à terme
  "mandats-sepa",         // mandats signés — valeur juridique
  "bons-cadeaux",         // dettes envers les clients
] as const;

export type CollectionFiscale = (typeof COLLECTIONS_FISCALES)[number];

/** Vrai si la collection porte des pièces à conserver. */
export function estCollectionFiscale(nom: string): boolean {
  return (COLLECTIONS_FISCALES as readonly string[]).includes(nom);
}

/**
 * Filtre une liste de collections destinées à l'effacement.
 *
 * En production, les collections à valeur fiscale sont écartées. Hors
 * production (base de test), la liste passe intacte.
 *
 * Retourne à la fois ce qui peut être effacé et ce qui a été protégé, pour que
 * la route puisse le dire clairement dans son rapport plutôt que d'ignorer
 * silencieusement une partie de la demande.
 */
export function filtrerCollectionsEffacables(
  collections: readonly string[],
  estProd: boolean,
): { effacables: string[]; protegees: string[] } {
  if (!estProd) return { effacables: [...collections], protegees: [] };

  const effacables: string[] = [];
  const protegees: string[] = [];
  for (const col of collections) {
    if (estCollectionFiscale(col)) protegees.push(col);
    else effacables.push(col);
  }
  return { effacables, protegees };
}

/** Message affiché dans le rapport d'une route quand des collections sont protégées. */
export function messageCollectionsProtegees(protegees: readonly string[]): string {
  if (protegees.length === 0) return "";
  return (
    `${protegees.length} collection(s) à valeur fiscale conservée(s) en production : ` +
    `${protegees.join(", ")}. Conservation obligatoire (art. L102 B du LPF, 6 ans ; ` +
    `art. L123-22 du Code de commerce, 10 ans). Ces données ne peuvent pas être ` +
    `effacées depuis l'application, y compris par un administrateur.`
  );
}

/**
 * Valeurs de remplacement pour une demande RGPD d'effacement.
 *
 * On garde l'écriture (montant, date, numéro de pièce, chaîne d'empreintes)
 * et on neutralise ce qui identifie la personne. La pièce reste probante, le
 * droit à l'effacement est satisfait dans la limite où l'obligation légale de
 * conservation le permet.
 */
export function anonymisationComptable(dateDemande: Date = new Date()): Record<string, unknown> {
  const iso = dateDemande.toISOString().slice(0, 10);
  return {
    familyName: "Client anonymisé (RGPD)",
    parentName: "Client anonymisé (RGPD)",
    parentEmail: null,
    parentPhone: null,
    childName: null,
    adresse: null,
    anonymiseLe: dateDemande,
    anonymisationMotif: `Demande d'effacement RGPD du ${iso} — écriture conservée au titre de l'art. L102 B du LPF`,
  };
}
