import type { BankLine } from "./types";

/**
 * Parser CSV bancaire — extrait depuis page.tsx:706-790.
 *
 * Comportement (à figer par les tests, ne PAS modifier dans ce refactor) :
 * 1. Détecte la ligne d'en-tête (contient "date" + "libellé"/"label"). Fallback ligne 0.
 * 2. Détecte le format : Débit/Crédit (CA) ou Montant unique (simple).
 * 3. Parse caractère par caractère pour gérer les guillemets multi-lignes.
 * 4. Sépare les champs par ";" (hors guillemets), collapse les whitespace.
 * 5. Valide la date par regex (DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY).
 * 6. Convertit débit/crédit en `amount = credit - debit`, ne garde que `amount > 0`.
 *
 * Encodage : le fichier doit être lu en ISO-8859-1 (Latin1) côté FileReader,
 * cf. page.tsx:1713. Cette fonction reçoit déjà la string décodée.
 */
export function parseCreditAgricoleCsv(raw: string): BankLine[] {
  // ── Parser intelligent pour CSV bancaires (Crédit Agricole, etc.) ──
  // Détecte automatiquement le format :
  // - Format CA : en-tête multi-lignes, libellés multi-lignes entre guillemets,
  //   colonnes Date;Libellé;Débit euros;Crédit euros; séparées par ;
  // - Format simple : Date;Libellé;Montant

  // 1. Trouver la ligne d'en-tête (celle qui contient "Date" et "Libellé" ou "Label")
  const allLines = raw.split("\n");
  let headerIdx = allLines.findIndex(l => {
    const lower = l.toLowerCase();
    return (lower.includes("date") && (lower.includes("libellé") || lower.includes("libelle") || lower.includes("label")));
  });
  if (headerIdx < 0) headerIdx = 0; // fallback : première ligne

  const headerLine = allLines[headerIdx].toLowerCase();
  const hasDebitCredit = headerLine.includes("débit") || headerLine.includes("debit") || headerLine.includes("crédit") || headerLine.includes("credit");

  // 2. Extraire le contenu après l'en-tête
  const dataText = allLines.slice(headerIdx + 1).join("\n");

  // 3. Parser les champs CSV avec guillemets multi-lignes
  const records: { date: string; label: string; debit: number; credit: number }[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < dataText.length; i++) {
    const ch = dataText[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === "\n" && !inQuotes) {
      // Fin de ligne réelle (hors guillemets)
      if (current.trim()) {
        const fields = [];
        let field = "";
        let fInQ = false;
        for (let j = 0; j < current.length; j++) {
          const fc = current[j];
          if (fc === '"') { fInQ = !fInQ; }
          else if (fc === ";" && !fInQ) { fields.push(field.trim()); field = ""; }
          else { field += fc; }
        }
        fields.push(field.trim());

        // Nettoyer les champs (supprimer espaces multiples, retours à la ligne dans les libellés)
        const cleanField = (s: string) => s.replace(/\s+/g, " ").trim();

        const date = cleanField(fields[0] || "");
        const label = cleanField(fields[1] || "");

        // Vérifier que la date ressemble à une date (DD/MM/YYYY, D/M/YYYY, YYYY-MM-DD, DD-MM-YYYY)
        const isDate = /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date) || /^\d{4}-\d{2}-\d{2}$/.test(date) || /^\d{1,2}-\d{1,2}-\d{4}$/.test(date);

        if (isDate && label) {
          if (hasDebitCredit) {
            // Format CA : Date;Libellé;Débit;Crédit
            const debit = parseFloat((fields[2] || "0").replace(/\s/g, "").replace(",", ".")) || 0;
            const credit = parseFloat((fields[3] || "0").replace(/\s/g, "").replace(",", ".")) || 0;
            records.push({ date, label, debit, credit });
          } else {
            // Format simple : Date;Libellé;Montant
            const amount = parseFloat((fields[2] || "0").replace(/\s/g, "").replace(",", ".")) || 0;
            records.push({ date, label, debit: amount < 0 ? Math.abs(amount) : 0, credit: amount > 0 ? amount : 0 });
          }
        }
      }
      current = "";
    } else {
      current += ch;
    }
  }

  // 4. Convertir en format attendu (montant = crédit - débit pour avoir + pour les recettes)
  // On ne garde que les crédits (mouvements entrants). Les débits sont tous exclus d'office
  // car le rapprochement bancaire ne concerne que les encaissements.
  const parsed = records.map(r => ({
    date: r.date,
    label: r.label,
    amount: Math.round((r.credit - r.debit) * 100) / 100,
    matched: false,
    matchType: "" as string,
    matchDetail: "" as string,
  })).filter(r => r.amount > 0);

  return parsed;
}
