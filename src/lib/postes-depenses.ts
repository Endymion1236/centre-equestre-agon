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
  { nom: "Honoraires & gestion (compta, juridique, GHN)", ref: 5321 },
  // Bilan 24-25 : services bancaires 1 464 + commissions CB 995 + commissions
  // s/emprunt 39 + frais ANCV 76 — les « Commission vente à distance »,
  // « Com Carte », factures Crédit Agricole et commissions Stripe vont ici.
  { nom: "Frais bancaires & commissions (CB, Stripe)", ref: 2574 },
  { nom: "Publicité & communication", ref: 2024 },
  { nom: "Autres dépenses", ref: null },
];

/** Valeur sentinelle pour un débit qui n'est PAS une dépense à suivre. */
export const POSTE_HORS_DEPENSES = "hors-depenses";
