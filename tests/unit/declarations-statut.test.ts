/**
 * L'état d'une déclaration de règlement, en clair
 * (src/app/admin/paiements/declarations-actions.ts).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { libelleStatutDeclaration } from "../../src/app/admin/paiements/declarations-actions";

test("chaque état se lit en français, y compris l'inconnu", () => {
  assert.equal(libelleStatutDeclaration("pending_confirmation"), "En attente");
  assert.equal(libelleStatutDeclaration("confirmed"), "Validée");
  assert.equal(libelleStatutDeclaration("rejected"), "Rejetée");
  assert.equal(libelleStatutDeclaration("reglee_en_ligne"), "Réglée en ligne");
  assert.equal(libelleStatutDeclaration(undefined), "État inconnu");
  assert.equal(libelleStatutDeclaration("bizarre"), "bizarre");
});
