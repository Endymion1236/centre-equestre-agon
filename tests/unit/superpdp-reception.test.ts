/**
 * tests/unit/superpdp-reception.test.ts — réception réelle des factures Super PDP.
 *   npx tsx tests/unit/superpdp-reception.test.ts
 */
import assert from "node:assert/strict";
import { compteDeProductionDuClub, estAvoirPlateforme, facturesAImporter, idPiecePlateforme, mimeFichierRecu, nomPiecePlateforme } from "../../src/lib/superpdp-reception";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };

test("bac à sable ou autre entreprise : jamais d'import", () => {
  assert.equal(compteDeProductionDuClub({ env: "sandbox", number: "000000001", number_scheme: "sandbox", formal_name: "Burger Queen" }).ok, false);
  assert.match(compteDeProductionDuClub({ env: "sandbox" }).raison!, /bac à sable/);
  assert.equal(compteDeProductionDuClub({ env: "production", number: "123456789", number_scheme: "fr_siren" }).ok, false);
  assert.equal(compteDeProductionDuClub({ env: "production", number: "507 569 184", number_scheme: "fr_siren" }).ok, true);
  assert.equal(compteDeProductionDuClub(null).ok, false);
});

test("une facture reçue n'entre qu'une fois ; les envoyées jamais", () => {
  const f = [{ id: 12, direction: "in" }, { id: 7, direction: "in" }, { id: 9, direction: "out" }, { id: 3, direction: "in" }];
  assert.deepEqual(facturesAImporter(f, new Set([idPiecePlateforme(3)])).map((x) => x.id), [7, 12]);
  assert.equal(idPiecePlateforme(42), "superpdp-42");
});

test("type et nom du fichier", () => {
  assert.equal(mimeFichierRecu("application/pdf", new Uint8Array([37, 80, 68, 70, 45])), "application/pdf");
  assert.equal(mimeFichierRecu("application/xml", new TextEncoder().encode("<?xml")), "application/xml");
  assert.equal(mimeFichierRecu("", new TextEncoder().encode(" <Inv")), "application/xml");
  assert.equal(mimeFichierRecu("application/octet-stream", new Uint8Array([1, 2, 3])), null);
  assert.equal(nomPiecePlateforme({ fournisseur: "AGRIAL", numero: "FA/2026/118", date: "2026-11-03" }, "application/xml"), "AGRIAL — n° FA 2026 118 — 2026-11-03.xml");
});
test("avoir reconnu à son code", () => {
  assert.ok(estAvoirPlateforme({ type_code: "381" }));
  assert.ok(estAvoirPlateforme({ type_code: 381 }));
  assert.ok(!estAvoirPlateforme({ type_code: "380" }));
  assert.ok(!estAvoirPlateforme(null));
});
console.log(`✅ ${n} tests passés`);
