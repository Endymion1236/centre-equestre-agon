/**
 * Ordre de règlement des échéances (cas GAGNARD, 11/2026 : la 10/10 payée
 * à la place de la 1/10 depuis l'espace famille).
 */
import assert from "node:assert/strict";
import { echeancesAnterieuresDues, trierARegler, messageReglerDabord, estEcheanceDeSerie } from "../../src/lib/echeances-ordre";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e) { console.error(`  ❌ ${nom}`); console.error(e); process.exitCode = 1; }
}

const mois = ["2026-09-30", "2026-10-30", "2026-11-30", "2026-12-30", "2027-01-30", "2027-02-28", "2027-03-30", "2027-04-30", "2027-05-30", "2027-06-30"];
const serie = mois.map((d, i) => ({
  id: `e${i + 1}`, familyId: "gagnard", forfaitRef: "galop3-mer-1545", echeance: i + 1, echeancesTotal: 10,
  echeanceDate: d, status: "pending", totalTTC: 69.9, paidAmount: 0, cree: 1000 + i,
}));

test("la 10/10 ne se règle pas avant la 1/10", () => {
  const ant = echeancesAnterieuresDues(serie[9], serie);
  assert.equal(ant.length, 9);
  assert.equal(ant[0].echeance, 1);
  assert.match(messageReglerDabord(ant), /^Réglez d'abord l'échéance 1\/10 \(69,90 €\), puis les 8 suivantes encore dues\.$/);
});

test("la plus ancienne due n'attend rien ; payée, c'est la suivante qui passe", () => {
  assert.equal(echeancesAnterieuresDues(serie[0], serie).length, 0);
  const apres = serie.map((e) => e.echeance === 1 ? { ...e, status: "paid", paidAmount: 69.9 } : e);
  assert.equal(echeancesAnterieuresDues(apres[1], apres).length, 0);
  assert.equal(echeancesAnterieuresDues(apres[2], apres)[0].echeance, 2);
});

test("une autre série ou une commande ordinaire n'est pas concernée", () => {
  const autreForfait = { ...serie[0], id: "x1", forfaitRef: "galop2-sam" };
  assert.equal(echeancesAnterieuresDues(serie[1], [...serie.slice(1), autreForfait]).length, 0);
  const ordinaire = { id: "c1", familyId: "gagnard", totalTTC: 26, status: "pending" };
  assert.equal(estEcheanceDeSerie(ordinaire), false);
  assert.equal(echeancesAnterieuresDues(ordinaire, serie).length, 0);
  assert.equal(echeancesAnterieuresDues({ ...serie[3] }, serie.map((e) => e.echeance < 4 ? { ...e, status: "cancelled" } : e)).length, 0);
});

test("espace famille : la 1/10 en tête, même si toutes les commandes ont la même date de création", () => {
  const melange = [...serie].reverse();
  const tri = trierARegler(melange, () => 1_790_000_000);
  assert.deepEqual(tri.map((e) => e.echeance), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const stage = { id: "s1", familyId: "gagnard", totalTTC: 175, status: "pending" };
  const avecStage = trierARegler([stage, ...melange], (c: any) => c.id === "s1" ? Date.parse("2026-10-15T10:00:00Z") / 1000 : 1_790_000_000);
  assert.deepEqual(avecStage.slice(0, 3).map((c: any) => c.id), ["e1", "s1", "e2"]);
});

if (process.exitCode) { console.error("❌ échec"); } else console.log(`✅ ${passes} tests passés`);
