import assert from "node:assert/strict";
import {
  construirePointsCloture,
  moisDecale,
  resumerCloture,
  type LigneMasseSalarialeCloture,
  type MoisResultatCloture,
  type ReleveClotureMois,
} from "../../src/app/admin/comptabilite/cloture-mois/cloture-mois-utils";

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

console.log("\n── Navigation mensuelle ──");

test("le décalage traverse correctement les changements d'année", () => {
  assert.equal(moisDecale("2026-01", -1), "2025-12");
  assert.equal(moisDecale("2026-12", 1), "2027-01");
});

const releves: ReleveClotureMois[] = [
  { id: "r1", mois: "2026-08", compte: "CIC", montant: 12000, creditsClients: 10000 },
  { id: "r2", mois: "2026-08", compte: "CA", montant: 8000, creditsClients: 9800 },
  { id: "r3", mois: "2026-08", compte: "Livret", montant: 5000, creditsClients: 999999 },
];
const lignesMS: LigneMasseSalarialeCloture[] = [
  { type: "salaire", mois: "2026-08" },
  { type: "salaire", mois: "2026-08" },
  { type: "charge", mois: "2026-08" },
];
const resultat: MoisResultatCloture[] = [
  { mois: "2026-08", ca: 20000, masse: 9000, depenses: 3500 },
];

console.log("\n── Checklist ──");

test("un mois complet rend les quatre contrôles de données au vert", () => {
  const points = construirePointsCloture({
    mois: "2026-08",
    releves,
    comptes: ["CIC", "CA", "Livret"],
    horsTotal: ["Livret"],
    lignesMS,
    resultat,
  });
  assert.deepEqual(points.slice(0, 4).map((p) => p.etat), ["ok", "ok", "ok", "ok"]);
});

test("un relevé manquant reste bloquant", () => {
  const points = construirePointsCloture({
    mois: "2026-08",
    releves: releves.filter((r) => r.compte !== "CA"),
    comptes: ["CIC", "CA"],
    horsTotal: [],
    lignesMS,
    resultat,
  });
  assert.equal(points[0].etat, "manque");
  assert.match(points[0].detail, /CA/);
});

test("absence de salaire et de dépenses sont bloquantes, absence de charge sociale est informative", () => {
  const points = construirePointsCloture({
    mois: "2026-08",
    releves,
    comptes: ["CIC", "CA"],
    horsTotal: [],
    lignesMS: [],
    resultat: [{ mois: "2026-08", ca: 20000, masse: 0, depenses: 0 }],
  });
  assert.equal(points[1].etat, "manque");
  assert.equal(points[2].etat, "info");
  assert.equal(points[3].etat, "manque");
});

console.log("\n── Rapprochement banque / caisse ──");

test("sans CA, le rapprochement est neutre et non bloquant", () => {
  const points = construirePointsCloture({
    mois: "2026-08",
    releves,
    comptes: ["CIC", "CA"],
    horsTotal: [],
    lignesMS,
    resultat: [{ mois: "2026-08", ca: 0, masse: 0, depenses: 100 }],
  });
  assert.equal(points.at(-1)?.etat, "neutre");
});

test("avec CA mais sans crédits clients lus, le rapprochement demande une vérification", () => {
  const points = construirePointsCloture({
    mois: "2026-08",
    releves: releves.map((r) => ({ ...r, creditsClients: null })),
    comptes: ["CIC", "CA"],
    horsTotal: [],
    lignesMS,
    resultat,
  });
  assert.equal(points.at(-1)?.etat, "info");
});

test("un écart de 1 % est cohérent", () => {
  const points = construirePointsCloture({
    mois: "2026-08",
    releves: [
      { id: "r1", mois: "2026-08", compte: "CIC", montant: 1, creditsClients: 9900 },
      { id: "r2", mois: "2026-08", compte: "CA", montant: 1, creditsClients: 9900 },
    ],
    comptes: ["CIC", "CA"],
    horsTotal: [],
    lignesMS,
    resultat,
  });
  assert.equal(points.at(-1)?.etat, "ok");
  assert.match(points.at(-1)?.detail || "", /Cohérent/);
});

test("un écart supérieur à 5 % est signalé", () => {
  const points = construirePointsCloture({
    mois: "2026-08",
    releves: [
      { id: "r1", mois: "2026-08", compte: "CIC", montant: 1, creditsClients: 9000 },
      { id: "r2", mois: "2026-08", compte: "CA", montant: 1, creditsClients: 9000 },
    ],
    comptes: ["CIC", "CA"],
    horsTotal: [],
    lignesMS,
    resultat,
  });
  assert.equal(points.at(-1)?.etat, "info");
  assert.match(points.at(-1)?.detail || "", /À creuser/);
});

test("les comptes hors total n'entrent pas dans le rapprochement", () => {
  const points = construirePointsCloture({
    mois: "2026-08",
    releves,
    comptes: ["CIC", "CA", "Livret"],
    horsTotal: ["Livret"],
    lignesMS,
    resultat,
  });
  assert.equal(points.at(-1)?.etat, "ok");
});

console.log("\n── Résumé ──");

test("le mois est bouclé uniquement sans point manquant", () => {
  assert.deepEqual(resumerCloture([
    { etat: "ok", titre: "a", detail: "", href: "", lien: "" },
    { etat: "info", titre: "b", detail: "", href: "", lien: "" },
  ]), { bloquants: 0, boucle: true });
  assert.deepEqual(resumerCloture([
    { etat: "manque", titre: "a", detail: "", href: "", lien: "" },
    { etat: "ok", titre: "b", detail: "", href: "", lien: "" },
  ]), { bloquants: 1, boucle: false });
});

console.log(`\n✅ ${passes} tests passés\n`);
