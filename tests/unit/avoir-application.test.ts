/**
 * tests/unit/avoir-application.test.ts — un avoir se déduit d'une commande, pas dans le vide.
 *   npx tsx tests/unit/avoir-application.test.ts
 */
import assert from "node:assert/strict";
import { commandesApplicables, fichesOuChercherLaCommande, nomDeFamille, planifierApplicationAvoir, resteDu, utilisationsSansCommande } from "../../src/lib/avoir-application";
import { identifiantsRattaches } from "../../src/lib/fusion-familles";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const maintenant = new Date("2026-10-19T10:00:00Z");
const avoir = { id: "av1", reference: "AV-2026-0012", amount: 108, usedAmount: 0, remainingAmount: 108, status: "actif", usageHistory: [] };
const stage = { id: "p1", totalTTC: 349.2, paidAmount: 60, status: "partial", invoiceNumber: null };

test("reste dû et commandes applicables", () => {
  assert.equal(resteDu(stage), 289.2);
  assert.deepEqual(commandesApplicables([stage, { id: "p2", totalTTC: 50, paidAmount: 50, status: "paid" }, { id: "p3", totalTTC: 30, status: "cancelled" }]).map(c => c.id), ["p1"]);
});

test("application normale : l'avoir est décompté, la commande tracée (cas COSTEGROSSE)", () => {
  const plan = planifierApplicationAvoir({ avoir, commande: stage, montant: 108, maintenant });
  assert.equal(plan.ok, true);
  assert.equal(plan.montant, 108);
  assert.deepEqual({ ...plan.avoirMaj, usageHistory: undefined }, { usedAmount: 108, remainingAmount: 0, status: "utilise", usageHistory: undefined });
  assert.equal(plan.avoirMaj.usageHistory[0].paymentId, "p1");
  assert.equal(plan.libelle, "Avoir AV-2026-0012");
});

test("refus : plus que ce qui reste sur l'avoir, plus que ce que doit la commande, commande soldée ou annulée", () => {
  assert.match(planifierApplicationAvoir({ avoir, commande: stage, montant: 120, maintenant }).erreur!, /108\.00 €/);
  assert.match(planifierApplicationAvoir({ avoir: { ...avoir, amount: 500, remainingAmount: 500 }, commande: stage, montant: 300, maintenant }).erreur!, /289\.20 €/);
  assert.match(planifierApplicationAvoir({ avoir, commande: { ...stage, paidAmount: 349.2, status: "paid" }, montant: 10, maintenant }).erreur!, /soldée/);
  assert.match(planifierApplicationAvoir({ avoir, commande: { ...stage, status: "cancelled" }, montant: 10, maintenant }).erreur!, /annulée/);
  assert.match(planifierApplicationAvoir({ avoir: { ...avoir, status: "utilise", remainingAmount: 0 }, commande: stage, montant: 10, maintenant }).erreur!, /plus utilisable/);
});

test("utilisations faites dans le vide : reconnues à l'absence de commande", () => {
  const consomme = { ...avoir, usedAmount: 108, remainingAmount: 0, status: "utilise", usageHistory: [{ date: "2026-10-18T09:00:00Z", amount: 108, invoiceRef: "F-2026-0285" }] };
  assert.deepEqual(utilisationsSansCommande(consomme).map(u => u.index), [0]);
  assert.deepEqual(utilisationsSansCommande(avoir), []);
});

test("réparation : la commande reçoit le montant déjà décompté, sans redécompter l'avoir", () => {
  const consomme = { ...avoir, usedAmount: 108, remainingAmount: 0, status: "utilise", usageHistory: [{ date: "2026-10-18T09:00:00Z", amount: 108, invoiceRef: "F-2026-0285" }] };
  const plan = planifierApplicationAvoir({ avoir: consomme, commande: stage, montant: 0, maintenant, reparation: { index: 0 } });
  assert.equal(plan.ok, true);
  assert.equal(plan.montant, 108);
  assert.equal(plan.avoirMaj.usedAmount, 108, "pas redécompté");
  assert.equal(plan.avoirMaj.remainingAmount, 0);
  assert.equal(plan.avoirMaj.usageHistory[0].paymentId, "p1");
  assert.match(plan.libelle, /régularisation/);
});

test("réparation quand la commande doit moins : la différence revient sur l'avoir", () => {
  const consomme = { ...avoir, usedAmount: 108, remainingAmount: 0, status: "utilise", usageHistory: [{ date: "2026-10-18T09:00:00Z", amount: 108 }] };
  const plan = planifierApplicationAvoir({ avoir: consomme, commande: { id: "p9", totalTTC: 100, paidAmount: 60, status: "partial" }, montant: 0, maintenant, reparation: { index: 0 } });
  assert.equal(plan.montant, 40);
  assert.equal(plan.avoirMaj.remainingAmount, 68);
  assert.equal(plan.avoirMaj.usedAmount, 40);
  assert.equal(plan.avoirMaj.status, "actif");
});


test("fiches où chercher la commande : rattachées, puis même nom de famille", () => {
  const fiches = [
    { id: "compte", parentName: "COSTEGROSSE Olivier" },
    { id: "bureau", status: "merged", mergedInto: "compte", parentName: "Costegrosse" },
    { id: "autre", parentName: "GROSSE Olivier" },
    { id: "homonyme", parentName: "Costégrosse Marie" },
  ];
  const ids = fichesOuChercherLaCommande({ familyId: "bureau", familyName: "COSTEGROSSE Olivier" }, fiches, identifiantsRattaches);
  assert.deepEqual([...ids].sort(), ["bureau", "compte", "homonyme"]);
  // Sans nom : seulement le rattachement.
  assert.deepEqual(fichesOuChercherLaCommande({ familyId: "autre" }, fiches, identifiantsRattaches), ["autre"]);
  assert.equal(nomDeFamille(" Costégrosse Olivier "), "costegrosse");
});
if (process.exitCode) { console.error("❌ échec"); } else console.log(`✅ ${passes} tests passés`);
