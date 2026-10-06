/**
 * tests/unit/creneau-sur-demande.test.ts — créneau « sur demande » (anniversaire, cours particulier).
 *   npx tsx tests/unit/creneau-sur-demande.test.ts
 */
import assert from "node:assert/strict";
import {
  champsChoixFormuleAdmin, champsEditionSurDemande, champsFixationFormule, champsRetourAuChoix, champsSurDemandeApresRetrait, creneauAvecFormule, deciderInscriptionSurDemande,
  formuleDuCreneau, formulesProposees, nettoyerFormules, placesSurDemande, privatisePourAutreFamille, titreSurDemande,
  type FormuleSurDemande,
} from "../../src/lib/creneau-sur-demande";
import { prixInscriptionCavalier } from "../../src/lib/tarif-forfaitaire";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const anniv: FormuleSurDemande = { id: "anniversaire", label: "Anniversaire", priceTTC: 180, places: 2, forfait: true, descriptif: "Jusqu'à 8 enfants" };
const cours: FormuleSurDemande = { id: "cours-particulier", label: "Cours particulier", priceTTC: 45, places: 3, forfait: false };
const libre = () => ({ activityTitle: "Créneau sur demande", priceTTC: 0, maxPlaces: 3, surDemande: true, formules: [anniv, cours], enrolled: [] as any[] });

test("le titre annonce les formules tant que personne n'a choisi", () => {
  assert.equal(titreSurDemande(libre()), "Sur demande — anniversaire ou cours particulier");
  assert.equal(formulesProposees({ ...libre(), formules: [anniv, { ...cours, priceTTC: 0 }] }).length, 1, "une formule sans prix n'est pas proposée");
});

test("première famille : elle choisit la formule, le créneau est fixé et privatisé", () => {
  const d = deciderInscriptionSurDemande(libre(), "anniversaire", "famA", false);
  assert.deepEqual(d, { ok: true, fixer: { formule: anniv, familyId: "famA" } });
  const champs = champsFixationFormule(libre(), anniv, "famA", "2026-10-03T10:00:00Z");
  assert.equal(champs.activityTitle, "Anniversaire");
  assert.equal(champs.priceTTC, 180);
  assert.equal(champs.maxPlaces, 2);
  assert.equal(champs.tarifForfaitaire, true);
  assert.equal(champs.formuleFamilyId, "famA");
  assert.deepEqual(champs.surDemandeOrigine, { activityTitle: "Créneau sur demande", priceTTC: 0, maxPlaces: 3, tarifForfaitaire: false });
});

test("sans formule déclarée, une famille est refusée ; le personnel passe", () => {
  assert.deepEqual(deciderInscriptionSurDemande(libre(), undefined, "famA", false), { ok: false, code: "formule_requise", formule: null });
  assert.deepEqual(deciderInscriptionSurDemande(libre(), undefined, "admin", true), { ok: true, fixer: null });
  assert.equal(deciderInscriptionSurDemande(libre(), "poney-game", "famA", false).ok, false);
});

test("créneau privatisé : une autre famille ne peut pas réserver, la fratrie si", () => {
  const fixe = { ...libre(), ...champsFixationFormule(libre(), cours, "famA", "x"), enrolled: [{ familyId: "famA" }] } as any;
  assert.equal(formuleDuCreneau(fixe)?.id, "cours-particulier");
  assert.deepEqual(deciderInscriptionSurDemande(fixe, "cours-particulier", "famB", false), { ok: false, code: "prive", formule: cours });
  assert.equal(privatisePourAutreFamille(fixe, "famB"), true);
  assert.equal(privatisePourAutreFamille(fixe, "famA"), false);
  assert.deepEqual(deciderInscriptionSurDemande(fixe, "cours-particulier", "famA", false), { ok: true, fixer: null });
  assert.deepEqual(deciderInscriptionSurDemande(fixe, undefined, "famA", false), { ok: true, fixer: null }, "le frère n'a pas à redéclarer la formule");
  assert.equal(deciderInscriptionSurDemande(fixe, "anniversaire", "famA", false).ok, false, "pas de changement de formule en route");
});

test("prix : anniversaire au forfait (une fois par famille), cours particulier par cavalier", () => {
  const a = creneauAvecFormule(libre(), anniv), c = creneauAvecFormule(libre(), cours);
  assert.equal(prixInscriptionCavalier(a, 0), 180);
  assert.equal(prixInscriptionCavalier(a, 1), 0, "le 2e enfant de la famille ne repaie pas l'anniversaire");
  assert.equal(prixInscriptionCavalier(c, 0), 45);
  assert.equal(prixInscriptionCavalier(c, 1), 45, "chaque cavalier du cours particulier paie");
});

test("créneau vidé : il redevient « sur demande » avec titre, prix et places d'origine", () => {
  const fixe = { ...libre(), ...champsFixationFormule(libre(), anniv, "famA", "x") } as any;
  assert.deepEqual(champsSurDemandeApresRetrait(fixe, []), { formuleChoisie: null, formuleFamilyId: null, activityTitle: "Créneau sur demande", priceTTC: 0, maxPlaces: 3, tarifForfaitaire: false });
  assert.deepEqual(champsSurDemandeApresRetrait(fixe, [{}]), {}, "il reste quelqu'un : rien ne change");
  assert.deepEqual(champsSurDemandeApresRetrait({ ...fixe, formuleForcee: true }, []), { formuleFamilyId: null }, "formule fixée par l'admin : seule la famille est libérée");
  assert.deepEqual(champsSurDemandeApresRetrait({ activityTitle: "Cours", enrolled: [] }, []), {}, "créneau ordinaire : rien");
});

test("formule fixée par l'admin sans famille : la première famille la prend et privatise", () => {
  const force = { ...libre(), formuleChoisie: "anniversaire" as const, formuleForcee: true };
  assert.deepEqual(deciderInscriptionSurDemande(force, undefined, "famA", false), { ok: true, fixer: { formule: anniv, familyId: "famA" } });
});

test("saisie admin nettoyée ; places du créneau libre = la plus grande formule", () => {
  const f = nettoyerFormules([{ id: "anniversaire", label: " ", priceTTC: "180,5", places: "0", forfait: true }, { id: "autre", priceTTC: 10 }]);
  assert.deepEqual(f, [{ id: "anniversaire", label: "Anniversaire", priceTTC: 180.5, places: 1, forfait: true, descriptif: "" }]);
  assert.equal(placesSurDemande([anniv, cours]), 3);
});

test("admin : formule fixée par le club, puis rendue au choix des familles", () => {
  const force = champsEditionSurDemande(libre(), [anniv, cours], "cours-particulier", "t");
  assert.equal(force.formuleForcee, true);
  assert.equal(force.formuleChoisie, "cours-particulier");
  assert.equal(force.activityTitle, "Cours particulier");
  assert.equal(force.formuleFamilyId, undefined, "pas encore de famille");
  const fixeAdmin = { ...libre(), ...force } as any;
  const rendu = champsEditionSurDemande(fixeAdmin, [anniv, cours], "", "t");
  assert.equal(rendu.formuleForcee, false);
  assert.equal(rendu.formuleChoisie, null, "personne d'inscrit : le créneau redevient libre");
  assert.equal(rendu.activityTitle, "Créneau sur demande");
  assert.equal(champsEditionSurDemande(libre(), [anniv, cours], "", "t").maxPlaces, 3);
});

test("formule fixée par le club, famille inscrite au planning : une autre famille ne peut pas la rejoindre", () => {
  const c = { ...libre(), formuleChoisie: "anniversaire" as const, formuleForcee: true, enrolled: [{ familyId: "famX" }] };
  assert.equal(deciderInscriptionSurDemande(c, undefined, "famB", false).ok, false);
  assert.equal(privatisePourAutreFamille(c, "famB"), true);
  assert.equal(privatisePourAutreFamille(c, "famX"), false);
});

test("planning : le club choisit la formule depuis le panneau, et peut revenir au choix tant que personne n'est inscrit", () => {
  const champs = champsChoixFormuleAdmin(libre(), "anniversaire", "t")!;
  assert.equal(champs.activityTitle, "Anniversaire");
  assert.equal(champs.priceTTC, 180);
  assert.equal(champs.formuleFamilyId, undefined, "la famille sera celle que le club inscrit");
  assert.equal(champs.formuleForcee, undefined, "pas forcée : le créneau vidé redevient libre");
  assert.equal(champsChoixFormuleAdmin(libre(), "poney-game", "t"), null);
  assert.equal(champsChoixFormuleAdmin({ activityTitle: "Cours" }, "anniversaire", "t"), null);
  const fixe = { ...libre(), ...champs } as any;
  const retour = champsRetourAuChoix(fixe)!;
  assert.equal(retour.activityTitle, "Créneau sur demande");
  assert.equal(retour.formuleChoisie, null);
  assert.equal(champsRetourAuChoix({ ...fixe, enrolled: [{ familyId: "famA" }] }), null, "déjà un inscrit : on ne change plus");
  const force = { ...libre(), ...champsEditionSurDemande(libre(), [anniv, cours], "cours-particulier", "t") } as any;
  assert.equal(champsRetourAuChoix(force)!.formuleForcee, false);
  assert.equal(champsRetourAuChoix(force)!.formuleChoisie, null);
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
