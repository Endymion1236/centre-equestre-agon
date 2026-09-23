/**
 * tests/unit/rapatriement-test.test.ts
 *
 * Rapatrier en production les justificatifs et dépenses faits sur test :
 * ne créer que l'absent, ne garder une association que si elle tient au bout.
 *   npx tsx tests/unit/rapatriement-test.test.ts
 */
import assert from "node:assert/strict";
import { fichiersACopier, planifierRapatriement, piecesDuLien } from "../../src/lib/rapatriement-test-utils";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const P1 = "a".repeat(64), P2 = "b".repeat(64), P3 = "c".repeat(64);
const dep = (id: string, mois: string, montant: number, fournisseur: string) => ({ id, data: { mois, montant, fournisseur, source: "releve-bancaire" } });

console.log("\n── Ce qui existe déjà en production n'est pas recréé ──");
test("seuls les absents sont créés, les présents sont comptés", () => {
  const plan = planifierRapatriement({
    test: { justificatifs: [{ id: P1, data: {} }, { id: P2, data: {} }], depenses: [dep("pdf_1", "2026-08", 10, "EDF")] },
    idsProd: { justificatifs: new Set([P1]) },
    depensesProd: [],
  });
  assert.deepEqual(plan.aCreer.justificatifs.map((d) => d.id), [P2]);
  assert.equal(plan.dejaPresents.justificatifs, 1);
  assert.deepEqual(plan.aCreer.depenses.map((d) => d.id), ["pdf_1"]);
});

console.log("\n── Associations ──");
test("une association arrive avec sa pièce et sa dépense", () => {
  const plan = planifierRapatriement({
    test: {
      justificatifs: [{ id: P1, data: { depenseId: "pdf_1", associationMode: "auto" } }],
      depenses: [dep("pdf_1", "2026-08", 120, "EDF")],
      "justificatifs-liens": [{ id: "pdf_1", data: { pieceId: P1 } }],
    },
    idsProd: {}, depensesProd: [],
  });
  assert.equal(plan.aCreer["justificatifs-liens"].length, 1);
  assert.equal(plan.aCreer.justificatifs[0].data.depenseId, "pdf_1");
  assert.deepEqual(plan.piecesDetachees, []);
});

test("une dépense déjà en production garde son lien si la pièce est nouvelle", () => {
  const plan = planifierRapatriement({
    test: {
      justificatifs: [{ id: P1, data: { depenseId: "dep_prod" } }],
      depenses: [dep("dep_prod", "2026-08", 120, "EDF")],
      "justificatifs-liens": [{ id: "dep_prod", data: { pieceId: P1 } }],
    },
    idsProd: { depenses: new Set(["dep_prod"]) }, depensesProd: [],
  });
  assert.equal(plan.aCreer.depenses.length, 0);
  assert.equal(plan.aCreer["justificatifs-liens"].length, 1);
  assert.equal(plan.aCreer.justificatifs[0].data.depenseId, "dep_prod");
});

test("une dépense déjà liée en production : la pièce arrive détachée", () => {
  const plan = planifierRapatriement({
    test: {
      justificatifs: [{ id: P1, data: { depenseId: "dep_prod", associationMode: "auto", modeRattachement: "exact" } }],
      "justificatifs-liens": [{ id: "dep_prod", data: { pieceId: P1 } }],
    },
    idsProd: { depenses: new Set(["dep_prod"]), "justificatifs-liens": new Set(["dep_prod"]) }, depensesProd: [],
  });
  assert.equal(plan.aCreer["justificatifs-liens"].length, 0);
  assert.equal(plan.aCreer.justificatifs[0].data.depenseId, null);
  assert.equal(plan.aCreer.justificatifs[0].data.associationMode, null);
  assert.deepEqual(plan.piecesDetachees, [P1]);
});

test("une pièce déjà en production : son lien n'est pas recréé", () => {
  const plan = planifierRapatriement({
    test: {
      justificatifs: [{ id: P1, data: { depenseId: "pdf_1" } }],
      depenses: [dep("pdf_1", "2026-08", 120, "EDF")],
      "justificatifs-liens": [{ id: "pdf_1", data: { pieceId: P1 } }],
    },
    idsProd: { justificatifs: new Set([P1]) }, depensesProd: [],
  });
  assert.equal(plan.aCreer["justificatifs-liens"].length, 0);
  assert.equal(plan.liensIgnores, 1);
});

test("un règlement groupé n'arrive que si toutes ses pièces arrivent", () => {
  const lien = { id: "pdf_9", data: { pieceId: P1, pieceIds: [P1, P2], groupe: true } };
  assert.deepEqual(piecesDuLien(lien.data), [P1, P2]);
  const plan = planifierRapatriement({
    test: {
      justificatifs: [{ id: P1, data: { depenseId: "pdf_9" } }, { id: P2, data: { depenseId: "pdf_9" } }],
      depenses: [dep("pdf_9", "2026-08", 300, "Coop")],
      "justificatifs-liens": [lien],
    },
    idsProd: { justificatifs: new Set([P2]) }, depensesProd: [],
  });
  assert.equal(plan.aCreer["justificatifs-liens"].length, 0);
  assert.deepEqual(plan.piecesDetachees, [P1]);
});

test("une pièce qui pointe vers une dépense inconnue arrive détachée", () => {
  const plan = planifierRapatriement({
    test: { justificatifs: [{ id: P3, data: { depenseId: "fantome" } }] },
    idsProd: {}, depensesProd: [],
  });
  assert.deepEqual(plan.piecesDetachees, [P3]);
  assert.equal(plan.aCreer.justificatifs[0].data.depenseId, null);
});

console.log("\n── Ressemblances avec la production ──");
test("même mois, montant et fournisseur sous un autre identifiant : signalé", () => {
  const plan = planifierRapatriement({
    test: { depenses: [dep("pdf_1", "2026-08", 42.1, "E.D.F."), dep("pdf_2", "2026-08", 10, "Orange")] },
    idsProd: {},
    depensesProd: [dep("aleatoire", "2026-08", 42.10, "edf")],
  });
  assert.equal(plan.aCreer.depenses.length, 2, "les deux sont créées");
  assert.deepEqual(plan.doublonsProbables.map((d) => [d.idTest, d.idProd]), [["pdf_1", "aleatoire"]]);
});

console.log("\n── Fichiers ──");
test("ne copier que les fichiers des pièces présentes et absents en production", () => {
  const r = fichiersACopier(
    [`justificatifs-prives/${P1}`, `justificatifs-prives/${P2}`, `justificatifs-prives/${P3}`],
    [`justificatifs-prives/${P1}`],
    new Set([P1, P2]),
  );
  assert.deepEqual(r, [`justificatifs-prives/${P2}`]);
});

console.log(`\n✅ ${passes} tests passés\n`);
