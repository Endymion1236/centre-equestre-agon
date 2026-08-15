"use client";

/**
 * src/app/admin/comptabilite/csv-bancaire.ts
 *
 * Lecture du fichier CSV téléchargé depuis la banque (Crédit Agricole en
 * pratique, mais le parser accepte aussi les formats simples LCL / BNP / SG).
 *
 * Pourquoi ce module est séparé du rapprochement : ce sont deux métiers
 * différents. Ici on ne fait que transformer un fichier texte hostile
 * (en-tête multi-lignes, libellés entre guillemets qui contiennent des
 * retours à la ligne, virgule décimale, encodage Latin1) en lignes propres.
 * Le fait de savoir à quel encaissement correspond une ligne est le travail
 * de rapprochement.ts.
 *
 * ⚠️ Le garde-fou de période est ici et pas ailleurs parce qu'il porte sur le
 * FICHIER, pas sur les données : c'est le seul endroit où l'on sait encore
 * quel intervalle Nicolas a demandé à sa banque.
 */

import type { BankLine } from "./types";

/**
 * Vérifie l'intervalle de dates annoncé en tête du CSV et demande
 * confirmation si quelque chose cloche.
 *
 * Retourne `false` si l'admin décide d'annuler l'import, `true` sinon
 * (y compris quand le fichier n'annonce aucune période — cas des banques
 * autres que le Crédit Agricole, où l'on continue sans vérification).
 */
export function verifierPeriodeCsv(raw: string): boolean {
  // Le Credit Agricole renvoie une ligne "Liste des operations du compte
  // entre le DD/MM/YYYY et le DD/MM/YYYY" en debut de fichier. Si Nicolas
  // se trompe dans son filtre cote banque (intervalle inverse, dates
  // futures non encore comptabilisees, etc.), le CSV peut ne contenir
  // qu'une periode tronquee, voire une seule journee.
  // On lit cette ligne et on previent au moindre doute :
  //   - periode tres courte (< 3 jours)
  //   - date de fin tres ancienne (> 30 jours avant aujourd'hui)
  // Confirmation requise avant de poursuivre l'import dans ces cas-la.
  const periodeMatch = raw.match(/entre le (\d{2})\/(\d{2})\/(\d{4})\s+et le (\d{2})\/(\d{2})\/(\d{4})/i);
  if (periodeMatch) {
    const [, d1, m1, y1, d2, m2, y2] = periodeMatch;
    const startStr = `${d1}/${m1}/${y1}`;
    const endStr = `${d2}/${m2}/${y2}`;
    const startDate = new Date(`${y1}-${m1}-${d1}T12:00:00`);
    const endDate = new Date(`${y2}-${m2}-${d2}T12:00:00`);
    const nbJours = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
    const now = new Date();
    const joursDepuisFin = Math.round((now.getTime() - endDate.getTime()) / 86_400_000);

    const alertes: string[] = [];
    if (nbJours < 3) alertes.push(`• Periode tres courte : seulement ${nbJours} jour(s)`);
    if (joursDepuisFin > 30) alertes.push(`• Derniere operation il y a ${joursDepuisFin} jours`);
    if (nbJours <= 0) alertes.push(`• Periode invalide : fin (${endStr}) anterieure au debut (${startStr})`);

    if (alertes.length > 0) {
      const ok = window.confirm(
        `⚠️ Periode lue dans le CSV : ${startStr} → ${endStr} (${nbJours} jour${nbJours > 1 ? "s" : ""})\n\n` +
        alertes.join("\n") +
        `\n\nCela peut indiquer un filtre de date incorrect cote banque ` +
        `(intervalle inverse, dates futures, etc.).\n\n` +
        `Continuer quand meme l'import ?`,
      );
      if (!ok) return false;
    } else {
      // Periode OK : info discrete dans la console pour debug
      console.log(`📅 CSV : ${startStr} → ${endStr} (${nbJours} jours)`);
    }
  }
  // Si la ligne de periode est absente (autre banque que CA), on continue
  // sans verification : le format simple n'a pas de header de periode.
  return true;
}

/**
 * Transforme le contenu brut du CSV en lignes bancaires exploitables.
 *
 * Ne garde que les CRÉDITS : le rapprochement bancaire ne concerne que les
 * encaissements, les débits (achats, frais, salaires) n'ont rien à faire ici.
 */
export function parserLignesCsvBancaire(raw: string): BankLine[] {
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
