import assert from "node:assert/strict";
import { test } from "node:test";
import { justifierParMasseSalariale, justifierCommissionsBancaires, moisMoins, type LigneMasseSalariale } from "../../src/lib/justification-paie";
import { posteCommissionCarte } from "../../src/lib/postes-depenses";
import type { LigneMois } from "../../src/lib/bilan-justificatifs";

const masse: LigneMasseSalariale[] = [
  { type: "salaire", mois: "2026-08", salarie: "LAGY Emmeline", net: 2302.57 },
  { type: "salaire", mois: "2026-08", salarie: "VASSET Alice", net: 803.93 },
  { type: "salaire", mois: "2026-08", salarie: "PLANCHE Aubance", net: 803.93 },
  { type: "salaire", mois: "2026-07", salarie: "DOUILLARD Lilou", net: 798.59 },
  { type: "charge", mois: "2026-07", libelle: "MSA cotisations", decaissement: 2762.59, montant: 2500 },
  { type: "charge", mois: "2026-07", libelle: "Mutuelle", decaissement: 240 },
];
const ligne = (id: string, fournisseur: string, montant: number, mois = "2026-08", extra: Partial<LigneMois> = {}): LigneMois => ({ id, fournisseur, montant, mois, source: "releve-bancaire", suivie: false, ...extra });

test("le net d'une salariée nommée dans le libellé, même le mois suivant", () => {
  const r = justifierParMasseSalariale([ligne("a", "VIR LAGY EMMELINE", 2302.57, "2026-09")], masse);
  assert.equal(r.get("a")?.detail, "Net à payer de LAGY Emmeline, août 2026");
});
test("deux salariées au même net : le nom tranche, sinon rien", () => {
  assert.equal(justifierParMasseSalariale([ligne("b", "VIR PLANCHE", 803.93)], masse).get("b")?.detail, "Net à payer de PLANCHE Aubance, août 2026");
  assert.equal(justifierParMasseSalariale([ligne("c", "VIR SALAIRE", 803.93)], masse).has("c"), false, "ambigu : on ne devine pas");
});
test("un seul net au montant et un libellé de virement suffisent ; un libellé de fournisseur ne suffit pas", () => {
  assert.equal(justifierParMasseSalariale([ligne("d", "VIR SEPA", 798.59)], masse).get("d")?.detail, "Net à payer de DOUILLARD Lilou, juillet 2026");
  assert.equal(justifierParMasseSalariale([ligne("e", "POINT.P", 798.59)], masse).has("e"), false);
});
test("tous les salaires du mois en un virement", () => {
  const r = justifierParMasseSalariale([ligne("f", "VIR SALAIRES", 3910.43)], masse);
  assert.equal(r.get("f")?.detail, "Salaires nets de août 2026 (3 bulletins)");
});
test("cotisations : le décaissement MSA de juillet prélevé en août, ou le total du mois", () => {
  assert.equal(justifierParMasseSalariale([ligne("g", "PRLV MSA COTES NORMANDES", 2762.59)], masse).get("g")?.detail, "MSA cotisations, juillet 2026");
  assert.equal(justifierParMasseSalariale([ligne("h", "PRLV MSA", 3002.59)], masse).get("h")?.detail, "Cotisations de juillet 2026 (2 organismes)");
  assert.equal(justifierParMasseSalariale([ligne("i", "ORANGE", 2762.59)], masse).has("i"), false, "sans libellé de cotisation, on ne devine pas");
});
test("une ligne déjà justifiée, exclue ou personnelle n'est pas touchée", () => {
  assert.equal(justifierParMasseSalariale([ligne("j", "VIR LAGY", 2302.57, "2026-08", { justificatifReleve: true })], masse).has("j"), false);
  assert.equal(justifierParMasseSalariale([ligne("k", "VIR LAGY", 2302.57, "2026-08", { rapprochementExclu: true })], masse).has("k"), false);
});
test("moisMoins passe l'année", () => { assert.equal(moisMoins("2026-01", 1), "2025-12"); assert.equal(moisMoins("2026-03", 3), "2025-12"); });

test("commissions et frais bancaires : le relevé fait foi d'office ; pas pour un fournisseur, ni si une pièce existe déjà", () => {
  const FRAIS = "Frais bancaires & commissions (CB, Stripe)";
  const r = justifierCommissionsBancaires([
    ligne("c1", "Com Carte", 2.31, "2026-07", { compte: "CA courant" }),
    ligne("c2", "Commission vente distance", 12.5, "2026-07"),
    ligne("c3", "COTISATION CARTE PRO", 45, "2026-07", { poste: FRAIS }),
    ligne("c4", "ORANGE", 66, "2026-07"),
    ligne("c5", "Com Carte", 2.31, "2026-07", { piece: { id: "p", nom: "x.pdf" } }),
    ligne("c6", "Com Carte", 2.31, "2026-07", { rapprochementExclu: true }),
  ], posteCommissionCarte, FRAIS);
  assert.equal(r.get("c1")?.type, "releve-bancaire"); assert.match(r.get("c1")!.detail, /compte CA courant/);
  assert.ok(r.has("c2")); assert.ok(r.has("c3"));
  assert.equal(r.has("c4"), false); assert.equal(r.has("c5"), false); assert.equal(r.has("c6"), false);
});
