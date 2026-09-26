import assert from "node:assert/strict";
import { annulerDebitCarte, debitAnnulable, seancesUtilisees } from "../../src/lib/carte-annulation-debit";

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

const maintenant = "2026-09-26T15:00:00.000Z";
// La carte de la capture : 5 séances, un absent tracé, un débit sur un créneau fantôme.
const carte = () => ({
  totalSessions: 5, usedSessions: 1, remainingSessions: 4,
  history: [
    { activityTitle: "Adultes G1 à G4", creneauId: "c-sam", childName: "Justine", presence: "absent", date: "2026-09-26T12:00:00Z" },
    { activityTitle: "Adultes G1 à G4", creneauId: "c-sam", childName: "Justine", presence: "present", date: "2026-09-26T12:00:00Z" },
  ],
});

test("le débit du créneau fantôme est annulé : +1 séance, ligne barrée, recrédit tracé", () => {
  const r = annulerDebitCarte(carte(), 1, { motif: "débit par erreur", maintenant });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.maj.remainingSessions, 5);
  assert.equal(r.maj.usedSessions, 0);
  assert.equal(r.maj.status, "active");
  assert.equal(r.maj.history.length, 3);
  assert.equal(r.maj.history[1].annule, true);
  assert.equal(r.maj.history[1].motifAnnulation, "débit par erreur");
  assert.equal(r.maj.history[2].credit, true);
  assert.equal(r.maj.history[2].creneauId, "c-sam");
  assert.equal(seancesUtilisees(r.maj.history), 0);
});

test("le montoir ne redébite pas après annulation : la ligne d'origine reste (non recrédit, même créneau)", () => {
  const r = annulerDebitCarte(carte(), 1, { motif: "", maintenant });
  assert.ok(r.ok);
  if (!r.ok) return;
  // Même test que l'anti-doublon de la clôture du montoir.
  assert.ok(r.maj.history.some(h => h.creneauId === "c-sam" && !h.credit && h.childName === "Justine"));
});

test("absence, recrédit ou débit déjà annulé : refusé", () => {
  assert.equal(annulerDebitCarte(carte(), 0, { motif: "", maintenant }).ok, false);
  const r = annulerDebitCarte(carte(), 1, { motif: "", maintenant });
  assert.ok(r.ok);
  if (!r.ok) return;
  const apres = { totalSessions: 5, usedSessions: 0, remainingSessions: 5, history: r.maj.history };
  assert.equal(annulerDebitCarte(apres, 1, { motif: "", maintenant }).ok, false); // déjà annulé
  assert.equal(annulerDebitCarte(apres, 2, { motif: "", maintenant }).ok, false); // recrédit
  assert.equal(annulerDebitCarte(apres, 9, { motif: "", maintenant }).ok, false); // introuvable
});

test("jamais plus de séances que la carte n'en compte", () => {
  const pleine = { totalSessions: 5, usedSessions: 0, remainingSessions: 5, history: [{ activityTitle: "Séance" }] };
  assert.equal(annulerDebitCarte(pleine, 0, { motif: "", maintenant }).ok, false);
});

test("débit manuel (bouton Débiter, sans présence) : annulable", () => {
  assert.equal(debitAnnulable({ activityTitle: "Séance", date: "2026-09-26" }), true);
  assert.equal(debitAnnulable({ credit: true }), false);
  assert.equal(debitAnnulable({ presence: "absent" }), false);
});

console.log(`\n✅ ${passes} tests passés\n`);
