/**
 * Une ligne du relevé n'encaisse qu'une fois (cas GAGNARD, 11/2026).
 */
import assert from "node:assert/strict";
import { ligneDejaEncaissee, lignesEncaisseesPlusieursFois, ecrituresDeLaLigne } from "../../src/lib/ligne-bancaire-unique";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e) { console.error(`  ❌ ${nom}`); console.error(e); process.exitCode = 1; }
}

const CLE = "30/09/2026|Virement en votre faveur M OU MME TUDAL GAGNARD C08V26273 - Reglement GAGNARD Ly|69.90";
const s = (j: string) => ({ seconds: Math.floor(Date.parse(`${j}T12:00:00Z`) / 1000) });
const e3 = { id: "a", paymentId: "ech3", familyName: "GAGNARD Emilie", montant: 69.9, bankLineKey: CLE, date: s("2026-09-30") };
const e2 = { id: "b", paymentId: "ech2", familyName: "GAGNARD Emilie", montant: 69.9, bankLineKey: CLE, date: s("2026-09-30") };
const e10 = { id: "c", paymentId: "ech10", familyName: "GAGNARD Emilie", montant: 69.9, bankLineKey: CLE, date: s("2026-09-30") };

test("une ligne déjà encaissée est reconnue, sur n'importe quelle commande", () => {
  assert.equal(ligneDejaEncaissee(CLE, [e3])?.paymentId, "ech3");
  assert.equal(ligneDejaEncaissee("autre", [e3]), null);
  assert.equal(ligneDejaEncaissee("", [e3]), null);
});

test("une écriture contre-passée ne compte plus : la ligne redevient libre", () => {
  const annul = { id: "z", paymentId: "ech3", montant: -69.9, correctionDe: "a", bankLineKey: null };
  assert.equal(ligneDejaEncaissee(CLE, [e3, annul]), null);
});

test("GAGNARD : la ligne encaissée trois fois est signalée, la première écriture en tête", () => {
  const r = lignesEncaisseesPlusieursFois<any>([e3, e2, e10, { id: "x", montant: 50, bankLineKey: "seule" }]);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].ecritures.map((e) => e.paymentId), ["ech3", "ech2", "ech10"]);
  const corrige = [e3, e2, e10, { id: "y", montant: -69.9, correctionDe: "b" }, { id: "w", montant: -69.9, correctionDe: "c" }];
  assert.equal(lignesEncaisseesPlusieursFois(corrige).length, 0);
  assert.equal(ecrituresDeLaLigne(CLE, corrige).length, 1);
});

if (process.exitCode) { console.error("❌ échec"); } else console.log(`✅ ${passes} tests passés`);
