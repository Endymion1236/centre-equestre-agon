/** src/lib/contreparties-credit.ts — pur, sans dépendance : lu par l'écran du rapprochement et par le FEC. */

/**
 * Crédits qui ne sont pas un paiement saisi dans l'application : le club dit
 * ce que c'est au rapprochement (« Autre crédit »), le FEC le range sur le
 * bon compte. Septembre 2026 : 10 505 € au 47100000 — factures Céleris
 * réglées par des collectivités, remboursements ANCV de remises d'avant
 * l'application, aide de l'ASP — que seul le club pouvait reconnaître.
 */
export const CONTREPARTIES_CREDIT: readonly { id: string; libelle: string; compte: string; compteLib: string }[] = [
  { id: "facture-anterieure", libelle: "Règlement d'une facture Céleris ou antérieure", compte: "41100000", compteLib: "Clients" },
  // Chèques-vacances reçus sous Céleris : il les passait au 51122000.
  { id: "ancv-anterieur", libelle: "Remboursement ANCV de chèques-vacances reçus sous Céleris", compte: "51122000", compteLib: "Paiement par chèques vacances (Céleris)" },
  { id: "subvention", libelle: "Aide ou subvention (ASP, État, région, commune)", compte: "74000000", compteLib: "Subventions d'exploitation" },
  { id: "virement-interne", libelle: "Virement depuis un autre compte du club", compte: "58000000", compteLib: "Virements internes" },
  { id: "apport", libelle: "Apport personnel de l'exploitant", compte: "45511000", compteLib: "Associés, compte courant" },
  { id: "autre", libelle: "Autre recette (la comptable classera)", compte: "47100000", compteLib: "Compte d'attente — à ventiler" },
];
