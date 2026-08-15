/**
 * src/app/admin/parametres/constantes.ts
 *
 * Valeurs par défaut et listes fixes de la page Paramètres.
 *
 * Pourquoi les sortir du composant : ce sont des données de référence
 * (plan comptable Celeris, épreuves fédérales, calendrier scolaire zone B)
 * qui n'ont aucune raison d'être reconstruites à chaque rendu, et que
 * plusieurs sections de l'écran doivent lire à l'identique.
 *
 * ⚠️ Ne mettre ici que des valeurs LUES, jamais mutées. Les paliers de
 * dégressivité (multiStage / familyDiscount) sont volontairement restés dans
 * page.tsx : l'écran les modifie en place (`updated[i].discount = …`), et un
 * objet partagé au niveau module serait corrompu d'un rendu à l'autre.
 */

export const defaultAccounts = [
  { code: "70641000", label: "Animations collectivité", tva: "5.50%", affectation: "Animations CE, collectivités" },
  { code: "70611110", label: "Cotisations / Adhésions", tva: "5.50%", affectation: "Adhésions annuelles" },
  { code: "70611600", label: "Découverte / Familiarisation", tva: "5.50%", affectation: "Séances découverte, baby poney" },
  { code: "70605000", label: "Divers", tva: "20%", affectation: "Produits divers" },
  { code: "70619900", label: "Droits d'accès installations", tva: "5.50%", affectation: "Accès carrière, manège" },
  { code: "70611300", label: "Enseignement / Cartes", tva: "5.50%", affectation: "Cartes d'heures" },
  { code: "70611700", label: "Enseignement / Coaching", tva: "5.50%", affectation: "Cours particuliers, coaching" },
  { code: "70611000", label: "Enseignement / Forfaits", tva: "5.50%", affectation: "Forfaits annuels, trimestriels" },
  { code: "4386", label: "Formation professionnelle", tva: "0%", affectation: "BPJEPS, formations" },
  { code: "70613110", label: "Location poneys", tva: "20%", affectation: "Location poneys extérieurs" },
  { code: "70630110", label: "Pensions équidé", tva: "5.50%", affectation: "Pensions box, paddock" },
  { code: "70611500", label: "Randonnées / Promenades", tva: "5.50%", affectation: "Balades plage, randonnées" },
  { code: "70100000", label: "Refacturation FFE", tva: "0%", affectation: "Licences FFE refacturées" },
  { code: "70880000", label: "Refacturation soin", tva: "20%", affectation: "Soins vétérinaires refacturés" },
  { code: "70611400", label: "Stages équitation", tva: "5.50%", affectation: "Stages vacances" },
  { code: "70622011", label: "Transport", tva: "20%", affectation: "Transport chevaux/cavaliers" },
  { code: "70410000", label: "Ventes équidés", tva: "20%", affectation: "Vente de chevaux/poneys" },
];

// ─── Épreuves compétition : disciplines et leurs épreuves par défaut ───
// `default` sert au bouton « Réinitialiser aux épreuves par défaut ».
export const DISCIPLINES = [
  { key: "pony_games", label: "Pony Games", default: ["Trot en ligne","Slalom","Tonneau","Cavaletti","Portique","Barre de vitesse","Étoile","Flag race"] },
  { key: "cso", label: "CSO", default: ["Parcours A","Barrage","Maniabilité","Chrono"] },
  { key: "equifun", label: "Équifun", default: ["Parcours thématique","Épreuve de précision","Course d'obstacles","Épreuve d'adresse"] },
  { key: "endurance", label: "Endurance", default: ["Boucle 1","Boucle 2","Boucle 3","Phase vétérinaire"] },
];

// Épreuves affichées tant que le document Firestore settings/competitions
// n'a pas encore été chargé (ou s'il ne contient pas la discipline).
export const EPREUVES_PAR_DEFAUT: Record<string, string[]> = {
  pony_games: ["Trot en ligne","Slalom","Tonneau","Cavaletti","Portique","Barre de vitesse","Étoile","Flag race"],
  cso: ["Parcours A","Barrage","Maniabilité","Chrono"],
  equifun: ["Parcours thématique","Épreuve de précision","Course d'obstacles","Épreuve d'adresse"],
  endurance: ["Boucle 1","Boucle 2","Boucle 3","Phase vétérinaire"],
};

// Vacances scolaires zone B 2025-2026 (source : education.gouv.fr)
export const DEFAULT_VACATION_PERIODS = [
  { name: "Vacances de la Toussaint 2025", startDate: "2025-10-18", endDate: "2025-11-03" },
  { name: "Vacances de Noël 2025", startDate: "2025-12-20", endDate: "2026-01-05" },
  { name: "Vacances d'Hiver 2026", startDate: "2026-02-14", endDate: "2026-03-02" },
  { name: "Vacances de Printemps 2026", startDate: "2026-04-11", endDate: "2026-04-27" },
  { name: "Vacances d'Été 2026", startDate: "2026-07-04", endDate: "2026-08-31" },
];

// Classe commune des petits champs de saisie centrés (tarifs, %, durées).
// Partagée par les sections Réductions, Dégressivité, Annulation et Horaires.
export const inputCls = "px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none text-center";
