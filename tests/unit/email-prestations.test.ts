/**
 * Tests de src/lib/email-prestations.ts
 *
 * Verrouille deux défauts constatés sur un email de confirmation réel
 * (29/08/2026, cours ponctuel) :
 *   • « Mode de paiement : {mode} » — marqueur non substitué, parce que la
 *     route de retour ne passait pas la variable que le gabarit attend ;
 *   • « Galop de bronze — ambre — ambre » — le prénom recollé sur un titre
 *     qui le contenait déjà.
 */
import assert from "node:assert/strict";
import {
  libelleModePaiement,
  titrePrestation,
  titreSansEnfant,
  prestationsCourtes,
  lignesDetailHtml,
  datesStage,
  horairesStage,
} from "../../src/lib/email-prestations";

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

console.log("\n── Mode de paiement ──");

test("un mode connu devient un libellé lisible", () => {
  assert.equal(libelleModePaiement("cb_online"), "Carte bancaire en ligne");
  assert.equal(libelleModePaiement("cb_terminal"), "Carte bancaire au club");
  assert.equal(libelleModePaiement("cheque"), "Chèque");
  assert.equal(libelleModePaiement("sepa"), "Prélèvement SEPA");
});

test("un mode inconnu ou absent ne laisse JAMAIS passer de valeur brute", () => {
  // Le gabarit affiche cette valeur telle quelle à la famille : « cb_online »
  // ou une chaîne vide y seraient visibles.
  for (const entree of [undefined, null, "", "wat"]) {
    const v = libelleModePaiement(entree as any);
    assert.ok(v.length > 0, `mode ${JSON.stringify(entree)} → libellé vide`);
    assert.ok(!v.includes("_"), `mode ${JSON.stringify(entree)} → valeur brute « ${v} »`);
  }
});

console.log("\n── Titre de prestation ──");

test("le prénom n'est PAS recollé quand le titre le contient déjà", () => {
  assert.equal(
    titrePrestation({ activityTitle: "Découverte / Galop de bronze — ambre", childName: "ambre" }),
    "Découverte / Galop de bronze — ambre"
  );
});

test("le prénom est ajouté quand le titre ne l'a pas (commande admin)", () => {
  assert.equal(
    titrePrestation({ activityTitle: "Balade plage", childName: "Eliot" }),
    "Balade plage — Eliot"
  );
});

test("la casse et les accents ne trompent pas la détection", () => {
  assert.equal(
    titrePrestation({ activityTitle: "Galop de bronze — Ambre", childName: "ambre" }),
    "Galop de bronze — Ambre"
  );
  assert.equal(
    titrePrestation({ activityTitle: "Cours — Éliot", childName: "Eliot" }),
    "Cours — Éliot"
  );
});

test("un titre ou un prénom manquant ne casse rien", () => {
  assert.equal(titrePrestation({ activityTitle: "Balade" }), "Balade");
  assert.equal(titrePrestation({ childName: "Eliot" }), "Eliot");
  assert.equal(titrePrestation({}), "Prestation");
});

console.log("\n── Titre débarrassé du prénom (gabarit stage) ──");

test("le suffixe « — Prénom » est retiré", () => {
  assert.equal(
    titreSansEnfant({ activityTitle: "Stage Poney — ambre", childName: "ambre" }),
    "Stage Poney"
  );
});

test("un prénom au milieu du titre n'est pas tronqué", () => {
  assert.equal(
    titreSansEnfant({ activityTitle: "Stage Ambre et compagnie", childName: "Ambre" }),
    "Stage Ambre et compagnie"
  );
});

test("un titre réduit au seul prénom n'est pas vidé", () => {
  assert.equal(titreSansEnfant({ activityTitle: "Eliot", childName: "Eliot" }), "Eliot");
});

console.log("\n── Récapitulatifs ──");

test("la liste courte ne répète pas les prénoms", () => {
  const items = [
    { activityTitle: "Galop de bronze — ambre", childName: "ambre" },
    { activityTitle: "Balade plage", childName: "Eliot" },
  ];
  assert.equal(prestationsCourtes(items), "Galop de bronze — ambre, Balade plage — Eliot");
});

test("un panier vide reste lisible", () => {
  assert.equal(prestationsCourtes([]), "Prestation");
});

test("le bloc détaillé porte date, horaires et moniteur", () => {
  const html = lignesDetailHtml([{
    activityTitle: "Galop de bronze — ambre", childName: "ambre",
    date: "2026-09-01", startTime: "10:00", endTime: "11:00", monitor: "Nicolas",
  }]);
  assert.ok(html.includes("Galop de bronze — ambre"));
  assert.ok(!html.includes("ambre — ambre"), "le prénom est dupliqué");
  assert.ok(html.includes("10:00–11:00"));
  assert.ok(html.includes("avec Nicolas"));
  assert.ok(html.includes("septembre"));
});

test("une promenade porte son jour et son horaire", () => {
  // Signalé le 31/08/2026 : la confirmation de paiement d'une promenade
  // n'indiquait ni la date ni l'heure — ni pour le client, ni sur la copie
  // reçue par le club. Les trois chemins d'envoi passent maintenant par ce
  // bloc détaillé.
  const html = lignesDetailHtml([{
    activityTitle: "Promenade débrouillés — Léa Lefèvre", childName: "Léa Lefèvre",
    date: "2026-10-23", startTime: "14:00", endTime: "16:00", monitor: "Nicolas",
  }]);
  assert.ok(html.includes("Promenade débrouillés — Léa Lefèvre"));
  assert.ok(html.includes("23 octobre"), "le jour manque");
  assert.ok(html.includes("14:00–16:00"), "l'horaire manque");
  assert.ok(html.includes("vendredi"), "le jour de la semaine manque");
});

test("une date invalide n'affiche pas « Invalid Date »", () => {
  const html = lignesDetailHtml([{ activityTitle: "Cours", date: "pas-une-date" }]);
  assert.ok(!html.toLowerCase().includes("invalid"));
});

test("un stage d'une semaine s'annonce comme une semaine, pas comme un lundi", () => {
  const items = [{
    activityTitle: "Stage galop de bronze — Éliona",
    date: "2026-10-26",
    stageDates: [
      { date: "2026-10-26" }, { date: "2026-10-27" }, { date: "2026-10-28" },
      { date: "2026-10-29" }, { date: "2026-10-30" },
    ],
  }];
  const rendu = datesStage(items, "2026-10-26");
  assert.ok(rendu.includes("lundi 26"), "le premier jour manque");
  assert.ok(rendu.includes("vendredi 30 octobre"), "le dernier jour manque");
  assert.ok(rendu.includes("5 jours"), "le nombre de jours manque");
});

test("un stage d'un seul jour ne s'annonce pas comme une période", () => {
  const rendu = datesStage([{ date: "2026-10-26", stageDates: [{ date: "2026-10-26" }] }]);
  assert.ok(rendu.includes("lundi 26 octobre"));
  assert.ok(!rendu.startsWith("du "), "une seule date ne doit pas devenir une plage");
});

test("les jours d'un même stage sont fusionnés et remis dans l'ordre", () => {
  const items = [
    { date: "2026-10-27", stageDates: [{ date: "2026-10-27" }, { date: "2026-10-26" }] },
  ];
  assert.ok(datesStage(items).includes("2 jours"));
  assert.ok(datesStage(items).includes("lundi 26"));
});

test("deux enfants sur le même stage ne l'annoncent qu'une fois", () => {
  const semaine = [{ date: "2026-10-26" }, { date: "2026-10-27" }];
  const items = [
    { activityTitle: "Stage — Éliona", date: "2026-10-26", stageDates: semaine },
    { activityTitle: "Stage — Tom", date: "2026-10-26", stageDates: semaine },
  ];
  const rendu = datesStage(items);
  assert.equal(rendu.split("·").length, 1, "la même période est répétée");
  assert.ok(rendu.includes("2 jours"));
});

test("deux stages différents restent deux périodes distinctes", () => {
  const items = [
    { activityTitle: "Toussaint — Éliona", date: "2026-10-26",
      stageDates: [{ date: "2026-10-26" }, { date: "2026-10-30" }] },
    { activityTitle: "Février — Tom", date: "2027-02-15",
      stageDates: [{ date: "2027-02-15" }, { date: "2027-02-19" }] },
  ];
  const rendu = datesStage(items);
  // Le piège : réduire l'ensemble au premier et au dernier jour annoncerait
  // une période de quatre mois que personne n'a achetée.
  assert.ok(!/octobre.*f[ée]vrier/.test(rendu.replace(/·.*/, "")),
    "les deux stages ont été fusionnés en une seule plage");
  assert.ok(rendu.includes("octobre") && rendu.includes("février"), "un stage manque");
  assert.ok(rendu.includes("·"), "les deux périodes ne sont pas séparées");
});

test("sans stageDates, la date de la ligne suffit", () => {
  assert.ok(datesStage([{ date: "2026-10-26" }]).includes("lundi 26 octobre"));
});

test("sans aucune date, le repli est rendu tel quel", () => {
  assert.equal(datesStage([], "à confirmer"), "à confirmer");
  assert.equal(datesStage([]), "");
});

console.log("\n── Horaires ──");

test("un stage aux mêmes heures chaque jour annonce une seule plage", () => {
  const items = [{ stageDates: [
    { date: "2026-10-26", startTime: "10h00", endTime: "12h00" },
    { date: "2026-10-27", startTime: "10h00", endTime: "12h00" },
  ] }];
  assert.equal(horairesStage(items), "10h00–12h00");
});

test("des horaires différents selon les jours sont détaillés jour par jour", () => {
  const items = [{ stageDates: [
    { date: "2026-10-27", startTime: "14h00", endTime: "16h00" },
    { date: "2026-10-26", startTime: "10h00", endTime: "12h00" },
  ] }];
  const rendu = horairesStage(items);
  assert.ok(rendu.indexOf("10h00–12h00") < rendu.indexOf("14h00–16h00"), "les jours ne sont pas dans l'ordre");
  assert.ok(rendu.includes("lun. 26") && rendu.includes("mar. 27"));
});

test("une commande saisie au bureau (sans startTime sur la ligne) a quand même ses horaires", () => {
  const items = [{ activityTitle: "Stage poney (5j) — Léa", stageSchedule: "du lun. 26 au ven. 30 octobre · 10h00–12h00",
    stageDates: [{ date: "2026-10-26", startTime: "10h00", endTime: "12h00" }] }];
  assert.equal(horairesStage(items), "10h00–12h00");
});

test("sans journées, la ligne puis stageSchedule servent de repli", () => {
  assert.equal(horairesStage([{ startTime: "09h30", endTime: "11h30" }]), "09h30–11h30");
  assert.equal(horairesStage([{ stageSchedule: "lun. 26 octobre · 10h00–12h00" }]), "lun. 26 octobre · 10h00–12h00");
  assert.equal(horairesStage([]), "");
});

test("une heure de début sans heure de fin reste affichée dans le détail", () => {
  const html = lignesDetailHtml([{ activityTitle: "Balade — Tom", date: "2026-10-23", startTime: "14h00" }]);
  assert.ok(html.includes("vendredi 23 octobre"));
  assert.ok(html.includes("14h00"));
});

test("un stage annonce toute sa période et ses horaires dans le détail", () => {
  const html = lignesDetailHtml([{ activityTitle: "Stage poney — Léa", date: "2026-10-26", stageDates: [
    { date: "2026-10-26", startTime: "10h00", endTime: "12h00" },
    { date: "2026-10-30", startTime: "10h00", endTime: "12h00" },
  ] }]);
  assert.ok(html.includes("lundi 26") && html.includes("vendredi 30 octobre") && html.includes("2 jours"));
  assert.ok(html.includes("10h00–12h00"));
});

test("un cours à l'année affiche son créneau récurrent", () => {
  const html = lignesDetailHtml([{ activityTitle: "Forfait 1×/semaine", childName: "Léa", creneauLabel: "Poney club · mercredi · 14h00–15h00" }]);
  assert.ok(html.includes("mercredi · 14h00–15h00"));
});

console.log(`\n✅ ${passes} tests passés\n`);
