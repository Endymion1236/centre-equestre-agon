/**
 * tests/unit/resend-webhook.test.ts — l'email du lien est-il arrivé ?
 *   npx tsx tests/unit/resend-webhook.test.ts
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { lireEvenementResend, statutSuivant, verifierSignatureResend } from "../../src/lib/resend-webhook";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const cle = Buffer.from("cle-de-test-du-webhook-resend-32o");
const secret = `whsec_${cle.toString("base64")}`;
const maintenant = new Date("2026-09-25T10:00:00Z");
const ts = String(Math.floor(maintenant.getTime() / 1000));
const corps = JSON.stringify({ type: "email.bounced", data: { email_id: "e1", to: ["mauvaise@adresse.fr"] } });
const signer = (c: string, t = ts) => `v1,${createHmac("sha256", cle).update(`msg_1.${t}.${c}`).digest("base64")}`;

test("signature Svix valide acceptée, y compris parmi plusieurs signatures", () => {
  assert.equal(verifierSignatureResend({ id: "msg_1", timestamp: ts, signatures: signer(corps), corps, secret, maintenant }), true);
  assert.equal(verifierSignatureResend({ id: "msg_1", timestamp: ts, signatures: `v1,AAAA ${signer(corps)}`, corps, secret, maintenant }), true);
});

test("corps modifié, mauvais secret, horodatage périmé ou en-têtes absents : refusé", () => {
  assert.equal(verifierSignatureResend({ id: "msg_1", timestamp: ts, signatures: signer(corps), corps: corps + " ", secret, maintenant }), false);
  assert.equal(verifierSignatureResend({ id: "msg_1", timestamp: ts, signatures: signer(corps), corps, secret: "whsec_" + Buffer.from("autre").toString("base64"), maintenant }), false);
  const vieux = String(Number(ts) - 3600);
  assert.equal(verifierSignatureResend({ id: "msg_1", timestamp: vieux, signatures: signer(corps, vieux), corps, secret, maintenant }), false);
  assert.equal(verifierSignatureResend({ id: null, timestamp: ts, signatures: signer(corps), corps, secret, maintenant }), false);
});

test("un rejet définitif se lit « adresse invalide »", () => {
  const e = lireEvenementResend({ type: "email.bounced", data: { email_id: "e1", to: ["x@y.fr"], bounce: { type: "Permanent", message: "550 5.1.1 user unknown" } } })!;
  assert.equal(e.statut, "bounced");
  assert.match(e.raison, /Adresse invalide/);
  assert.match(e.raison, /user unknown/);
  assert.deepEqual(e.destinataires, ["x@y.fr"]);
});

test("remis, ouvert, retardé, spam ; un type inconnu est ignoré", () => {
  assert.equal(lireEvenementResend({ type: "email.delivered", data: { email_id: "e" } })!.statut, "delivered");
  assert.equal(lireEvenementResend({ type: "email.opened", data: { email_id: "e" } })!.statut, "opened");
  assert.match(lireEvenementResend({ type: "email.delivery_delayed", data: { email_id: "e" } })!.raison, /retardée/);
  assert.match(lireEvenementResend({ type: "email.complained", data: { email_id: "e" } })!.raison, /indésirable/);
  assert.equal(lireEvenementResend({ type: "email.sent", data: { email_id: "e" } }), null);
  assert.equal(lireEvenementResend({ type: "email.delivered", data: {} }), null);
});

test("les événements dans le désordre ne font pas revenir en arrière", () => {
  assert.equal(statutSuivant("opened", "delivered"), "opened");
  assert.equal(statutSuivant("delivered", "opened"), "opened");
  assert.equal(statutSuivant("delayed", "bounced"), "bounced");
  assert.equal(statutSuivant(undefined, "delivered"), "delivered");
  assert.equal(statutSuivant("bounced", "delivered"), "bounced");
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
