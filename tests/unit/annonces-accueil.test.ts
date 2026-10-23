/**
 * tests/unit/annonces-accueil.test.ts — fenêtre d'affichage des annonces de l'accueil.
 *   npx tsx tests/unit/annonces-accueil.test.ts
 */
import assert from "node:assert/strict";
import { ANNONCES_ACCUEIL, annoncesActives, maintenantParis } from "../../src/lib/annonces-accueil";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };

test("heure de Paris, pas celle du serveur", () => {
  assert.equal(maintenantParis(new Date("2026-10-23T06:30:00Z")), "2026-10-23 08:30");
  assert.equal(maintenantParis(new Date("2026-10-22T22:30:00Z")), "2026-10-23 00:30");
});
test("le stage baby annulé s'affiche ce matin, plus après 13 h ni la veille", () => {
  assert.equal(annoncesActives(ANNONCES_ACCUEIL, new Date("2026-10-23T06:30:00Z")).length, 1);
  assert.equal(annoncesActives(ANNONCES_ACCUEIL, new Date("2026-10-23T11:30:00Z")).length, 0);
  assert.equal(annoncesActives(ANNONCES_ACCUEIL, new Date("2026-10-22T20:00:00Z")).length, 0);
});
console.log(`✅ ${n} tests passés`);
