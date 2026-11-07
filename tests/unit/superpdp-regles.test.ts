/**
 * tests/unit/superpdp-regles.test.ts — réponses de Super PDP mises en forme.
 *   npx tsx tests/unit/superpdp-regles.test.ts
 */
import assert from "node:assert/strict";
import { dernierStatut, resumerFacture, variablesDuRole } from "../../src/lib/superpdp-regles";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };

test("facture reçue : sens, numéro, parties, montant (chaîne décimale de l'API)", () => {
  const r = resumerFacture({
    id: 42, direction: "in", created_at: "2026-11-07T10:00:00Z",
    en_invoice: { number: "F-0001", issue_date: "2026-11-06", seller: { name: "Tricatel" }, buyer: { name: "Burger Queen" }, totals: { total_with_vat: "120.00" } },
    events: [{ id: 2, status_text: "Mise à disposition" }, { id: 1, status_text: "Déposée" }],
  });
  assert.deepEqual(r, { id: 42, sens: "reçue", numero: "F-0001", date: "2026-11-06", vendeur: "Tricatel", acheteur: "Burger Queen", ttc: 120, statut: "Mise à disposition" });
});
test("facture pas encore traitée : pas d'en_invoice, pas d'événement", () => {
  const r = resumerFacture({ id: 7, direction: "out", external_id: "essai-1", created_at: "2026-11-07T10:00:00Z" });
  assert.equal(r.sens, "envoyée");
  assert.equal(r.numero, "essai-1");
  assert.equal(r.date, "2026-11-07");
  assert.equal(r.ttc, null);
  assert.equal(r.statut, "en cours de traitement");
  assert.equal(dernierStatut([{ id: 1, status_code: "fr:200" }]), "fr:200");
});
test("variables Vercel de chaque rôle", () => {
  assert.deepEqual(variablesDuRole("club"), { id: "SUPERPDP_CLIENT_ID", secret: "SUPERPDP_CLIENT_SECRET" });
  assert.equal(variablesDuRole("fournisseur").id, "SUPERPDP_FOURNISSEUR_CLIENT_ID");
});
console.log(`✅ ${n} tests passés`);
