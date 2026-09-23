import assert from "node:assert/strict";
import {
  ENTETE_FEC,
  construireFecVentes,
  analyserFecVentes,
  compteTvaCollectee,
} from "../../src/app/admin/comptabilite/fec-utils";

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

console.log("\n── FEC des ventes ──");

const paiements = [
  {
    familyName: "Famille Martin",
    totalTTC: 105.5,
    date: { seconds: Date.UTC(2026, 7, 15, 12) / 1000 },
    items: [
      { activityTitle: "Stage été", priceHT: 100, priceTTC: 105.5, tva: 5.5 },
    ],
  },
  {
    familyName: "Famille Durand",
    totalTTC: 50,
    date: null,
    items: [
      { activityTitle: "Cotisation", priceHT: 50, priceTTC: 50, tva: 0 },
    ],
  },
];

/** Somme des débits et des crédits, par numéro d'écriture. */
function soldes(contenu: string) {
  const parNumero = new Map<string, { debit: number; credit: number }>();
  for (const l of contenu.split("\n").slice(1).filter(Boolean)) {
    const c = l.split("\t");
    const cur = parNumero.get(c[2]) || { debit: 0, credit: 0 };
    cur.debit += Math.round(Number(c[11] || 0) * 100);
    cur.credit += Math.round(Number(c[12] || 0) * 100);
    parNumero.set(c[2], cur);
  }
  return parNumero;
}

test("l'en-tête réglementaire reste la première ligne", () => {
  assert.equal(construireFecVentes([]), ENTETE_FEC + "\n");
});

test("toutes les lignes gardent les 18 colonnes du format", () => {
  const lignes = construireFecVentes(paiements).split("\n");
  for (const l of lignes) assert.equal(l.split("\t").length, 18, l);
});

test("une vente avec TVA produit produit, TVA et créance client", () => {
  const lignes = construireFecVentes([paiements[0]]).split("\n");
  assert.equal(lignes.length, 4);
  assert.match(lignes[1], /^VE\tVentes\t1\t20260815\t70611400/);
  assert.match(lignes[1], /Stage été\t\t100\.00/);
  assert.match(lignes[2], /^VE\tVentes\t1\t20260815\t44571200/);
  assert.match(lignes[2], /TVA 5\.5%\t\t5\.50/);
  assert.match(lignes[3], /^VE\tVentes\t1\t20260815\t41100000/);
  assert.match(lignes[3], /Famille Martin.*105\.50/);
});

test("les trois lignes d'une facture portent le même numéro d'écriture", () => {
  const numeros = construireFecVentes([paiements[0]])
    .split("\n")
    .slice(1)
    .map((l) => l.split("\t")[2]);
  assert.deepEqual(numeros, ["1", "1", "1"]);
});

test("chaque écriture est équilibrée : débit = crédit", () => {
  for (const [numero, s] of soldes(construireFecVentes(paiements))) {
    assert.equal(s.debit, s.credit, `écriture ${numero} déséquilibrée`);
  }
});

test("le numéro d'écriture avance d'une facture à l'autre", () => {
  const numeros = [
    ...new Set(
      construireFecVentes(paiements)
        .split("\n")
        .slice(1)
        .map((l) => l.split("\t")[2]),
    ),
  ];
  assert.deepEqual(numeros, ["1", "2"]);
});

test("une ligne sans TVA ne crée pas d'écriture de TVA", () => {
  const contenu = construireFecVentes([paiements[1]], new Date(2026, 8, 1, 12));
  assert.doesNotMatch(contenu, /\t4457/);
  assert.match(contenu, /20260901/);
});

test("les comptes sont au format 8 chiffres du plan comptable", () => {
  const comptes = new Set(
    construireFecVentes(paiements)
      .split("\n")
      .slice(1)
      .map((l) => l.split("\t")[4]),
  );
  for (const c of comptes) assert.equal(c.length, 8, `compte ${c}`);
});

test("le taux de TVA choisit le bon compte collecté", () => {
  assert.equal(compteTvaCollectee(5.5).compte, "44571200");
  assert.equal(compteTvaCollectee(20).compte, "44571700");
  assert.equal(compteTvaCollectee(10).compte, "44575000");
});

test("la référence de pièce est stable par paiement", () => {
  const lignes = construireFecVentes(paiements, new Date(2026, 8, 1, 12)).split("\n");
  assert.ok(lignes.slice(1, 4).every((l) => l.includes("F2026-001")));
  assert.ok(lignes.slice(4).every((l) => l.includes("F2026-002")));
});

test("le vrai numéro de facture sert de référence de pièce quand il existe", () => {
  const contenu = construireFecVentes([
    { ...paiements[0], invoiceNumber: "FA-2026-0042" },
  ]);
  assert.ok(contenu.includes("FA-2026-0042"));
  assert.ok(!contenu.includes("F2026-001"));
});

test("une facture dont le détail ne retombe pas sur le total reste équilibrée", () => {
  const { contenu, anomalies } = analyserFecVentes([
    {
      familyName: "Famille Remise",
      totalTTC: 90,
      date: { seconds: Date.UTC(2026, 7, 15, 12) / 1000 },
      items: [{ activityTitle: "Stage", priceHT: 100, priceTTC: 105.5, tva: 5.5 }],
    },
  ]);
  for (const [numero, s] of soldes(contenu)) {
    assert.equal(s.debit, s.credit, `écriture ${numero} déséquilibrée`);
  }
  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0].familyName, "Famille Remise");
  assert.equal(anomalies[0].ecart, -15.5);
  assert.ok(contenu.includes("Écart de ventilation"));
});

test("une facture conforme ne remonte aucune anomalie", () => {
  assert.deepEqual(analyserFecVentes(paiements).anomalies, []);
});

test("une vente du 1er septembre à 00h30 reste datée du 1er septembre", () => {
  // 31 août 22h30 UTC = 1er septembre 00h30 à Agon (UTC+2 en été).
  const contenu = construireFecVentes([
    { ...paiements[0], date: { seconds: Date.UTC(2026, 7, 31, 22, 30) / 1000 } },
  ]);
  assert.match(contenu, /\t20260901\t/);
  assert.doesNotMatch(contenu, /\t20260831\t/);
});

console.log(`\n✅ ${passes} tests passés\n`);
