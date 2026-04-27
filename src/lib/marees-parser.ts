/**
 * Parser pour les données de marée copiées depuis Météo Consult Marine
 * (https://marine.meteoconsult.fr/meteo-marine/horaires-des-marees/pointe-d-agon-944/)
 *
 * Format d'entrée typique (copier-coller du site, mois entier) :
 *
 *   mercredi 1
 *   Marée basse 02h51 1.93m
 *   Marée haute 07h54 12.39m  89
 *   Marée basse 15h16 1.63m
 *   Marée haute 20h18 12.42m  92
 *   Lune gibbeuse croissante
 *   Saint Hugues
 *   Lever 07h41 ...
 *
 *   jeudi 2
 *   Marée basse 03h30 1.65m
 *   ...
 *
 * Le parser :
 * - Détecte les en-têtes de jour (lundi N, mardi N, ..., dimanche N)
 * - Extrait les lignes "Marée basse/haute HHhMM X.XXm [coef]"
 * - Convertit en format Maree[]
 * - Tolère lignes parasites (Lune, Saint, Lever, Coucher, etc.)
 */

import type { Maree } from "./marees";

// Noms de jours en français pour détecter les en-têtes
const JOURS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

// Noms de mois en français → numéro (1-12)
const MOIS_FR: Record<string, number> = {
  "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4,
  "mai": 5, "juin": 6, "juillet": 7, "août": 8, "aout": 8,
  "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12, "decembre": 12,
};

export interface ParseResult {
  success: boolean;
  data: Record<string, Maree[]>; // { "2026-04-27": [...], ... }
  errors: string[];              // erreurs non bloquantes (ligne ignorée etc.)
  daysParsed: number;
  totalMarees: number;
  warnings: string[];
}

/**
 * Parse le texte collé depuis Météo Consult.
 * @param text Texte brut (multi-lignes)
 * @param yearHint Année à utiliser pour les dates (le format ne contient
 *                 souvent que "mercredi 1" sans année). Défaut : année courante.
 * @param monthHint Mois (1-12) à utiliser. Si non fourni, on tente de le
 *                  détecter depuis le texte (ex : "avril 2026") ou on prend
 *                  le mois courant.
 */
export function parseMeteoConsult(
  text: string,
  yearHint?: number,
  monthHint?: number
): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const data: Record<string, Maree[]> = {};
  let totalMarees = 0;

  // 1. Tenter de détecter l'année et le mois depuis le texte
  let detectedYear = yearHint ?? new Date().getFullYear();
  let detectedMonth = monthHint ?? (new Date().getMonth() + 1);

  const moisRegex = new RegExp(
    `\\b(${Object.keys(MOIS_FR).join("|")})\\s+(\\d{4})\\b`,
    "i"
  );
  const moisMatch = text.match(moisRegex);
  if (moisMatch) {
    detectedYear = parseInt(moisMatch[2], 10);
    detectedMonth = MOIS_FR[moisMatch[1].toLowerCase()];
  }

  // 2. Découper en blocs par jour (chaque bloc commence par "lundi N", "mardi N"...)
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  let currentDate: string | null = null;
  let currentMarees: Maree[] = [];
  let lastSeenDay = 0; // pour détecter le passage au mois suivant

  const flushDay = () => {
    if (currentDate && currentMarees.length > 0) {
      data[currentDate] = currentMarees;
      totalMarees += currentMarees.length;
    }
    currentMarees = [];
  };

  // Regex en-tête jour : "mercredi 1", "jeudi 30", éventuellement avec date complète
  const dayHeaderRegex = new RegExp(
    `^(${JOURS_FR.join("|")})\\s+(\\d{1,2})(?:\\s+(${Object.keys(MOIS_FR).join("|")})(?:\\s+(\\d{4}))?)?\\s*$`,
    "i"
  );

  // Regex marée : "Marée basse 02h51 1.93m" ou "Marée haute 07h54 12.39m  89"
  // Tolère espacement, point ou virgule décimale, "BM"/"PM" abrégé.
  const mareeRegex = /^(?:Mar[ée]e\s+)?(basse|haute|BM|PM)\s+(\d{1,2})[h:](\d{2})\s+(\d{1,2}[.,]\d{1,2})\s*m?\s*(\d{1,3})?\s*$/i;

  for (const line of lines) {
    const dayMatch = line.match(dayHeaderRegex);
    if (dayMatch) {
      flushDay();
      const dayNum = parseInt(dayMatch[2], 10);
      // Si présent, écraser le mois/année détecté avec ceux de l'en-tête
      let m = detectedMonth;
      let y = detectedYear;
      if (dayMatch[3]) m = MOIS_FR[dayMatch[3].toLowerCase()];
      if (dayMatch[4]) y = parseInt(dayMatch[4], 10);

      // Détection passage au mois suivant : si lastSeenDay = 30 et dayNum = 1
      // sans en-tête mois explicite, on incrémente
      if (!dayMatch[3] && lastSeenDay > dayNum && lastSeenDay >= 25 && dayNum <= 5) {
        m += 1;
        if (m > 12) { m = 1; y += 1; }
        warnings.push(`Bascule auto vers ${m}/${y} après le ${lastSeenDay}`);
      }

      currentDate = `${y}-${String(m).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      lastSeenDay = dayNum;
      continue;
    }

    const mareeMatch = line.match(mareeRegex);
    if (mareeMatch) {
      if (!currentDate) {
        errors.push(`Marée orpheline ignorée : "${line}"`);
        continue;
      }
      const typeStr = mareeMatch[1].toLowerCase();
      const type: "PM" | "BM" =
        typeStr === "haute" || typeStr === "pm" ? "PM" : "BM";
      const hh = mareeMatch[2].padStart(2, "0");
      const mm = mareeMatch[3];
      const time = `${hh}:${mm}`;
      const height = parseFloat(mareeMatch[4].replace(",", "."));
      const coefRaw = mareeMatch[5];
      const coef = coefRaw ? parseInt(coefRaw, 10) : undefined;

      const m: Maree = { type, time, height };
      if (coef && type === "PM") m.coef = coef;

      currentMarees.push(m);
      continue;
    }

    // Lignes ignorées : Lune, Saint, Lever, Coucher, etc.
    // On ne fait pas d'erreur sauf si la ligne ressemble à une marée mal formée.
    if (/mar[ée]e/i.test(line) && !mareeMatch) {
      errors.push(`Ligne 'marée' non reconnue : "${line}"`);
    }
  }

  flushDay();

  return {
    success: Object.keys(data).length > 0,
    data,
    errors,
    daysParsed: Object.keys(data).length,
    totalMarees,
    warnings,
  };
}
