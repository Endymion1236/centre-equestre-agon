/**
 * tests/unit/fec-achats-banque.test.ts — journaux HA et BQ du FEC.
 *   npx tsx tests/unit/fec-achats-banque.test.ts
 */
import assert from "node:assert/strict";
import { construireAchatsBanque, dateReleveFec, estAchat, transitDuCredit } from "../../src/lib/fec-achats-banque";
import { ENTETE_FEC } from "../../src/app/admin/comptabilite/fec-utils";
import { controlerStructureFec } from "../../src/lib/controle-fec";
import { fecDuMois } from "../../src/lib/envoi-comptable-utils";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };

const champs = (l: string) => l.split("\t");
const ecriture = (lignes: string[], journal: string, num: number) => lignes.map(champs).filter((c) => c[0] === journal && c[2] === String(num));
const cts = (v: string) => Math.round(Number((v || "0").replace(",", ".")) * 100);
const resume = (lignes: string[][]) => lignes.map((c) => `${c[4]}${c[6] ? `/${c[6]}` : ""} ${c[11] ? "D" + c[11] : "C" + c[12]}`);

const debit = (x: any) => ({ id: x.id || "d1", mois: "2026-09", dateOperation: "2026-09-10", source: "releve-bancaire", compte: "51200000", suivie: true, ...x });

test("achat avec facture et TVA justifiée : HA (charge HT + TVA + fournisseur) puis BQ", () => {
  const r = construireAchatsBanque({
    mois: "2026-09", numeroDepart: 10, credits: [],
    debits: [debit({ fournisseur: "AGRIAL GRANULES", poste: "Aliments, litières, paille", montant: 120, piece: { id: "p1", extraction: { typeDocument: "achat", devise: "EUR", numero: "FA-77", ht: 100, tva: 20, ttc: 120 } } })],
  });
  assert.equal(r.ecrituresAchats, 1);
  assert.deepEqual(resume(ecriture(r.lignes, "HA", 10)), ["60141000 D100,00", "44566000 D20,00", "40100000/401AGRIAL C120,00"]);
  assert.deepEqual(resume(ecriture(r.lignes, "BQ", 11)), ["40100000/401AGRIAL D120,00", "51200000 C120,00"]);
  assert.equal(ecriture(r.lignes, "HA", 10)[0][8], "FA-77"); // PieceRef = n° de facture
});

test("achat sans justificatif : le TTC en charge, aucune TVA inventée", () => {
  const r = construireAchatsBanque({ mois: "2026-09", numeroDepart: 1, credits: [], debits: [debit({ fournisseur: "Quincaillerie Dupont", poste: "Fournitures & petit équipement (dont sellerie)", montant: 36.5 })] });
  assert.deepEqual(resume(ecriture(r.lignes, "HA", 1)), ["60660000 D36,50", "40100000 C36,50"]);
});

test("salaire, frais bancaires, catégorie inconnue : directement en banque", () => {
  const r = construireAchatsBanque({
    mois: "2026-09", numeroDepart: 1, credits: [],
    debits: [
      debit({ id: "a", fournisseur: "VIR SALAIRE LEA", poste: "Salaires", montant: 1500, suivie: false }),
      debit({ id: "b", fournisseur: "COM CARTE 12/09", poste: "Frais bancaires & commissions (CB, Stripe)", montant: 4.2, dateOperation: "2026-09-12" }),
      debit({ id: "c", fournisseur: "PRLV MYSTERE", poste: "", montant: 9, dateOperation: "2026-09-13" }),
    ],
  });
  assert.equal(r.ecrituresAchats, 0);
  assert.equal(r.ecrituresBanque, 3);
  assert.deepEqual(resume(ecriture(r.lignes, "BQ", 1)), ["42100000 D1500,00", "51200000 C1500,00"]);
  assert.deepEqual(resume(ecriture(r.lignes, "BQ", 2)), ["62710000 D4,20", "51200000 C4,20"]);
  assert.deepEqual(resume(ecriture(r.lignes, "BQ", 3)), ["47100000 D9,00", "51200000 C9,00"]);
  assert.equal(r.compteAttente, 9);
  assert.ok(r.anomalies.some((a) => a.includes("PRLV MYSTERE")));
});

test("doublon probable et dépense hors relevé : hors FEC", () => {
  const r = construireAchatsBanque({ mois: "2026-09", numeroDepart: 1, credits: [], debits: [
    debit({ fournisseur: "Orange", poste: "Informatique, logiciels & abonnements", montant: 40, doublonProbable: true }),
    debit({ id: "m", fournisseur: "Ticket", poste: "Autres dépenses", montant: 5, source: "manuel" }),
  ] });
  assert.equal(r.lignes.length, 0);
  assert.ok(r.anomalies.some((a) => a.includes("doublon")));
});

test("crédits : remise carte, ANCV net de commission, virement déjà en RG, crédit non rapproché", () => {
  const r = construireAchatsBanque({
    mois: "2026-10", numeroDepart: 1, debits: [],
    credits: [
      { date: "13/10/2026", label: "Remise carte CARTE 8067954", amount: 1231.2, matched: true, matchType: "CB en ligne", matchedEncs: [{ montant: 1000, mode: "cb_online" }, { montant: 240, mode: "cb_online" }] },
      { date: "12/10/2026", label: "Virement DRFIP -ANCV-DC2699G6EL-1", amount: 448.5, matched: true, matchType: "Manuel", matchedEncs: [{ montant: 460, mode: "cheque_vacances_connect" }] },
      { date: "12/10/2026", label: "VIR MME DUPONT", amount: 200, matched: true, matchType: "Virement", matchedEncs: [{ montant: 200, mode: "virement" }] },
      { date: "14/10/2026", label: "VIR INCONNU", amount: 50, matched: false, matchType: "" },
      { date: "02/09/2026", label: "Hors mois", amount: 10, matched: false },
    ],
  });
  const bq = r.lignes.map(champs);
  const parNum = (num: number) => resume(bq.filter((c) => c[2] === String(num)));
  // Tri par date : ANCV (12/10), virement sauté, carte (13/10), inconnu (14/10).
  assert.deepEqual(parNum(1), ["51200000 D448,50", "51180000 C460,00", "62840000 D11,50"]);
  assert.deepEqual(parNum(2), ["51200000 D1231,20", "51150000 C1240,00", "62710000 D8,80"]);
  assert.deepEqual(parNum(3), ["51200000 D50,00", "47100000 C50,00"]);
  assert.equal(r.ecrituresBanque, 3);
  assert.ok(r.anomalies.some((a) => a.includes("déjà passés en banque")));
});

test("transit d'un crédit et règles de classement", () => {
  assert.deepEqual(transitDuCredit({ date: "", label: "", amount: 1, matchType: "Chèques" }).compte?.compte, "51120000");
  assert.equal(transitDuCredit({ date: "", label: "", amount: 1, matchType: "Espèces" }).dejaEnBanque, true);
  assert.equal(transitDuCredit({ date: "", label: "", amount: 1, matchType: "Prélèvement SEPA", remiseSepaId: "r" }).dejaEnBanque, true);
  assert.equal(estAchat("60141000"), true);
  assert.equal(estAchat("62710000"), false);
  assert.equal(estAchat("42100000"), false);
  assert.equal(estAchat("21540000"), true);
  assert.equal(dateReleveFec("2/9/2026"), "20260902");
});

test("FEC complet : VE + RG + HA + BQ, structure conforme et écritures équilibrées", () => {
  const facture = { id: "p1", invoiceNumber: "F-2026-001", familyName: "Durand", totalTTC: 100, status: "paid", date: { seconds: Date.parse("2026-09-05T10:00:00Z") / 1000 }, items: [{ activityTitle: "Cours", priceHT: 94.79, priceTTC: 100, tva: 5.5 }] };
  const enc = { id: "e1", paymentId: "p1", familyName: "Durand", montant: 100, mode: "cheque", date: { seconds: Date.parse("2026-09-05T10:00:00Z") / 1000 } };
  const f = fecDuMois({
    mois: "2026-09", factures: [facture], encaissements: [enc], payments: [facture], tousEncaissements: [enc],
    achatsBanque: {
      debits: [debit({ fournisseur: "AGRIAL", poste: "Aliments, litières, paille", montant: 120 }), debit({ id: "s", fournisseur: "SALAIRE", poste: "Salaires", montant: 800, suivie: false })],
      credits: [{ date: "08/09/2026", label: "REMISE CHEQUES", amount: 100, matched: true, matchType: "Chèques", matchedEncs: [{ montant: 100, mode: "cheque" }] }],
    },
  });
  assert.deepEqual(controlerStructureFec(f.contenu), []);
  const journaux = new Set(f.contenu.trim().split("\n").slice(1).map((l) => l.split("\t")[0]));
  assert.deepEqual([...journaux].sort(), ["BQ", "HA", "RG", "VE"]);
  assert.equal(f.ecrituresAchats, 1);
  assert.equal(f.ecrituresBanque, 3);
  // Numéros d'écriture uniques dans tout le fichier.
  const nums = f.contenu.trim().split("\n").slice(1).map((l) => `${l.split("\t")[0]}|${l.split("\t")[2]}`);
  const parNum = new Map<string, Set<string>>();
  for (const k of nums) { const [j, num] = k.split("|"); parNum.set(num, (parNum.get(num) || new Set()).add(j)); }
  assert.ok([...parNum.values()].every((s) => s.size === 1));
  // 51120000 soldé : débité au règlement (RG), crédité à la remise (BQ).
  const lignes = f.contenu.trim().split("\n").slice(1).map((l) => l.split("\t"));
  const solde = lignes.filter((c) => c[4] === "51120000").reduce((s, c) => s + cts(c[11]) - cts(c[12]), 0);
  assert.equal(solde, 0);
});

test("mois Céleris : écritures reprises + HA et BQ, crédits omis si Céleris tient la banque", () => {
  const celeris = { lignes: [
    { journal: "VTE", compte: "411", piece: "12", date: "2026-08-01", debit: 12000, credit: 0, libelle: "Client", libelleCompte: "Clients" },
    { journal: "VTE", compte: "706", piece: "12", date: "2026-08-01", debit: 0, credit: 12000, libelle: "Stage", libelleCompte: "Stages" },
    { journal: "BNQ", compte: "512", piece: "13", date: "2026-08-02", debit: 12000, credit: 0, libelle: "Reglement", libelleCompte: "Banque" },
    { journal: "BNQ", compte: "411", piece: "13", date: "2026-08-02", debit: 0, credit: 12000, libelle: "Reglement", libelleCompte: "Clients" },
  ] } as any;
  const f = fecDuMois({
    mois: "2026-08", factures: [], encaissements: [], payments: [], celeris,
    achatsBanque: {
      debits: [debit({ mois: "2026-08", dateOperation: "2026-08-20", fournisseur: "PADD", poste: "Fournitures & petit équipement (dont sellerie)", montant: 60 })],
      credits: [{ date: "05/08/2026", label: "REMISE CB", amount: 300, matched: true, matchType: "Remise carte" }],
    },
  });
  assert.deepEqual(controlerStructureFec(f.contenu), []);
  assert.equal(f.source, "celeris");
  assert.equal(f.ecrituresAchats, 1);
  assert.equal(f.ecrituresBanque, 1); // le seul débit ; les crédits sont dans Céleris
  assert.ok(f.anomalies.some((a) => a.includes("déjà tenue dans les écritures Céleris")));
  const lignes = f.contenu.trim().split("\n").slice(1).map((l) => l.split("\t"));
  assert.ok(lignes.some((c) => c[0] === "HA" && c[2] === "3"));
});

console.log(`✅ ${n} tests passés`);
