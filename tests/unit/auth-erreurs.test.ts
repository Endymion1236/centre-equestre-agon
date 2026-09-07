import assert from "node:assert/strict";
import {
  DELAI_RENVOI_MS,
  ErreurConnexion,
  codeConnexionFournisseur,
  codeEnvoiConfirmation,
  messageConfirmationAdresse,
  messageConnexionFournisseur,
  messageEnvoiConfirmation,
  secondesAvantRenvoi,
} from "../../src/lib/auth-erreurs";

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

const fb = (code: string) => Object.assign(new Error(code), { code });

console.log("\n── Envoi du lien de confirmation ──");

test("les codes Firebase sont regroupés en causes lisibles", () => {
  assert.equal(codeEnvoiConfirmation(fb("auth/too-many-requests")), "trop-de-demandes");
  assert.equal(codeEnvoiConfirmation(fb("auth/quota-exceeded")), "trop-de-demandes");
  assert.equal(codeEnvoiConfirmation(fb("auth/network-request-failed")), "reseau");
  assert.equal(codeEnvoiConfirmation(fb("auth/user-token-expired")), "session-expiree");
  assert.equal(codeEnvoiConfirmation(fb("auth/requires-recent-login")), "session-expiree");
  assert.equal(codeEnvoiConfirmation(fb("auth/operation-not-allowed")), "indisponible");
  assert.equal(codeEnvoiConfirmation(fb("auth/unauthorized-continue-uri")), "indisponible");
  assert.equal(codeEnvoiConfirmation(fb("auth/internal-error")), "indisponible");
  assert.equal(codeEnvoiConfirmation(new Error("boom")), "inconnue");
  assert.equal(codeEnvoiConfirmation(null), "inconnue");
});

test("chaque cause a un message français distinct", () => {
  const codes = ["trop-de-demandes", "reseau", "session-expiree", "indisponible", "aucun-compte", "trop-tot", "inconnue"] as const;
  const messages = new Set(codes.map((c) => messageEnvoiConfirmation(c, 12)));
  assert.equal(messages.size, codes.length);
  assert.match(messageEnvoiConfirmation("trop-tot", 12), /12 s/);
  assert.match(messageEnvoiConfirmation("trop-tot", 0), /1 s/);
  assert.match(messageEnvoiConfirmation("reseau"), /Réseau/);
});

test("temporisation : 60 s après un envoi réussi, rien après un échec", () => {
  const t0 = 1_000_000;
  assert.equal(secondesAvantRenvoi(null, t0), 0);
  assert.equal(secondesAvantRenvoi(t0, t0), 60);
  assert.equal(secondesAvantRenvoi(t0, t0 + 59_100), 1);
  assert.equal(secondesAvantRenvoi(t0, t0 + DELAI_RENVOI_MS), 0);
  assert.equal(secondesAvantRenvoi(t0, t0 + 120_000), 0);
});

console.log("\n── Connexion Google / Facebook ──");

test("popup bloquée, annulation, domaine, conflit et réseau sont distingués", () => {
  assert.equal(codeConnexionFournisseur(fb("auth/popup-blocked")), "popup-bloquee");
  assert.equal(codeConnexionFournisseur(fb("auth/popup-closed-by-user")), "annulee");
  assert.equal(codeConnexionFournisseur(fb("auth/cancelled-popup-request")), "annulee");
  assert.equal(codeConnexionFournisseur(fb("auth/unauthorized-domain")), "domaine-non-autorise");
  assert.equal(codeConnexionFournisseur(fb("auth/account-exists-with-different-credential")), "conflit-identifiants");
  assert.equal(codeConnexionFournisseur(fb("auth/network-request-failed")), "reseau");
  assert.equal(codeConnexionFournisseur(fb("auth/user-disabled")), "compte-desactive");
  assert.equal(codeConnexionFournisseur({}), "inconnue");
});

test("ErreurConnexion porte le code, le fournisseur et un message affichable", () => {
  const e = new ErreurConnexion(fb("auth/popup-blocked"), "google");
  assert.ok(e instanceof Error);
  assert.equal(e.code, "popup-bloquee");
  assert.equal(e.fournisseur, "google");
  assert.equal(e.codeFirebase, "auth/popup-blocked");
  assert.match(e.message, /Google/);
  assert.match(e.message, /fenêtre/);
  assert.match(new ErreurConnexion(fb("auth/unauthorized-domain"), "facebook").message, /Facebook/);
});

test("les messages ne prétendent jamais un succès", () => {
  for (const code of ["popup-bloquee", "annulee", "domaine-non-autorise", "conflit-identifiants", "reseau", "compte-desactive", "inconnue"] as const) {
    const m = messageConnexionFournisseur(code, "google");
    assert.ok(m.length > 20);
    assert.doesNotMatch(m, /connecté\b|réussi/i);
  }
});

console.log("\n── Rattachement après confirmation ──");

test("les issues de « J'ai confirmé mon adresse » ont chacune un message", () => {
  const codes = ["aucun-compte", "toujours-non-verifiee", "reseau", "inconnue"] as const;
  assert.equal(new Set(codes.map(messageConfirmationAdresse)).size, codes.length);
  assert.match(messageConfirmationAdresse("toujours-non-verifiee"), /indésirables/);
});

console.log(`\n${passes} réussite(s)\n`);
