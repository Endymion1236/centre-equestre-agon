/**
 * src/lib/sepa-validation.ts
 *
 * Validation des identifiants bancaires SEPA :
 * - IBAN par checksum modulo 97 (ISO 13616)
 * - BIC structurel selon ISO 9362 + coherence pays IBAN/BIC
 *
 * Extrait de /admin/sepa/page.tsx pour pouvoir etre :
 * 1. Utilise dans plusieurs endroits (admin/sepa, future page client, API)
 * 2. Teste unitairement (Playwright via une page de test ou Vitest plus tard)
 *
 * Aucune dependance externe : ces fonctions sont pures.
 */

// ═══════════════════════════════════════════════════════════════════
//   IBAN
// ═══════════════════════════════════════════════════════════════════

/**
 * Longueurs IBAN par pays (extrait pour les principaux).
 * Liste officielle complete : https://www.iban.com/structure
 */
const IBAN_EXPECTED_LENGTHS: Record<string, number> = {
  FR: 27, MC: 27, // France, Monaco
  BE: 16,         // Belgique
  DE: 22,         // Allemagne
  CH: 21,         // Suisse
  LU: 20,         // Luxembourg
  IT: 27,         // Italie
  ES: 24,         // Espagne
  NL: 18,         // Pays-Bas
  GB: 22,         // UK
  PT: 25,         // Portugal
  AT: 20,         // Autriche
  IE: 22,         // Irlande
  FI: 18,         // Finlande
  DK: 18,         // Danemark
  SE: 24,         // Suede
  NO: 15,         // Norvege
  PL: 28,         // Pologne
};

/**
 * Validation IBAN par algorithme officiel ISO 13616 (modulo 97).
 *
 * Etapes :
 * 1. Retirer espaces, mettre en majuscules
 * 2. Verifier format de base (2 lettres + 2 chiffres + alphanumerique)
 * 3. Verifier longueur attendue par pays (FR=27, BE=16, etc.)
 * 4. Deplacer les 4 premiers caracteres a la fin
 * 5. Convertir chaque lettre en 2 chiffres (A=10, B=11, ..., Z=35)
 * 6. Calculer le modulo 97 de la chaine de chiffres (par blocs pour eviter overflow)
 * 7. Si resultat = 1, l'IBAN est valide
 *
 * @param iban IBAN a valider (peut contenir des espaces, minuscules)
 * @returns { valid: boolean, error: string | null }
 *
 * @example
 * validateIban("FR1420041010050500013M02606")  // { valid: true, error: null }
 * validateIban("FR1420041010050500013M02000")  // { valid: false, error: "Checksum invalide..." }
 * validateIban("FR14200410100505000")          // { valid: false, error: "Longueur incorrecte..." }
 */
export function validateIban(iban: string): { valid: boolean; error: string | null } {
  if (!iban) return { valid: false, error: "IBAN manquant" };
  const clean = iban.replace(/\s/g, "").toUpperCase();

  // Format de base : 2 lettres (pays) + 2 chiffres (cle) + alphanumerique
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(clean)) {
    return { valid: false, error: "Format invalide (doit commencer par 2 lettres + 2 chiffres)" };
  }

  // Verification longueur par pays
  const country = clean.substring(0, 2);
  const expected = IBAN_EXPECTED_LENGTHS[country];
  if (expected && clean.length !== expected) {
    return { valid: false, error: `Longueur incorrecte pour ${country} : ${clean.length} caractères au lieu de ${expected}` };
  }

  // Algorithme modulo 97 : deplacer les 4 premiers caracteres a la fin
  const rearranged = clean.substring(4) + clean.substring(0, 4);

  // Convertir lettres en chiffres (A=10, B=11, ..., Z=35)
  let numeric = "";
  for (const ch of rearranged) {
    if (/[0-9]/.test(ch)) {
      numeric += ch;
    } else {
      numeric += (ch.charCodeAt(0) - 55).toString();
    }
  }

  // Modulo 97 par traitement par blocs (eviter overflow JS number ~2^53)
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 9) {
    const block = remainder.toString() + numeric.substring(i, i + 9);
    remainder = parseInt(block, 10) % 97;
  }

  if (remainder !== 1) {
    return { valid: false, error: "Checksum invalide — vérifiez votre saisie" };
  }

  return { valid: true, error: null };
}

// ═══════════════════════════════════════════════════════════════════
//   BIC
// ═══════════════════════════════════════════════════════════════════

/**
 * Validation BIC (Bank Identifier Code) selon ISO 9362.
 *
 * Format attendu :
 * - 8 ou 11 caracteres
 * - 4 lettres : code banque (ex: AGRI pour Credit Agricole)
 * - 2 lettres : code pays (ex: FR pour France) — DOIT matcher avec le pays de l'IBAN si fourni
 * - 2 chars alphanumeriques : code emplacement
 * - 3 chars alphanumeriques OPTIONNELS : code succursale
 *
 * Limite : on ne peut PAS valider que le BIC pointe vers une vraie succursale
 * existante (necessiterait une API externe). On valide juste la coherence
 * structurelle + coherence pays avec l'IBAN.
 *
 * @param bic BIC a valider (peut contenir des espaces, minuscules)
 * @param countryFromIban Code pays de l'IBAN associe (ex: "FR"). Si fourni,
 *                        verifie que le BIC est du meme pays.
 * @returns { valid: boolean, error: string | null }
 *
 * @example
 * validateBic("AGRIFRPP866")          // { valid: true, error: null }
 * validateBic("AGRIFRPP", "FR")       // { valid: true, error: null }  (8 chars OK)
 * validateBic("AGRIFRP")              // { valid: false, error: "doit faire 8 ou 11..." }
 * validateBic("AGRIFRPP866", "DE")    // { valid: false, error: "Pays du BIC (FR)..." }
 */
export function validateBic(
  bic: string,
  countryFromIban?: string
): { valid: boolean; error: string | null } {
  if (!bic) return { valid: false, error: "BIC manquant" };
  const clean = bic.replace(/\s/g, "").toUpperCase();

  // Format : 8 ou 11 chars
  if (clean.length !== 8 && clean.length !== 11) {
    return { valid: false, error: `BIC doit faire 8 ou 11 caractères (vous avez ${clean.length})` };
  }

  // Structure : 4 lettres + 2 lettres + 2 alphanumeriques [+ 3 alphanumeriques]
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(clean)) {
    return { valid: false, error: "Format invalide (4 lettres banque + 2 lettres pays + 2 caractères agence)" };
  }

  // Coherence pays avec l'IBAN
  if (countryFromIban) {
    const bicCountry = clean.substring(4, 6);
    if (bicCountry !== countryFromIban) {
      return { valid: false, error: `Pays du BIC (${bicCountry}) ne correspond pas au pays de l'IBAN (${countryFromIban})` };
    }
  }

  return { valid: true, error: null };
}

// ═══════════════════════════════════════════════════════════════════
//   Utilitaires de formatage
// ═══════════════════════════════════════════════════════════════════

/**
 * Formate un IBAN par groupes de 4 caracteres (pour l'affichage).
 * Ex: FR7616606100640013539343253 -> FR76 1660 6100 6400 1353 9343 253
 */
export function formatIban(iban: string): string {
  return iban.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Masque un IBAN pour l'affichage securise (4 premiers + 4 derniers, le reste masque).
 * Ex: FR7616606100640013539343253 -> FR76 •••• •••• •••• •••• 3253
 */
export function maskIban(iban: string): string {
  const clean = iban.replace(/\s/g, "");
  if (clean.length <= 8) return clean;
  const start = clean.substring(0, 4);
  const end = clean.substring(clean.length - 4);
  // Groupes de 4 pour le milieu, masques
  const middleLen = clean.length - 8;
  const groups = Math.ceil(middleLen / 4);
  const mask = Array(groups).fill("••••").join(" ");
  return `${start} ${mask} ${end}`;
}
