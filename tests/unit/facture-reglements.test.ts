import assert from "node:assert/strict";
import { construireAffichageReglementsFacture } from "../../src/lib/facture-reglements";

const partielMixte = construireAffichageReglementsFacture({
  paidAmount: 150,
  paymentMode: "Virement",
  paymentDate: "02/09/2026",
  paymentDetails: [
    { mode: "especes", modeLabel: "Espèces", montant: 50, date: "30/08/2026" },
    { mode: "cb_terminal", modeLabel: "CB au club", montant: 50, date: "31/08/2026", ref: "TPE-42" },
    { mode: "virement", modeLabel: "Virement", montant: 50, date: "02/09/2026" },
  ],
});

assert.equal(partielMixte.titre, "Détail des règlements encaissés :");
assert.deepEqual(partielMixte.lignes, [
  "• Espèces : 50.00 € · le 30/08/2026",
  "• CB au club : 50.00 € · le 31/08/2026 · réf. TPE-42",
  "• Virement : 50.00 € · le 02/09/2026",
]);
assert.equal(partielMixte.lignes.length, 3);
assert.ok(!partielMixte.lignes.some((ligne) => ligne.includes("150.00") && ligne.includes("Virement")));

const ancienPaiement = construireAffichageReglementsFacture({
  paidAmount: 50,
  paymentMode: "Chèque",
  paymentDate: "01/09/2026",
});
assert.deepEqual(ancienPaiement, {
  lignes: ["Mode de règlement : Chèque · le 01/09/2026"],
});

assert.deepEqual(
  construireAffichageReglementsFacture({
    paidAmount: 0,
    paymentMode: "Virement",
    paymentDetails: [{ mode: "virement", montant: 50 }],
  }),
  { lignes: [] },
);

console.log("✅ Facture partielle : chaque encaissement conserve son montant, son mode et sa date");
