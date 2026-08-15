/**
 * src/app/admin/paiements/constantes-encaisser.ts
 *
 * Le vocabulaire figé de l'onglet « Encaisser » : les catégories de recette
 * proposées pour une saisie libre, et la classe des champs de saisie.
 *
 * Pourquoi sortir les catégories du composant : chacune porte un COMPTE
 * COMPTABLE (706100, 707000…) et un taux de TVA par défaut. Ce couple est
 * recopié tel quel dans l'article du panier, donc dans la commande, donc
 * dans l'export comptable. Ce n'est pas de l'état d'écran : c'est le plan
 * de comptes du centre. Le laisser au milieu du JSX faisait qu'un ajout de
 * catégorie ressemblait à une retouche d'interface, alors que ça engage la
 * comptabilité.
 *
 * `inputCls` suit ici parce que les morceaux d'écran extraits dans les
 * fichiers voisins doivent tous rendre EXACTEMENT le même champ : si chacun
 * recopiait la chaîne Tailwind, les formulaires finiraient par diverger.
 */

/** Une ligne de recette : ce qu'on vend, sur quel compte, à quelle TVA. */
export interface CategorieRecette {
  id: string;
  label: string;
  compte: string;
  tvaDefault: string;
}

export const CATEGORIES: CategorieRecette[] = [
  { id: "enseignement", label: "Enseignement", compte: "706100", tvaDefault: "5.5" },
  { id: "pension", label: "Pension / Hébergement", compte: "706200", tvaDefault: "10" },
  { id: "location", label: "Location (box, matériel)", compte: "706300", tvaDefault: "20" },
  { id: "vente", label: "Vente (équipement, produits)", compte: "707000", tvaDefault: "20" },
  { id: "licence", label: "Licence / Cotisation FFE", compte: "706400", tvaDefault: "0" },
  { id: "transport", label: "Transport", compte: "706500", tvaDefault: "10" },
  { id: "evenement", label: "Événement / Animation", compte: "706600", tvaDefault: "5.5" },
  { id: "autre", label: "Autre", compte: "708000", tvaDefault: "20" },
];

/** Apparence commune de tous les champs de saisie de l'onglet. */
export const inputCls = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";
