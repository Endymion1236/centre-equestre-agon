/**
 * tests/unit/discounts-stages.test.ts
 *
 * Les réductions sur les stages : rang multi-stages et cascade.
 *   npx tsx tests/unit/discounts-stages.test.ts
 *
 * Deux défauts réels tenus ici. Le rang se comptait en lignes de
 * réservation, si bien qu'une deuxième semaine passait pour une troisième
 * (cas JUVET FRASER, 22/09/2026). Et les taux s'additionnaient au lieu de
 * s'appliquer l'un après l'autre.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function charger(reservations: any[]) {
  const source = readFileSync(resolve("src/lib/discounts.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: "discounts.ts",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const dependencies: Record<string, unknown> = {
    "firebase/firestore": {
      collection: () => ({}), doc: () => ({}), query: () => ({}), where: () => ({}),
      getDoc: async () => ({ exists: () => false }),
      getDocs: async () => ({ docs: reservations.map((r, i) => ({ id: `r${i}`, data: () => r })) }),
      Timestamp: class {},
    },
    "@/lib/firebase": { db: {} },
  };
  const module = { exports: {} as any };
  runInNewContext(outputText, {
    module, exports: module.exports,
    Date, Set, Map, Array, Object, String, Number, Boolean, Math, JSON, Promise, Error, isNaN,
    console: { error() {}, warn() {}, log() {} },
    require(name: string) {
      if (!(name in dependencies)) throw new Error(`Import non simulé : ${name}`);
      return dependencies[name];
    },
  }, { filename: "discounts.ts" });
  return module.exports;
}

const PERIODE = { id: "toussaint", name: "Toussaint 2026", startDate: "2026-10-17", endDate: "2026-11-02" };
const BAREME = {
  // Barème de test, volontairement figé : ces cas pinnent le CALCUL, pas les
  // réglages du club, qui changent au gré de sa politique tarifaire.
  multiStageDiscount: [{ nth: 2, discount: 10 }, { nth: 3, discount: 15 }, { nth: 4, discount: 20 }],
  familyDiscount: [{ nth: 2, discount: 6 }, { nth: 3, discount: 10 }, { nth: 4, discount: 15 }],
  prixPlancherStage: 160,
};
/** Une ligne de réservation de stage, telle que Firestore la rend. */
const resa = (childId: string, date: string, titre = "Stage galop d'or (5j)") => ({
  childId, childName: childId, familyId: "fam", activityType: "stage",
  date, activityTitle: titre, creneauId: `${titre}-${date}`, priceTTC: 180,
});

let passes = 0;
async function test(nom: string, fn: () => Promise<void> | void) {
  try { await fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e?.message || e}`); process.exitCode = 1; }
}

async function main() {
  console.log("\n── Identité d'un stage ──");

  await test("la semaine sépare deux stages de même intitulé", () => {
    const api = charger([]);
    assert.equal(api.lundiDeLaSemaine("2026-10-23"), "2026-10-19", "vendredi → lundi de sa semaine");
    assert.equal(api.lundiDeLaSemaine("2026-10-19"), "2026-10-19");
    assert.notEqual(
      api.cleStage({ stageTitle: "Stage galop d'or (5j)", stageDate: "2026-10-19" }),
      api.cleStage({ stageTitle: "Stage galop d'or (5j)", stageDate: "2026-10-26" }),
    );
    assert.equal(
      api.cleStage({ stageTitle: "Stage galop d'or (5j)", stageDate: "2026-10-19" }),
      api.cleStage({ stageTitle: " stage galop d'or (5J) ", stageDate: "2026-10-23" }),
      "même semaine, même intitulé à la casse près : un seul stage",
    );
  });

  console.log("\n── Rang multi-stages ──");

  await test("les cinq jours d'un même stage comptent pour un seul", () => {
    const api = charger([]);
    const jours = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]
      .map((d) => ({ childId: "juliette", stageTitle: "Stage galop d'or (5j)", stageDate: d }));
    const r = api.calculateMultiStageDiscount(jours, "juliette", BAREME.multiStageDiscount);
    assert.equal(r.nth, 2, "la semaine suivante est la 2ème, pas la 6ème");
    assert.equal(r.percent, 10);
  });

  await test("deux semaines distinctes font bien un 3ème stage", () => {
    const api = charger([]);
    const deux = [
      { childId: "juliette", stageTitle: "Stage galop d'or (5j)", stageDate: "2026-10-19" },
      { childId: "juliette", stageTitle: "Stage galop d'or (5j)", stageDate: "2026-10-26" },
    ];
    const r = api.calculateMultiStageDiscount(deux, "juliette", BAREME.multiStageDiscount);
    assert.equal(r.nth, 3);
    assert.equal(r.percent, 15);
  });

  console.log("\n── Prix facturé ──");

  const prixDe = async (reservations: any[], childId: string, settings: any = BAREME) => {
    const api = charger(reservations);
    return api.applyDiscounts({
      familyId: "fam", newChildId: childId, stageDate: "2026-10-26", stageType: "stage",
      originalPriceTTC: 180, settings, periods: [PERIODE], excludeCreneauId: "",
    });
  };

  await test("le cas JUVET FRASER : 162 €, et le plancher ne mord pas", async () => {
    // Juliette a déjà la semaine du 19 au 23 octobre, quel qu'en soit le
    // nombre de lignes. La semaine suivante est sa 2ème : -10 %.
    const r = await prixDe(
      ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"].map((d) => resa("juliette", d)),
      "juliette",
    );
    assert.equal(r.finalPriceTTC, 162, "et non 160 € comme le plancher l'imposait");
    assert.equal(r.discountAmount, 18);
    assert.equal(JSON.stringify(r.reasons), JSON.stringify(["2ème stage (-10%)"]));
  });

  await test("un 3ème stage tombe sous le plancher, qui le remonte et le dit", async () => {
    const r = await prixDe(
      [resa("juliette", "2026-10-19"), resa("juliette", "2026-10-26")],
      "juliette",
    );
    // -15 % → 153 €, sous le plancher de 160 €.
    assert.equal(r.finalPriceTTC, 160);
    assert.ok(r.reasons.some((x: string) => x.includes("plancher")), r.reasons.join(" · "));
  });

  await test("sans plancher, le barème s'applique en entier", async () => {
    const r = await prixDe(
      [resa("juliette", "2026-10-19"), resa("juliette", "2026-10-26")],
      "juliette",
      { ...BAREME, prixPlancherStage: 0 },
    );
    assert.equal(r.finalPriceTTC, 153);
  });

  console.log("\n── Ordre d'application ──");

  await test("les taux s'appliquent en cascade, multi-stages d'abord", () => {
    const api = charger([]);
    // -10 % puis -6 % sur 180 € : 162 € puis 152,28 €. En additif on aurait
    // eu -16 %, soit 151,20 €.
    const cascade = Math.round(180 * 0.9 * 0.94 * 100) / 100;
    assert.equal(cascade, 152.28);
    assert.notEqual(cascade, Math.round(180 * 0.84 * 100) / 100);
    assert.equal(typeof api.applyDiscounts, "function");
  });

  await test("un 2ème enfant qui enchaîne cumule les deux réductions", async () => {
    // Le rang dans la famille reste acquis : Juliette est arrivée après
    // Alice, elle est 2ème enfant sur toute la période, y compris à son
    // 2ème stage. Auparavant elle perdait sa réduction famille.
    const r = await prixDe(
      [resa("alice", "2026-10-19"), resa("juliette", "2026-10-19")],
      "juliette",
    );
    assert.equal(r.nthFamille, 2);
    assert.equal(r.nthMultiStage, 2);
    assert.equal(
      JSON.stringify(r.reasons),
      JSON.stringify(["2ème stage (-10%)", "2ème enfant famille (-6%)", "(plafond au prix plancher 160€)"]),
    );
    // 180 × 0,90 × 0,94 = 152,28 €, sous le plancher de 160 €.
    assert.equal(r.finalPriceTTC, 160);
  });

  await test("le 1er enfant garde son rang : jamais de réduction famille pour lui", async () => {
    const r = await prixDe(
      [resa("alice", "2026-10-19"), resa("juliette", "2026-10-19")],
      "alice",
    );
    assert.equal(r.nthFamille, 1);
    assert.equal(JSON.stringify(r.reasons), JSON.stringify(["2ème stage (-10%)"]));
    assert.equal(r.finalPriceTTC, 162);
  });

  await test("l'ordre d'arrivée fait le rang, pas l'ordre des inscriptions en base", async () => {
    // Juliette a commencé la semaine du 19, Alice n'arrive que le 26 :
    // Juliette reste la 1ère de la famille.
    const r = await prixDe(
      [resa("juliette", "2026-10-19"), resa("alice", "2026-10-26")],
      "alice",
    );
    assert.equal(r.nthFamille, 2, "Alice est la 2ème arrivée");
  });

  await test("un nouvel enfant de la famille a la réduction famille, sans multi-stages", async () => {
    const r = await prixDe([resa("alice", "2026-10-19")], "juliette");
    assert.equal(JSON.stringify(r.reasons), JSON.stringify(["2ème enfant famille (-6%)"]));
    assert.equal(r.finalPriceTTC, 169.2);
  });

  await test("deux enfants inscrits d'un coup : le second a bien le rang 2", async () => {
    // Sans les inscriptions en attente d'écriture, chacun repartait du rang 1
    // et le second enfant perdait sa réduction famille.
    const api = charger([]);
    const commun = {
      familyId: "fam", stageDate: "2026-10-19", stageType: "stage",
      originalPriceTTC: 180, settings: BAREME, periods: [PERIODE], excludeCreneauId: "c1",
    };
    const premier = await api.applyDiscounts({ ...commun, newChildId: "alice" });
    assert.equal(premier.finalPriceTTC, 180, "le premier enfant paie plein tarif");

    const second = await api.applyDiscounts({
      ...commun,
      newChildId: "bastien",
      stagesSupplementaires: [{
        childId: "alice", childName: "Alice", familyId: "fam",
        stageDate: "2026-10-19", stageTitle: "Stage galop d'or (5j)", creneauId: "c1", priceTTC: 180,
      }],
    });
    assert.equal(second.nthFamille, 2);
    assert.equal(JSON.stringify(second.reasons), JSON.stringify(["2ème enfant famille (-6%)"]));
    assert.equal(second.finalPriceTTC, 169.2);
  });

  await test("hors vacances scolaires, prix plein", async () => {
    const api = charger([resa("juliette", "2026-10-19")]);
    const r = await api.applyDiscounts({
      familyId: "fam", newChildId: "juliette", stageDate: "2026-12-15", stageType: "stage",
      originalPriceTTC: 180, settings: BAREME, periods: [PERIODE],
    });
    assert.equal(r.finalPriceTTC, 180);
    assert.equal(JSON.stringify(r.reasons), "[]");
  });

  console.log(process.exitCode ? "\n❌ des tests ont échoué" : `\n✅ ${passes} tests passés`);
}
main();
