import assert from "node:assert/strict";
import {
  COLLECTIONS_FISCALES,
  estCollectionFiscale,
  filtrerCollectionsEffacables,
  messageCollectionsProtegees,
  anonymisationComptable,
} from "../../src/lib/collections-comptables";

let passes = 0;
function test(nom: string, fn: () => void) {
  try {
    fn();
    passes++;
    console.log(`  ✅ ${nom}`);
  } catch (e: any) {
    console.error(`  ❌ ${nom}\n     ${e.message}`);
    process.exitCode = 1;
  }
}

console.log("\n── Collections à valeur fiscale ──");

test("les recettes et les clôtures sont reconnues comme fiscales", () => {
  assert.equal(estCollectionFiscale("encaissements"), true);
  assert.equal(estCollectionFiscale("avoirs"), true);
  assert.equal(estCollectionFiscale("cloturesJournalieres"), true);
  assert.equal(estCollectionFiscale("invoice_audit"), true);
  assert.equal(estCollectionFiscale("mouvements_registre"), true);
});

test("la structure métier n'est pas fiscale", () => {
  assert.equal(estCollectionFiscale("creneaux"), false);
  assert.equal(estCollectionFiscale("activities"), false);
  assert.equal(estCollectionFiscale("families"), false);
  assert.equal(estCollectionFiscale("cawl_sessions"), false);
});

test("en production, les collections fiscales sortent du périmètre d'effacement", () => {
  const { effacables, protegees } = filtrerCollectionsEffacables(
    ["encaissements", "cawl_sessions", "avoirs", "cartes"],
    true,
  );
  assert.deepEqual(effacables, ["cawl_sessions", "cartes"]);
  assert.deepEqual(protegees, ["encaissements", "avoirs"]);
});

test("hors production, la liste passe intacte", () => {
  const demande = ["encaissements", "avoirs", "cartes"];
  const { effacables, protegees } = filtrerCollectionsEffacables(demande, false);
  assert.deepEqual(effacables, demande);
  assert.deepEqual(protegees, []);
});

test("aucune collection fiscale ne peut être effacée en production", () => {
  const { effacables } = filtrerCollectionsEffacables(COLLECTIONS_FISCALES, true);
  assert.deepEqual(effacables, [], "le filtre a laissé passer une collection fiscale");
});

test("le rapport nomme les collections protégées", () => {
  const msg = messageCollectionsProtegees(["encaissements", "avoirs"]);
  assert.ok(msg.includes("encaissements"));
  assert.ok(msg.includes("avoirs"));
  assert.ok(msg.includes("L102 B"));
});

test("pas de message quand rien n'est protégé", () => {
  assert.equal(messageCollectionsProtegees([]), "");
});

test("l'anonymisation RGPD efface l'identité et garde la trace de la demande", () => {
  const a = anonymisationComptable(new Date("2026-09-17T10:00:00Z"));
  assert.equal(a.parentEmail, null);
  assert.equal(a.parentPhone, null);
  assert.equal(a.familyName, "Client anonymisé (RGPD)");
  assert.ok(String(a.anonymisationMotif).includes("2026-09-17"));
  assert.ok(String(a.anonymisationMotif).includes("L102 B"));
});

console.log(`\n✅ ${passes} tests passés\n`);
