import assert from "node:assert/strict";
import {
  BALADE_ARRIVEE_MINUTES,
  CONSIGNE_ARRIVEE_BALADE,
  CONSIGNE_ARRIVEE_BALADE_COURTE,
  encadreConsignesBalade,
  estBalade,
} from "../../src/lib/cgv-clauses";
import { PUBLIC_ACTIVITIES } from "../../src/lib/public-activities";

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

console.log("── Consigne d'arrivée des balades ──");

test("la consigne annonce 30 minutes, en version courte et complète", () => {
  assert.equal(BALADE_ARRIVEE_MINUTES, 30);
  assert.match(CONSIGNE_ARRIVEE_BALADE_COURTE, /30 minutes avant le départ/);
  assert.match(CONSIGNE_ARRIVEE_BALADE, /30 minutes avant l'heure de départ/);
});

test("estBalade reconnaît le type, puis le libellé en repli", () => {
  assert.equal(estBalade({ activityType: "balade" }), true);
  assert.equal(estBalade({ activityType: "cours", activityTitle: "Promenade débrouillés — Léa" }), true);
  assert.equal(estBalade({ activityTitle: "Balade au coucher du soleil" }), true);
  assert.equal(estBalade({ activityType: "cours", activityTitle: "Galop 2" }), false);
  assert.equal(estBalade({ activityType: "stage", activityTitle: "Stage Poney" }), false);
  assert.equal(estBalade(null), false);
});

test("l'encadré email porte le rendez-vous 30 minutes avant", () => {
  const html = encadreConsignesBalade();
  assert.match(html, /Avant le départ/);
  assert.match(html, /30 minutes avant l'heure de départ/);
});

test("chaque balade du site vitrine commence ses infos pratiques par la consigne", () => {
  const balades = PUBLIC_ACTIVITIES.filter((a) => a.category === "balades");
  assert.ok(balades.length >= 3);
  for (const b of balades) {
    assert.match(b.practical[0], /^Arrivée 30 minutes avant le départ/, b.id);
  }
});

test("les autres activités ne l'affichent pas", () => {
  const autres = PUBLIC_ACTIVITIES.filter((a) => a.category !== "balades");
  assert.ok(autres.every((a) => !a.practical.some((l) => /30 minutes avant le départ/.test(l))));
});

console.log(`\n✅ ${passes} tests passés\n`);
