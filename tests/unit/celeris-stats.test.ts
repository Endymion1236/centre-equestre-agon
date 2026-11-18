/**
 * tests/unit/celeris-stats.test.ts — mois Céleris repris dans les statistiques.
 *   npx tsx tests/unit/celeris-stats.test.ts
 */
import assert from "node:assert/strict";
import { celerisPourAnnee, modeDuCompteCeleris, resumeCelerisMois } from "../../src/lib/celeris-stats";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };
const l = (journal: string, compte: string, piece: string, debit: number, credit: number) => ({ journal, compte, piece, date: "2026-07-10", debit, credit });

test("facturé = TTC des ventes ; encaissé = règlements clients, par mode ; remise en banque ignorée", () => {
  const lignes = [
    // Vente de 105,50 € TTC.
    l("VTE", "41100000", "F1", 10550, 0), l("VTE", "70600000", "F1", 0, 10000), l("VTE", "44571000", "F1", 0, 550),
    // Avoir de 5,50 €.
    l("VTE", "41100000", "A1", 0, 550), l("VTE", "70600000", "A1", 550, 0),
    // Règlement par carte : 60 €.
    l("BQ", "51125000", "R1", 6000, 0), l("BQ", "41100000", "R1", 0, 6000),
    // Règlement mixte : 30 € espèces + 10 € chèque.
    l("CAI", "53110000", "R2", 3000, 0), l("CAI", "51121000", "R2", 1000, 0), l("CAI", "41100000", "R2", 0, 4000),
    // Remboursement de 5 € en espèces.
    l("CAI", "41100000", "R3", 500, 0), l("CAI", "53110000", "R3", 0, 500),
    // Remise de chèques en banque : aucun client, pas un encaissement.
    l("BQ", "51210000", "REM", 1000, 0), l("BQ", "51121000", "REM", 0, 1000),
  ];
  const r = resumeCelerisMois("2026-07", lignes);
  assert.equal(r.factureTTC, 100);
  assert.equal(r.encaisse, 95);
  assert.deepEqual(r.parMode, { cb_terminal: 60, especes: 25, cheque: 10 });
  assert.equal(modeDuCompteCeleris("58000000"), "cb_online");
  assert.equal(modeDuCompteCeleris("51122000"), "cheque_vacances");
});

test("vente au comptant sans compte client : facturée et encaissée", () => {
  const r = resumeCelerisMois("2026-08", [l("VTE", "53110000", "T1", 2000, 0), l("VTE", "70600000", "T1", 0, 1896), l("VTE", "44571000", "T1", 0, 104)]);
  assert.equal(r.factureTTC, 20);
  assert.equal(r.encaisse, 20);
  assert.deepEqual(r.parMode, { especes: 20 });
});

test("année : juillet et août additionnés, placés dans leur mois", () => {
  const a = celerisPourAnnee([
    { mois: "2026-07", factureTTC: 100, encaisse: 95, parMode: { especes: 25, cb_terminal: 70 } },
    { mois: "2026-08", factureTTC: 50, encaisse: 40, parMode: { especes: 40 } },
    { mois: "2025-08", factureTTC: 999, encaisse: 999, parMode: {} },
  ], 2026);
  assert.equal(a.facture, 150);
  assert.equal(a.encaisse, 135);
  assert.equal(a.factureParMois[6], 100);
  assert.equal(a.factureParMois[7], 50);
  assert.deepEqual(a.parMode, { especes: 65, cb_terminal: 70 });
  assert.deepEqual(a.mois, ["2026-07", "2026-08"]);
  assert.equal(celerisPourAnnee([], 2026).facture, 0);
});
console.log(`✅ ${n} tests passés`);
