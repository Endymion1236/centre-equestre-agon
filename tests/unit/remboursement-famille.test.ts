/**
 * tests/unit/remboursement-famille.test.ts — l'argent rendu à une famille, du relevé au FEC.
 *   npx tsx tests/unit/remboursement-famille.test.ts
 */
import assert from "node:assert/strict";
import { apparierRemboursements, CATEGORIE_REMBOURSEMENT_FAMILLE, nomDuVirementEmis, remboursementsDuJournal } from "../../src/lib/remboursement-famille";
import { construireAchatsBanque } from "../../src/lib/fec-achats-banque";
import { construireFecComplet } from "../../src/lib/fec-complet";
import { proposerPosteBancaire } from "../../src/lib/import-bancaire";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); } catch (e) { console.error(`  ❌ ${nom}\n`, e); process.exitCode = 1; }
}
const cols = (l: string) => l.split("\t");

test("le nom de la famille dans le libellé du virement émis", () => {
  assert.equal(nomDuVirementEmis("Virement émis WEB besse fanny"), "besse fanny");
  assert.equal(nomDuVirementEmis("Virement émis VIR INST vers gautier thierry - remboursement promenade non effectuee"), "gautier thierry");
  assert.equal(proposerPosteBancaire("Virement émis VIR INST vers gautier thierry - remboursement promenade non effectuee"), CATEGORIE_REMBOURSEMENT_FAMILLE);
  assert.notEqual(proposerPosteBancaire("Remboursement de prêt 10001790945"), CATEGORIE_REMBOURSEMENT_FAMILLE);
});

test("remboursements du journal : virement et chèque, hors annulés et hors autres modes", () => {
  const enc = [
    { id: "r1", mode: "remboursement_virement", montant: -57, familyName: "GAUTIER", d: "2026-09-20" },
    { id: "r2", mode: "remboursement_cb", montant: -30, familyName: "X", d: "2026-09-20" },
    { id: "r3", mode: "remboursement_cheque", montant: -40, familyName: "Y", d: "2026-09-21" },
    { id: "c3", mode: "remboursement_cheque", montant: 40, correctionDe: "r3", d: "2026-09-22" },
    { id: "p", mode: "virement", montant: 100, d: "2026-09-01" },
  ];
  const r = remboursementsDuJournal(enc, (e) => e.d);
  assert.deepEqual(r.map((x) => x.id), ["r1"]);
  assert.equal(r[0].montant, 57);
});

test("appariement : même montant à 15 jours, le nom d'abord", () => {
  const remb = [{ id: "a", montant: 57, dateIso: "2026-09-18", familyName: "BESSE Fanny" }, { id: "b", montant: 57, dateIso: "2026-09-19", familyName: "GAUTIER Thierry" }];
  const m = apparierRemboursements([
    { id: "d1", montant: 57, dateOperation: "2026-09-19", fournisseur: "Virement émis WEB besse fanny" },
    { id: "d2", montant: 57, dateOperation: "2026-09-20", fournisseur: "VIR INST vers gautier thierry" },
    { id: "d3", montant: 57, dateOperation: "2026-10-30", fournisseur: "VIR INST vers autre" },
  ], remb);
  assert.equal(m.get("d1")?.id, "a");
  assert.equal(m.get("d2")?.id, "b");
  assert.equal(m.get("d3"), null);
});

const debit = (x: any) => ({ id: "d1", mois: "2026-09", dateOperation: "2026-09-19", source: "releve-bancaire", compte: "51200000", suivie: false, poste: CATEGORIE_REMBOURSEMENT_FAMILLE, ...x });

test("FEC septembre 2026 : remboursement non enregistré = client 41100000 au nom lu, jamais le 47100000", () => {
  const ab = construireAchatsBanque({ mois: "2026-09", numeroDepart: 1, credits: [],
    debits: [debit({ fournisseur: "Virement émis WEB besse fanny", montant: 57 })] as any });
  const l = ab.lignes.map(cols);
  assert.deepEqual(l.map((c) => [c[0], c[4], c[6], c[11], c[12]]), [["BQ", "41100000", "besse fanny", "57,00", ""], ["BQ", "51200000", "", "", "57,00"]]);
  assert.ok(ab.anomalies.some((a) => /besse fanny.*rattachez-le à la commande/.test(a)));
  assert.equal(ab.compteAttente, 0);
});

test("FEC : remboursement déjà enregistré dans l'application = pas repris en BQ, et le RG le sort de la banque", () => {
  const ab = construireAchatsBanque({ mois: "2026-09", numeroDepart: 1, credits: [],
    debits: [debit({ fournisseur: "VIR INST vers gautier thierry - remboursement promenade non effectuee", montant: 57 })] as any,
    remboursements: [{ id: "r1", montant: 57, dateIso: "2026-09-18", familyName: "GAUTIER" }] });
  assert.equal(ab.lignes.length, 0);
  assert.ok(ab.anomalies.some((a) => /1 remboursement\(s\) à une famille déjà enregistré/.test(a)));
  const rg = construireFecComplet({ factures: [], encaissements: [{ id: "r1", paymentId: "p1", familyName: "GAUTIER", montant: -57, mode: "remboursement_virement", modeLabel: "Remboursement virement", date: { seconds: Date.parse("2026-09-18T10:00:00Z") / 1000 } }] as any, maintenant: new Date("2026-10-01") });
  const lignes = rg.contenu.split("\n").filter(Boolean).slice(1).map(cols).filter((c) => c[0] === "RG");
  assert.deepEqual(lignes.map((c) => [c[4], c[11], c[12]]), [["41100000", "57,00", ""], ["51200000", "", "57,00"]]);
  assert.ok(!rg.anomalies.some((a) => /mode .* inconnu/.test(a)));
});

if (process.exitCode) console.error("❌ échec"); else console.log(`✅ ${passes} tests passés`);
