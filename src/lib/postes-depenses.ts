/**
 * Les postes de dépenses suivis — source unique.
 *
 * Utilisée par l'écran Dépenses par poste ET par l'extraction des relevés de
 * compte (API trésorerie), qui propose un poste pour chaque débit lu : les
 * deux doivent parler exactement la même langue, sinon les catégories
 * proposées ne retomberaient pas sur les lignes du tableau.
 *
 * `ref` : total du poste sur l'exercice 2024-25 (compte de résultat détaillé
 * du bilan clos le 30/06/2025) — la référence de comparaison, à rafraîchir à
 * chaque nouveau bilan.
 */
export const POSTES_DEPENSES: { nom: string; ref: number | null }[] = [
  { nom: "Aliments, litières, paille", ref: 24723 },
  { nom: "Maréchalerie & travail des chevaux", ref: 7597 },
  { nom: "Vétérinaire & santé des chevaux", ref: 7877 },
  { nom: "Eau & électricité", ref: 7227 },
  { nom: "Carburants", ref: 3391 },
  { nom: "Fournitures & petit équipement (dont sellerie)", ref: 18470 },
  { nom: "Entretien (bâtiments, matériel, véhicules)", ref: 10546 },
  { nom: "Locations & loyers", ref: 21357 },
  { nom: "Assurances", ref: 9992 },
  { nom: "Retraite / PER — à vérifier", ref: null },
  { nom: "Honoraires & gestion (compta, juridique, GHN)", ref: 5321 },
  // Bilan 24-25 : services bancaires 1 464 + commissions CB 995 + commissions
  // s/emprunt 39 + frais ANCV 76 — les « Commission vente à distance »,
  // « Com Carte », factures Crédit Agricole et commissions Stripe vont ici.
  { nom: "Frais bancaires & commissions (CB, Stripe)", ref: 2574 },
  { nom: "Publicité & communication", ref: 2024 },
  { nom: "Engagements de concours", ref: null },
  { nom: "Autres dépenses", ref: null },
];

/** Valeur sentinelle pour un débit qui n'est PAS une dépense à suivre. */
export const POSTE_HORS_DEPENSES = "hors-depenses";

/**
 * Commission ou frais prélevés par la banque elle-même : « Com Carte »,
 * « Commission vente à distance », frais de tenue de compte, cotisation
 * carte… Pour ces lignes, la banque n'émet pas de facture séparée : le relevé
 * bancaire est le justificatif, et l'écran permet de le déclarer comme tel.
 * Règle sur un libellé explicite, jamais sur « Carte » seul (un paiement par
 * carte n'est pas une commission).
 */
export function posteCommissionCarte(libelle: unknown): string | null {
  const texte = String(libelle ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const commission = /^(com|comm|commission|commissions) (carte|cartes|cb|vente( a)? distance|vad|paiement|paiements|encaissement|encaissements|interchange|monetique|tpe)\b/.test(texte)
    || /^(frais|cotisation|cotisations|abonnement) (bancaire|bancaires|de tenue de compte|tenue de compte|carte|cartes|cb|tpe)\b/.test(texte)
    || /^(commission|commissions) s(ur)? emprunt/.test(texte);
  return commission ? "Frais bancaires & commissions (CB, Stripe)" : null;
}
