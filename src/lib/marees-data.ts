/**
 * Données marées Pointe d'Agon - source officielle SHOM (maree.shom.fr).
 *
 * Format : { "YYYY-MM-DD": [{ type, time, height, coef? }, ...] }
 *
 * Pour ajouter des dates : utiliser l'outil de saisie dans
 * /admin/parametres > Marées (à venir) qui parse le format SHOM.
 *
 * Les coefficients ne sont renseignés que sur les PM (pratique courante :
 * une journée a 1 ou 2 valeurs de coefficient, identiques pour les 2 PM).
 */

import type { Maree } from "./marees";

export const MAREES_POINTE_AGON_2026: Record<string, Maree[]> = {
  // Lundi 27 avril 2026 (depuis capture SHOM Nicolas)
  "2026-04-27": [
    { type: "PM", time: "05:05", height: 10.17, coef: 56 },
    { type: "BM", time: "12:10", height: 3.44 },
    { type: "PM", time: "17:43", height: 10.42, coef: 61 },
  ],

  // Mardi 28 avril 2026
  "2026-04-28": [
    { type: "BM", time: "00:34", height: 3.37 },
    { type: "PM", time: "05:59", height: 10.81, coef: 66 },
    { type: "BM", time: "13:07", height: 2.86 },
    { type: "PM", time: "18:29", height: 11.07, coef: 71 },
  ],

  // Mercredi 29 avril 2026
  "2026-04-29": [
    { type: "BM", time: "01:27", height: 2.78 },
    { type: "PM", time: "06:44", height: 11.35, coef: 74 },
    { type: "BM", time: "13:55", height: 2.44 },
    { type: "PM", time: "19:10", height: 11.56, coef: 77 },
  ],

  // Jeudi 30 avril 2026
  "2026-04-30": [
    { type: "BM", time: "02:12", height: 2.39 },
    { type: "PM", time: "07:24", height: 11.72, coef: 80 },
    { type: "BM", time: "14:37", height: 2.20 },
    { type: "PM", time: "19:46", height: 11.88, coef: 81 },
  ],
};
