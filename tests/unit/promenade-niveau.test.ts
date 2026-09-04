/**
 * tests/unit/promenade-niveau.test.ts
 *
 * Promenade au niveau fixé par la première inscription (décision de
 * septembre 2026) : un seul créneau « Promenade du dimanche », le premier
 * inscrit verrouille le niveau, les suivants doivent être du même niveau,
 * le créneau vidé redevient à définir.
 *   npx tsx tests/unit/promenade-niveau.test.ts
 */
import assert from "node:assert/strict";
import {
  deciderInscriptionNiveau, champsNiveauApresRetrait, titreAvecNiveau,
  libelleNiveauCreneau, niveauDuCreneau, compatibiliteCavalier,
} from "../../src/lib/promenade-niveau";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const dimanche = (o: any = {}) => ({ activityTitle: "Promenade du dimanche", activityType: "balade", niveauADefinir: true, niveauFixe: null, enrolled: [], ...o });

console.log("\n── Verrou du niveau ──");

test("créneau vide : la première famille fixe le niveau qu'elle déclare", () => {
  const d = deciderInscriptionNiveau(dimanche(), "debrouille", false);
  assert.deepEqual(d, { ok: true, fixer: "debrouille" });
});

test("créneau vide sans niveau déclaré : refus « niveau requis » pour une famille", () => {
  const d = deciderInscriptionNiveau(dimanche(), undefined, false);
  assert.equal(d.ok, false);
  assert.equal((d as any).code, "niveau_requis");
});

test("le personnel peut inscrire sans déclarer : il n'impose aucun niveau", () => {
  assert.deepEqual(deciderInscriptionNiveau(dimanche(), undefined, true), { ok: true, fixer: null });
});

test("niveau verrouillé : même niveau accepté, autre niveau refusé", () => {
  const verrouille = dimanche({ niveauFixe: "debrouille", enrolled: [{ childId: "a" }] });
  assert.deepEqual(deciderInscriptionNiveau(verrouille, "debrouille", false), { ok: true, fixer: null });
  const refus = deciderInscriptionNiveau(verrouille, "confirme", false);
  assert.equal(refus.ok, false);
  assert.equal((refus as any).code, "niveau_different");
  assert.equal((refus as any).niveauFixe, "debrouille");
});

test("un niveau verrouillé sans plus aucun inscrit ne compte plus : le suivant fixe le sien", () => {
  const vide = dimanche({ niveauFixe: "confirme", enrolled: [] });
  assert.deepEqual(deciderInscriptionNiveau(vide, "debutant", false), { ok: true, fixer: "debutant" });
});

test("une promenade classique (niveau dans le titre) n'est pas concernée", () => {
  const classique = { activityTitle: "Promenade débrouillés", activityType: "balade", enrolled: [] };
  assert.deepEqual(deciderInscriptionNiveau(classique, undefined, false), { ok: true, fixer: null });
  assert.equal(niveauDuCreneau(classique), "debrouille");
  assert.equal(titreAvecNiveau(classique), "Promenade débrouillés");
});

console.log("\n── Déverrouillage ──");

test("le créneau vidé redevient à définir", () => {
  assert.deepEqual(champsNiveauApresRetrait(dimanche({ niveauFixe: "debutant" }), []), { niveauFixe: null });
});

test("il reste des inscrits : le niveau tient", () => {
  assert.deepEqual(champsNiveauApresRetrait(dimanche({ niveauFixe: "debutant" }), [{ childId: "b" }]), {});
});

test("rien à écrire sur un créneau ordinaire", () => {
  assert.deepEqual(champsNiveauApresRetrait({ activityTitle: "Cours", activityType: "cours" }, []), {});
});

console.log("\n── Affichage ──");

test("titre et libellé avant et après verrouillage", () => {
  assert.equal(titreAvecNiveau(dimanche()), "Promenade du dimanche — niveau à définir");
  assert.equal(libelleNiveauCreneau(dimanche()), "Niveau fixé par la première inscription");
  const v = dimanche({ niveauFixe: "confirme", enrolled: [{}] });
  assert.equal(titreAvecNiveau(v), "Promenade du dimanche — Confirmés");
  assert.equal(libelleNiveauCreneau(v), "Confirmés");
});

console.log("\n── Compatibilité du cavalier ──");

const naissance = (age: number) => { const d = new Date(); d.setFullYear(d.getFullYear() - age); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };

test("trop jeune pour des confirmés (13 ans minimum)", () => {
  const r = compatibiliteCavalier("confirme", { birthDate: naissance(12), galopLevel: "4" });
  assert.equal(r.ok, false);
  assert.match(r.raison, /13 ans/);
});

test("galop connu trop bas : refusé, avec la piste de l'évaluation pour débrouillés", () => {
  const r = compatibiliteCavalier("debrouille", { birthDate: naissance(14), galopLevel: "1" });
  assert.equal(r.ok, false);
  assert.match(r.raison, /évaluation/);
});

test("galop inconnu : l'âge suffit, l'équipe vérifie au départ", () => {
  assert.equal(compatibiliteCavalier("confirme", { birthDate: naissance(15), galopLevel: "—" }).ok, true);
});

test("sans date de naissance : pas de réservation directe", () => {
  assert.equal(compatibiliteCavalier("debutant", { galopLevel: "2" }).ok, false);
});

console.log(`\n✅ ${passes} tests passés\n`);
