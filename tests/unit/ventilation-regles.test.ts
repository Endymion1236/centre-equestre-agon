/**
 * tests/unit/ventilation-regles.test.ts — ventiler les ventes restées « à ventiler ».
 *   npx tsx tests/unit/ventilation-regles.test.ts
 */
import assert from "node:assert/strict";
import { cleLibelleVente, compteDeLigne, groupesNonVentiles, NON_VENTILE, ventiler } from "../../src/lib/ventilation-comptable";
import { construireFecComplet } from "../../src/lib/fec-complet";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const anniv = { activityTitle: "Anniversaire poney — échéance 2/3", priceTTC: 120, tva: 5.5 };
const anniv2 = { activityTitle: "ANNIVERSAIRE Poney", priceTTC: 80, tva: 5.5 };
const forfait = { activityTitle: "Forfait Galop 3", priceTTC: 600, tva: 5.5 };

test("la clé d'un libellé ignore casse, accents et « — échéance x/y »", () => {
  assert.equal(cleLibelleVente("Anniversaire poney — échéance 2/3"), "anniversaire poney");
  assert.equal(cleLibelleVente("ANNIVERSAIRE Poney"), "anniversaire poney");
  assert.equal(cleLibelleVente("Séance découverte"), "seance decouverte");
});

test("sans règle : non ventilé, regroupé par libellé avec nombre et total", () => {
  assert.equal(compteDeLigne(anniv).code, NON_VENTILE);
  const g = groupesNonVentiles([anniv, anniv2, forfait]);
  assert.equal(g.length, 1);
  assert.equal(g[0].nb, 2);
  assert.equal(g[0].ttc, 200);
  assert.deepEqual(g[0].taux, [5.5]);
});

test("avec la règle du gérant : toutes les lignes du libellé sont ventilées", () => {
  const regles = { "anniversaire poney": "70641000" };
  assert.deepEqual(compteDeLigne(anniv, regles), { code: "70641000", source: "règle du gérant" });
  assert.equal(groupesNonVentiles([anniv, anniv2], regles).length, 0);
  const v = ventiler([anniv, anniv2, forfait], regles);
  assert.ok(!v.some((l) => l.compte === NON_VENTILE));
  assert.equal(v.find((l) => l.compte === "70641000")?.ttc, 200);
});

test("un compte posé sur la ligne reste prioritaire sur la règle", () => {
  assert.equal(compteDeLigne({ ...anniv, compteComptable: "70605000" }, { "anniversaire poney": "70641000" }).code, "70605000");
});

test("le FEC applique la règle : plus de compte d'attente 47100000", () => {
  const facture = { familyName: "Martin", invoiceNumber: "F-2026-0200", totalTTC: 120, date: { seconds: Math.floor(Date.parse("2026-09-10T10:00:00Z") / 1000) }, items: [{ activityTitle: "Anniversaire poney", priceHT: 113.74, priceTTC: 120, tva: 5.5 }] };
  const sans = construireFecComplet({ factures: [facture as any], encaissements: [], maintenant: new Date("2026-10-01") });
  assert.match(sans.contenu, /47100000/);
  const avec = construireFecComplet({ factures: [facture as any], encaissements: [], maintenant: new Date("2026-10-01"), regles: { "anniversaire poney": "70641000" } });
  assert.doesNotMatch(avec.contenu, /47100000/);
  assert.match(avec.contenu, /70641000/);
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
