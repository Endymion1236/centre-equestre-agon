/**
 * tests/unit/lecture-piece.test.ts — lecture d'un justificatif scanné : réponse tolérée, échecs dits en clair.
 *   npx tsx tests/unit/lecture-piece.test.ts
 */
import assert from "node:assert/strict";
import { ErreurLecturePiece, erreurLecturePiece, jsonDepuisReponse, motifRefusLecture } from "../../src/lib/lecture-piece";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

test("réponse JSON nue, entre ```json```, ou précédée d'une phrase : lue", () => {
  assert.deepEqual(jsonDepuisReponse('{"ttc": 375}'), { ttc: 375 });
  assert.deepEqual(jsonDepuisReponse('```json\n{"ttc": 375}\n```'), { ttc: 375 });
  assert.deepEqual(jsonDepuisReponse('Voici la pièce lue :\n{"ttc": 375, "fournisseur": "Lacolley"}\nBonne journée'), { ttc: 375, fournisseur: "Lacolley" });
});

test("réponse sans JSON : erreur lisible (422), pas un « service indisponible »", () => {
  assert.throws(() => jsonDepuisReponse("Je ne peux pas lire ce document."), (e: unknown) => e instanceof ErreurLecturePiece && e.statut === 422);
});

test("échecs de l'analyse : chacun son message, et la pièce reste déposée", () => {
  assert.equal(erreurLecturePiece({ name: "APIConnectionTimeoutError", message: "Request timed out." }).statut, 504);
  assert.match(erreurLecturePiece({ status: 400, message: "image exceeds 5 MB" }).message, /résolution/);
  assert.equal(erreurLecturePiece({ status: 529, message: "Overloaded" }).statut, 503);
  for (const e of [{ status: 400 }, { status: 529 }, new Error("x")]) assert.match(erreurLecturePiece(e).message, /déposée/);
});

test("refus de l'analyse : la raison est rendue à l'écran", () => {
  assert.match(motifRefusLecture({ erreur: "Une seule pièce par fichier" }), /une facture par fichier/);
  assert.match(motifRefusLecture({ erreur: "document flou" }), /document flou/);
  assert.match(motifRefusLecture(null), /scan est net/);
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
