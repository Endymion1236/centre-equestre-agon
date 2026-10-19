/**
 * tests/unit/boite-suivi.test.ts — un mail déjà répondu par un collègue se voit.
 *   npx tsx tests/unit/boite-suivi.test.ts
 */
import assert from "node:assert/strict";
import { etatSuivi, nomAdmin } from "../../src/lib/boite-suivi";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };
const recu = "Mon, 19 Oct 2026 09:00:00 +0200";
const maintenant = new Date("2026-10-19T10:00:00+02:00");

test("répondu après réception : « répondu par »", () => {
  assert.deepEqual(etatSuivi(recu, { repondu: { le: "2026-10-19T07:30:00Z", par: "Emeline" } }, maintenant), { etat: "repondu", par: "Emeline", le: "2026-10-19T07:30:00Z" });
});
test("la famille réécrit après la réponse : à traiter, avec rappel de la réponse précédente", () => {
  const r = etatSuivi("Mon, 19 Oct 2026 11:00:00 +0200", { repondu: { le: "2026-10-19T07:30:00Z", par: "Emeline" } }, maintenant);
  assert.equal(r.etat, "a-traiter");
  assert.equal(r.relance, true);
});
test("assistant lancé par un collègue il y a moins de 2 h : en cours ; plus vieux : oublié", () => {
  assert.equal(etatSuivi(recu, { enCours: { le: "2026-10-19T07:45:00Z", par: "Nicolas" } }, maintenant).etat, "en-cours");
  assert.equal(etatSuivi(recu, { enCours: { le: "2026-10-19T07:45:00Z", par: "Nicolas" } }, new Date("2026-10-19T13:00:00+02:00")).etat, "a-traiter");
});
test("sans suivi : à traiter ; nom court de l'administrateur", () => {
  assert.deepEqual(etatSuivi(recu, null, maintenant), { etat: "a-traiter" });
  assert.equal(nomAdmin({ name: "Emeline Dupont", email: "e@x.fr" }), "Emeline");
  assert.equal(nomAdmin({ email: "ceagon50@gmail.com" }), "ceagon50");
});
console.log(`✅ ${n} tests passés`);
