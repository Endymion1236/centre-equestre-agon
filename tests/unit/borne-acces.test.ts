/**
 * Qui peut faire parler la borne (src/lib/borne-acces.ts) : le personnel du
 * club, et le compte déclaré pour la tablette — personne d'autre.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { accesBorneAccorde, estCompteDeclare, nettoyerComptes, normaliserCompte } from "../../src/lib/borne-acces";

const famille = { estStaff: false, uid: "uid-famille", email: "parent@example.com" };

test("le personnel passe toujours, même sans compte déclaré", () => {
  assert.deepEqual(accesBorneAccorde({ estStaff: true, uid: "uid-admin", email: "gerant@club.fr", comptes: [] }), { ok: true, motif: "staff" });
  assert.deepEqual(accesBorneAccorde({ estStaff: true, uid: "uid-admin", comptes: ["borne@club.fr"], strict: true }).motif, "staff");
});

test("le compte déclaré passe, par son adresse (sans la casse) ou son identifiant", () => {
  const parMail = accesBorneAccorde({ estStaff: false, uid: "uid-borne", email: "Borne@Club.FR", comptes: [" borne@club.fr "], strict: true });
  assert.deepEqual(parMail, { ok: true, motif: "compte-borne" });
  const parUid = accesBorneAccorde({ estStaff: false, uid: "uid-borne", email: null, comptes: ["uid-borne"], strict: true });
  assert.equal(parUid.ok, true);
  assert.equal(accesBorneAccorde({ ...famille, comptes: ["borne@club.fr"], strict: true }).ok, false, "une famille reste dehors");
});

test("tant qu'aucun compte n'est déclaré : les routes ouvertes le restent, le tableau non", () => {
  assert.deepEqual(accesBorneAccorde({ ...famille, comptes: [] }), { ok: true, motif: "aucun-compte-declare" });
  assert.deepEqual(accesBorneAccorde({ ...famille, comptes: [], strict: true }), { ok: false, motif: "refuse" });
});

test("déclarer un compte referme la porte pour tous les autres", () => {
  assert.deepEqual(accesBorneAccorde({ ...famille, comptes: ["borne@club.fr"] }), { ok: false, motif: "refuse" });
});

test("saisie nettoyée : espaces, casse, doublons et lignes vides", () => {
  assert.deepEqual(nettoyerComptes([" Borne@Club.fr ", "borne@club.fr", "", "  ", "uid-borne"]), ["borne@club.fr", "uid-borne"]);
  assert.equal(normaliserCompte("  UID-Borne "), "UID-Borne", "un identifiant garde sa casse");
  assert.equal(estCompteDeclare("x", "autre@club.fr", ["borne@club.fr"]), false);
  assert.equal(estCompteDeclare("x", null, []), false);
});
