/**
 * tests/unit/travail-bilan.test.ts — bilan mensuel du travail des poneys.
 *   npx tsx tests/unit/travail-bilan.test.ts
 */
import assert from "node:assert/strict";
import { consigneBilanTravail, finDeMois, htmlBilanTravail, lireAnalyseBilan, moisPrecedent, statsMois } from "../../src/lib/travail-bilan";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };
const equides = [{ id: "e1", name: "Caramel" }, { id: "e2", name: "Pistache" }, { id: "e3", name: "Éclair" }];
const s = (date: string, equideId: string, type: any, duree: number | null, qui: string, notes = "") => ({ date, equideId, equideNom: equides.find((e) => e.id === equideId)!.name, type, duree, qui, notes });
const seances = [
  s("2026-11-03", "e1", "longe", 20, "Léa", "raide à main droite"),
  s("2026-11-10", "e1", "monte", 45, "Léa"),
  s("2026-11-28", "e1", "longe", 20, "Nicolas", "mieux à main droite"),
  s("2026-11-12", "e2", "obstacle", 40, "Nicolas", "chaud à l'abord"),
  s("2026-10-30", "e2", "monte", 30, "Léa"),
];

test("chiffres du mois : par poney, par type, par personne, coupures, poneys sans séance", () => {
  assert.equal(finDeMois("2026-11"), "2026-11-30");
  assert.equal(finDeMois("2028-02"), "2028-02-29");
  assert.equal(moisPrecedent("2026-01"), "2025-12");
  const st = statsMois(seances, equides, "2026-11");
  assert.equal(st.nbSeances, 4);
  assert.equal(st.minutes, 125);
  assert.deepEqual(st.sansTravail, ["Éclair"]);
  const c = st.equides[0];
  assert.equal(c.nom, "Caramel");
  assert.equal(c.nb, 3);
  assert.deepEqual(c.parType.map((p) => [p.type, p.nb]), [["longe", 2], ["monte", 1]]);
  assert.deepEqual(c.parQui, [{ qui: "Léa", nb: 2 }, { qui: "Nicolas", nb: 1 }]);
  assert.equal(c.plusLongRepos, 17, "du 11 au 27");
  assert.equal(st.equides[1].plusLongRepos, 18, "du 13 au 30");
  assert.deepEqual(st.parQui, [{ qui: "Léa", nb: 2 }, { qui: "Nicolas", nb: 2 }]);
});

test("consigne : les remarques des moniteurs, rien d'autre ; réponse contrôlée", () => {
  const st = statsMois(seances, equides, "2026-11");
  const c = consigneBilanTravail(st, seances);
  assert.match(c, /raide à main droite/);
  assert.match(c, /Sans aucune séance notée ce mois-ci : Éclair/);
  assert.ok(!c.includes("30/10"), "octobre exclu");
  const a = lireAnalyseBilan(`ok {"synthese":"Bon mois.","equides":[{"nom":"caramel","pointsTravailles":["longe"],"aRetravailler":["main droite"],"conseil":"continuer"},{"nom":"Inconnu","pointsTravailles":[],"aRetravailler":[],"conseil":""}],"alertes":["Éclair non travaillé"]}`, st)!;
  assert.equal(a.equides.length, 1);
  assert.equal(a.equides[0].nom, "Caramel");
  assert.equal(lireAnalyseBilan("pas du json", st), null);
  const html = htmlBilanTravail(st, a, "Centre <équestre>");
  assert.ok(html.includes("À retravailler") && html.includes("main droite") && html.includes("Éclair non travaillé"));
  assert.ok(html.includes("Centre &lt;équestre&gt;"));
  assert.ok(htmlBilanTravail(st, null, "Club", true).startsWith("<!doctype html>"));
});
console.log(`✅ ${n} tests passés`);
