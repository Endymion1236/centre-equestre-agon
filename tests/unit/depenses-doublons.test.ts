import assert from "node:assert/strict";
import {
  empreinteDepense,
  filtrerNouvellesLignes,
  normaliserLibelle,
  totalEnTrop,
  trouverDoublons,
  type Depense,
} from "../../src/app/admin/comptabilite/depenses/depenses-utils";

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

console.log("── Empreinte d'une dépense ──");

test("le libellé est normalisé : accents, casse, ponctuation, espaces", () => {
  assert.equal(normaliserLibelle("  PRLV SEPA  EDF - Électricité  "), "prlv sepa edf electricite");
  assert.equal(normaliserLibelle(null), "");
});

test("même mois, même libellé, même montant → même empreinte, quel que soit le poste", () => {
  const a = empreinteDepense({ mois: "2026-07", fournisseur: "EDF", montant: 120 });
  const b = empreinteDepense({ mois: "2026-07", fournisseur: "edf ", montant: "120,00" });
  assert.equal(a, b);
  assert.equal(a, "2026-07|edf|120.00");
});

test("un autre mois ou un autre montant → empreinte différente", () => {
  const base = empreinteDepense({ mois: "2026-07", fournisseur: "EDF", montant: 120 });
  assert.notEqual(base, empreinteDepense({ mois: "2026-08", fournisseur: "EDF", montant: 120 }));
  assert.notEqual(base, empreinteDepense({ mois: "2026-07", fournisseur: "EDF", montant: 120.5 }));
});

console.log("\n── Garde-fou d'import (ajouter-lot) ──");

const enBase = [
  { mois: "2026-07", fournisseur: "Total Energies", montant: 50 },
  { mois: "2026-07", fournisseur: "EDF", montant: 120 },
];

test("le même relevé importé une seconde fois n'ajoute rien", () => {
  const lot = [
    { mois: "2026-07", poste: "Carburants", fournisseur: "TOTAL ENERGIES", montant: 50 },
    { mois: "2026-07", poste: "Eau & électricité", fournisseur: "EDF", montant: 120 },
  ];
  const r = filtrerNouvellesLignes(enBase, lot);
  assert.equal(r.aAjouter.length, 0);
  assert.equal(r.doublons.length, 2);
});

test("une ligne nouvelle passe, une ligne déjà là est ignorée", () => {
  const lot = [
    { mois: "2026-07", poste: "Carburants", fournisseur: "Total Energies", montant: 50 },
    { mois: "2026-07", poste: "Vétérinaire", fournisseur: "Clinique du Bocage", montant: 210 },
  ];
  const r = filtrerNouvellesLignes(enBase, lot);
  assert.deepEqual(r.aAjouter.map((l) => l.fournisseur), ["Clinique du Bocage"]);
  assert.deepEqual(r.doublons.map((l) => l.fournisseur), ["Total Energies"]);
});

test("deux pleins identiques le même mois : la base en a un, le lot en porte deux → un seul ajouté", () => {
  const lot = [
    { mois: "2026-07", poste: "Carburants", fournisseur: "Total Energies", montant: 50 },
    { mois: "2026-07", poste: "Carburants", fournisseur: "Total Energies", montant: 50 },
  ];
  const r = filtrerNouvellesLignes(enBase, lot);
  assert.equal(r.aAjouter.length, 1);
  assert.equal(r.doublons.length, 1);
});

test("un poste différent ne fait pas une dépense différente", () => {
  const lot = [{ mois: "2026-07", poste: "Autre poste", fournisseur: "EDF", montant: 120 }];
  assert.equal(filtrerNouvellesLignes(enBase, lot).aAjouter.length, 0);
});

test("base vide : tout le lot passe", () => {
  const lot = [{ mois: "2026-08", poste: "Assurances", fournisseur: "Groupama", montant: 300 }];
  assert.equal(filtrerNouvellesLignes([], lot).aAjouter.length, 1);
});

console.log("\n── Doublons déjà en base (nettoyage) ──");

const d = (id: string, mois: string, poste: string, fournisseur: string, montant: number): Depense =>
  ({ id, mois, poste, fournisseur, montant, note: "" });

const depenses: Depense[] = [
  d("a1", "2026-07", "Carburants", "Total Energies", 50),
  d("a2", "2026-07", "Carburants", "TOTAL ENERGIES", 50),
  d("a3", "2026-07", "Carburants", "Total Energies", 50),
  d("b1", "2026-07", "Eau & électricité", "EDF", 120),
  d("b2", "2026-07", "Entretien", "EDF", 120), // recatégorisé au second import
  d("c1", "2026-08", "Assurances", "Groupama", 300),
  d("z1", "2026-07", "Fournitures", "", 12),
  d("z2", "2026-07", "Fournitures", "", 12),
  d("n1", "2026-07", "Fournitures", "Sans montant", 0),
  d("n2", "2026-07", "Fournitures", "Sans montant", 0),
];

test("regroupe les lignes répétées, une par empreinte, et compte celles en trop", () => {
  const groupes = trouverDoublons(depenses);
  assert.equal(groupes.length, 2);
  const total = groupes.find((g) => g.fournisseur === "Total Energies")!;
  assert.equal(total.lignes.length, 3);
  assert.deepEqual(total.enTrop.map((l) => l.id), ["a2", "a3"]);
  const edf = groupes.find((g) => g.fournisseur === "EDF")!;
  assert.deepEqual(edf.enTrop.map((l) => l.id), ["b2"]);
  assert.deepEqual(edf.postes, ["Eau & électricité", "Entretien"]);
});

test("lignes sans fournisseur ou à zéro : jamais proposées au retrait", () => {
  const ids = trouverDoublons(depenses).flatMap((g) => g.lignes.map((l) => l.id));
  assert.ok(!ids.includes("z1") && !ids.includes("n1"));
});

test("le montant compté en trop additionne les lignes à retirer", () => {
  assert.equal(totalEnTrop(trouverDoublons(depenses)), 50 + 50 + 120);
});

test("aucun doublon → liste vide", () => {
  assert.deepEqual(trouverDoublons([depenses[0], depenses[3], depenses[5]]), []);
});

console.log(`\n✅ ${passes} tests passés\n`);
