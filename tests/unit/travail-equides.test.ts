/**
 * tests/unit/travail-equides.test.ts — feuille de travail des poneys dictée.
 *   npx tsx tests/unit/travail-equides.test.ts
 */
import assert from "node:assert/strict";
import { consigneDicteeTravail, grilleSemaine, htmlFeuilleTravail, joursSemaine, lireDicteeTravail, lundiDe, seanceValide, trouverEquide } from "../../src/lib/travail-equides";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };
const equides = [{ id: "e1", name: "Caramel" }, { id: "e2", name: "Pistache" }, { id: "e3", name: "Éclair" }, { id: "e4", name: "Caramba" }];

test("poney reconnu malgré la dictée", () => {
  assert.equal(trouverEquide("pistache", equides)?.id, "e2");
  assert.equal(trouverEquide("eclair", equides)?.id, "e3");
  assert.equal(trouverEquide("Pistach", equides)?.id, "e2");
  assert.equal(trouverEquide("Caramelle", equides)?.id, "e1");
  assert.equal(trouverEquide("Tornade", equides), null);
  assert.equal(trouverEquide("Cara", equides), null, "ambigu : Caramel ou Caramba");
});

test("réponse de l'IA contrôlée : poney inconnu, date folle, type inconnu", () => {
  const brut = `Voici : {"seances":[
    {"date":"2026-11-12","poney":"Caramel","type":"longe","duree":20,"qui":"Léa","notes":"détente, bon"},
    {"date":"2025-01-01","poney":"Tornade","type":"galop","duree":900,"qui":"","notes":""}
  ],"remarques":["un mot incompris"]}`;
  const r = lireDicteeTravail(brut, equides, "2026-11-13")!;
  assert.equal(r.seances[0].equideId, "e1");
  assert.equal(r.seances[0].duree, 20);
  assert.ok(seanceValide(r.seances[0]));
  const s = r.seances[1];
  assert.equal(s.date, "2026-11-13");
  assert.equal(s.type, "autre");
  assert.equal(s.duree, null);
  assert.equal(s.nomEntendu, "Tornade");
  assert.equal(s.alertes.length, 3, JSON.stringify(s.alertes));
  assert.ok(!seanceValide(s));
  assert.deepEqual(r.remarques, ["un mot incompris"]);
  assert.equal(lireDicteeTravail("rien", equides, "2026-11-13"), null);
  // « J'ai longé Pistache » : la personne qui dicte ; sinon séance incomplète.
  const moi = lireDicteeTravail('{"seances":[{"date":"2026-11-13","poney":"Pistache","type":"longe","duree":null,"qui":"","notes":""}]}', equides, "2026-11-13", "Nicolas")!;
  assert.equal(moi.seances[0].qui, "Nicolas");
  assert.ok(seanceValide(moi.seances[0]));
  const anonyme = lireDicteeTravail('{"seances":[{"date":"2026-11-13","poney":"Pistache","type":"longe","duree":null,"qui":"","notes":""}]}', equides, "2026-11-13")!;
  assert.ok(!seanceValide(anonyme.seances[0]));
  assert.match((anonyme.seances[0] as any).alertes.join(), /Qui a travaillé/);
  assert.match(consigneDicteeTravail("j'ai longé Caramel", ["Caramel"], "2026-11-13"), /vendredi 13 novembre 2026/);
});

test("grille de la semaine et feuille imprimable", () => {
  assert.equal(lundiDe("2026-11-13"), "2026-11-09");
  assert.equal(joursSemaine("2026-11-09")[6], "2026-11-15");
  const seances = [
    { date: "2026-11-10", equideId: "e1", equideNom: "Caramel", type: "longe" as const, duree: 20, qui: "", notes: "" },
    { date: "2026-11-10", equideId: "e1", equideNom: "Caramel", type: "monte" as const, duree: 45, qui: "Léa", notes: "<b>" },
    { date: "2026-11-20", equideId: "e1", equideNom: "Caramel", type: "monte" as const, duree: 45, qui: "", notes: "" },
  ];
  const g = grilleSemaine(seances, equides, "2026-11-09");
  const caramel = g.find((l) => l.equideId === "e1")!;
  assert.equal(caramel.nb, 2);
  assert.equal(caramel.minutes, 65);
  assert.equal(caramel.jours[1].length, 2);
  assert.equal(g.find((l) => l.equideId === "e2")!.nb, 0);
  const html = htmlFeuilleTravail(g, "2026-11-09", "Centre équestre");
  assert.match(html, /1h05/);
  assert.ok(html.includes("&lt;b&gt;") && !html.includes("<i><b>"));
});
console.log(`✅ ${n} tests passés`);
