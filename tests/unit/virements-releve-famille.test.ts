/**
 * Virements d'une famille : relevé contre journal (cas GAGNARD, 11/2026).
 */
import assert from "node:assert/strict";
import { comparerVirements, libelleDeLaFamille, motsDuNom } from "../../src/lib/virements-releve-famille";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e) { console.error(`  ❌ ${nom}`); console.error(e); process.exitCode = 1; }
}

const LIB = "Virement en votre faveur M OU MME TUDAL GAGNARD C08V26273 - Reglement GAGNARD Ly";
const ligne = (dateIso: string, amount: number, label = LIB) => ({ dateIso, date: dateIso.split("-").reverse().join("/"), label, amount, cle: `${dateIso}|${label}|${amount.toFixed(2)}` });
const ecr = (id: string, montant: number, dateIso: string, extra: any = {}) => ({ id, montant, dateIso, mode: "virement", ...extra });

test("les mots du nom : le NOM en majuscules, pas le prénom", () => {
  assert.deepEqual(motsDuNom(["GAGNARD Emilie"], ["Lya GAGNARD"]), ["GAGNARD"]);
  assert.deepEqual(motsDuNom(["Martin Paul"]), ["MARTIN", "PAUL"]);
  assert.equal(libelleDeLaFamille(LIB, ["GAGNARD"]), true);
  assert.equal(libelleDeLaFamille("VIR SEPA GAGNARDIERE SARL", ["GAGNARD"]), false);
  assert.equal(libelleDeLaFamille("Virement M. Gagnard", ["GAGNARD"]), true);
});

test("GAGNARD : un virement, trois écritures, deux en trop", () => {
  const l = ligne("2026-09-30", 69.9);
  const r = comparerVirements([l], [
    ecr("a", 69.9, "2026-09-30", { bankLineKey: l.cle, invoiceNumber: "F-2026-0237" }),
    ecr("b", 69.9, "2026-09-30", { bankLineKey: l.cle, invoiceNumber: "F-2026-0298" }),
    ecr("c", 69.9, "2026-09-30", { bankLineKey: l.cle, invoiceNumber: "F-2026-0299" }),
  ], ["2026-09", "2026-10"]);
  assert.equal(r.virements.length, 1);
  assert.equal(r.virements[0].ecritures.length, 3);
  assert.equal(r.virements[0].enTrop, 2);
  assert.equal(r.sansVirement.length, 0);
});

test("un virement de 209,70 € pour trois échéances n'est pas un doublon", () => {
  const l = ligne("2026-09-30", 209.7);
  const r = comparerVirements([l], ["a", "b", "c"].map((id) => ecr(id, 69.9, "2026-09-30", { bankLineKey: l.cle })), ["2026-09"]);
  assert.equal(r.virements[0].enTrop, 0);
});

test("saisie à la main (bouton Vir) : rattachée par montant et date, sinon signalée", () => {
  const l = ligne("2026-10-02", 69.9);
  const r = comparerVirements([l], [
    ecr("m1", 69.9, "2026-09-30"),
    ecr("m2", 69.9, "2026-10-30"),
    ecr("m3", 69.9, "2026-12-30"),
    ecr("annulee", 69.9, "2026-10-05"), ecr("contre", -69.9, "2026-11-03", { correctionDe: "annulee" }),
    ecr("cb", 69.9, "2026-10-02", { mode: "cb_terminal" }),
  ], ["2026-09", "2026-10"]);
  assert.deepEqual(r.virements[0].ecritures.map((e) => e.id), ["m1"]);
  assert.deepEqual(r.sansVirement.map((e) => [e.id, e.moisImporte]), [["m2", true], ["m3", false]]);
});

test("BARBEY : deux écritures au 12/10 pour un seul virement, et un virement du 03/11 rattaché à rien", () => {
  const l1 = ligne("2026-10-12", 80, "Virement en votre faveur Equitation Manon barbey M.");
  const l2 = ligne("2026-11-03", 80, "Virement en votre faveur Barbey Manon M. BARBEY PAS");
  const r = comparerVirements([l1, l2], [
    ecr("rappro", 80, "2026-10-12", { bankLineKey: l1.cle, paymentId: "GjvYSY" }),
    ecr("main", 80, "2026-10-12", { paymentId: "GjvYSY" }),
  ], ["2026-09", "2026-10", "2026-11"]);
  assert.equal(r.virements[0].ecritures.length, 1);
  assert.equal(r.virements[1].ecritures.length, 0);
  assert.equal(r.sansVirement.length, 1);
  assert.equal(r.sansVirement[0].virementDejaPris?.date, "12/10/2026");
  assert.equal(r.sansVirement[0].virementLibre?.date, "03/11/2026");
});

if (process.exitCode) { console.error("❌ échec"); } else console.log(`✅ ${passes} tests passés`);
