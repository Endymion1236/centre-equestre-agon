/**
 * Réponse à un devis par email (src/lib/devis-reponse.ts) : qui y a droit,
 * et jusqu'à quand.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { estClientEtablissement, etatReponseDevis, JETON_DEVIS_RE, nouveauJetonDevis, reponseValide } from "../../src/lib/devis-reponse";

test("un établissement se reconnaît à son type de compte ou à son étiquette", () => {
  assert.equal(estClientEtablissement({ accountType: "collectivite" }), true);
  assert.equal(estClientEtablissement({ accountType: "asso" }), true);
  assert.equal(estClientEtablissement({ accountType: "entreprise" }), true);
  assert.equal(estClientEtablissement({ accountType: "particulier", tags: ["etablissement"] }), true);
  assert.equal(estClientEtablissement({ accountType: "particulier" }), false);
  assert.equal(estClientEtablissement({}), false);
  assert.equal(estClientEtablissement(null), false);
});

test("le jeton est long, hexadécimal et différent à chaque fois", () => {
  const a = nouveauJetonDevis(), b = nouveauJetonDevis();
  assert.match(a, JETON_DEVIS_RE);
  assert.equal(a.length, 48);
  assert.notEqual(a, b);
});

test("un devis envoyé reste ouvert jusqu'au dernier jour de validité inclus", () => {
  const devis = { status: "sent", validUntil: "2026-10-30" };
  assert.equal(etatReponseDevis(devis, "2026-10-01"), "ouvert");
  assert.equal(etatReponseDevis(devis, "2026-10-30"), "ouvert", "le dernier jour compte");
  assert.equal(etatReponseDevis(devis, "2026-10-31"), "expire");
  assert.equal(etatReponseDevis({ status: "sent" }, "2026-10-31"), "ouvert", "sans date de fin, pas d'expiration");
});

test("un devis déjà répondu ou converti n'est jamais rouvert", () => {
  assert.equal(etatReponseDevis({ status: "accepted", validUntil: "2026-10-30" }, "2026-10-01"), "deja_repondu");
  assert.equal(etatReponseDevis({ status: "refused" }, "2026-10-01"), "deja_repondu");
  assert.equal(etatReponseDevis({ status: "converted" }, "2026-10-01"), "converti");
  assert.equal(etatReponseDevis(null, "2026-10-01"), "introuvable");
});

test("seules deux réponses sont acceptées", () => {
  assert.equal(reponseValide("accepted"), true);
  assert.equal(reponseValide("refused"), true);
  assert.equal(reponseValide("converted"), false);
  assert.equal(reponseValide(""), false);
});
