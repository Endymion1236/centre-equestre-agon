import assert from "node:assert/strict";
import { test } from "node:test";
import { analyserCeleris } from "../../src/lib/import-comptable-celeris";
const h = "Journal;N compte;N piece;Date ope;Debit;Credit;Libele ecriture;Libele compte";
const rows = [
  "VTE;411;12;01-07-2026;1 200,00;0;Client;Clients",
  "VTE;706;12;01-07-2026;0;1 000,00;Stage aout;Stages",
  "VTE;4457;12;01-07-2026;0;200,00;TVA;TVA",
  "BNQ;512;12;02-07-2026;1 200,00;0;Reglement;Banque",
  "BNQ;411;12;02-07-2026;0;1 200,00;Reglement;Clients",
];
test("les règlements ne doublent pas la facturation ; milliers et centimes", () => {
  const a = analyserCeleris([h, ...rows].join("\r\n"));
  assert.equal(a.mois, "2026-07");
  assert.deepEqual(a.totaux, { ht: 100000, tva: 20000, ttc: 120000, debit: 240000, credit: 240000 });
});
test("ordre, BOM et fins de ligne ne changent pas l'identité ; vraies répétitions préservées", () => {
  const a = analyserCeleris([h, ...rows].join("\n"));
  assert.deepEqual(analyserCeleris("\uFEFF" + [h, ...rows.slice().reverse()].join("\r\n") + "\r\n"), a);
  assert.equal(analyserCeleris([h, ...rows, ...rows].join("\n")).lignes.length, 10);
});
test("export tronqué, multimois, montant et dates invalides refusés", () => {
  assert.throws(() => analyserCeleris([h, ...rows.slice(1)].join("\n")), /déséquilibrées/);
  assert.throws(() => analyserCeleris([h, ...rows].join("\n").replaceAll("02-07", "02-08")), /seul mois/);
  assert.throws(() => analyserCeleris([h, ...rows].join("\n").replaceAll("01-07", "31-02")), /Date inexistante/);
  assert.throws(() => analyserCeleris([h, ...rows].join("\n").replace("1 200,00", "12oops")), /Montant invalide/);
});
