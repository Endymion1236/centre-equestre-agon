/**
 * src/app/admin/comptabilite/constants.ts
 *
 * Tables de référence de l'écran Comptabilité : plan comptable, libellés des
 * modes de paiement, palettes des onglets.
 *
 * Pourquoi les sortir de page.tsx : ce sont des données, pas de la logique.
 * Le plan comptable vient de Celeris (le logiciel du cabinet) et sert à la
 * fois au FEC et à l'affichage ; les libellés de modes sont recopiés dans une
 * dizaine d'endroits de l'écran — les avoir en un seul point évite qu'un
 * « Chèques Vacances » devienne « Chèque vacances » selon l'onglet.
 */

import type { TabColor } from "./types";

/**
 * Plan comptable des produits, avec le taux de TVA associé.
 * L'enseignement équestre est à 5,5 % ; les ventes de matériel, transports et
 * locations restent à 20 %. Ce tableau n'est pour l'instant affiché que dans
 * l'onglet FEC (nombre de comptes importés), le FEC lui-même écrivant les
 * numéros de compte en dur — cf. fec.ts.
 */
export const accounts = [
  { code: "70641000", label: "Animations collectivité", tva: 5.5 },
  { code: "70611110", label: "Cotisations / Adhésions", tva: 5.5 },
  { code: "70611600", label: "Découverte / Familiarisation", tva: 5.5 },
  { code: "70605000", label: "Divers", tva: 20 },
  { code: "70619900", label: "Droits d'accès installations", tva: 5.5 },
  { code: "70611300", label: "Enseignement / Cartes", tva: 5.5 },
  { code: "70611700", label: "Enseignement / Coaching", tva: 5.5 },
  { code: "70611000", label: "Enseignement / Forfaits", tva: 5.5 },
  { code: "4386", label: "Formation professionnelle", tva: 0 },
  { code: "70613110", label: "Location poneys", tva: 20 },
  { code: "70630110", label: "Pensions équidé", tva: 5.5 },
  { code: "70611500", label: "Randonnées / Promenades", tva: 5.5 },
  { code: "70100000", label: "Refacturation FFE", tva: 0 },
  { code: "70880000", label: "Refacturation soin", tva: 20 },
  { code: "70611400", label: "Stages équitation", tva: 5.5 },
  { code: "70622011", label: "Transport", tva: 20 },
  { code: "70410000", label: "Ventes équidés", tva: 20 },
];

export const modeLabels: Record<string, string> = {
  cb_terminal: "CB Terminal", cb_online: "CB en ligne", cheque: "Chèque", especes: "Espèces",
  cheque_vacances: "Chèques Vacances", pass_sport: "Pass'Sport", ancv: "ANCV",
  virement: "Virement", avoir: "Avoir", prelevement_sepa: "Prélèvement SEPA",
};

/**
 * Classes Tailwind par couleur d'onglet.
 *
 * On évite l'interpolation dynamique (`bg-${color}-500`) car Tailwind purge en
 * compilation toutes les classes qu'il ne voit pas écrites en toutes lettres :
 * un onglet coloré dynamiquement sortirait gris en production. D'où ces
 * chaînes complètes.
 */
export const tabClasses: Record<TabColor, { active: string; inactive: string }> = {
  blue:   { active: "bg-blue-500 text-white border-blue-500",       inactive: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
  purple: { active: "bg-purple-500 text-white border-purple-500",   inactive: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100" },
  green:  { active: "bg-green-600 text-white border-green-600",     inactive: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" },
  indigo: { active: "bg-indigo-500 text-white border-indigo-500",   inactive: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100" },
  slate:  { active: "bg-slate-500 text-white border-slate-500",     inactive: "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100" },
  rose:   { active: "bg-rose-600 text-white border-rose-600",       inactive: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100" },
  amber:  { active: "bg-amber-500 text-white border-amber-500",     inactive: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" },
};
