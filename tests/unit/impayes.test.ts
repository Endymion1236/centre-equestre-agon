import assert from "node:assert/strict";
import {
  calculerResumeImpayes,
  compterParNature,
  filtrerImpayes,
  natureCommande,
  rienRegle,
  grouperImpayesParEvenement,
  listerImpayes,
  prelevementAPreparer,
  preparerMultiEncaissements,
  resumerAttentes,
  soldeRestant,
} from "../../src/app/admin/paiements/impayes-utils";

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

const ts = (seconds: number) => ({ seconds });
const p = (overrides: Record<string, any> = {}) => ({
  id: "p1",
  familyId: "f1",
  familyName: "Martin",
  status: "pending",
  paymentMode: "cheque",
  totalTTC: 100,
  paidAmount: 20,
  items: [{ activityTitle: "Stage", childName: "Eliot", date: "2026-09-10" }],
  date: ts(100),
  ...overrides,
});

console.log("\n── Sélection des impayés ──");

test("le solde restant tient compte du déjà encaissé", () => {
  assert.equal(soldeRestant(p()), 80);
});

test("payés, annulés, prélèvements ORGANISÉS et chèques différés sont exclus", () => {
  const result = listerImpayes([
    p({ id: "ok" }),
    p({ id: "paid", status: "paid" }),
    p({ id: "cancelled", status: "cancelled" }),
    // Prélèvement réellement posé : échéancier chiffré, ou commande marquée à l'inscription.
    p({ id: "sepa-planifie", paymentMode: "prelevement_sepa", status: "sepa_scheduled" }),
    p({ id: "diff", paymentMode: "cheque_differe" }),
  ], "2026-09-01");
  assert.deepEqual(result.map((x) => x.id), ["ok"]);
});

test("annoncé en prélèvement mais sans échéance posée : la somme reste réclamée", () => {
  // Une facture de récurrence porte le mode de règlement habituel de la
  // famille ; rien n'est prélevé tant qu'aucune échéance n'existe.
  const result = listerImpayes([
    p({ id: "a-preparer", paymentMode: "prelevement_sepa", status: "partial", totalTTC: 900, paidAmount: 300 }),
  ], "2026-09-01");
  assert.deepEqual(result.map((x) => x.id), ["a-preparer"]);
  assert.equal(prelevementAPreparer(result[0]), true);
  assert.equal(prelevementAPreparer(p({ paymentMode: "prelevement_sepa", status: "sepa_scheduled" })), false);
  assert.equal(prelevementAPreparer(p({ paymentMode: "cheque" })), false);
});

test("une échéance n'est impayée que si sa date est dépassée", () => {
  const result = listerImpayes([
    p({ id: "past", echeancesTotal: 3, echeanceDate: "2026-08-31" }),
    p({ id: "future", echeancesTotal: 3, echeanceDate: "2026-09-15" }),
  ], "2026-09-01");
  assert.deepEqual(result.map((x) => x.id), ["past"]);
});

test("la 1re échéance, datée du jour de l'inscription, est impayée dès aujourd'hui", () => {
  // Forfait annuel en 3× : la première échéance porte la date du jour. Elle
  // restait invisible dans Impayés jusqu'au lendemain.
  const result = listerImpayes([
    p({ id: "jour", echeancesTotal: 3, echeanceDate: "2026-09-26", paidAmount: 0 }),
    p({ id: "suivante", echeancesTotal: 3, echeanceDate: "2026-10-26", paidAmount: 0 }),
  ], "2026-09-26");
  assert.deepEqual(result.map((x) => x.id), ["jour"]);
});

console.log("\n── Filtres ──");

const unpaid = [
  p({ id: "a", familyId: "f1", familyName: "Martin", items: [{ activityTitle: "Stage", childName: "Eliot", date: "2026-09-10" }] }),
  p({ id: "b", familyId: "f2", familyName: "Durand", items: [{ activityTitle: "Balade", childName: "Ambre", date: "2026-09-11" }] }),
  p({ id: "c", familyId: "f2", familyName: "Durand", echeancesTotal: 3, echeanceDate: "2026-08-31", items: [{ activityTitle: "Forfait" }] }),
];

test("le filtre famille utilise l'identifiant et pas le nom", () => {
  assert.deepEqual(filtrerImpayes(unpaid, { familyFilter: "f1" }).map((x) => x.id), ["a"]);
});

test("le filtre type distingue facture et échéance", () => {
  assert.deepEqual(filtrerImpayes(unpaid, { typeFilter: "invoice" }).map((x) => x.id), ["a", "b"]);
  assert.deepEqual(filtrerImpayes(unpaid, { typeFilter: "echeance" }).map((x) => x.id), ["c"]);
});

test("la recherche couvre famille, activité et enfant", () => {
  assert.deepEqual(filtrerImpayes(unpaid, { search: "durand" }).map((x) => x.id), ["b", "c"]);
  assert.deepEqual(filtrerImpayes(unpaid, { search: "balade" }).map((x) => x.id), ["b"]);
  assert.deepEqual(filtrerImpayes(unpaid, { search: "eliot" }).map((x) => x.id), ["a"]);
});

console.log("\n── Nature des commandes ──");

test("la nature se lit sur le type d'activité, le libellé en repli", () => {
  assert.equal(natureCommande(p({ items: [{ activityType: "stage", activityTitle: "Galop de bronze 6/7 ans", stageDates: [{ date: "2026-10-20" }] }] })), "stage");
  assert.equal(natureCommande(p({ items: [{ activityTitle: "Stage galop de bronze 6/7 ans — 20 au 24 oct." }] })), "stage");
  assert.equal(natureCommande(p({ items: [{ activityType: "balade", activityTitle: "Balade en forêt" }] })), "balade");
  assert.equal(natureCommande(p({ items: [{ activityTitle: "Promenade du dimanche", date: "2026-10-04" }] })), "balade");
  assert.equal(natureCommande(p({ items: [{ activityType: "cours", activityTitle: "Adultes G1 à G4", creneauId: "cr1", date: "2026-10-02" }] })), "seance");
  assert.equal(natureCommande(p({ items: [{ activityTitle: "Cours débutant", date: "2026-10-02" }] })), "seance");
});

test("un forfait annuel prime sur ses lignes de cours, adhésion seule est « autre »", () => {
  assert.equal(natureCommande(p({ items: [
    { activityTitle: "Adhésion annuelle (enfant 1)" },
    { activityTitle: "Licence FFE -18 ans" },
    { activityType: "cours", activityTitle: "Forfait 1×/semaine" },
  ] })), "forfait");
  assert.equal(natureCommande(p({ type: "inscription_annuelle", items: [{ activityType: "cours", activityTitle: "Cours débutant 10-16 ans" }] })), "forfait");
  assert.equal(natureCommande(p({ items: [{ activityTitle: "Adhésion annuelle" }] })), "autre");
});

test("le filtre par nature et ses compteurs", () => {
  const lot = [
    p({ id: "s", items: [{ activityType: "stage", activityTitle: "Stage", date: "2026-10-20" }] }),
    p({ id: "b", items: [{ activityTitle: "Promenade", date: "2026-10-04" }] }),
    p({ id: "c", items: [{ activityType: "cours", activityTitle: "Adultes G1 à G4", creneauId: "cr1", date: "2026-10-02" }] }),
    p({ id: "f", items: [{ activityTitle: "Forfait 1×/semaine" }] }),
  ];
  assert.deepEqual(filtrerImpayes(lot, { natureFilter: "seance" }).map((x) => x.id), ["c"]);
  assert.deepEqual(filtrerImpayes(lot, { natureFilter: "stage" }).map((x) => x.id), ["s"]);
  assert.deepEqual(filtrerImpayes(lot, { natureFilter: "all" }).map((x) => x.id), ["s", "b", "c", "f"]);
  assert.deepEqual(compterParNature(lot), { stage: 1, balade: 1, seance: 1, forfait: 1, autre: 0 });
});

test("« Rien réglé » écarte les acomptes et règlements partiels", () => {
  const lot = [
    p({ id: "zero", paidAmount: 0 }),
    p({ id: "absent", paidAmount: undefined }),
    p({ id: "acompte", paidAmount: 30 }),
    p({ id: "centime", paidAmount: 0.01 }),
  ];
  assert.equal(rienRegle(lot[0]), true);
  assert.equal(rienRegle(lot[1]), true);
  assert.equal(rienRegle(lot[2]), false);
  assert.deepEqual(filtrerImpayes(lot, { rienRegle: true }).map((x) => x.id), ["zero", "absent"]);
  assert.deepEqual(filtrerImpayes(lot, { rienRegle: false }).map((x) => x.id), ["zero", "absent", "acompte", "centime"]);
});

console.log("\n── Totaux et regroupements ──");

test("le résumé calcule total global, total filtré et compteurs", () => {
  const result = calculerResumeImpayes(unpaid, [unpaid[0]]);
  assert.equal(result.totalDue, 240);
  assert.equal(result.totalFiltre, 80);
  assert.equal(result.nbInvoice, 2);
  assert.equal(result.nbEcheance, 1);
});

test("les commandes d'un même événement sont regroupées et triées par famille", () => {
  const groups = grouperImpayesParEvenement([
    p({ id: "d", familyName: "Zulu", items: [{ activityTitle: "Concours", date: "2026-09-20" }] }),
    p({ id: "e", familyName: "Alpha", items: [{ activityTitle: "Concours", date: "2026-09-20" }] }),
    p({ id: "f", familyName: "Orpheline", items: [], date: ts(999) }),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].isOrphan, false);
  assert.deepEqual(groups[0].payments.map((x) => x.familyName), ["Alpha", "Zulu"]);
  assert.equal(groups[1].isOrphan, true);
});

test("les factures sans événement restent dans le groupe Autres factures", () => {
  const groups = grouperImpayesParEvenement([
    p({ id: "old", items: [], date: ts(100) }),
    p({ id: "new", items: [], date: ts(200) }),
  ]);
  assert.deepEqual(groups[0].payments.map((x) => x.id), ["new", "old"]);
});

console.log("\n── Encaissement groupé ──");

test("seules les familles avec au moins deux factures réglables sont proposées", () => {
  const result = preparerMultiEncaissements([
    p({ id: "m1", familyId: "f1", familyName: "Martin", totalTTC: 100, paidAmount: 0 }),
    p({ id: "m2", familyId: "f1", familyName: "Martin", totalTTC: 50, paidAmount: 10 }),
    p({ id: "m3", familyId: "f2", familyName: "Durand" }),
    p({ id: "m4", familyId: "f3", familyName: "Sepa", paymentMode: "prelevement_sepa", status: "sepa_scheduled" }),
    p({ id: "m5", familyId: "f3", familyName: "Sepa" }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].familyId, "f1");
  assert.equal(result[0].total, 140);
});

test("resumerAttentes : un paiement en 3 fois est « à venir », pas impayé", () => {
  const payments = [
    { id: "e1", familyId: "f1", status: "pending", totalTTC: 214, paidAmount: 0, echeancesTotal: 3, echeanceDate: "2026-10-05" },
    { id: "e2", familyId: "f1", status: "pending", totalTTC: 214, paidAmount: 0, echeancesTotal: 3, echeanceDate: "2026-11-05" },
    { id: "e3", familyId: "f1", status: "pending", totalTTC: 214, paidAmount: 0, echeancesTotal: 3, echeanceDate: "2026-12-05" },
  ];
  const r = resumerAttentes(payments, ["f1"], "2026-09-02");
  assert.equal(r.impayes.length, 0);
  assert.equal(r.aVenir.length, 3);
  assert.equal(r.totalAVenir, 642);
  assert.equal(r.totalImpayes, 0);
});

test("resumerAttentes : une échéance dépassée devient un impayé", () => {
  const payments = [
    { id: "e1", familyId: "f1", status: "pending", totalTTC: 214, paidAmount: 0, echeancesTotal: 3, echeanceDate: "2026-08-05" },
    { id: "e2", familyId: "f1", status: "pending", totalTTC: 214, paidAmount: 0, echeancesTotal: 3, echeanceDate: "2026-11-05" },
  ];
  const r = resumerAttentes(payments, ["f1"], "2026-09-02");
  assert.deepEqual(r.impayes.map((p) => p.id), ["e1"]);
  assert.deepEqual(r.aVenir.map((p) => p.id), ["e2"]);
});

test("resumerAttentes : une commande simple impayée compte comme impayé, une autre famille est ignorée", () => {
  const payments = [
    { id: "c1", familyId: "f1", status: "pending", totalTTC: 26, paidAmount: 0 },
    { id: "c2", familyId: "f2", status: "pending", totalTTC: 99, paidAmount: 0 },
    { id: "c3", familyId: "f1", status: "partial", totalTTC: 349, paidAmount: 99.8 },
    { id: "c4", familyId: "f1", status: "paid", totalTTC: 50, paidAmount: 50 },
  ];
  const r = resumerAttentes(payments, ["f1"], "2026-09-02");
  assert.deepEqual(r.impayes.map((p) => p.id), ["c1", "c3"]);
  assert.equal(r.totalImpayes, 275.2);
  assert.equal(r.aVenir.length, 0);
});

test("resumerAttentes : SEPA programmé et chèques différés sont à venir", () => {
  const payments = [
    // Prélèvement réellement posé : 120 € d'échéances à venir, pas un impayé.
    { id: "s1", familyId: "f1", status: "pending", totalTTC: 120, paidAmount: 0, paymentMode: "prelevement_sepa", sepaRestant: 120 },
    { id: "d1", familyId: "f1", status: "pending", totalTTC: 90, paidAmount: 0, paymentMode: "cheque_differe" },
  ];
  const r = resumerAttentes(payments, ["f1"], "2026-09-02");
  assert.equal(r.impayes.length, 0);
  assert.equal(r.totalAVenir, 210);
});

console.log(`\n✅ ${passes} tests passés\n`);
