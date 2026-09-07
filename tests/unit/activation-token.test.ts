/**
 * Lien magique « maison » : le lien prouve l'adresse.
 *
 * Régression du 07/09/2026 : un compte créé à l'envoi du lien
 * (emailVerified: false) restait non vérifié après la connexion par le lien,
 * et /api/famille/lier-compte refusait la reprise de la fiche pré-créée.
 *
 * Tout est simulé : aucun accès à Firebase, aucun réseau.
 */
import assert from "node:assert/strict";
import {
  verifierTokenActivation,
  type CompteAuth,
  type TokenRecord,
  type VerifierTokenDeps,
} from "../../src/lib/activation-token";

let passes = 0;
const echecs: string[] = [];
async function test(nom: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passes++;
    console.log(`  ✅ ${nom}`);
  } catch (e: any) {
    echecs.push(nom);
    console.error(`  ❌ ${nom}\n     ${e.message}`);
    process.exitCode = 1;
  }
}

const TOKEN = "a".repeat(64);
const NOW = Date.parse("2026-09-07T16:00:00Z");
const DANS_3_JOURS = new Date(NOW + 3 * 86_400_000).toISOString();

interface Journal {
  appels: string[];
  tokens: Record<string, TokenRecord>;
  comptes: Record<string, CompteAuth>;
  logs: unknown[];
}

function simulateur(opts: {
  token?: TokenRecord | null;
  compte?: CompteAuth | null;
  echecConfirmation?: Error;
  echecCustomToken?: Error;
}): { deps: VerifierTokenDeps; journal: Journal } {
  const journal: Journal = { appels: [], tokens: {}, comptes: {}, logs: [] };
  if (opts.token) journal.tokens[TOKEN] = { ...opts.token };
  if (opts.compte) journal.comptes[opts.compte.uid] = { ...opts.compte };
  const emailDuCompte = "famille@example.org";

  const deps: VerifierTokenDeps = {
    now: () => NOW,
    log: (m, d) => journal.logs.push([m, d]),
    lireToken: async (t) => {
      journal.appels.push("lireToken");
      return journal.tokens[t] ?? null;
    },
    marquerUtilise: async (t, usedAt) => {
      journal.appels.push("marquerUtilise");
      journal.tokens[t] = { ...journal.tokens[t], used: true, usedAt };
    },
    getUserByEmail: async (email) => {
      journal.appels.push(`getUserByEmail:${email}`);
      const c = Object.values(journal.comptes).find(() => email === emailDuCompte);
      if (!c) throw Object.assign(new Error("absent"), { code: "auth/user-not-found" });
      return { ...c };
    },
    createUser: async (email) => {
      journal.appels.push(`createUser:${email}`);
      const c = { uid: "uid-cree", emailVerified: true, disabled: false };
      journal.comptes[c.uid] = c;
      return c;
    },
    confirmerAdresse: async (uid) => {
      journal.appels.push(`confirmerAdresse:${uid}`);
      if (opts.echecConfirmation) throw opts.echecConfirmation;
      journal.comptes[uid] = { ...journal.comptes[uid], emailVerified: true };
    },
    createCustomToken: async (uid) => {
      journal.appels.push(`createCustomToken:${uid}`);
      if (opts.echecCustomToken) throw opts.echecCustomToken;
      return `custom-${uid}`;
    },
  };
  return { deps, journal };
}

const tokenValide: TokenRecord = { email: "famille@example.org", expiresAt: DANS_3_JOURS, used: false, usedAt: null };

(async () => {
  console.log("\n── Le lien confirme l'adresse ──");

  await test("compte existant non vérifié + lien valide : adresse confirmée AVANT le custom token", async () => {
    const { deps, journal } = simulateur({
      token: tokenValide,
      compte: { uid: "uid-astrid", emailVerified: false },
    });
    const r = await verifierTokenActivation(TOKEN, deps);
    assert.equal(r.ok, true, `résultat : ${JSON.stringify(r)}`);
    assert.equal(r.customToken, "custom-uid-astrid");
    assert.equal(journal.comptes["uid-astrid"].emailVerified, true, "le compte doit être vérifié");
    const iConfirm = journal.appels.indexOf("confirmerAdresse:uid-astrid");
    const iToken = journal.appels.indexOf("createCustomToken:uid-astrid");
    assert.ok(iConfirm >= 0, `confirmerAdresse jamais appelé : ${journal.appels.join(" → ")}`);
    assert.ok(iConfirm < iToken, "la confirmation doit précéder l'émission du custom token");
    assert.equal(journal.tokens[TOKEN].used, true);
    assert.equal(journal.tokens[TOKEN].usedAt, new Date(NOW).toISOString());
  });

  await test("compte déjà vérifié : même UID, pas de mise à jour du compte", async () => {
    const { deps, journal } = simulateur({
      token: tokenValide,
      compte: { uid: "uid-ok", emailVerified: true },
    });
    const r = await verifierTokenActivation(TOKEN, deps);
    assert.equal(r.ok, true);
    assert.equal(r.customToken, "custom-uid-ok");
    assert.ok(!journal.appels.some((a) => a.startsWith("confirmerAdresse")));
  });

  await test("compte absent : création déjà vérifiée, puis custom token", async () => {
    const { deps, journal } = simulateur({ token: tokenValide, compte: null });
    const r = await verifierTokenActivation(TOKEN, deps);
    assert.equal(r.ok, true);
    assert.equal(r.customToken, "custom-uid-cree");
    assert.deepEqual(
      journal.appels,
      ["lireToken", "getUserByEmail:famille@example.org", "createUser:famille@example.org", "marquerUtilise", "createCustomToken:uid-cree"],
    );
  });

  await test("le compte est résolu sur l'adresse du token, normalisée", async () => {
    const { deps, journal } = simulateur({
      token: { ...tokenValide, email: "  Famille@Example.org " },
      compte: { uid: "uid-ok", emailVerified: true },
    });
    const r = await verifierTokenActivation(TOKEN, deps);
    assert.equal(r.ok, true);
    assert.equal(r.email, "famille@example.org");
    assert.ok(journal.appels.includes("getUserByEmail:famille@example.org"));
  });

  console.log("\n── Aucun custom token quand la preuve ne tient pas ──");

  await test("échec de la confirmation : pas de custom token, token NON consommé, trace sans secret", async () => {
    const { deps, journal } = simulateur({
      token: tokenValide,
      compte: { uid: "uid-astrid", emailVerified: false },
      echecConfirmation: Object.assign(new Error("boom"), { code: "auth/internal-error" }),
    });
    const r = await verifierTokenActivation(TOKEN, deps);
    assert.deepEqual(r, { ok: false, error: "internal" });
    assert.ok(!journal.appels.some((a) => a.startsWith("createCustomToken")));
    assert.equal(journal.tokens[TOKEN].used, false, "le lien doit rester utilisable après l'incident");
    const trace = JSON.stringify(journal.logs);
    assert.ok(trace.includes("confirmerAdresse") && trace.includes("auth/internal-error"));
    assert.ok(!trace.includes(TOKEN), "le token ne doit jamais être journalisé");
  });

  await test("compte désactivé : refus explicite, rien n'est émis ni consommé", async () => {
    const { deps, journal } = simulateur({
      token: tokenValide,
      compte: { uid: "uid-off", emailVerified: false, disabled: true },
    });
    const r = await verifierTokenActivation(TOKEN, deps);
    assert.deepEqual(r, { ok: false, error: "disabled" });
    assert.ok(!journal.appels.some((a) => /confirmerAdresse|createCustomToken|marquerUtilise/.test(a)));
  });

  await test("échec de createCustomToken après marquage : erreur interne, rattrapable dans la grâce", async () => {
    const { deps, journal } = simulateur({
      token: tokenValide,
      compte: { uid: "uid-ok", emailVerified: true },
      echecCustomToken: Object.assign(new Error("quota"), { code: "auth/quota-exceeded" }),
    });
    const r = await verifierTokenActivation(TOKEN, deps);
    assert.deepEqual(r, { ok: false, error: "internal" });
    assert.equal(journal.tokens[TOKEN].used, true);
    // Rejeu immédiat (même instant, dans la fenêtre de grâce) : on retente.
    const { deps: deps2, journal: j2 } = simulateur({
      token: journal.tokens[TOKEN],
      compte: { uid: "uid-ok", emailVerified: true },
    });
    const r2 = await verifierTokenActivation(TOKEN, deps2);
    assert.equal(r2.ok, true);
    assert.ok(!j2.appels.includes("marquerUtilise"), "pas de second marquage dans la grâce");
  });

  console.log("\n── Le token d'abord : aucun appel Auth sans secret reconnu ──");

  for (const [nom, token, record, erreur] of [
    ["token absent", "", null, "not_found"],
    ["token trop court", "abc", null, "not_found"],
    ["token inconnu", TOKEN, null, "not_found"],
    ["token expiré", TOKEN, { ...tokenValide, expiresAt: new Date(NOW - 1000).toISOString() }, "expired"],
    ["token déjà utilisé hors grâce", TOKEN, { ...tokenValide, used: true, usedAt: new Date(NOW - 61_000).toISOString() }, "used"],
    ["token sans adresse", TOKEN, { ...tokenValide, email: "" }, "internal"],
  ] as const) {
    await test(`${nom} → ${erreur}, sans toucher au compte`, async () => {
      const { deps, journal } = simulateur({
        token: record,
        compte: { uid: "uid-astrid", emailVerified: false },
      });
      const r = await verifierTokenActivation(token as string, deps);
      assert.deepEqual(r, { ok: false, error: erreur });
      assert.ok(
        !journal.appels.some((a) => /getUserByEmail|createUser|confirmerAdresse|createCustomToken|marquerUtilise/.test(a)),
        `appels Auth interdits : ${journal.appels.join(", ")}`,
      );
      assert.equal(journal.comptes["uid-astrid"].emailVerified, false);
    });
  }

  await test("double-clic dans les 60 s : accepté, sans second marquage", async () => {
    const { deps, journal } = simulateur({
      token: { ...tokenValide, used: true, usedAt: new Date(NOW - 20_000).toISOString() },
      compte: { uid: "uid-astrid", emailVerified: false },
    });
    const r = await verifierTokenActivation(TOKEN, deps);
    assert.equal(r.ok, true);
    assert.ok(!journal.appels.includes("marquerUtilise"));
    assert.equal(journal.comptes["uid-astrid"].emailVerified, true);
  });

  console.log(`\n${passes} réussite(s), ${echecs.length} échec(s)\n`);
})();
