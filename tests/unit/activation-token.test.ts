/**
 * Exécute le code serveur réel avec Auth et Firestore simulés : aucun compte,
 * aucun email et aucune base Firebase ne sont touchés par ces tests.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { randomBytes } from "node:crypto";
import ts from "typescript";

function charger(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const source = readFileSync(resolve(path), "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} as any };
  runInNewContext(outputText, {
    module, exports: module.exports, Date, ...globals,
    console: { error() {}, warn() {}, log() {} },
    require(name: string) {
      if (!(name in dependencies)) throw new Error(`Import non simulé : ${name}`);
      return dependencies[name];
    },
  }, { filename: path });
  return module.exports;
}

const token = "a".repeat(64);
type Options = {
  absent?: boolean; verified?: boolean; disabled?: boolean;
  missingToken?: boolean; tokenData?: Record<string, unknown>;
  updateFails?: boolean; mintFails?: boolean;
};

function fixture(opts: Options = {}) {
  let user: any = opts.absent ? null : {
    uid: "fixture-uid", email: "parent@example.test", emailVerified: !!opts.verified,
    disabled: !!opts.disabled, customClaims: { preserved: true },
  };
  const calls: string[] = [];
  const data: any = {
    email: "parent@example.test", expiresAt: new Date(Date.now() + 60_000).toISOString(),
    used: false, usedAt: null, ...opts.tokenData,
  };
  const ref = {
    get: async () => ({ exists: !opts.missingToken, data: () => data }),
    update: async (patch: any) => { calls.push("consume"); Object.assign(data, patch); },
    set: async (value: any) => { calls.push("store"); Object.assign(data, value); },
  };
  const adminAuth = {
    getUserByEmail: async (email: string) => {
      calls.push("lookup");
      assert.equal(email, "parent@example.test");
      if (!user) throw { code: "auth/user-not-found" };
      return user;
    },
    createUser: async (value: any) => {
      calls.push("create"); user = { uid: "fixture-uid", ...value }; return user;
    },
    updateUser: async (uid: string, patch: any) => {
      calls.push("verify");
      assert.equal(uid, "fixture-uid");
      assert.equal(JSON.stringify(patch), JSON.stringify({ emailVerified: true }));
      if (opts.updateFails) throw { code: "auth/internal-error" };
      Object.assign(user, patch); return user;
    },
    createCustomToken: async (uid: string) => {
      calls.push("mint"); assert.equal(uid, "fixture-uid");
      if (opts.mintFails) throw { code: "auth/internal-error" };
      return "synthetic-custom-token";
    },
  };
  const api = charger("src/lib/activation-token.ts", {
    crypto: { randomBytes },
    "./firebase-admin": { adminAuth, adminDb: { collection: () => ({ doc: () => ref }) } },
  });
  return { api, calls, data, user: () => user };
}

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { process.exitCode = 1; console.error(`  ❌ ${name}`, e); }
}

async function main() {
  await test("régression : le compte précréé est vérifié avant l'émission du jeton", async () => {
    const f = fixture();
    assert.equal((await f.api.verifyActivationToken(token)).ok, true);
    assert.equal(f.user().emailVerified, true);
    assert.deepEqual(f.calls, ["lookup", "verify", "mint", "consume"]);
    assert.equal(f.user().uid, "fixture-uid");
    assert.deepEqual(f.user().customClaims, { preserved: true });
  });
  await test("le compte déjà vérifié garde son identité sans mise à jour inutile", async () => {
    const f = fixture({ verified: true });
    assert.equal((await f.api.verifyActivationToken(token)).ok, true);
    assert.equal(f.calls.includes("verify"), false);
  });
  await test("un compte absent est créé vérifié après présentation du secret", async () => {
    const f = fixture({ absent: true });
    assert.equal((await f.api.verifyActivationToken(token)).ok, true);
    assert.equal(f.user().emailVerified, true);
    assert.deepEqual(f.calls, ["lookup", "create", "mint", "consume"]);
  });
  for (const [name, options, error] of [
    ["inconnu", { missingToken: true }, "not_found"],
    ["expiré", { tokenData: { expiresAt: new Date(Date.now() - 1000).toISOString() } }, "expired"],
    ["expiration absente", { tokenData: { expiresAt: null } }, "expired"],
    ["expiration invalide", { tokenData: { expiresAt: "invalid" } }, "expired"],
    ["déjà utilisé", { tokenData: { used: true, usedAt: new Date(Date.now() - 120_000).toISOString() } }, "used"],
    ["date de rejeu invalide", { tokenData: { used: true, usedAt: "invalid" } }, "used"],
  ] as [string, Options, string][]) {
    await test(`token ${name} : aucun accès à Auth`, async () => {
      const f = fixture(options);
      const result = await f.api.verifyActivationToken(token);
      assert.equal(result.ok, false); assert.equal(result.error, error);
      assert.deepEqual(f.calls, []);
    });
  }
  await test("le compte désactivé n'est ni vérifié ni connecté", async () => {
    const f = fixture({ disabled: true });
    const result = await f.api.verifyActivationToken(token);
    assert.equal(result.ok, false); assert.equal(result.error, "disabled");
    assert.deepEqual(f.calls, ["lookup"]);
  });
  for (const [name, options, calls] of [
    ["vérification", { updateFails: true }, ["lookup", "verify"]],
    ["signature du jeton", { mintFails: true }, ["lookup", "verify", "mint"]],
  ] as [string, Options, string[]][]) {
    await test(`échec de ${name} : pas de faux succès, lien encore utilisable`, async () => {
      const f = fixture(options);
      assert.equal((await f.api.verifyActivationToken(token)).ok, false);
      assert.equal(f.data.used, false); assert.deepEqual(f.calls, calls);
    });
  }
  await test("un double clic dans la grâce n'étend pas la fenêtre de rejeu", async () => {
    const usedAt = new Date(Date.now() - 1000).toISOString();
    const f = fixture({ tokenData: { used: true, usedAt } });
    assert.equal((await f.api.verifyActivationToken(token)).ok, true);
    assert.equal(f.user().emailVerified, true);
    assert.equal(f.data.usedAt, usedAt); assert.equal(f.calls.includes("consume"), false);
  });
  await test("créer un lien ne vérifie aucun compte", async () => {
    const f = fixture();
    await f.api.createActivationToken({ email: "parent@example.test" });
    assert.deepEqual(f.calls, ["store"]); assert.equal(f.user().emailVerified, false);
  });
  await test("la route de rattachement refuse toujours une adresse non vérifiée", async () => {
    class Response {
      constructor(public body: any, public status: number = 200) {}
      static json(body: any, options?: any) { return new Response(body, options?.status); }
    }
    const deniedWrite = () => { throw new Error("Aucune écriture autorisée avant vérification"); };
    const query: any = {
      where: () => query, limit: () => query,
      get: async () => ({ empty: false, docs: [{ id: "precreated", data: () => ({ children: [] }) }] }),
      doc: () => ({ get: async () => ({ exists: false }), set: deniedWrite }),
    };
    const route = charger("src/app/api/famille/lier-compte/route.ts", {
      "next/server": { NextResponse: Response },
      "@/lib/firebase-admin": { adminDb: { collection: () => query } },
      "@/lib/api-auth": { verifyAuth: async () => ({ uid: "fixture-uid", email: "parent@example.test", email_verified: false }) },
      "firebase-admin/firestore": { FieldValue: {} },
    });
    const response = await route.POST({});
    assert.equal(response.status, 403); assert.equal(response.body.error, "EMAIL_NON_VERIFIE");
  });
  for (const scenario of ["confirmation", "fallback", "network", "http-error", "signed-out"]) {
    await test(`renvoi depuis le bandeau : ${scenario}`, async () => {
      const calls: string[] = [];
      const user = scenario === "signed-out" ? null : { email: "parent@example.test" };
      const context = charger("src/lib/auth-context.tsx", {
        react: {
          createContext: () => ({ Provider: "provider" }),
          useState: (value: unknown) => [value, () => {}], useEffect() {},
        },
        "react/jsx-runtime": { jsx: (_type: unknown, props: any) => props },
        "firebase/auth": { sendEmailVerification: async (target: unknown) => {
          assert.equal(target, user); calls.push("confirmation");
          if (scenario !== "confirmation") throw { code: "auth/too-many-requests" };
        } },
        "firebase/firestore": {},
        "@/lib/firebase": { auth: { currentUser: user } },
        "@/lib/admin-emails": { repliEmailAutorise: () => false },
      }, { fetch: async (url: string, init: any) => {
        calls.push("magic-link");
        assert.equal(url, "/api/request-magic-link"); assert.equal(init.method, "POST");
        assert.deepEqual(JSON.parse(init.body), { email: "parent@example.test" });
        if (scenario === "network") throw new Error("offline");
        return { ok: scenario !== "http-error" };
      } });
      const renvoyer = context.AuthProvider({ children: null }).value.renvoyerConfirmation;
      if (["network", "http-error", "signed-out"].includes(scenario)) {
        await assert.rejects(renvoyer);
      } else {
        assert.equal(await renvoyer(), scenario === "confirmation" ? "confirmation" : "connexion");
      }
      assert.deepEqual(calls, scenario === "signed-out" ? [] : scenario === "confirmation" ? ["confirmation"] : ["confirmation", "magic-link"]);
    });
  }
  await test("un lien ouvert dans une session existante recharge le document avec un jeton frais", async () => {
    const calls: string[] = [];
    const effects: (() => void)[] = [];
    let redirected!: () => void;
    const done = new Promise<void>((resolve) => { redirected = resolve; });
    const user = {
      reload: async () => { calls.push("reload-user"); },
      getIdToken: async (force: boolean) => { assert.equal(force, true); calls.push("refresh-token"); },
    };
    const location = {
      href: `https://example.test/connexion-magique?token=${token}`,
      replace: (path: string) => { assert.equal(path, "/espace-cavalier"); calls.push("replace-document"); redirected(); },
    };
    const jsx = (type: any, props: any) => typeof type === "function" ? type(props) : props;
    const page = charger("src/app/connexion-magique/page.tsx", {
      react: {
        useEffect: (fn: () => void) => effects.push(fn),
        useState: (value: unknown) => [value, () => {}], useRef: (value: unknown) => ({ current: value }),
        Suspense: "suspense",
      },
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "next/navigation": { useSearchParams: () => ({ get: () => token }) },
      "firebase/auth": { signInWithCustomToken: async () => { calls.push("sign-in"); return { user }; } },
      "@/lib/firebase": { auth: { currentUser: user } },
    }, {
      window: { location }, setTimeout: (fn: () => void) => fn(),
      fetch: async () => { calls.push("exchange"); return { json: async () => ({ ok: true, customToken: "synthetic" }) }; },
    });
    page.default();
    effects[0](); effects[0](); // même effet rejoué, comme sous StrictMode
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([done, new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Redirection absente")), 1000);
      })]);
    } finally { clearTimeout(timeout); }
    assert.deepEqual(calls, ["exchange", "sign-in", "reload-user", "refresh-token", "replace-document"]);
  });
  console.log(`${passed} tests de lien magique réussis.`);
}
void main();
