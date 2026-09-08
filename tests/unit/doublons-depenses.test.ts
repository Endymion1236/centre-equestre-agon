import assert from "node:assert/strict";
import { test } from "node:test";
import { doublonPossible, groupesDoublons, memeCommercant, preparerLotDoublons, fournisseurNormalise } from "../../src/lib/doublons-depenses";
import type { DepenseCandidate } from "../../src/lib/justificatifs";
const a = { id: "datee", fournisseur: "Arrosage Distrib Ste", montant: 77.49, mois: "2026-07", dateOperation: "2026-07-09", source: "releve-bancaire" };
const b = { ...a, id: "ancienne", dateOperation: "" };
test("deux imports Mol Fulfiller avec préfixe Carte et astérisque : proposés ensemble", () => {
  const datee = { ...a, fournisseur: "Carte Mol*fulfiller", montant: 118.8, note: "Relevé juillet.pdf" };
  const ancienne = { ...b, fournisseur: "Mol Fulfiller", montant: 118.8, note: "Relevé juillet (2).pdf" };
  assert.ok(doublonPossible(datee, ancienne));
  assert.equal(preparerLotDoublons([datee, ancienne], new Set()).propositions.length, 1);
  assert.equal(preparerLotDoublons([datee, ancienne, { ...ancienne, id: "autre-paiement" }], new Set()).propositions.length, 0);
  assert.equal(doublonPossible(datee, { ...ancienne, fournisseur: "Mol Autre" }), false);
});
test("ancien import sans date + relecture datée : à examiner, pas supprimé", () => {
  assert.ok(doublonPossible(a, b));
  assert.equal(groupesDoublons([a, b]).length, 1);
  assert.equal(groupesDoublons([a, b])[0].length, 2);
});
test("lot : conserver la copie datée, sans toucher aux autres champs", () => {
  const lignes = [{ ...a, note: "Relevé juillet CCOU 001.pdf" }, { ...b, note: "Relevé juillet CCOU 001 (2).pdf" }];
  const original = JSON.stringify(lignes);
  const plan = preparerLotDoublons(lignes, new Set());
  assert.equal(plan.propositions.length, 1);
  assert.equal(plan.propositions[0].conserver.id, a.id);
  assert.equal(plan.propositions[0].ecarter.id, b.id);
  assert.equal(plan.groupesManuels, 0);
  assert.equal(JSON.stringify(lignes), original);
});
test("lot : copies identiques, dates doubles, trois occurrences, autre relevé, liens et perte de compte exclus", () => {
  const x = { ...a, note: "Releve juillet.pdf" }, y = { ...b, note: "Releve juillet (2).pdf" };
  for (const lignes of [[x, { ...y, note: x.note }], [x, { ...y, dateOperation: x.dateOperation }], [x, y, { ...y, id: "troisieme" }],
    [x, { ...y, note: "Autre compte.pdf" }], [x, { ...y, compte: "Compte à préserver" }]]) {
    assert.equal(preparerLotDoublons(lignes, new Set()).propositions.length, 0);
  }
  assert.equal(preparerLotDoublons([x, y], new Set([y.id])).propositions.length, 0);
  assert.equal(preparerLotDoublons([x, y], new Set([x.id])).propositions.length, 1);
});
test("paiements distincts par date, compte, montant, mois ou fournisseur non fusionnés", () => {
  for (const patch of [{ dateOperation: "2026-07-10" }, { montant: 77.50 }, { mois: "2026-08" }, { fournisseur: "Autre" }, { source: "saisie" }]) assert.equal(doublonPossible(a, { ...b, ...patch }), false);
  assert.equal(doublonPossible({ ...a, compte: "courant" }, { ...b, compte: "epargne" }), false);
  assert.equal(doublonPossible(a, a), false);
});
test("aucune identité déduite du seul montant ; accents normalisés", () => {
  assert.equal(doublonPossible({ ...a, fournisseur: "" }, { ...b, fournisseur: "" }), false);
  assert.ok(doublonPossible({ ...a, fournisseur: "Vétérinaire" }, { ...b, fournisseur: "VETERINAIRE" }));
});

test("les préfixes bancaires (Prlv, Vir, Carte…) ne distinguent pas deux fois le même débit", () => {
  const a = { id: "g1", fournisseur: "Groupama Centre Manche", montant: 676.81, source: "releve-bancaire", mois: "2026-07", dateOperation: "2026-07-15" };
  const b = { ...a, id: "g2", fournisseur: "Prlv Groupama Centre Manche" };
  assert.ok(doublonPossible(a, b));
  assert.equal(groupesDoublons([a, b]).length, 1);
  assert.equal(fournisseurNormalise("PRLV SEPA Groupama Centre Manche"), "groupama centre manche");
  assert.equal(fournisseurNormalise("CARTE Point.P"), "point p");
  assert.equal(doublonPossible(a, { ...b, fournisseur: "Prlv Groupama Sud" }), false, "le reste du libellé doit être identique");
});

/**
 * Le même relevé importé deux fois — une fois par CSV, une fois par PDF —
 * arrive avec des libellés tronqués à des longueurs différentes. Le gérant
 * voyait « Anthropic San Franci » et « Anthropic San Francisco » côte à côte
 * dans son tableau ; l'écran de contrôle, qui exigeait une égalité stricte,
 * n'y voyait aucun doublon.
 */
test("un libellé tronqué reste le même commerçant", () => {
  for (const [a, b] of [
    ["Anthropic San Franci", "Anthropic San Francisco"],
    ["Elevenlabs.io", "Elevenlabs.io New Yo"],
    ["Lemonde.fr", "Lemonde.fr Paris"],
    ["Mp Carrefour Blainvi", "Mp Carrefour Blainville"],
    ["Action Coutance", "Action 4307 Coutance"],
    ["Groupama Centre Manche", "Prlv Groupama Centre Manche"],
  ]) assert.ok(memeCommercant(a, b), `${a} / ${b}`);

  // Deux commerçants distincts ne se confondent pas, même au même montant.
  for (const [a, b] of [
    ["Anthropic San Francisco", "Elevenlabs.io"],
    ["Uep u Express Agon", "Uep dac Resterdis"],
    ["Avem", "Agon"],
    ["", "Anthropic"],
  ]) assert.ok(!memeCommercant(a, b), `${a} / ${b}`);
});

test("deux troncatures du même débit forment un groupe de doublons", () => {
  const l = (id: string, fournisseur: string, extra: Partial<DepenseCandidate> = {}): DepenseCandidate => ({
    id, fournisseur, montant: 15.83, mois: "2026-07", source: "releve-bancaire", ...extra,
  } as DepenseCandidate);
  const groupes = groupesDoublons([
    l("a", "Anthropic San Franci"),
    l("b", "Anthropic San Francisco"),
    // Même montant, autre commerçant : ne doit pas être happé par le groupe.
    l("c", "Groupama Centre Manche"),
  ]);
  assert.equal(groupes.length, 1);
  assert.deepEqual(groupes[0].map(d => d.id).sort(), ["a", "b"]);
});
