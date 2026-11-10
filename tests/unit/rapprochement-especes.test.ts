/**
 * tests/unit/rapprochement-especes.test.ts — versements d'espèces au rapprochement.
 *   npx tsx tests/unit/rapprochement-especes.test.ts
 */
import assert from "node:assert/strict";
import { bordereauxEspecesCandidats, estLigneVersementEspeces, versementManuelCorrespondant, versementsActifsParLigne } from "../../src/app/admin/comptabilite/rapprochement-utils";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };

test("ligne de versement d'espèces reconnue", () => {
  assert.ok(estLigneVersementEspeces("Versement d'espèces AGON COUTAINVILLE 09/11/26 15H33"));
  assert.ok(estLigneVersementEspeces("VERSEMENT ESP. AGON"));
  assert.ok(!estLigneVersementEspeces("Virement en votre faveur DE MR LE VAN"));
  assert.ok(!estLigneVersementEspeces("Remise CHQ 3 chèques"));
});

test("bordereaux d'espèces non pointés, le bon montant d'abord", () => {
  const j = (d: string) => ({ seconds: Date.parse(`${d}T12:00:00Z`) / 1000 });
  const remises = [
    { id: "a", paymentMode: "especes", total: 300, date: j("2026-11-02") },
    { id: "b", paymentMode: "especes", total: 1200, date: j("2026-11-08") },
    { id: "c", paymentMode: "cheque", total: 1200, date: j("2026-11-08") },
    { id: "d", paymentMode: "especes", total: 1200, date: j("2026-11-08"), pointee: true },
  ];
  const c = bordereauxEspecesCandidats(remises, { amount: 1200 }, new Date("2026-11-09T12:00:00Z"));
  assert.deepEqual(c.map((x) => x.remise.id), ["b", "a"]);
  assert.equal(c[0].ecartJours, 1);
});

test("dé-pointer annule le versement par contre-passation, sans rien effacer", () => {
  const k = "09/11/2026|Versement d'espèces|1200.00";
  assert.equal(versementsActifsParLigne([{ id: "v1", bankLineKey: k }]).get(k)?.id, "v1");
  const annule = [{ id: "v1", bankLineKey: k }, { id: "cp", bankLineKey: k, correctionDe: "v1" }];
  assert.equal(versementsActifsParLigne(annule).has(k), false);
  // Re-pointé ensuite : un nouveau versement redevient actif.
  assert.equal(versementsActifsParLigne([...annule, { id: "v2", bankLineKey: k }]).get(k)?.id, "v2");
});
test("versement déjà saisi à la main : retrouvé, jamais créé deux fois", () => {
  const sec = (iso: string) => ({ seconds: Date.parse(iso) / 1000 });
  const manuel = { id: "m", montant: -1200, date: sec("2026-11-09T12:00:00Z") };
  const ligne = { amount: 1200, date: new Date("2026-11-09T12:00:00Z") };
  assert.equal(versementManuelCorrespondant([manuel], ligne, new Set())?.id, "m");
  assert.equal(versementManuelCorrespondant([manuel], ligne, new Set(["m"])), null, "déjà pris par une autre ligne");
  assert.equal(versementManuelCorrespondant([manuel, { id: "x", montant: 1200, correctionDe: "m" }], ligne, new Set()), null, "annulé");
  assert.equal(versementManuelCorrespondant([{ ...manuel, date: sec("2026-10-20T12:00:00Z") }], ligne, new Set()), null, "trop loin");
  assert.equal(versementManuelCorrespondant([{ ...manuel, bankLineKey: "k" }], ligne, new Set()), null, "lié à une autre ligne");
  assert.equal(versementManuelCorrespondant([{ ...manuel, montant: -1100 }], ligne, new Set()), null, "autre montant");
});
console.log(`✅ ${n} tests passés`);
