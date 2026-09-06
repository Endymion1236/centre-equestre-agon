import assert from "node:assert/strict";
import { clesPeriode, resumePeriodes, trouverPeriodeNommee } from "../../src/lib/periode-vacances";

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

const periodes = [
  { name: "Vacances de la Toussaint 2025", startDate: "2025-10-18", endDate: "2025-11-03" },
  { name: "Vacances de Noël 2025", startDate: "2025-12-20", endDate: "2026-01-05" },
  { name: "Vacances d'hiver 2026", startDate: "2026-02-14", endDate: "2026-03-02" },
  { name: "Vacances de printemps 2026", startDate: "2026-04-11", endDate: "2026-04-27" },
  { name: "Vacances d'été 2026", startDate: "2026-07-04", endDate: "2026-08-31" },
  { name: "Vacances de la Toussaint 2026", startDate: "2026-10-17", endDate: "2026-11-02" },
  { name: "Vacances de Noël 2026", startDate: "2026-12-19", endDate: "2027-01-04" },
];

console.log("── Période nommée dans un mail ──");
test("« pendant les vacances de la Toussaint » un 6 septembre 2026 → Toussaint 2026, pas 2025", () => {
  const p = trouverPeriodeNommee("Bonjour, ma petite-fille voudrait monter pendant les vacances de la Toussaint.", periodes, "2026-09-06");
  assert.equal(p?.name, "Vacances de la Toussaint 2026");
});
test("« à Noël » et « en février » trouvent leur période, accents ou non", () => {
  assert.equal(trouverPeriodeNommee("un stage a Noel pour Tom", periodes, "2026-09-06")?.name, "Vacances de Noël 2026");
  // « février » désigne l'hiver ; celui de 2026 est passé et aucun 2027 n'est configuré → rien.
  assert.equal(trouverPeriodeNommee("les vacances de fevrier", periodes, "2026-09-06"), null);
});
test("une période passée n'est jamais proposée", () => {
  assert.equal(trouverPeriodeNommee("vacances d'hiver", periodes, "2026-09-06"), null);
});
test("rien de nommé → null", () => {
  assert.equal(trouverPeriodeNommee("Est-ce qu'il reste des places samedi ?", periodes, "2026-09-06"), null);
  assert.deepEqual(clesPeriode("samedi matin"), []);
});
test("le résumé ne liste que les périodes à venir, par date", () => {
  const r = resumePeriodes(periodes, "2026-09-06");
  assert.ok(r.startsWith("Vacances de la Toussaint 2026 : 2026-10-17 → 2026-11-02"));
  assert.ok(!r.includes("2025"));
});

console.log(`\n✅ ${passes} tests passés\n`);
