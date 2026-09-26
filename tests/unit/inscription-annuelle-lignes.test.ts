import assert from "node:assert/strict";
import { lignesInscriptionAnnuelle } from "../../src/app/admin/planning/inscription-annuelle-lignes";

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

const base = {
  adhesion: true, ajoutHeureAdmin: false, childName: "Suzanne",
  creneau: { id: "c1", activityTitle: "Pony games enfants +", activityType: "cours" },
  extraSlots: [] as string[], freqCumuleeAdmin: 1, frequenceDejaInscrite: 0,
  licence: true, licenceType: "moins18", prixAdhesionDegressif: 40, prixLicence: 29,
  rangEnfantFamille: 2, remiseMotif: "", selChild: "e1", slotKey: "Pony games enfants + — mercredi 17:00",
};
const somme = (items: any[]) => Math.round(items.reduce((s, i) => s + i.priceTTC, 0) * 100) / 100;

console.log("\n── Lignes d'une inscription annuelle ──");

test("la réduction famille n'est déduite qu'une fois (cas Duhem, 2e enfant −6 %)", () => {
  const items = lignesInscriptionAnnuelle({ ...base, prixForfaitBrut: 1016, familyDiscountAmount: 60.96, familyDiscountPercent: 6 });
  const forfait = items.find((i) => i.activityTitle.startsWith("Forfait"));
  assert.equal(forfait.priceTTC, 1016);
  assert.equal(somme(items), 40 + 29 + 1016 - 60.96);
});

test("la somme des lignes égale le total annuel calculé", () => {
  for (const [rang, pct] of [[2, 6], [3, 10], [4, 15], [5, 20]] as const) {
    const brut = 590;
    const remise = Math.round(brut * pct) / 100;
    const items = lignesInscriptionAnnuelle({ ...base, rangEnfantFamille: rang, prixForfaitBrut: brut, familyDiscountAmount: remise, familyDiscountPercent: pct });
    assert.equal(somme(items), Math.round((40 + 29 + brut - remise) * 100) / 100);
  }
});

test("sans réduction, pas de ligne négative", () => {
  const items = lignesInscriptionAnnuelle({ ...base, rangEnfantFamille: 1, prixForfaitBrut: 700, familyDiscountAmount: 0, familyDiscountPercent: 0 });
  assert.equal(items.some((i) => i.priceTTC < 0), false);
  assert.equal(somme(items), 769);
});

console.log(`\n✅ ${passes} tests passés`);
