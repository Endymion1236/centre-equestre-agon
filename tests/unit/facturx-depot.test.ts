import assert from "node:assert/strict";
import {
  dateIso,
  echeanceParDefaut,
  facturxEnAttente,
  listerFacturesProfessionnelles,
  resumerDepots,
} from "../../src/app/admin/paiements/facturx-depot-utils";
import { estCompteProfessionnel } from "../../src/lib/facturx";

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

const families = [
  { firestoreId: "fam-part", accountType: "particulier", parentName: "DUPONT Marie" },
  { firestoreId: "fam-asso", accountType: "asso", parentName: "Club de l'Étrier" },
  { firestoreId: "fam-coll", accountType: "collectivite", parentName: "CMB — Centre de loisirs" },
  { firestoreId: "fam-ent", accountType: "entreprise", parentName: "SARL Les Écuries" },
  { firestoreId: "fam-vieux", parentName: "Fiche sans type" },
];

const ts = (iso: string) => ({ seconds: Math.floor(new Date(iso).getTime() / 1000) });

const payments = [
  // particulier facturé : hors périmètre plateforme
  { id: "p1", familyId: "fam-part", invoiceNumber: "F-2026-0001", invoiceDate: ts("2026-09-10"), status: "paid", totalTTC: 50 },
  // asso, non déposée
  { id: "p2", familyId: "fam-asso", invoiceNumber: "F-2026-0002", invoiceDate: ts("2026-09-12"), status: "paid", totalTTC: 300 },
  // entreprise, émise avant paiement, déposée
  { id: "p3", familyId: "fam-ent", invoiceNumber: "F-2026-0003", invoiceDate: ts("2026-09-15"), status: "pending", dueDate: "2026-10-15", totalTTC: 900, facturxDeposeLe: ts("2026-09-16"), facturxDeposePar: "nicolas@agon.fr" },
  // collectivité, sans invoiceDate → repli sur date de commande
  { id: "p4", familyId: "fam-coll", invoiceNumber: "F-2026-0004", date: ts("2026-09-20"), status: "partial", totalTTC: 1200 },
  // collectivité mais AVANT le début de la réforme
  { id: "p5", familyId: "fam-coll", invoiceNumber: "F-2026-0000", invoiceDate: ts("2026-03-01"), status: "paid", totalTTC: 100 },
  // proforma (pas de numéro) : rien à déposer
  { id: "p6", familyId: "fam-ent", status: "pending", totalTTC: 200 },
  // annulée
  { id: "p7", familyId: "fam-asso", invoiceNumber: "F-2026-0005", invoiceDate: ts("2026-09-21"), status: "cancelled", totalTTC: 80 },
  // famille inconnue / sans type
  { id: "p8", familyId: "fam-vieux", invoiceNumber: "F-2026-0006", invoiceDate: ts("2026-09-22"), status: "paid", totalTTC: 80 },
  { id: "p9", familyId: "fam-inconnue", invoiceNumber: "F-2026-0007", invoiceDate: ts("2026-09-22"), status: "paid", totalTTC: 80 },
];

console.log("estCompteProfessionnel");
test("asso, collectivité et entreprise sont des comptes pros", () => {
  assert.equal(estCompteProfessionnel({ accountType: "asso" }), true);
  assert.equal(estCompteProfessionnel({ accountType: "collectivite" }), true);
  assert.equal(estCompteProfessionnel({ accountType: "entreprise" }), true);
});
test("particulier, fiche sans type ou absente : non", () => {
  assert.equal(estCompteProfessionnel({ accountType: "particulier" }), false);
  assert.equal(estCompteProfessionnel({}), false);
  assert.equal(estCompteProfessionnel(null), false);
});

console.log("\ndateIso / echeanceParDefaut");
test("timestamp Firestore, Date, ISO, vide", () => {
  assert.equal(dateIso(ts("2026-09-10")), "2026-09-10");
  assert.equal(dateIso(new Date("2026-09-11T10:00:00Z")), "2026-09-11");
  assert.equal(dateIso("2026-09-12"), "2026-09-12");
  assert.equal(dateIso(null), "");
  assert.equal(dateIso("n'importe quoi"), "");
});
test("échéance par défaut = émission + 30 jours", () => {
  assert.equal(echeanceParDefaut(new Date(2026, 8, 15)), "2026-10-15");
  assert.equal(echeanceParDefaut(new Date(2026, 11, 20), 30), "2027-01-19");
});

console.log("\nlisterFacturesProfessionnelles");
const lignes = listerFacturesProfessionnelles(payments, families);
test("ne retient que les factures pros numérotées, non annulées, depuis le 1er sept. 2026", () => {
  assert.deepEqual(lignes.map((l) => l.payment.id), ["p4", "p3", "p2"]);
});
test("les plus récentes d'abord, avec repli sur la date de commande", () => {
  assert.equal(lignes[0].dateEmission, "2026-09-20");
  assert.equal(lignes[2].dateEmission, "2026-09-12");
});
test("le marquage « déposée » est lu depuis facturxDeposeLe", () => {
  assert.equal(lignes.find((l) => l.payment.id === "p3")?.deposee, true);
  assert.equal(lignes.find((l) => l.payment.id === "p2")?.deposee, false);
});
test("un début de suivi différent change le périmètre", () => {
  const depuisMars = listerFacturesProfessionnelles(payments, families, "2026-01-01");
  assert.ok(depuisMars.some((l) => l.payment.id === "p5"));
});

console.log("\nresumerDepots");
test("sépare à déposer / déposées", () => {
  const r = resumerDepots(payments, families);
  assert.deepEqual(r.aDeposer.map((l) => l.payment.id), ["p4", "p2"]);
  assert.deepEqual(r.deposees.map((l) => l.payment.id), ["p3"]);
});

console.log("\nfacturxEnAttente (pastille Historique)");
test("pro non déposée → en attente ; déposée, particulier, ou sans famille → non", () => {
  assert.equal(facturxEnAttente(payments[1], families[1]), true);
  assert.equal(facturxEnAttente(payments[2], families[3]), false);
  assert.equal(facturxEnAttente(payments[0], families[0]), false);
  assert.equal(facturxEnAttente(payments[1], undefined), false);
});

console.log(`\n${passes} test(s) OK`);
