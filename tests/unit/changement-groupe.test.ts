/**
 * tests/unit/changement-groupe.test.ts
 *
 * Le déplacement d'un cavalier d'un stage (ou d'un groupe) vers un autre.
 * Ce qui est vérifié ici, ce sont les trois promesses faites à Nicolas :
 * l'acompte reste sur la bonne inscription, le prix ne bouge que de l'écart
 * entre les deux tarifs, et la liste d'attente n'est pas dérangée quand on
 * reste dans le même stage.
 */
import assert from "node:assert/strict";
import {
  conflitsHoraires,
  libelleItem,
  placesRestantes,
  grouperEnStages,
  planifierChangementGroupe,
  stageKeyDe,
  tarifStage,
} from "../../src/lib/changement-groupe";
import { memeStage } from "../../src/lib/meme-stage";

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

/** Trois jours de stage, du lundi au mercredi. */
const jours = (opts: {
  prefixe: string; titre: string; debut: string; prix: number;
  groupe?: string; places?: number; inscrits?: string[]; lundi?: string;
}) => {
  const base = opts.lundi || "2026-10-19";
  return [0, 1, 2].map((i) => {
    const d = new Date(base + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    return {
      id: `${opts.prefixe}${i}`,
      activityId: "act-stage",
      activityTitle: opts.titre,
      activityType: "stage",
      date: d.toISOString().split("T")[0],
      startTime: opts.debut,
      endTime: opts.debut === "09:00" ? "12:00" : "17:00",
      maxPlaces: opts.places ?? 8,
      enrolled: (opts.inscrits || []).map((childId) => ({ childId })),
      priceTTC: opts.prix,
      stageGroupId: opts.groupe || `grp-${opts.prefixe}`,
    };
  });
};

const GROUPE_MATIN = jours({ prefixe: "m", titre: "Stage Poneys", debut: "09:00", prix: 160, groupe: "grp-matin", inscrits: ["enfant-2"] });
const GROUPE_APREM = jours({ prefixe: "a", titre: "Stage Poneys", debut: "14:00", prix: 160, groupe: "grp-aprem" });

const ITEM = {
  childId: "enfant-2",
  childName: "Juliette",
  activityTitle: "Stage Poneys (3j) — Juliette (-16€)",
  stageKey: "Stage Poneys_2026-10-19",
  priceTTC: 144,
  priceHT: 136.49,
  tva: 5.5,
};

const BASE = {
  childId: "enfant-2",
  childName: "Juliette",
  source: GROUPE_MATIN,
  cible: GROUPE_APREM,
  item: ITEM,
  autresItems: [{ priceTTC: 160 }],
  dejaEncaisse: 60,
  maintenant: new Date("2026-09-23T10:00:00Z"),
};

console.log("\n── Tarif d'un stage ──");

test("le tarif configuré pour ce nombre de jours prime s'il est plus bas", () => {
  const stage = jours({ prefixe: "x", titre: "S", debut: "09:00", prix: 160 });
  assert.equal(tarifStage(stage), 160);
  stage.forEach((c: any) => { c.price3days = 140; });
  assert.equal(tarifStage(stage), 140);
});

test("un tarif configuré plus cher que le prix plein est ignoré", () => {
  const stage = jours({ prefixe: "x", titre: "S", debut: "09:00", prix: 160 });
  stage.forEach((c: any) => { c.price3days = 200; });
  assert.equal(tarifStage(stage), 160, "on ne facture jamais plus que le prix plein");
});

test("un stage sans jour ne vaut rien", () => {
  assert.equal(tarifStage([]), 0);
});

console.log("\n── Places et conflits ──");

test("le cavalier déplacé ne se bloque pas lui-même", () => {
  const complet = jours({ prefixe: "c", titre: "S", debut: "09:00", prix: 160, places: 1, inscrits: ["enfant-2"] });
  assert.equal(placesRestantes(complet, "enfant-2"), 1, "sa propre place se libère");
  assert.equal(placesRestantes(complet, "enfant-9"), 0, "pour un autre, c'est complet");
});

test("le jour le plus chargé décide", () => {
  const stage = jours({ prefixe: "d", titre: "S", debut: "09:00", prix: 160, places: 3 });
  (stage[1] as any).enrolled = [{ childId: "a" }, { childId: "b" }, { childId: "c" }];
  assert.equal(placesRestantes(stage, "enfant-2"), 0);
});

test("un cours qui chevauche le nouveau créneau est un conflit", () => {
  const autre = {
    id: "cours-1", activityTitle: "Cours galop 2", date: GROUPE_APREM[0].date,
    startTime: "15:00", endTime: "16:00", enrolled: [{ childId: "enfant-2" }],
  };
  const trouves = conflitsHoraires(GROUPE_APREM, "enfant-2", [autre], new Set());
  assert.equal(trouves.length, 1);
  assert.equal(trouves[0].titre, "Cours galop 2");
});

test("un cours qui ne chevauche pas, ou sans horaire, ne bloque rien", () => {
  const apres = {
    id: "cours-2", activityTitle: "Cours du soir", date: GROUPE_APREM[0].date,
    startTime: "18:00", endTime: "19:00", enrolled: [{ childId: "enfant-2" }],
  };
  assert.deepEqual(conflitsHoraires(GROUPE_APREM, "enfant-2", [apres], new Set()), []);

  const sansHoraire = { ...apres, id: "cours-3", startTime: "", endTime: "" };
  assert.deepEqual(conflitsHoraires(GROUPE_APREM, "enfant-2", [sansHoraire], new Set()), [],
    "sans horaire connu, on n'invente pas un conflit");
});

test("les créneaux du déplacement lui-même ne comptent pas comme conflit", () => {
  const ignorer = new Set(GROUPE_APREM.map((c) => c.id!));
  const memeJour = { ...GROUPE_APREM[0], enrolled: [{ childId: "enfant-2" }] };
  assert.deepEqual(conflitsHoraires(GROUPE_APREM, "enfant-2", [memeJour], ignorer), []);
});

console.log("\n── Libellés ──");

test("la clé du stage suit le premier jour du groupe visé", () => {
  assert.equal(stageKeyDe(GROUPE_APREM), "Stage Poneys_2026-10-19");
  assert.equal(stageKeyDe([]), "");
});

test("le libellé garde la remise déjà accordée", () => {
  assert.equal(
    libelleItem("Stage Poneys", 3, "Juliette", "Stage Poneys (3j) — Juliette (-16€)"),
    "Stage Poneys (3j) — Juliette (-16€)",
  );
  assert.equal(
    libelleItem("Stage Grands", 2, "Juliette", "Stage Poneys (3j) — Juliette"),
    "Stage Grands (2j) — Juliette",
  );
});

console.log("\n── Le plan de déplacement ──");

test("à tarif égal, rien ne bouge côté argent", () => {
  const plan = planifierChangementGroupe(BASE);
  assert.equal(plan.possible, true, plan.blocages.join(" | "));
  assert.equal(plan.prixAncien, 144);
  assert.equal(plan.prixNouveau, 144);
  assert.equal(plan.ecart, 0);
  assert.equal(plan.totalCommande, 304, "160 (l'autre enfant) + 144");
  assert.equal(plan.paidAmount, 60, "l'acompte reste acquis à la commande");
  assert.equal(plan.statut, "partial");
  assert.equal(plan.avoir, 0);
});

test("l'écart de tarif, et lui seul, se répercute sur le prix", () => {
  const cherA = jours({ prefixe: "b", titre: "Stage Grands", debut: "14:00", prix: 200, groupe: "grp-grands" });
  const plan = planifierChangementGroupe({ ...BASE, cible: cherA });
  assert.equal(plan.ecart, 40, "200 − 160");
  assert.equal(plan.prixNouveau, 184, "la remise de 16€ est conservée");
  assert.ok(plan.avertissements.some((a) => a.includes("144.00€ à 184.00€")), plan.avertissements.join(" | "));
});

test("un stage moins cher que l'acompte déjà versé produit un avoir", () => {
  const plan = planifierChangementGroupe({
    ...BASE,
    cible: jours({ prefixe: "p", titre: "Stage Découverte", debut: "14:00", prix: 40, groupe: "grp-dec" }),
    autresItems: [],
    dejaEncaisse: 60,
  });
  assert.equal(plan.prixNouveau, 24, "144 + (40 − 160) = 24");
  assert.equal(plan.totalCommande, 24);
  assert.equal(plan.paidAmount, 24);
  assert.equal(plan.avoir, 36);
  assert.equal(plan.statut, "paid");
  assert.ok(plan.avertissements.some((a) => a.includes("avoir de 36.00€")));
});

test("le prix ne descend jamais sous zéro", () => {
  const plan = planifierChangementGroupe({
    ...BASE,
    item: { ...ITEM, priceTTC: 10 },
    cible: jours({ prefixe: "z", titre: "S", debut: "14:00", prix: 0, groupe: "grp-z" }),
  });
  assert.equal(plan.prixNouveau, 0);
});

console.log("\n── La ligne de commande retaillée ──");

test("la ligne pointe le nouveau stage, TVA et HT recalculés", () => {
  const plan = planifierChangementGroupe({
    ...BASE,
    cible: jours({ prefixe: "g", titre: "Stage Grands", debut: "14:00", prix: 200, groupe: "grp-grands" }),
  });
  const item = plan.itemModifie!;
  assert.equal(item.stageKey, "Stage Grands_2026-10-19");
  assert.equal(item.activityTitle, "Stage Grands (3j) — Juliette (-16€)");
  assert.equal(item.priceTTC, 184);
  assert.equal(item.tva, 5.5);
  assert.equal(item.priceHT, 174.41, "184 / 1.055");
  assert.equal((item.stageDates || []).length, 3);
  assert.equal((item as any)._deplaceDepuis.stageKey, "Stage Poneys_2026-10-19");
  assert.equal((item as any)._deplaceDepuis.prixTTC, 144);
});

test("une TVA à 0 % n'est pas repliée sur 5,5 %", () => {
  const plan = planifierChangementGroupe({ ...BASE, item: { ...ITEM, tva: 0, priceTTC: 100 } });
  assert.equal(plan.itemModifie!.tva, 0);
  assert.equal(plan.itemModifie!.priceHT, 100, "exonéré : HT = TTC");
});

test("les jours ne sont posés sur la ligne que si elle en portait déjà", () => {
  const sansJours = planifierChangementGroupe(BASE).itemModifie!;
  assert.equal(sansJours.creneauIds, undefined, "ligne créée en admin : on ne change pas sa forme");
  assert.equal(sansJours.creneauId, undefined);

  const avecJours = planifierChangementGroupe({
    ...BASE,
    item: { ...ITEM, creneauIds: ["m0", "m1", "m2"], creneauId: "m0" },
  }).itemModifie!;
  assert.deepEqual(avecJours.creneauIds, ["a0", "a1", "a2"]);
  assert.equal(avecJours.creneauId, "a0");
});

console.log("\n── Ce qui bloque ──");

test("un groupe complet bloque le déplacement", () => {
  const complet = jours({ prefixe: "f", titre: "Stage Poneys", debut: "14:00", prix: 160, groupe: "grp-f", places: 1, inscrits: ["autre"] });
  const plan = planifierChangementGroupe({ ...BASE, cible: complet });
  assert.equal(plan.possible, false);
  assert.ok(plan.blocages.some((b) => b.includes("complet")), plan.blocages.join(" | "));
});

test("un conflit d'horaire bloque le déplacement", () => {
  const plan = planifierChangementGroupe({
    ...BASE,
    creneauxConnus: [{
      id: "cours-1", activityTitle: "Cours galop 2", date: GROUPE_APREM[0].date,
      startTime: "15:00", endTime: "16:00", enrolled: [{ childId: "enfant-2" }],
    }],
  });
  assert.equal(plan.possible, false);
  assert.ok(plan.blocages.some((b) => b.includes("Conflit d'horaire")));
});

test("déplacer vers le groupe où l'enfant est déjà ne sert à rien", () => {
  const plan = planifierChangementGroupe({ ...BASE, cible: GROUPE_MATIN });
  assert.equal(plan.possible, false);
  assert.ok(plan.blocages.some((b) => b.includes("déjà inscrit")));
});

test("une facture émise interdit de changer le prix, pas de corriger l'intitulé", () => {
  const cher = jours({ prefixe: "g", titre: "Stage Grands", debut: "14:00", prix: 200, groupe: "grp-grands" });
  const bloque = planifierChangementGroupe({ ...BASE, cible: cher, numeroFacture: "FA-2026-0042" });
  assert.equal(bloque.possible, false);
  assert.ok(bloque.blocages.some((b) => b.includes("FA-2026-0042")), bloque.blocages.join(" | "));

  const passe = planifierChangementGroupe({ ...BASE, numeroFacture: "FA-2026-0042" });
  assert.equal(passe.possible, true, passe.blocages.join(" | "));
  assert.ok(passe.avertissements.some((a) => a.includes("FA-2026-0042")));
});

console.log("\n── Liste d'attente et périmètre ──");

test("changer de groupe dans le même stage ne prévient pas la liste d'attente", () => {
  const memeGroupeId = jours({ prefixe: "s", titre: "Stage Poneys", debut: "14:00", prix: 160, groupe: "grp-matin" });
  const plan = planifierChangementGroupe({ ...BASE, cible: memeGroupeId });
  assert.equal(plan.memeStage, true);
  assert.equal(plan.notifierListeAttente, false);
  assert.ok(plan.avertissements.some((a) => a.includes("liste d'attente n'est pas prévenue")));
});

test("partir vers un autre stage libère une place, et ça se dit", () => {
  const plan = planifierChangementGroupe({
    ...BASE,
    cible: jours({ prefixe: "n", titre: "Stage Noël", debut: "09:00", prix: 160, groupe: "grp-noel", lundi: "2026-12-21" }),
  });
  assert.equal(plan.memeStage, false);
  assert.equal(plan.notifierListeAttente, true);
});

test("un changement de période de vacances est signalé", () => {
  const plan = planifierChangementGroupe({
    ...BASE,
    cible: jours({ prefixe: "n", titre: "Stage Noël", debut: "09:00", prix: 160, groupe: "grp-noel", lundi: "2026-12-21" }),
    periodeSource: "toussaint-2026",
    periodeCible: "noel-2026",
  });
  assert.ok(plan.avertissements.some((a) => a.includes("autre période de vacances")), plan.avertissements.join(" | "));
});

test("les jours à quitter et à rejoindre excluent ceux qui sont communs", () => {
  const partage = [GROUPE_MATIN[0], ...jours({ prefixe: "q", titre: "Stage Poneys", debut: "14:00", prix: 160, groupe: "grp-matin" }).slice(1)];
  const plan = planifierChangementGroupe({ ...BASE, cible: partage });
  assert.deepEqual(plan.quitter, ["m1", "m2"]);
  assert.deepEqual(plan.rejoindre, ["q1", "q2"]);
});

test("sans commande rattachée, le déplacement reste possible et le dit", () => {
  const plan = planifierChangementGroupe({ ...BASE, item: null, autresItems: [], dejaEncaisse: 0 });
  assert.equal(plan.possible, true, plan.blocages.join(" | "));
  assert.equal(plan.itemModifie, null);
  assert.ok(plan.avertissements.some((a) => a.includes("aucune commande")));
});

console.log("\n── La règle « même stage » n'existe qu'à un endroit ──");

test("deux semaines différentes ne sont jamais le même stage", () => {
  assert.equal(memeStage(GROUPE_MATIN[0], GROUPE_APREM[0]), false, "groupes distincts");
  assert.equal(memeStage(GROUPE_MATIN[0], { ...GROUPE_MATIN[0], date: "2026-12-21" }), false);
  assert.equal(memeStage(GROUPE_MATIN[0], GROUPE_MATIN[2]), true);
});

console.log("\n── Regroupement des destinations ──");

test("les jours se regroupent par stage, triés par date de début", () => {
  const melange = [
    ...GROUPE_APREM,
    ...jours({ prefixe: "n", titre: "Stage Noël", debut: "09:00", prix: 160, groupe: "grp-noel", lundi: "2026-12-21" }),
    ...GROUPE_MATIN,
  ];
  const lots = grouperEnStages(melange);
  assert.equal(lots.length, 3);
  assert.deepEqual(lots.map((l) => l.length), [3, 3, 3]);
  assert.deepEqual(lots.map((l) => l[0].id), ["m0", "a0", "n0"], "matin avant aprem, Toussaint avant Noël");
  assert.deepEqual(lots[0].map((c) => c.date), [...lots[0]].sort((a, b) => a.date.localeCompare(b.date)).map((c) => c.date));
});

test("un stage d'un seul jour forme son propre lot", () => {
  const lots = grouperEnStages([GROUPE_MATIN[0]]);
  assert.equal(lots.length, 1);
  assert.equal(lots[0].length, 1);
});

console.log(`\n✅ ${passes} tests passés\n`);
