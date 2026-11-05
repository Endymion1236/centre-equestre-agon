/**
 * tests/unit/fec-achats-banque.test.ts — journaux HA et BQ du FEC.
 *   npx tsx tests/unit/fec-achats-banque.test.ts
 */
import assert from "node:assert/strict";
import { codeLettrage, codeModeRapproche, construireAchatsBanque, dateReleveFec, estAchat, tiersFournisseur, transitDuCredit } from "../../src/lib/fec-achats-banque";
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

test("achat avec facture et TVA justifiée : HA à la date de facture, compte du fournisseur, lettré avec son règlement", () => {
  const r = construireAchatsBanque({
    mois: "2026-09", numeroDepart: 10, credits: [],
    debits: [debit({ id: "dep-agrial", fournisseur: "AGRIAL GRANULES", poste: "Aliments, litières, paille", montant: 120, piece: { id: "p1", extraction: { typeDocument: "achat", devise: "EUR", numero: "FA-77", date: "2026-09-02", ht: 100, tva: 20, ttc: 120 } } })],
  });
  assert.equal(r.ecrituresAchats, 1);
  const ha = ecriture(r.lignes, "HA", 10), bq = ecriture(r.lignes, "BQ", 11);
  assert.deepEqual(resume(ha), ["60141000 D100,00", "44566000 D20,00", "401AGRIAL/401AGRIAL C120,00"]);
  assert.deepEqual(resume(bq), ["401AGRIAL/401AGRIAL D120,00", "51200000 C120,00"]);
  assert.equal(ha[0][8], "FA-77"); // PieceRef = n° de facture
  assert.equal(ha[0][3], "20260902"); // date de la facture
  assert.equal(bq[0][3], "20260910"); // date du débit
  // Lettrage : même code sur la facture et le règlement (401), daté du règlement.
  const code = codeLettrage("dep-agrial");
  assert.match(code, /^[A-Z]{4}$/);
  assert.deepEqual([ha[2][13], ha[2][14]], [code, "20260910"]);
  assert.deepEqual([bq[0][13], bq[0][14]], [code, "20260910"]);
  assert.equal(ha[0][13], ""); // la charge n'est pas lettrée
});

test("facture antérieure à août 2026 : déjà saisie par le cabinet, seul le règlement", () => {
  const r = construireAchatsBanque({
    mois: "2026-08", numeroDepart: 1, credits: [],
    debits: [debit({ mois: "2026-08", dateOperation: "2026-08-05", fournisseur: "PADD", poste: "Fournitures & petit équipement (dont sellerie)", montant: 80, piece: { id: "p", extraction: { typeDocument: "achat", devise: "EUR", numero: "P-9", date: "2026-07-28", ttc: 80 } } })],
  });
  assert.equal(r.ecrituresAchats, 0);
  assert.deepEqual(resume(ecriture(r.lignes, "BQ", 1)), ["401PADD/401PADD D80,00", "51200000 C80,00"]);
  assert.ok(r.anomalies.some((a) => a.includes("déjà saisie par le cabinet")));
});

test("date de facture mal lue (1996) : pas « déjà saisie par le cabinet », achat à la date du débit (JIMMY LACOLLEY, 11/2026)", () => {
  const r = construireAchatsBanque({
    mois: "2026-10", numeroDepart: 1, credits: [],
    debits: [debit({ mois: "2026-10", dateOperation: "2026-10-30", fournisseur: "JIMMY LACOLLEY", poste: "Aliments, litières, paille", montant: 375, piece: { id: "p", extraction: { typeDocument: "achat", devise: "EUR", numero: "F12", date: "1996-09-09", ttc: 375 } } })],
  });
  assert.equal(r.anomalies.some((a) => a.includes("déjà saisie par le cabinet")), false);
  assert.ok(r.anomalies.some((a) => a.includes("sans doute mal lue")));
  assert.equal(r.ecrituresAchats, 1);
  assert.equal(ecriture(r.lignes, "HA", 1)[0][3], "20261030");
});

test("chaque ligne fournisseur porte son tiers (FEC-Expert, 11/2026), le compte du cabinet ne change pas", () => {
  const r = construireAchatsBanque({
    mois: "2026-09", numeroDepart: 1, credits: [],
    debits: [
      debit({ id: "a", fournisseur: "AGRIAL GRANULES", poste: "Aliments, litières, paille", montant: 50 }),
      debit({ id: "b", fournisseur: "Quincaillerie Dupont", poste: "Fournitures & petit équipement (dont sellerie)", montant: 12 }),
    ],
  });
  const lignes401 = r.lignes.map(champs).filter((c) => c[4].startsWith("401"));
  assert.ok(lignes401.length >= 4);
  assert.ok(lignes401.every((c) => c[6] && c[7]), "CompAuxNum et CompAuxLib remplis");
  assert.ok(lignes401.some((c) => c[4] === "401AGRIAL" && c[6] === "401AGRIAL" && c[7] === "Agrial"));
  assert.ok(lignes401.some((c) => c[4] === "40100000" && c[6] === "FQUINCAILLERIEDUPO" && c[7] === "Quincaillerie Dupont"));
  assert.deepEqual(tiersFournisseur("", { compte: "40100000", libelle: "x", collectif: true }), { auxNum: "FFOURNISSEUROCCASI", auxLib: "Fournisseur occasionnel" });
  assert.deepEqual(controlerStructureFec([ENTETE_FEC, ...r.lignes].join("\n") + "\n"), []);
});

test("prélèvement rejeté (SAMSON, 11/2026) : à la date du relevé, contre la liaison si le rejet est enregistré, sinon au 47100000, jamais en charge", () => {
  const impaye = debit({ id: "imp", mois: "2026-10", dateOperation: "2026-10-30", fournisseur: "Impayé Prel Mr Samson Mickael", poste: "Frais bancaires", montant: 55 });
  const avec = construireAchatsBanque({ mois: "2026-10", numeroDepart: 1, credits: [], debits: [impaye], rejets: [{ id: "cp", montant: 55, dateIso: "2026-11-01" }] });
  // Rejet enregistré : la banque sort à la date du relevé, contre le compte de liaison que l'annulation (RG) solde.
  assert.deepEqual(resume(ecriture(avec.lignes, "BQ", 1)), ["58000000 D55,00", "51200000 C55,00"]);
  assert.equal(ecriture(avec.lignes, "BQ", 1)[0][3], "20261030", "à la date du relevé");
  const sans = construireAchatsBanque({ mois: "2026-10", numeroDepart: 1, credits: [], debits: [impaye], rejets: [] });
  assert.deepEqual(resume(ecriture(sans.lignes, "BQ", 1)), ["47100000 D55,00", "51200000 C55,00"]);
  assert.ok(sans.anomalies.some((a) => /bouton « Rejeté »/.test(a)));
  assert.equal(sans.compteAttente, 55);
});

test("remise carte rapprochée à une écriture en espèces (13/10/2026) : la remise passe en entier, l'écart au 47100000", () => {
  const credit = { date: "13/10/2026", label: "Remise carte CARTE 8067954 001 195811 13/10", amount: 1231.2, matched: true, matchType: "CB terminal",
    matchedEncs: [{ familyName: "Famille A", montant: 1081.2, mode: "cb_terminal", date: "13/10/2026" }, { familyName: "Famille B", montant: 150, mode: "especes", date: "13/10/2026" }] };
  const r = construireAchatsBanque({ mois: "2026-10", numeroDepart: 1, debits: [], credits: [credit as any] });
  const bq = resume(ecriture(r.lignes, "BQ", 1));
  assert.ok(bq.includes("51200000 D1231,20"), bq.join(" | "));
  assert.ok(bq.includes("51150000 C1081,20"));
  assert.ok(bq.includes("47100000 C150,00"));
  assert.equal(r.anomalies.filter((a) => /Famille B/.test(a)).length, 1, "un seul message, qui nomme l'écriture");
});

test("facture postérieure au débit (acompte) : datée du débit", () => {
  const r = construireAchatsBanque({ mois: "2026-09", numeroDepart: 1, credits: [], debits: [debit({ fournisseur: "Orange", poste: "Informatique, logiciels & abonnements", montant: 30, piece: { id: "p", extraction: { typeDocument: "achat", devise: "EUR", date: "2026-09-20" } } })] });
  assert.equal(ecriture(r.lignes, "HA", 1)[0][3], "20260910");
});

test("achat sans justificatif : le TTC en charge, aucune TVA inventée", () => {
  const r = construireAchatsBanque({ mois: "2026-09", numeroDepart: 1, credits: [], debits: [debit({ fournisseur: "Quincaillerie Dupont", poste: "Fournitures & petit équipement (dont sellerie)", montant: 36.5 })] });
  assert.deepEqual(resume(ecriture(r.lignes, "HA", 1)), ["60660000 D36,50", "40100000/FQUINCAILLERIEDUPO C36,50"]);
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

test("modes enregistrés sous leur libellé par le rapprochement : reconnus", () => {
  assert.equal(codeModeRapproche("CB Terminal"), "cb_terminal");
  assert.equal(codeModeRapproche("CB en ligne"), "cb_online");
  assert.equal(codeModeRapproche("Chèque"), "cheque");
  assert.equal(codeModeRapproche("Chèques Vacances"), "cheque_vacances");
  assert.equal(codeModeRapproche("Chq. Vacances Connect"), "cheque_vacances_connect");
  assert.equal(codeModeRapproche("Virement"), "virement");
  assert.equal(codeModeRapproche("Prélèvement SEPA"), "prelevement_sepa");
  assert.equal(codeModeRapproche("Espèces"), "especes");
  assert.equal(codeModeRapproche("cb_terminal"), "cb_terminal");
  const r = construireAchatsBanque({ mois: "2026-09", numeroDepart: 1, debits: [], credits: [
    { date: "10/09/2026", label: "Remise carte CARTE 1535134 001 1 09/09", amount: 80, matched: true, matchType: "CB Terminal", matchedEncs: [{ montant: 50, mode: "CB Terminal" }, { montant: 30, mode: "CB Terminal" }] },
    { date: "11/09/2026", label: "REMISE CHQ", amount: 100, matched: true, matchType: "Chèques", matchedEncs: [{ montant: 100, mode: "Chèque" }] },
    { date: "12/09/2026", label: "VIR DUPONT", amount: 60, matched: true, matchType: "Virement", matchedEncs: [{ montant: 60, mode: "Virement" }] },
  ] });
  assert.equal(r.compteAttente, 0);
  assert.equal(r.ecrituresBanque, 2); // le virement est déjà en banque par RG
});

test("remise mêlant chèques et chèques-vacances : chaque mode soldé ; « Ignoré » nommé", () => {
  const r = construireAchatsBanque({ mois: "2026-09", numeroDepart: 1, debits: [], credits: [
    { date: "15/09/2026", label: "REMISE CHQ 12", amount: 1300, matched: true, matchType: "Chèques", matchedEncs: [{ montant: 1000, mode: "Chèque" }, { montant: 300, mode: "Chèques Vacances" }] },
    { date: "16/09/2026", label: "VIR EXCEDENT PRO", amount: 5000, matched: true, matchType: "Ignoré" },
    { date: "17/09/2026", label: "VIR + CHQ", amount: 150, matched: true, matchType: "Manuel", matchedEncs: [{ montant: 100, mode: "Virement" }, { montant: 50, mode: "Chèque" }] },
  ] });
  const bq = r.lignes.map(champs);
  const parNum = (num: number) => resume(bq.filter((c) => c[2] === String(num)));
  assert.deepEqual(parNum(1), ["51200000 D1300,00", "51120000 C1000,00", "51180000 C300,00"]);
  assert.deepEqual(parNum(2), ["51200000 D5000,00", "47100000 C5000,00"]);
  // La part virement est déjà en banque par RG : seule la part chèque passe ici.
  assert.deepEqual(parNum(3), ["51200000 D50,00", "51120000 C50,00"]);
  assert.equal(r.compteAttenteCredits, 5000);
  assert.ok(r.anomalies.some((a) => a.includes("« Ignoré »")));
});

test("crédit hors application classé au rapprochement : sur son compte", () => {
  const r = construireAchatsBanque({ mois: "2026-09", numeroDepart: 1, debits: [], credits: [
    { date: "07/09/2026", label: "VIR SGC COUTANCES FAC NO10736", amount: 1920, matched: true, matchType: "Manuel", compteContrepartie: { id: "facture-anterieure", compte: "41100000", libelle: "Règlement d'une facture Céleris ou antérieure" } },
    { date: "03/09/2026", label: "VIR ASP AIDE UNIQUE", amount: 833.48, matched: true, matchType: "Manuel", compteContrepartie: { id: "subvention", compte: "74000000", libelle: "Aide" } },
    { date: "15/09/2026", label: "DRFIP ANCV", amount: 682.5, matched: true, matchType: "Manuel", compteContrepartie: { id: "autre", compte: "47100000", libelle: "Autre" } },
  ] });
  const bq = r.lignes.map(champs);
  const parNum = (num: number) => resume(bq.filter((c) => c[2] === String(num)));
  assert.deepEqual(parNum(1), ["51200000 D833,48", "74000000 C833,48"]);
  assert.deepEqual(parNum(2), ["51200000 D1920,00", "41100000 C1920,00"]);
  assert.deepEqual(parNum(3), ["51200000 D682,50", "47100000 C682,50"]);
  assert.equal(r.compteAttenteCredits, 682.5);
});

test("avoir d'un fournisseur au relevé : au compte du fournisseur, jamais en recette", () => {
  const r = construireAchatsBanque({ mois: "2026-10", numeroDepart: 1, debits: [], credits: [
    { date: "20/10/2026", label: "Avoir CARTE X4673 Prusa Research 05/10", amount: 57.21, matched: true, matchType: "Manuel", compteContrepartie: { id: "remboursement-fournisseur", compte: "40100000", libelle: "Remboursement" } },
    { date: "21/10/2026", label: "Avoir CARTE X4673 AGRIAL", amount: 10, matched: true, matchType: "Manuel", compteContrepartie: { id: "remboursement-fournisseur", compte: "40100000", libelle: "Remboursement" } },
  ] });
  const bq = r.lignes.map(champs);
  const parNum = (num: number) => resume(bq.filter((c) => c[2] === String(num)));
  assert.deepEqual(parNum(1), ["51200000 D57,21", "40100000/FAVOIRCARTEX4673PR C57,21"]);
  assert.deepEqual(parNum(2), ["51200000 D10,00", "401AGRIAL/401AGRIAL C10,00"]);
  assert.equal(r.compteAttenteCredits, 0);
  assert.ok(r.anomalies.some((a) => a.includes("remboursement fournisseur")));
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
  // Solde de stage débité sur la carte enregistrée (CAWL) : une carte, pas un prélèvement SEPA.
  assert.equal(codeModeRapproche("Prélèvement automatique du solde (CAWL)"), "cb_online");
  assert.equal(codeModeRapproche("Prélèvement SEPA"), "prelevement_sepa");
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
  // OD : la TVA rendue exigible par le règlement (44574000 → 4457x).
  assert.deepEqual([...journaux].sort(), ["BQ", "HA", "OD", "RG", "VE"]);
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

test("règle du cabinet (05/11/2026) : paiement supérieur à la facture = achat au montant de la facture, écart signalé", () => {
  const ab = construireAchatsBanque({ mois: "2026-09", numeroDepart: 1, credits: [],
    debits: [debit({ id: "veto", fournisseur: "FamilyVets VETERINAIRE", poste: "Vétérinaire & santé des chevaux", montant: 150, dateOperation: "2026-09-10",
      piece: { id: "p", extraction: { typeDocument: "achat", devise: "EUR", ttc: 120, tva: 20, date: "2026-09-05", numero: "V-1" } } })] as any });
  const l = ab.lignes.map((x) => x.split("\t"));
  const ha = l.filter((c) => c[0] === "HA"), bq = l.filter((c) => c[0] === "BQ");
  assert.deepEqual(ha.map((c) => [c[4], c[11], c[12]]), [["62250000", "100,00", ""], ["44566000", "20,00", ""], ["401VETERIN", "", "120,00"]]);
  assert.deepEqual(bq.map((c) => [c[4], c[11], c[12]]), [["401VETERIN", "150,00", ""], ["51200000", "", "150,00"]]);
  assert.equal(ha[2][13], "", "pas de lettrage tant que l'écart n'est pas expliqué");
  assert.ok(ab.anomalies.some((a) => /150,00 € payés pour une facture de 120,00 €.*réclamez-la/.test(a)));
});

test("règle du cabinet (05/11/2026) : repas seul sans TVA en 62560000, repas à plusieurs avec TVA en 62570000", () => {
  const piece = { id: "r", extraction: { typeDocument: "achat", devise: "EUR", ttc: 33, tva: 3, date: "2026-09-09" } };
  const seul = construireAchatsBanque({ mois: "2026-09", numeroDepart: 1, credits: [],
    debits: [debit({ id: "r1", fournisseur: "Restaurant la Cale", poste: "Repas, restauration & réceptions", montant: 33, piece })] as any });
  const ha1 = seul.lignes.map((x) => x.split("\t")).filter((c) => c[0] === "HA");
  assert.deepEqual(ha1.map((c) => [c[4], c[11], c[12]]), [["62560000", "33,00", ""], ["401RESTAUR", "", "33,00"]]);
  const plusieurs = construireAchatsBanque({ mois: "2026-09", numeroDepart: 1, credits: [],
    debits: [debit({ id: "r2", fournisseur: "Restaurant la Cale", poste: "Repas à plusieurs (invités, 2 repas et plus)", montant: 33, piece })] as any });
  const ha2 = plusieurs.lignes.map((x) => x.split("\t")).filter((c) => c[0] === "HA");
  assert.deepEqual(ha2.map((c) => [c[4], c[11], c[12]]), [["62570000", "30,00", ""], ["44566000", "3,00", ""], ["401RESTAUR", "", "33,00"]]);
  assert.ok(plusieurs.anomalies.some((a) => /nom des invités/.test(a)));
});
