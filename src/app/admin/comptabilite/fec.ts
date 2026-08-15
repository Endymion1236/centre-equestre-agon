"use client";

/**
 * src/app/admin/comptabilite/fec.ts
 *
 * Génération du FEC — Fichier des Écritures Comptables — au format imposé par
 * l'article L47 A-I du Livre des procédures fiscales.
 *
 * Pourquoi c'est isolé : ce fichier est une pièce RÉGLEMENTAIRE. Sa structure
 * (18 colonnes séparées par des tabulations, dans cet ordre exact) et sa
 * logique d'écriture — une ligne produit, une ligne de TVA collectée quand
 * elle est non nulle, une ligne de créance client — ne doivent pas être
 * modifiées à l'occasion d'un remaniement d'affichage. Isolé, ce risque
 * disparaît : on ne touche à ce fichier que lorsqu'on parle au comptable.
 */

import type { Payment } from "./types";

/**
 * Construit le FEC de la période et déclenche son téléchargement.
 *
 * `filteredPayments` doit déjà être restreint à la période : la fonction ne
 * refiltre rien, elle numérote les écritures dans l'ordre reçu.
 */
export function genererFEC(filteredPayments: Payment[], period: string) {
  const header = "JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise";
  const rows: string[] = [];
  let ecritureNum = 1;

  filteredPayments.forEach((p, idx) => {
    const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : new Date();
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const pieceRef = `F${d.getFullYear()}-${String(idx + 1).padStart(3, "0")}`;

    // Ligne produit
    (p.items || []).forEach((item) => {
      rows.push(`VE\tVentes\t${ecritureNum}\t${dateStr}\t70611400\tStages équitation\t\t\t${pieceRef}\t${dateStr}\t${item.activityTitle}\t\t${(item.priceHT || 0).toFixed(2)}\t\t\t${dateStr}\t\t`);
      ecritureNum++;
      // TVA
      const tvaAmount = (item.priceTTC || 0) - (item.priceHT || 0);
      if (tvaAmount > 0) {
        rows.push(`VE\tVentes\t${ecritureNum}\t${dateStr}\t44571\tTVA collectée\t\t\t${pieceRef}\t${dateStr}\tTVA ${item.tva || 5.5}%\t\t${tvaAmount.toFixed(2)}\t\t\t${dateStr}\t\t`);
        ecritureNum++;
      }
    });
    // Créance client
    rows.push(`VE\tVentes\t${ecritureNum}\t${dateStr}\t411000\tClients\t${p.familyName}\t${p.familyName}\t${pieceRef}\t${dateStr}\tCréance ${p.familyName}\t${(p.totalTTC || 0).toFixed(2)}\t\t\t\t${dateStr}\t\t`);
    ecritureNum++;
  });

  const content = header + "\n" + rows.join("\n");
  const blob = new Blob([content], { type: "text/tab-separated-values;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `FEC_${period.replace("-", "")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
