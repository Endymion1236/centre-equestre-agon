/**
 * Contrôle de banque : relevé du mois face au compte 512 du FEC.
 */
import assert from "node:assert/strict";
import { avertissementsControle, comparerBanque, lignesBanqueDuFec, texteControleBanque } from "../../src/lib/controle-banque";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e) { console.error(`  ❌ ${nom}`); console.error(e); process.exitCode = 1; }
}

const ENTETE = "JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise";
const l = (j: string, n: number, date: string, compte: string, lib: string, d: string, c: string) => [j, j, String(n), date, compte, "x", "", "", "P", date, lib, d, c, "", "", date, "", ""].join("\t");
const r = (id: string, date: string, libelle: string, montant: number) => ({ id, date, libelle, montant });

test("le FEC : seules les lignes 512, au signe de la banque", () => {
  const fec = [ENTETE,
    l("RG", 1, "20261012", "51200000", "Virement BARBEY", "80,00", ""),
    l("RG", 1, "20261012", "41100000", "Virement BARBEY", "", "80,00"),
    l("BQ", 2, "20261030", "51200000", "Decathlon", "", "64,96"),
  ].join("\n");
  const b = lignesBanqueDuFec(fec);
  assert.deepEqual(b.map((x) => [x.journal, x.date, x.montant]), [["RG", "2026-10-12", 80], ["BQ", "2026-10-30", -64.96]]);
});

test("tout concorde : écart nul, rien à signaler", () => {
  const fec = lignesBanqueDuFec([ENTETE, l("RG", 1, "20261012", "51200000", "Vir", "80,00", ""), l("BQ", 2, "20261030", "51200000", "Decathlon", "", "64,96")].join("\n"));
  const c = comparerBanque([r("a", "2026-10-13", "VIR BARBEY", 80), r("b", "2026-10-30", "Decathlon", -64.96)], fec);
  assert.deepEqual([c.ecart, c.apparies, c.releveSeul.length, c.fecSeul.length], [0, 2, 0, 0]);
});

test("GAGNARD : un virement au relevé, trois au FEC → 139,80 € de trop, les deux en trop listés", () => {
  const fec = lignesBanqueDuFec([ENTETE, ...[1, 2, 3].map((n) => l("RG", n, "20260930", "51200000", `Virement GAGNARD ${n}`, "69,90", ""))].join("\n"));
  const c = comparerBanque([r("v", "2026-09-30", "TUDAL GAGNARD", 69.9)], fec);
  assert.equal(c.ecart, 139.8);
  assert.equal(c.fecSeul.length, 2);
});

test("un virement de 209,70 € pour trois échéances : rapproché d'un bloc", () => {
  const fec = lignesBanqueDuFec([ENTETE, ...[1, 2, 3].map((n) => l("RG", n, "20261002", "51200000", "Vir", "69,90", ""))].join("\n"));
  const c = comparerBanque([r("v", "2026-10-03", "VIR", 209.7)], fec);
  assert.deepEqual([c.ecart, c.apparies, c.fecSeul.length], [0, 1, 0]);
});

test("SAMSON avant correction : prélèvement rejeté sorti deux fois → FEC 55 € plus bas", () => {
  const fec = lignesBanqueDuFec([ENTETE,
    l("RG", 1, "20261101", "51200000", "Contre-passation — Règlement SAMSON", "", "55,00"),
    l("BQ", 2, "20261030", "51200000", "Impayé Prel Mr Samson", "", "55,00"),
  ].join("\n"));
  const c = comparerBanque([r("i", "2026-10-30", "Impayé Prel Mr Samson Mickael", -55)], fec);
  assert.equal(c.ecart, -55);
  assert.equal(c.fecSeul.length, 1);
});

test("même montant à 20 jours d'écart : décalage de date, pas une erreur", () => {
  const fec = lignesBanqueDuFec([ENTETE, l("RG", 1, "20261002", "51200000", "Versement espèces", "300,00", "")].join("\n"));
  const c = comparerBanque([r("e", "2026-10-22", "VERSEMENT ESPECES", 300)], fec);
  assert.equal(c.decales.length, 1);
  assert.equal(c.decales[0].jours, 20);
  assert.equal(c.releveSeul.length + c.fecSeul.length, 0);
  assert.match(texteControleBanque("2026-10", c), /dates différentes/);
});

test("octobre 2026 : remise SEPA incomplète, remise carte d'un autre montant, correction DUHEM qui s'annule", () => {
  const fec = lignesBanqueDuFec([ENTETE,
    ...[1, 2, 3, 4, 5].map((n) => l("RG", n, "20261027", "51200000", `Prélèvement SEPA ${n}`, "69,90", "")),
    l("BQ", 10, "20261013", "51200000", "Remise carte CARTE 8067954 001 195811 13/10", "1081,20", ""),
    l("RG", 11, "20261005", "51200000", "Contre-passation DUHEM", "", "650,00"),
    l("RG", 12, "20261005", "51200000", "Règlement DUHEM", "650,00", ""),
  ].join("\n"));
  const c = comparerBanque([
    r("sepa", "2026-10-28", "Avis de prélèvement emis PREL ECH DU. 28/10/26", 419.4),
    r("cb", "2026-10-13", "Remise carte CARTE 8067954 001 195811 13/10", 1231.2),
  ], fec);
  assert.equal(c.remisesIncompletes.length, 1);
  assert.deepEqual([c.remisesIncompletes[0].nb, c.remisesIncompletes[0].total, c.remisesIncompletes[0].ecart], [5, 349.5, -69.9]);
  assert.deepEqual(c.montantsDifferents.map((x) => x.ecart), [-150]);
  assert.equal(c.annulations.length, 1);
  assert.deepEqual([c.releveSeul.length, c.fecSeul.length], [0, 0], "tout est expliqué");
  assert.equal(c.ecart, -219.9, "l'écart total reste le même : 69,90 + 150");
});

test("août 2026 : pas de crédits au rapprochement, mois Céleris — dit avant les chiffres, et dans le texte copié", () => {
  const a = avertissementsControle({ debits: 88, credits: 0, tableauIncomplet: false, moisCeleris: true });
  assert.equal(a.length, 2);
  assert.match(a[0], /ne voit que les débits/);
  const c = comparerBanque([], []);
  assert.match(texteControleBanque("2026-08", c, a), /À savoir avant de lire/);
  assert.deepEqual(avertissementsControle({ debits: 10, credits: 10, tableauIncomplet: false, moisCeleris: false }), []);
});

if (process.exitCode) { console.error("❌ échec"); } else console.log(`✅ ${passes} tests passés`);

test("un doublon probable du relevé ne prend pas la ligne du FEC d'un autre débit", () => {
  const releve = [
    { id: "d1", date: "2026-09-22", libelle: "Commission vente à distance", montant: -0.2, horsFec: true, note: "doublon probable" },
    { id: "d2", date: "2026-09-25", libelle: "Commission vente à distance", montant: -0.2 },
  ];
  const fec = [{ journal: "BQ", numero: "10", date: "2026-09-25", libelle: "Commission", piece: "x", montant: -0.2 }];
  const c = comparerBanque(releve, fec);
  assert.equal(c.apparies, 1);
  assert.deepEqual(c.releveSeul.map((r) => r.id), ["d1"]);
  assert.equal(c.fecSeul.length, 0);
});

test("débits des comptes FFE : signalés, hors du contrôle du 512", () => {
  const a = avertissementsControle({ debits: 3, credits: 2, tableauIncomplet: false, moisCeleris: false, autresComptes: 2 });
  assert.ok(a.some((x) => x.includes("2 débit(s)") && x.includes("FFE")));
});
