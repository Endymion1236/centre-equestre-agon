/**
 * tests/unit/pieces-zip.test.ts — noms des factures dans le ZIP du mois.
 *   npx tsx tests/unit/pieces-zip.test.ts
 */
import assert from "node:assert/strict";
import { fichiersPieces } from "../../src/lib/pieces-zip";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };

test("une pièce par fichier, nom lisible, doublons de nom distingués", () => {
  const f = fichiersPieces([
    { dateOperation: "2026-07-03", fournisseur: "Agrial Saint-Lô", montant: 412.5, piece: { id: "abcdef123", nom: "facture.PDF" } },
    { dateOperation: "2026-07-10", fournisseur: "Agrial Saint-Lô", montant: 80, piece: { id: "abcdef123", nom: "facture.PDF" } },
    { dateOperation: "2026-07-03", fournisseur: "Agrial Saint-Lô", montant: 412.5, piece: { id: "zzz999xx", mime: "application/pdf" } },
    { dateOperation: "2026-07-05", fournisseur: "Gamm Vert", montant: 12, piece: { id: "photo1", mime: "image/jpeg" } },
    { dateOperation: "2026-07-04", fournisseur: "Maréchal Éric", montant: 90, piece: null },
  ]);
  assert.deepEqual(f, [
    { id: "abcdef123", nom: "2026-07-03 - Agrial Saint-Lo - 412.50 EUR.pdf" },
    { id: "zzz999xx", nom: "2026-07-03 - Agrial Saint-Lo - 412.50 EUR (zzz999).pdf" },
    { id: "photo1", nom: "2026-07-05 - Gamm Vert - 12.00 EUR.jpg" },
  ]);
});
console.log(`✅ ${n} tests passés`);
