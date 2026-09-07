import { test } from "node:test";
import assert from "node:assert/strict";
import { preparerJournalAchats } from "../../src/lib/journal-achats-preparatoire";
import { construireDocuments } from "../../src/lib/documents-comptables";
import type { LigneMois } from "../../src/lib/bilan-justificatifs";

const periode = { debut: "2026-07-01", fin: "2027-06-30" };
const depense = (props: Partial<LigneMois> = {}): LigneMois => ({ id: "depense_fictive_1", mois: "2026-07", dateOperation: "2026-07-15", montant: 120, fournisseur: "Fournisseur fictif", poste: "Aliments, litières, paille", source: "releve-bancaire", compte: "51200000", suivie: true, ...props });
const piece = { id: "facture_fictive", extraction: { typeDocument: "achat", devise: "EUR", date: "2026-07-10", numero: "TEST-123", ht: 100, tva: 20, ttc: 120 } };
test("une dépense produit achat et règlement équilibrés, une charge une seule fois", () => {
  const d = depense(), avant = structuredClone(d), r = preparerJournalAchats([d], periode);
  assert.equal(r.inclus, 1); assert.equal(r.bloques, 0); assert.equal(r.ecritures.length, 4);
  const etats = construireDocuments([{ nom: "Achats fictifs", lignes: r.ecritures }], periode);
  assert.equal(etats.charges, 12000); assert.equal(etats.balance.find(c => c.compte === "40100000")?.solde, 0);
  assert.equal(etats.balance.find(c => c.compte === "51200000")?.solde, -12000);
  assert.equal(etats.balance.filter(c => /^4456/.test(c.compte)).length, 0); assert.deepEqual(d, avant);
});
test("TVA documentée jamais déduite automatiquement, montant explicite contrôlé", () => {
  const d = depense({ piece });
  assert.equal(preparerJournalAchats([d], periode).tva, 0);
  const r = preparerJournalAchats([d], periode, { [d.id]: { tva: "20,00" } });
  assert.equal(r.tva, 2000); assert.equal(r.ecritures.find(l => l.compte === "60141000")?.debit, 10000);
  assert.equal(r.ecritures.find(l => l.compte === "44566000")?.debit, 2000);
  assert.equal(r.ecritures.find(l => l.journal === "ACHAPP")?.date, "2026-07-10");
  assert.equal(r.ecritures.find(l => l.journal === "BQAPP")?.date, "2026-07-15");
  for (const mauvais of [depense(), depense({ piece, statutTVA: "non-recuperee" }), depense({ piece: { ...piece, extraction: { ...piece.extraction, ht: 99 } } })]) {
    const rejet = preparerJournalAchats([mauvais], periode, { [mauvais.id]: { tva: "20" } }); assert.equal(rejet.inclus, 0); assert.equal(rejet.bloques, 1);
  }
  assert.equal(preparerJournalAchats([d], periode, { [d.id]: { tva: "20,01" } }).bloques, 1);
});
test("date et banque absentes : aucun montant n'est ajouté, corrections limitées au brouillon", () => {
  const d = depense({ dateOperation: "", compte: "" });
  const vide = preparerJournalAchats([d], periode); assert.equal(vide.bloques, 1); assert.equal(vide.ecritures.length, 0);
  assert.equal(preparerJournalAchats([d], periode, { [d.id]: { date: "2026-07-20", banque: "51200000" } }).inclus, 1);
  assert.equal(d.dateOperation, ""); assert.equal(d.compte, "");
  assert.equal(preparerJournalAchats([d], periode, { [d.id]: { date: "2026-08-20", banque: "51200000" } }).bloques, 1);
});
test("immobilisation reste à l'actif et frais CB débitent directement la banque", () => {
  const i = depense({ immobilisation: true, poste: "Immobilisation — à amortir", fournisseur: "Cheval de sport fictif" });
  const r = preparerJournalAchats([i], periode); assert.equal(r.ecritures[0].compte, "24313000");
  assert.equal(preparerJournalAchats([i], periode, { [i.id]: { compte: "60660000" } }).bloques, 1);
  const c = preparerJournalAchats([depense({ poste: "Frais bancaires & commissions (CB, Stripe)", fournisseur: "Com Carte" })], periode);
  assert.equal(c.ecritures.length, 2); assert.equal(c.ecritures[0].compte, "62710000"); assert.equal(c.ecritures[1].compte, "51200000");
});
test("dépenses personnelles, avances, emprunts et paie ne deviennent pas des achats", () => {
  for (const props of [{ depensePersonnelle: true }, { avanceFfe: true }, { rapprochementExclu: true }, { suivie: false }, { poste: "Emprunts" }, { poste: "Salaires" }]) {
    const r = preparerJournalAchats([depense(props)], periode); assert.equal(r.inclus, 0); assert.equal(r.exclus, 1); assert.equal(r.bloques, 0);
  }
});
test("exclusion explicite motivée, jamais une omission silencieuse", () => {
  const d = depense({ doublonProbable: true });
  assert.equal(preparerJournalAchats([d], periode).bloques, 1);
  assert.equal(preparerJournalAchats([d], periode, { [d.id]: { exclure: true } }).bloques, 1);
  const r = preparerJournalAchats([d], periode, { [d.id]: { exclure: true, motif: "Déjà repris dans le journal du cabinet" } });
  assert.equal(r.exclus, 1); assert.ok(r.controles[0].motifs[0].includes("cabinet"));
});
test("facture partagée, échéance, facture d'un autre exercice : pas de double charge", () => {
  for (const p of [{ ...piece, modeRattachement: "echeance" }, { ...piece, extraction: { ...piece.extraction, date: "2026-06-30" } }, { ...piece, associationEcart: { type: "escompte", taux: 2, montant: 2 } }])
    assert.equal(preparerJournalAchats([depense({ piece: p })], periode).bloques, 1);
  const shared = preparerJournalAchats([depense({ piece }), depense({ id: "autre", piece })], periode);
  assert.equal(shared.bloques, 2); assert.equal(shared.ecritures.length, 0);
});
test("journal déjà complet ou règlement de même date/montant : protection du cumul des sources", () => {
  const base = { date: "2026-07-15", journal: "BN", piece: "TEST", libelle: "Test", libelleCompte: "Test", debit: 0, credit: 12000 };
  assert.throws(() => preparerJournalAchats([depense()], periode, {}, [{ ...base, compte: "60141000" }]), /déjà/);
  assert.equal(preparerJournalAchats([depense()], periode, {}, [{ ...base, compte: "51210000" }]).bloques, 1);
  assert.throws(() => preparerJournalAchats([depense(), depense()], periode), /deux fois/);
  assert.throws(() => preparerJournalAchats([depense()], periode, { absente: { banque: "51200000" } }), /absente/);
});
