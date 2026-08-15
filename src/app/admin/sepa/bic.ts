/**
 * src/app/admin/sepa/bic.ts
 *
 * Déduction du BIC à partir du code banque d'un IBAN français (caractères 5 à
 * 9 de l'IBAN, soit le code établissement).
 *
 * Pourquoi c'est là : les familles recopient leur IBAN depuis un RIB mais
 * oublient presque toujours le BIC, alors que le fichier de remise en a besoin
 * pour chaque débiteur. Cette table évite de le leur redemander pour les
 * banques qu'on croise réellement à Agon. Elle n'est volontairement PAS
 * exhaustive : quand le code n'y est pas, on rend une chaîne vide et l'admin
 * saisit le BIC à la main — un BIC deviné faux serait pire qu'un BIC absent.
 *
 * La valeur proposée ici n'est jamais enregistrée telle quelle : elle repasse
 * par `validateBic` (cohérence structurelle + pays de l'IBAN) avant écriture.
 *
 * Fonction pure, sans état d'écran : elle est appelée à la fois pendant la
 * frappe de l'IBAN (auto-complétion du champ) et au moment de l'enregistrement.
 */

// ═══ BIC lookup simplifié (premiers 5 chiffres IBAN FR → BIC) ═══
const BIC_LOOKUP: Record<string, string> = {
  "10007": "BDFEFRPP",    // Banque de France
  "10096": "CMCIFRPP",    // CIC
  "10278": "CMCIFRPP",    // CIC
  "12506": "AGRIFRPP",    // Crédit Agricole
  "13106": "AGRIFRPP",    // Crédit Agricole
  "13807": "CCBPFRPP",    // Banque Populaire
  "14445": "CEPAFRPP",    // Caisse d'Épargne
  "14518": "CEPAFRPP",    // Caisse d'Épargne
  "15489": "CMCIFR2A",    // Crédit Mutuel
  "16606": "AGRIFRPP866", // Crédit Agricole Normandie
  "16607": "AGRIFRPP866", // Crédit Agricole Normandie
  "17515": "CEPAFRPP",    // Caisse d'Épargne
  "20041": "PSSTFRPP",    // La Banque Postale
  "30002": "BNPAFRPP",    // BNP
  "30003": "SOGEFRPP",    // Société Générale
  "30004": "BNPAFRPPXXX", // BNP Paribas
  "30006": "AGRIFRPP",    // Crédit Agricole (autre)
  "30027": "CMCIFRPP",    // CIC
  "30056": "HSBNFRPP",    // HSBC
  "30076": "NORDFRPP",    // Banque de Savoie
  "11425": "CEPAFRPP142", // Caisse d'Épargne Normandie
};

export function lookupBic(iban: string): string {
  if (!iban || iban.length < 9) return "";
  const code = iban.substring(4, 9);
  return BIC_LOOKUP[code] || "";
}
