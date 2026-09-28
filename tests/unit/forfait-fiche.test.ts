import assert from "node:assert/strict";
import { forfaitDejaActif, forfaitsDesCommandes } from "../../src/app/admin/planning/forfait-fiche-utils";
import { prixForfaitDepuisCommandes } from "../../src/lib/forfaits";

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

const SLOT = "Découverte / Galop de bronze — samedi 15:45";
const fiche = (extra: Record<string, any> = {}) => ({ id: "f1", childId: "anouk", slotKey: SLOT, seasonStartYear: 2026, status: "actif", ...extra });

test("seconde inscription annuelle au même créneau : la fiche existante est trouvée", () => {
  assert.equal(forfaitDejaActif([fiche()], { childId: "anouk", slotKey: SLOT, seasonStartYear: 2026 })?.id, "f1");
});

test("fiche résiliée, autre créneau, autre saison, autre cavalier : pas de blocage", () => {
  const cible = { childId: "anouk", slotKey: SLOT, seasonStartYear: 2026 };
  assert.equal(forfaitDejaActif([fiche({ status: "cancelled" })], cible), null);
  assert.equal(forfaitDejaActif([fiche({ slotKey: "Autre — lundi 17:00" })], cible), null);
  assert.equal(forfaitDejaActif([fiche({ seasonStartYear: 2025 })], cible), null);
  assert.equal(forfaitDejaActif([fiche({ childId: "zoe" })], cible), null);
});

test("fiche ancienne sans saison : considérée comme de la saison (pas de doublon)", () => {
  assert.equal(forfaitDejaActif([fiche({ seasonStartYear: undefined })], { childId: "anouk", slotKey: SLOT, seasonStartYear: 2026 })?.id, "f1");
});

test("correction du montant : les fiches actives du créneau corrigé sont remises au prix", () => {
  const commandes = [{ forfaitRef: SLOT, items: [{ childId: "anouk" }] }];
  assert.deepEqual(forfaitsDesCommandes([fiche(), fiche({ id: "f2" }), fiche({ id: "f3", status: "cancelled" })], commandes, "anouk"), ["f1", "f2"]);
});

test("commande de fratrie ou sans forfait : la fiche n'est pas touchée", () => {
  assert.deepEqual(forfaitsDesCommandes([fiche()], [{ forfaitRef: SLOT, items: [{ childId: "anouk" }, { childId: "zoe" }] }], "anouk"), []);
  assert.deepEqual(forfaitsDesCommandes([fiche()], [{ items: [{ childId: "anouk" }] }], "anouk"), []);
});

test("prix d'après les commandes : 550 € après correction, fratrie répartie, annulée ignorée", () => {
  const forfait = { familyId: "leconte", childId: "anouk", slotKey: SLOT, activityTitle: "Découverte / Galop de bronze" };
  const commande = { familyId: "leconte", forfaitRef: SLOT, status: "sepa_scheduled", totalTTC: 550, items: [
    { childId: "anouk", priceTTC: 450 }, { childId: "anouk", priceTTC: 25 }, { childId: "anouk", priceTTC: 75 },
  ] };
  assert.equal(prixForfaitDepuisCommandes([commande], forfait), 550);
  const fratrie = { ...commande, totalTTC: 1100, items: [...commande.items, { childId: "zoe", priceTTC: 550 }] };
  assert.equal(prixForfaitDepuisCommandes([fratrie], forfait), 550);
  assert.equal(prixForfaitDepuisCommandes([{ ...commande, status: "cancelled" }], forfait), null);
});

console.log(`\n✅ ${passes} tests passés\n`);
