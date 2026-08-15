/**
 * src/app/admin/forfaits/constantes.ts
 *
 * Les libellés et les tarifs fixes de l'écran « Forfaits annuels ».
 *
 * Pourquoi séparé : ces valeurs sont recopiées à plusieurs endroits de
 * l'écran (le formulaire de création affiche les prix, la liste affiche les
 * statuts, trois fonctions différentes traduisent un jour en texte). Une
 * seule définition évite qu'un tarif change à un endroit et pas à l'autre —
 * on parle ici de facturation réelle.
 */

/** Jours de la semaine à la française : l'indice 0 est LUNDI. */
export const dayLabels = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/**
 * Jours de la semaine dans l'ordre de `Date.getDay()` : l'indice 0 est
 * DIMANCHE. À ne pas confondre avec `dayLabels` ci-dessus : les créneaux réels
 * sont identifiés par le `getDay()` de leur date, donc par cette table-ci.
 */
export const NOMS_JOURS_DEPUIS_DIMANCHE = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/**
 * Statuts d'un forfait. `active` et `actif` cohabitent : les documents créés
 * par cet écran écrivent `active`, des forfaits plus anciens portent `actif`.
 * Les deux doivent rester traités comme « en cours ».
 */
export const statusConfig: Record<string, { label: string; color: "green" | "orange" | "gray" | "red" }> = {
  active: { label: "Actif", color: "green" },
  actif: { label: "Actif", color: "green" },
  suspended: { label: "Suspendu", color: "orange" },
  completed: { label: "Terminé", color: "gray" },
  cancelled: { label: "Résilié", color: "red" },
};

/** Tarifs annexes facturés en plus du forfait, à l'inscription. */
export const LICENCE_FFE_MOINS18 = 25;
export const LICENCE_FFE_PLUS18 = 36;
export const ADHESION_PRICE = 60;
