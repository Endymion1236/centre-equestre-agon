/**
 * Catégories de recettes et comptes comptables associés.
 *
 * Source unique pour toutes les lignes saisies librement — caisse et
 * récurrences — afin qu'une pension facturée à la caisse et la même pension
 * facturée par récurrence tombent dans le même compte.
 *
 * ⚠️ Ces codes viennent du formulaire d'encaissement historique. Le module
 * Comptabilité affiche par ailleurs un plan importé de Celeris, plus détaillé
 * (« Pensions équidé » 70630110). Les deux listes coexistent : celle-ci sert à
 * qualifier la ligne, l'autre reste la référence du comptable.
 */
export interface CategorieComptable {
  id: string;
  label: string;
  compte: string;
  tvaDefault: string;
}

export const CATEGORIES_COMPTABLES: CategorieComptable[] = [
  { id: "enseignement", label: "Enseignement", compte: "706100", tvaDefault: "5.5" },
  { id: "pension", label: "Pension / Hébergement", compte: "706200", tvaDefault: "10" },
  { id: "location", label: "Location (box, matériel)", compte: "706300", tvaDefault: "20" },
  { id: "vente", label: "Vente (équipement, produits)", compte: "707000", tvaDefault: "20" },
  { id: "licence", label: "Licence / Cotisation FFE", compte: "706400", tvaDefault: "0" },
  { id: "transport", label: "Transport", compte: "706500", tvaDefault: "10" },
  { id: "evenement", label: "Événement / Animation", compte: "706600", tvaDefault: "5.5" },
  { id: "autre", label: "Autre", compte: "708000", tvaDefault: "20" },
];

/** Compte comptable d'une catégorie — repli sur « Autre » si inconnue. */
export function compteDeCategorie(id?: string): string {
  return CATEGORIES_COMPTABLES.find(c => c.id === id)?.compte
    || CATEGORIES_COMPTABLES[CATEGORIES_COMPTABLES.length - 1].compte;
}
