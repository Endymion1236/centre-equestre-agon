import assert from "node:assert/strict";
import {
  calculerTotauxTresorerieParMois,
  indexerRelevesParMoisCompte,
  moisDe,
  normaliserComptesTresorerie,
  saisonDe,
  saisonsDisponiblesTresorerie,
} from "../../src/app/admin/comptabilite/tresorerie/tresorerie-utils";

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

console.log("\n── Saisons ──");

test("septembre ouvre une nouvelle saison et août la termine", () => {
  assert.equal(saisonDe("2025-09"), "2025-2026");
  assert.equal(saisonDe("2026-08"), "2025-2026");
  assert.equal(moisDe("2025-2026", "09"), "2025-09");
  assert.equal(moisDe("2025-2026", "03"), "2026-03");
});

test("la saison courante est toujours présente même sans relevé", () => {
  const saisons = saisonsDisponiblesTresorerie(
    [{ mois: "2024-10" }, { mois: "2025-02" }],
    new Date(2026, 8, 1),
  );
  assert.deepEqual(saisons, ["2024-2025", "2026-2027"]);
});

console.log("\n── Relevés et totaux ──");

const releves = [
  { id: "a", mois: "2026-08", compte: "Courant", montant: 1200 },
  { id: "b", mois: "2026-08", compte: "Épargne", montant: 30000 },
  { id: "c", mois: "2026-09", compte: "Courant", montant: 900 },
];

test("l'index retrouve un relevé par mois et compte", () => {
  const index = indexerRelevesParMoisCompte(releves);
  assert.equal(index.get("2026-08|Courant")?.id, "a");
  assert.equal(index.get("2026-08|Épargne")?.id, "b");
});

test("les comptes hors total restent suivis mais sont exclus du disponible", () => {
  const totaux = calculerTotauxTresorerieParMois(releves, ["Épargne"]);
  assert.equal(totaux.get("2026-08"), 1200);
  assert.equal(totaux.get("2026-09"), 900);
});

console.log("\n── Configuration des comptes ──");

test("les noms sont nettoyés et les lignes vides supprimées", () => {
  const resultat = normaliserComptesTresorerie([
    { nom: " Courant ", compte: true },
    { nom: "   ", compte: false },
  ]);
  assert.equal(resultat.erreur, null);
  assert.deepEqual(resultat.comptes, [{ nom: "Courant", compte: true }]);
});

test("au moins un compte doit participer au total", () => {
  assert.equal(normaliserComptesTresorerie([]).erreur, "Au moins un compte");
  assert.equal(
    normaliserComptesTresorerie([{ nom: "Épargne", compte: false }]).erreur,
    "Au moins un compte doit compter dans le total",
  );
});

console.log(`\n✅ ${passes} tests passés\n`);
