import assert from "node:assert/strict";
import {
  analyserPeriodeCsv,
  cleLigneBancaire,
  encaissementEnDetail,
  estDansFenetreBancaire,
  parserCsvBancaire,
  parserDateBancaire,
  parserDetailCa,
  periodePrecedente,
  trouverSousEnsembleMontant,
} from "../../src/app/admin/comptabilite/rapprochement-utils";

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

console.log("\n── Période du relevé ──");

test("une période normale ne déclenche aucune alerte", () => {
  const resultat = analyserPeriodeCsv(
    "Liste des operations du compte entre le 01/08/2026 et le 31/08/2026",
    new Date("2026-09-01T12:00:00"),
  );
  assert.equal(resultat?.nbJours, 31);
  assert.deepEqual(resultat?.alertes, []);
});

test("une période courte, ancienne ou inversée est signalée", () => {
  const courte = analyserPeriodeCsv(
    "entre le 01/06/2026 et le 02/06/2026",
    new Date("2026-09-01T12:00:00"),
  );
  assert.ok(courte?.alertes.some((alerte) => alerte.includes("tres courte")));
  assert.ok(courte?.alertes.some((alerte) => alerte.includes("Derniere operation")));

  const inversee = analyserPeriodeCsv(
    "entre le 03/08/2026 et le 01/08/2026",
    new Date("2026-08-04T12:00:00"),
  );
  assert.ok(inversee?.alertes.some((alerte) => alerte.includes("invalide")));
});

console.log("\n── CSV bancaire ──");

test("un export Crédit Agricole garde les crédits et ignore les débits", () => {
  const csv = [
    "Liste des operations du compte",
    "Date;Libellé;Débit euros;Crédit euros",
    '01/08/2026;"REMISE CARTE\nTPE AGON";;1 234,56',
    '02/08/2026;"FRAIS BANCAIRES";12,50;',
  ].join("\n");

  assert.deepEqual(parserCsvBancaire(csv), [{
    date: "01/08/2026",
    label: "REMISE CARTE TPE AGON",
    amount: 1234.56,
    matched: false,
    matchType: "",
    matchDetail: "",
  }]);
});

test("le format simple accepte montant positif et dernière ligne sans saut final", () => {
  const csv = [
    "Date;Label;Montant",
    "2026-08-03;Virement famille;57,00",
    "04-08-2026;Débit test;-20,00",
  ].join("\n");
  const lignes = parserCsvBancaire(csv);
  assert.equal(lignes.length, 1);
  assert.equal(lignes[0].amount, 57);
});

console.log("\n── Dates et conservation des pointages ──");

test("les trois formats de date bancaire sont acceptés", () => {
  assert.equal(parserDateBancaire("3/8/2026")?.toISOString().slice(0, 10), "2026-08-03");
  assert.equal(parserDateBancaire("2026-08-03")?.toISOString().slice(0, 10), "2026-08-03");
  assert.equal(parserDateBancaire("03-08-2026")?.toISOString().slice(0, 10), "2026-08-03");
  assert.equal(parserDateBancaire("03.08.2026"), null);
});

test("la clé bancaire stabilise le montant aux centimes", () => {
  assert.equal(
    cleLigneBancaire({ date: "01/08/2026", label: "REMISE", amount: 57 }),
    "01/08/2026|REMISE|57.00",
  );
});

console.log("\n── Détail des remises CB ──");

test("les heures ancrent les montants sans avaler les secondes", () => {
  assert.deepEqual(
    parserDetailCa("13:59:09 175,00 EUR\n10:00145,50 EUR"),
    [175, 145.5],
  );
});

test("le fallback ignore le total récapitulatif", () => {
  assert.deepEqual(
    parserDetailCa("Transaction 95,00 EUR\nTOTAL 190,00 EUR\nTransaction 1 250,25 €"),
    [95, 1250.25],
  );
});

console.log("\n── Helpers de rapprochement ──");

test("janvier remonte correctement à décembre de l'année précédente", () => {
  assert.equal(periodePrecedente("2026-01"), "2025-12");
  assert.equal(periodePrecedente("2026-08"), "2026-07");
});

test("la fenêtre bancaire accepte les trois jours de bord et refuse le quatrième", () => {
  const banque = new Date("2026-08-10T12:00:00Z");
  const encaissement = (jour: number) => ({ date: { seconds: Date.UTC(2026, 7, jour, 12) / 1000 } });
  assert.equal(estDansFenetreBancaire(encaissement(7), banque), true);
  assert.equal(estDansFenetreBancaire(encaissement(6), banque), false);
  assert.equal(estDansFenetreBancaire({}, banque), false);
  assert.equal(estDansFenetreBancaire({}, null), true);
});

test("le détail d'encaissement normalise les champs affichés", () => {
  assert.deepEqual(
    encaissementEnDetail({
      familyName: "Martin",
      montant: 57,
      date: { seconds: Date.UTC(2026, 7, 3, 12) / 1000 },
      activityTitle: "Balade",
      mode: "cheque",
    }),
    {
      familyName: "Martin",
      montant: 57,
      date: "03/08/2026",
      activityTitle: "Balade",
      mode: "cheque",
    },
  );
});

test("la recherche de sous-ensemble retrouve une combinaison exacte", () => {
  const encaissements = [
    { id: "a", montant: 57 },
    { id: "b", montant: 35 },
    { id: "c", montant: 20 },
  ];
  assert.deepEqual(
    trouverSousEnsembleMontant(encaissements, 5500)?.map((ligne) => ligne.id),
    ["b", "c"],
  );
});

test("la recherche tolère deux centimes mais refuse les cibles impossibles", () => {
  assert.equal(trouverSousEnsembleMontant([{ montant: 10 }], 1002)?.length, 1);
  assert.equal(trouverSousEnsembleMontant([{ montant: 10 }], 1003), null);
  assert.equal(trouverSousEnsembleMontant([{ montant: 10 }], 0), null);
});

test("les lots supérieurs à vingt-cinq lignes ne lancent pas la recherche", () => {
  const lot = Array.from({ length: 26 }, () => ({ montant: 1 }));
  assert.equal(trouverSousEnsembleMontant(lot, 100), null);
});

console.log(`\n✅ ${passes} tests passés\n`);
