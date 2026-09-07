import assert from "node:assert/strict";
import { test } from "node:test";
import { bilanTvaMois, construireExportTva, motifControleTva, type LigneMois } from "../../src/lib/bilan-justificatifs";

const facture = { id: "facture-360", extraction: { typeDocument: "achat", devise: "EUR", ht: 300, tva: 60, ttc: 360, numero: "F360" } };
const unique: LigneMois = { id: "unique", mois: "2026-08", dateOperation: "2026-08-01", montant: 360, suivie: true, piece: facture };
const echeances: LigneMois[] = Array.from({ length: 4 }, (_, i) => ({ ...unique, id: `e${i}`, montant: 90, piece: { ...facture, modeRattachement: "echeance", paiementsAssocies: Array.from({ length: 4 }, (_, j) => ({ id: `e${j}`, montant: 90 })) } }));

test("une facture payée en une fois conserve ses 60 euros de TVA documentée", () => {
  assert.equal(bilanTvaMois([unique]).deductibleJustifiee, 60);
  assert.equal(bilanTvaMois([unique]).nbJustifiees, 1);
});

test("quatre échéances ne produisent plus 240 euros : elles sont à contrôler, la TVA facturée reste visible", () => {
  const bilan = bilanTvaMois(echeances);
  assert.equal(bilan.deductibleJustifiee, 0);
  assert.deepEqual(bilan.aVerifier, { nb: 4, ttc: 360 });
  const csv = construireExportTva(echeances);
  const rows = csv.trimEnd().split("\n");
  assert.match(rows[0], /TVA totale facture \(non cumulable\)/);
  for (const row of rows.slice(1, -1)) {
    const cells = row.split(";");
    assert.equal(cells[6], "60.00");
    assert.equal(cells[7], "");
    assert.match(cells[11], /Paiement fractionné/);
  }
  assert.equal(rows.at(-1)!.split(";")[7], "0.00");
});

test("deux mois distincts et une seule échéance restante ne redéduisent pas la facture entière", () => {
  for (const lot of [echeances.slice(0, 2), echeances.slice(2), [echeances[0]]]) {
    assert.equal(bilanTvaMois(lot).deductibleJustifiee, 0);
    assert.equal(bilanTvaMois(lot).aVerifier.nb, lot.length);
  }
});

test("les anciens liens partagés et paiements partiels sans métadonnées restent à vérifier", () => {
  assert.equal(bilanTvaMois([unique, { ...unique, id: "copie" }]).deductibleJustifiee, 0);
  assert.equal(bilanTvaMois([{ ...unique, montant: 90 }]).aVerifier.nb, 1);
});

test("les décisions sans TVA et non récupérée priment sur les échéances", () => {
  for (const statutTVA of ["sans-tva", "non-recuperee"]) {
    const l = { ...echeances[0], statutTVA };
    const b = bilanTvaMois([l]);
    assert.equal(b.deductibleJustifiee, 0);
    assert.equal(b.aVerifier.nb, 0);
    assert.equal(motifControleTva(l), null);
    assert.equal((statutTVA === "sans-tva" ? b.sansTva : b.nonRecuperee).nb, 1);
  }
});

test("exclusions, personnel, avance FFE, devise et escompte ne créent pas de TVA automatique", () => {
  const lot: LigneMois[] = [
    { ...unique, rapprochementExclu: true }, { ...unique, depensePersonnelle: true }, { ...unique, suivie: false },
    { ...unique, avanceFfe: true },
    { ...unique, piece: { ...facture, extraction: { ...facture.extraction, devise: "USD" } } },
    { ...unique, piece: { ...facture, associationEcart: { type: "escompte", taux: 2, montant: 7.2 } } },
  ];
  for (const l of lot) assert.equal(bilanTvaMois([l]).deductibleJustifiee, 0);
  assert.deepEqual(bilanTvaMois(echeances), bilanTvaMois([...echeances].reverse()));
});
