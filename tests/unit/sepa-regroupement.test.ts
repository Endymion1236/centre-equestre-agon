/**
 * tests/unit/sepa-regroupement.test.ts
 *
 * Une famille, un débit.
 *   npx tsx tests/unit/sepa-regroupement.test.ts
 *
 * Deux enfants inscrits à l'année en dix fois, c'est deux échéanciers — donc
 * deux lignes de 69,90 € par mois sur le relevé de la famille. Les échéances
 * restent séparées en base (suivi et encaissement par enfant), mais le fichier
 * remis à la banque réunit celles d'un même mandat en une seule opération.
 */

import { regrouperParMandat, generateSepaXml, estPrelevementSepa, type SepaTransaction } from "../../src/lib/sepa";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires — regroupement des prélèvements SEPA");
console.log("══════════════════════════════════════════════════════════════\n");

const tx = (over: Partial<SepaTransaction>): SepaTransaction => ({
  instrId: "CEDC1PRLVM1P00001",
  endToEndId: "M1P00001",
  amount: 69.9,
  mandatId: "CEDC2190MD1",
  mandatDate: "2026-08-20",
  debtorName: "ANDRIEU Christophe",
  debtorIban: "FR7630006000011234567890189",
  debtorBic: "AGRIFRPP866",
  remittanceInfo: "Forfait G3 à G5 Ados 1/10",
  ...over,
});

console.log("✓ Deux enfants, un mandat : un seul débit :");
{
  const groupees = regrouperParMandat([
    tx({}),
    tx({ instrId: "CEDC1PRLVM2P00002", endToEndId: "M2P00002", remittanceInfo: "Forfait Baby poney 1/10" }),
  ]);
  assert("une seule opération", groupees.length === 1, String(groupees.length));
  assert("montant additionné : 139,80 €", groupees[0].amount === 139.8, String(groupees[0].amount));
  assert("le libellé énumère les deux forfaits",
    groupees[0].remittanceInfo.includes("G3 à G5") && groupees[0].remittanceInfo.includes("Baby poney"),
    groupees[0].remittanceInfo);
  assert("le mandat est conservé", groupees[0].mandatId === "CEDC2190MD1");
}

console.log("\n✓ Ce qui ne doit pas être regroupé :");
{
  const deuxMandats = regrouperParMandat([
    tx({}),
    tx({ mandatId: "CEDC2191MD1", debtorIban: "FR7630006000011234567890999", remittanceInfo: "Forfait Poney 1/10" }),
  ]);
  assert("deux mandats = deux opérations", deuxMandats.length === 2, String(deuxMandats.length));

  const seule = regrouperParMandat([tx({})]);
  assert("une échéance seule est inchangée",
    seule.length === 1 && seule[0].remittanceInfo === "Forfait G3 à G5 Ados 1/10");
  assert("son identifiant est conservé", seule[0].endToEndId === "M1P00001");
}

console.log("\n✓ Le libellé respecte la limite de la norme (140 caractères) :");
{
  const long = regrouperParMandat([
    tx({ remittanceInfo: "F".repeat(100) }),
    tx({ instrId: "x", endToEndId: "y", remittanceInfo: "B".repeat(100) }),
  ]);
  assert("tronqué à 140", long[0].remittanceInfo.length <= 140, String(long[0].remittanceInfo.length));
  assert("et signalé par des points de suspension", long[0].remittanceInfo.endsWith("…"));
}

console.log("\n✓ Le fichier XML porte bien l'opération regroupée :");
{
  const groupees = regrouperParMandat([
    tx({}),
    tx({ instrId: "CEDC1PRLVM2P00002", endToEndId: "M2P00002", remittanceInfo: "Forfait Baby poney 1/10" }),
  ]);
  const xml = generateSepaXml({
    msgId: "CEDC1PRLV",
    creationDate: "2026-09-01T10:00:00",
    requestedDate: "2026-09-05",
    sequenceType: "RCUR",
    transactions: groupees,
  });
  assert("une seule transaction annoncée", xml.includes("<NbOfTxs>1</NbOfTxs>"));
  assert("somme de contrôle à 139.80", xml.includes("<CtrlSum>139.80</CtrlSum>"));
  assert("montant de l'opération", xml.includes('<InstdAmt Ccy="EUR">139.80</InstdAmt>'));
}

console.log("\n✓ Une commande SEPA reste reconnue après le premier prélèvement :");
{
  // Au dépôt de la première remise, le statut passe de `sepa_scheduled` à
  // `partial` : les écrans qui la reconnaissaient au statut la reprenaient
  // pour un échéancier ordinaire — « Échéance 1/10 » de 699 €, encaissable
  // en espèces. C'est le mode qui fait foi.
  assert("à la création", estPrelevementSepa({ status: "sepa_scheduled", paymentMode: "prelevement_sepa" }));
  assert("après la première remise", estPrelevementSepa({ status: "partial", paymentMode: "prelevement_sepa" }));
  assert("une fois soldée", estPrelevementSepa({ status: "paid", paymentMode: "prelevement_sepa" }));
  assert("un échéancier par chèques n'en est pas",
    !estPrelevementSepa({ status: "partial", paymentMode: "cheque" }));
  assert("une commande sans mode non plus", !estPrelevementSepa({ status: "pending" }));
}

console.log(`\n──────────────────────────────────────────────────────────────`);
console.log(`  ${passed} réussis, ${failed} échoués`);
if (failed > 0) {
  console.log(`  Échecs : ${failures.join(", ")}`);
  console.log("──────────────────────────────────────────────────────────────\n");
  process.exit(1);
}
console.log("──────────────────────────────────────────────────────────────\n");
