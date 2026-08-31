/**
 * tests/unit/forfait-regle.test.ts
 *
 * Ce qu'un forfait annuel a réellement encaissé.
 *   npx tsx tests/unit/forfait-regle.test.ts
 *
 * Constaté le 31/08/2026 : forfait à 699 € en dix prélèvements, première
 * remise déposée, 69,90 € au journal — et l'écran Forfaits affichait
 * « 0 € / 699 € ». Deux causes, figées ici.
 */

import { montantRegleForfait, commandeDuForfait } from "../../src/lib/forfaits";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires — montant réglé d'un forfait annuel");
console.log("══════════════════════════════════════════════════════════════\n");

const FORFAIT = {
  familyId: "andrieu",
  slotKey: "G3 à G5 Ados — mercredi 14:30",
  activityTitle: "G3 à G5 Ados",
};

console.log("✓ Prélèvement SEPA : la commande de référence passe en « partiel » :");
{
  // markDeposited met la commande à `partial` et fait grossir paidAmount à
  // chaque remise. L'ancien filtre ne gardait que `paid` et `sepa_scheduled`.
  const avantRemise = [{
    familyId: "andrieu", status: "sepa_scheduled", paidAmount: 0, totalTTC: 699,
    forfaitRef: "G3 à G5 Ados — mercredi 14:30",
    items: [{ activityTitle: "Forfait G3 à G5 Ados (G3 à G5 Ados — mercredi 14:30)" }],
  }];
  assert("rien prélevé : 0 €", montantRegleForfait(avantRemise, FORFAIT) === 0);

  const apresPremiere = [{ ...avantRemise[0], status: "partial", paidAmount: 69.9 }];
  assert("première échéance prélevée : 69,90 €",
    montantRegleForfait(apresPremiere, FORFAIT) === 69.9,
    String(montantRegleForfait(apresPremiere, FORFAIT)));

  const soldee = [{ ...avantRemise[0], status: "paid", paidAmount: 699 }];
  assert("année soldée : 699 €", montantRegleForfait(soldee, FORFAIT) === 699);
}

console.log("\n✓ Paiement en dix fois : les échéances 2 à 10 comptent aussi :");
{
  // Leur libellé est « Échéance 2/10 — Prénom » : le rattachement par titre
  // les ignorait, seul le premier document était compté.
  const echeances = Array.from({ length: 10 }, (_, i) => ({
    familyId: "andrieu",
    forfaitRef: "G3 à G5 Ados — mercredi 14:30",
    status: i < 3 ? "paid" : "pending",
    paidAmount: i < 3 ? 69.9 : 0,
    totalTTC: 69.9,
    items: [{
      activityTitle: i === 0
        ? "Forfait G3 à G5 Ados (G3 à G5 Ados — mercredi 14:30)"
        : `Échéance ${i + 1}/10 — Christophe`,
    }],
  }));
  assert("trois échéances réglées : 209,70 €",
    montantRegleForfait(echeances, FORFAIT) === 209.7,
    String(montantRegleForfait(echeances, FORFAIT)));
  assert("la 2e échéance est bien rattachée au forfait",
    commandeDuForfait(echeances[1], FORFAIT));
}

console.log("\n✓ Ce qui ne doit pas être compté :");
{
  const autreFamille = [{ familyId: "duhem", status: "paid", paidAmount: 300, totalTTC: 300,
    forfaitRef: "G3 à G5 Ados — mercredi 14:30", items: [] }];
  assert("une autre famille", montantRegleForfait(autreFamille, FORFAIT) === 0);

  const annulee = [{ familyId: "andrieu", status: "cancelled", paidAmount: 699, totalTTC: 699,
    forfaitRef: "G3 à G5 Ados — mercredi 14:30", items: [] }];
  assert("une commande annulée", montantRegleForfait(annulee, FORFAIT) === 0);

  const autreCreneau = [{ familyId: "andrieu", status: "paid", paidAmount: 500, totalTTC: 500,
    forfaitRef: "Baby poney — samedi 10:00",
    items: [{ activityTitle: "Forfait Baby poney (Baby poney — samedi 10:00)" }] }];
  assert("le forfait d'un autre créneau", montantRegleForfait(autreCreneau, FORFAIT) === 0);
}

console.log("\n✓ Forfaits anciens, sans rattachement explicite :");
{
  const legacy = [{ familyId: "andrieu", status: "paid", paidAmount: 0, totalTTC: 699,
    items: [{ activityTitle: "Forfait G3 à G5 Ados — mercredi 14:30" }] }];
  assert("repli sur le libellé, et sur totalTTC faute de paidAmount",
    montantRegleForfait(legacy, FORFAIT) === 699, String(montantRegleForfait(legacy, FORFAIT)));
}

console.log(`\n──────────────────────────────────────────────────────────────`);
console.log(`  ${passed} réussis, ${failed} échoués`);
if (failed > 0) {
  console.log(`  Échecs : ${failures.join(", ")}`);
  console.log("──────────────────────────────────────────────────────────────\n");
  process.exit(1);
}
console.log("──────────────────────────────────────────────────────────────\n");
