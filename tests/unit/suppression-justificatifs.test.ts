/**
 * Une suppression irréversible se distingue d'un clic malheureux par ce
 * qu'elle exige avant d'agir : un mot écrit à la main, et un aperçu qui
 * correspond encore à la base.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { apercuTouJours, verifierDemandeSuppression, MOT_DE_CONFIRMATION } from "../../src/lib/suppression-justificatifs";

test("rien ne part sans le mot de confirmation, écrit en toutes lettres", () => {
  for (const confirme of [undefined, null, "", "oui", "supprime", true, 1, "SUPPRIMER TOUT"]) {
    const v = verifierDemandeSuppression({ confirme });
    assert.equal(v.ok, false, JSON.stringify(confirme));
    if (!v.ok) assert.match(v.erreur, /SUPPRIMER/);
  }
  // La casse et les espaces autour ne doivent pas piéger le gérant.
  for (const confirme of ["SUPPRIMER", "supprimer", " Supprimer "]) {
    assert.equal(verifierDemandeSuppression({ confirme }).ok, true, confirme);
  }
  assert.equal(MOT_DE_CONFIRMATION, "SUPPRIMER");
});

test("le compte de l'aperçu est facultatif, mais jamais fantaisiste", () => {
  assert.deepEqual(verifierDemandeSuppression({ confirme: "SUPPRIMER" }), { ok: true, attendu: null });
  assert.deepEqual(verifierDemandeSuppression({ confirme: "SUPPRIMER", attendu: 103 }), { ok: true, attendu: 103 });
  assert.deepEqual(verifierDemandeSuppression({ confirme: "SUPPRIMER", attendu: 0 }), { ok: true, attendu: 0 });
  for (const attendu of [-1, 1.5, "103", 200_000, NaN]) {
    const v = verifierDemandeSuppression({ confirme: "SUPPRIMER", attendu });
    assert.equal(v.ok, false, String(attendu));
  }
});

test("trouver plus de pièces que l'aperçu arrête tout ; en trouver moins, non", () => {
  // Un import lancé depuis un autre onglet : on ne supprime pas ce que
  // personne n'a vu dans l'aperçu.
  assert.match(apercuTouJours(103, 118)!, /118 pièces alors que l'aperçu en annonçait 103/);
  assert.match(apercuTouJours(103, 118)!, /Relancez la prévisualisation/);
  // Une suppression précédente interrompue en a déjà emporté : on continue.
  assert.equal(apercuTouJours(103, 40), null);
  assert.equal(apercuTouJours(103, 103), null);
  assert.equal(apercuTouJours(103, 0), null);
  // Sans aperçu, aucun contrôle à faire.
  assert.equal(apercuTouJours(null, 999), null);
});
