/**
 * Import Drive : une panne doit nommer sa cause et le geste à faire.
 *
 * Le diagnostic est extrait de la route pour être vérifiable sans Firebase ni
 * Google. Le cas qui a motivé ce test : un jeton Google révoqué remontait en
 * « Import Drive impossible pour le moment », qui invite à réessayer alors
 * qu'il faut reconnecter le compte.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnosticImportDrive } from "../../src/lib/diagnostic-import-drive";

test("connexion Google à refaire : 409 et geste explicite", () => {
  for (const message of ["DRIVE_SCOPE_MANQUANT", "Gmail non connecté", "refresh 400: {\"error\":\"invalid_grant\"}", "drive list 401: token expired", "invalid_grant"]) {
    const d = diagnosticImportDrive(message);
    assert.ok(d, message);
    assert.equal(d.statut, 409, message);
    assert.match(d.erreur, /Reconnectez le compte Google/, message);
  }
});

test("dossier, droits, quota et stockage ont chacun leur message", () => {
  assert.equal(diagnosticImportDrive("drive list 403: forbidden")?.statut, 409);
  assert.match(diagnosticImportDrive("drive list 403: forbidden")!.erreur, /appartient bien au compte connecté/);
  assert.equal(diagnosticImportDrive("Dossier Drive introuvable ou non partagé avec le compte Google connecté.")?.statut, 404);
  assert.match(diagnosticImportDrive("Dossier Drive introuvable ou non partagé avec le compte Google connecté.")!.erreur, /introuvable/);
  assert.equal(diagnosticImportDrive("drive meta 404: not found")?.statut, 404);
  assert.equal(diagnosticImportDrive("drive list 429: rateLimitExceeded")?.statut, 429);
  assert.match(diagnosticImportDrive("drive list 429: rateLimitExceeded")!.erreur, /Attendez une minute/);
  assert.match(diagnosticImportDrive("bucket write failed")!.erreur, /stockage des pièces/);
});

test("une panne inconnue n'est pas maquillée : la route remontera son texte", () => {
  assert.equal(diagnosticImportDrive("ECONNRESET"), null);
  assert.equal(diagnosticImportDrive(""), null);
});

test("le message de reconnexion dit où aller, pas seulement qu'il y a un problème", () => {
  const d = diagnosticImportDrive("DRIVE_SCOPE_MANQUANT")!;
  assert.match(d.erreur, /Assistant boîte mail/);
  assert.match(d.erreur, /relancez l'import/);
});

test("API Drive désactivée dans le projet Google : cause nommée, geste précis", () => {
  const message = 'drive list 403: {"error":{"code":403,"message":"Google Drive API has not been used in project 785848912923 before or it is disabled.","errors":[{"reason":"accessNotConfigured"}]}}';
  const d = diagnosticImportDrive(message)!;
  assert.equal(d.statut, 409);
  assert.match(d.erreur, /API Google Drive n'est pas activée/);
  assert.match(d.erreur, /Bibliothèque/);
  assert.match(d.erreur, /partage du dossier n'y change rien/);
});

test("un 403 d'accès cite le motif renvoyé par Google", () => {
  const d = diagnosticImportDrive('drive list 403: {"error":{"code":403,"message":"The user does not have sufficient permissions for this file."}}')!;
  assert.equal(d.statut, 409);
  assert.match(d.erreur, /Motif renvoyé par Google : « The user does not have sufficient permissions/);
  // Sans corps JSON exploitable, le message reste utilisable tel quel.
  assert.doesNotMatch(diagnosticImportDrive("drive list 403: forbidden")!.erreur, /Motif renvoyé/);
});

test("un quota présenté en 403 reste un quota", () => {
  const d = diagnosticImportDrive('drive list 403: {"error":{"errors":[{"reason":"userRateLimitExceeded"}]}}')!;
  assert.equal(d.statut, 429);
  assert.match(d.erreur, /Attendez une minute/);
});
