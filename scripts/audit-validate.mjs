#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * SCRIPT D'AUDIT & VALIDATION — Centre Équestre d'Agon-Coutainville
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Teste TOUS les cas sensibles identifiés dans l'audit de sécurité.
 * Ce script fonctionne en mode statique (analyse du code source) et ne 
 * nécessite pas de connexion Firebase ni d'accès réseau.
 *
 * Usage : node scripts/audit-validate.mjs
 *         npm run audit (si ajouté au package.json)
 *
 * Catégories testées :
 *   1. Sécurité — Routes API, secrets, auth
 *   2. Intégrité — Stripe supprimé, cohérence CAWL
 *   3. Qualité — Fichiers debug, données sensibles, code mort
 *   4. Documentation — README, .env.local.example à jour
 *   5. Production — Fichiers de test, routes debug
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, join } from "path";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROOT = resolve(process.cwd());
let passed = 0;
let failed = 0;
let warned = 0;
const errors = [];
const warnings = [];

const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

function section(title) {
  console.log(`\n${COLORS.cyan}${"═".repeat(70)}${COLORS.reset}`);
  console.log(`${COLORS.bold}  ${title}${COLORS.reset}`);
  console.log(`${COLORS.cyan}${"═".repeat(70)}${COLORS.reset}`);
}

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ${COLORS.green}✅${COLORS.reset} ${name}`);
  } catch (e) {
    failed++;
    const msg = e?.message || String(e);
    console.log(`  ${COLORS.red}❌${COLORS.reset} ${name}`);
    console.log(`     ${COLORS.dim}→ ${msg}${COLORS.reset}`);
    errors.push(`${name}: ${msg}`);
  }
}

function warn(name, msg) {
  warned++;
  console.log(`  ${COLORS.yellow}⚠️${COLORS.reset}  ${name}`);
  if (msg) console.log(`     ${COLORS.dim}→ ${msg}${COLORS.reset}`);
  warnings.push(`${name}: ${msg || ""}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}

function readFile(relPath) {
  const full = resolve(ROOT, relPath);
  if (!existsSync(full)) return null;
  return readFileSync(full, "utf8");
}

function fileExists(relPath) {
  return existsSync(resolve(ROOT, relPath));
}

function findFiles(dir, ext, results = []) {
  const full = resolve(ROOT, dir);
  if (!existsSync(full)) return results;
  for (const entry of readdirSync(full)) {
    const p = join(full, entry);
    const s = statSync(p);
    if (s.isDirectory() && entry !== "node_modules" && entry !== ".next") {
      findFiles(join(dir, entry), ext, results);
    } else if (entry.endsWith(ext)) {
      results.push(join(dir, entry));
    }
  }
  return results;
}

function findApiRoutes() {
  return findFiles("src/app/api", "route.ts");
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 : SÉCURITÉ
// ═══════════════════════════════════════════════════════════════════════════════

section("1. SÉCURITÉ — Authentification des routes API");

const apiRoutes = findApiRoutes();

// C1 — Route debug-firebase
test("C1 — /api/debug-firebase doit être supprimée", () => {
  assert(
    !fileExists("src/app/api/debug-firebase/route.ts"),
    "La route /api/debug-firebase existe encore ! Elle expose des fragments de FIREBASE_PRIVATE_KEY."
  );
});

// C2 — Vérifier que les routes sensibles ont une auth
const ROUTES_REQUIRING_AUTH = [
  { path: "src/app/api/send-email/route.ts", name: "/api/send-email" },
  { path: "src/app/api/push/route.ts", name: "/api/push" },
  { path: "src/app/api/ia/route.ts", name: "/api/ia" },
  { path: "src/app/api/whisper/route.ts", name: "/api/whisper" },
  { path: "src/app/api/tts/route.ts", name: "/api/tts" },
  { path: "src/app/api/agent/route.ts", name: "/api/agent" },
  { path: "src/app/api/send-payment-link/route.ts", name: "/api/send-payment-link" },
  { path: "src/app/api/invoice-pdf/route.ts", name: "/api/invoice-pdf" },
  { path: "src/app/api/facture/route.ts", name: "/api/facture" },
  { path: "src/app/api/avoir-pdf/route.ts", name: "/api/avoir-pdf" },
  { path: "src/app/api/bon-cadeau/route.ts", name: "/api/bon-cadeau" },
  { path: "src/app/api/gift-voucher/route.ts", name: "/api/gift-voucher" },
  { path: "src/app/api/progression-pdf/route.ts", name: "/api/progression-pdf" },
  { path: "src/app/api/cawl/checkout/route.ts", name: "/api/cawl/checkout" },
  { path: "src/app/api/admin/unenroll-annual/route.ts", name: "/api/admin/unenroll-annual" },
  { path: "src/app/api/admin/assign-ordre-equides/route.ts", name: "/api/admin/assign-ordre-equides" },
  { path: "src/app/api/challenges/route.ts", name: "/api/challenges" },
];

for (const { path, name } of ROUTES_REQUIRING_AUTH) {
  test(`C2 — ${name} doit avoir une authentification`, () => {
    const content = readFile(path);
    if (!content) return; // Route supprimée = OK
    const hasAuth = /verifyIdToken|verifyAuth|CRON_SECRET|Authorization.*Bearer|x-webhook-secret|hmac|HMAC/.test(content);
    assert(hasAuth, `Route ${name} n'a aucune vérification d'authentification !`);
  });
}

// C3 — Route test-seed
test("C3 — /api/test-seed doit être supprimée ou protégée", () => {
  const content = readFile("src/app/api/test-seed/route.ts");
  if (!content) return; // Supprimée = OK
  const hasProtection =
    /NODE_ENV.*production|PLAYWRIGHT_TEST_MODE|verifyIdToken|CRON_SECRET/.test(content);
  assert(
    hasProtection,
    "/api/test-seed existe sans protection d'environnement ! Permet l'injection de données arbitraires."
  );
});

// C4 — Route send-email/test
test("C4 — /api/send-email/test doit être supprimée ou protégée", () => {
  const content = readFile("src/app/api/send-email/test/route.ts");
  if (!content) return;
  const hasProtection = /verifyIdToken|CRON_SECRET|NODE_ENV/.test(content);
  assert(
    hasProtection,
    "/api/send-email/test est ouverte ! Permet d'envoyer des emails de test et de lister les domaines Resend."
  );
});

// C5 — Middleware couvre les routes admin API
test("C5 — Le middleware doit protéger /api/admin/*", () => {
  const content = readFile("src/middleware.ts");
  assert(content, "middleware.ts introuvable !");
  const matcherPattern = /api\/admin|api\/(?:cron|admin)/;
  const coversAdmin =
    matcherPattern.test(content) ||
    content.includes('"/api/admin/:path*"') ||
    content.includes("pathname.startsWith(\"/api/admin\")");
  assert(
    coversAdmin,
    "Le middleware ne protège pas /api/admin/* — seules les routes cron sont matchées."
  );
});

// C6 — Webhook CAWL vérifie HMAC
test("C6 — Webhook CAWL vérifie la signature HMAC", () => {
  const content = readFile("src/app/api/cawl/webhook/route.ts");
  assert(content, "Route webhook CAWL introuvable !");
  assert(content.includes("createHmac"), "Le webhook CAWL n'utilise pas createHmac pour vérifier la signature !");
  assert(
    content.includes("CAWL_SECRET_API_KEY") && /!webhookSecret|!secret/.test(content),
    "Le webhook CAWL doit rejeter si CAWL_SECRET_API_KEY est absent !"
  );
});

// C7 — Pas de secrets hardcodés
section("1b. SÉCURITÉ — Secrets et données sensibles");

test("C7 — Aucune clé Stripe hardcodée dans le code", () => {
  const allFiles = [
    ...findFiles("src", ".ts"),
    ...findFiles("src", ".tsx"),
  ];
  for (const f of allFiles) {
    const content = readFile(f);
    if (!content) continue;
    assert(
      !/sk_test_[A-Za-z0-9]{10,}|sk_live_[A-Za-z0-9]{10,}|pk_test_[A-Za-z0-9]{10,}|pk_live_[A-Za-z0-9]{10,}/.test(content),
      `Clé Stripe hardcodée trouvée dans ${f} !`
    );
  }
});

test("C8 — Aucune clé API hardcodée (Anthropic, OpenAI, ElevenLabs)", () => {
  const patterns = [
    /sk-ant-[A-Za-z0-9]{20,}/,  // Anthropic
    /sk-[A-Za-z0-9]{40,}/,      // OpenAI
  ];
  const allFiles = [...findFiles("src", ".ts"), ...findFiles("src", ".tsx")];
  for (const f of allFiles) {
    const content = readFile(f);
    if (!content) continue;
    for (const pat of patterns) {
      assert(!pat.test(content), `Clé API hardcodée trouvée dans ${f} !`);
    }
  }
});

test("C9 — Aucun mot de passe hardcodé", () => {
  const allFiles = [...findFiles("src", ".ts"), ...findFiles("src", ".tsx")];
  for (const f of allFiles) {
    const content = readFile(f);
    if (!content) continue;
    // Cherche des patterns comme password = "xxx" ou pwd: "xxx"
    const matches = content.match(/(?:password|pwd|passwd)\s*[:=]\s*["'][^"']{8,}["']/gi);
    if (matches) {
      // Exclure les faux positifs (placeholder, type annotations)
      const real = matches.filter(
        (m) => !m.includes("placeholder") && !m.includes("type=") && !m.includes("label")
      );
      assert(real.length === 0, `Mot de passe hardcodé dans ${f} : ${real[0]}`);
    }
  }
});

// C10 — Vérification que error.message n'est pas renvoyé au client
test("C10 — Les routes API ne doivent pas exposer error.message brut", () => {
  let exposedCount = 0;
  const exposedRoutes = [];
  for (const route of apiRoutes) {
    const content = readFile(route);
    if (!content) continue;
    // Cherche NextResponse.json({ error: error.message }) ou similaire
    if (/NextResponse\.json\(\s*\{[^}]*error\.message/s.test(content)) {
      exposedCount++;
      exposedRoutes.push(route.replace("src/app/api/", ""));
    }
  }
  assert(
    exposedCount === 0,
    `${exposedCount} routes exposent error.message au client : ${exposedRoutes.slice(0, 5).join(", ")}${exposedCount > 5 ? "..." : ""}`
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 : INTÉGRITÉ — Migration Stripe → CAWL
// ═══════════════════════════════════════════════════════════════════════════════

section("2. INTÉGRITÉ — Migration Stripe → CAWL");

test("I1 — src/lib/stripe.ts doit être supprimé", () => {
  assert(!fileExists("src/lib/stripe.ts"), "src/lib/stripe.ts existe encore !");
});

test("I2 — Aucune import de stripe dans le code source", () => {
  const allFiles = [...findFiles("src", ".ts"), ...findFiles("src", ".tsx")];
  for (const f of allFiles) {
    const content = readFile(f);
    if (!content) continue;
    assert(
      !/import.*from\s+["']stripe["']|import.*from\s+["']@stripe/.test(content),
      `Import Stripe trouvé dans ${f} !`
    );
  }
});

test("I3 — Aucune route /api/stripe/", () => {
  assert(
    !fileExists("src/app/api/stripe"),
    "Le répertoire src/app/api/stripe/ existe encore !"
  );
});

test("I4 — package.json ne contient pas stripe", () => {
  const pkg = readFile("package.json");
  assert(pkg, "package.json introuvable !");
  assert(
    !/"stripe"|"@stripe\/stripe-js"/.test(pkg),
    "Stripe est encore dans les dépendances package.json !"
  );
});

test("I5 — CAWL SDK est dans les dépendances", () => {
  const pkg = readFile("package.json");
  assert(pkg, "package.json introuvable !");
  assert(
    /onlinepayments-sdk-nodejs/.test(pkg),
    "onlinepayments-sdk-nodejs (CAWL) manquant dans package.json !"
  );
});

test("I6 — Les routes CAWL existent (checkout, status, webhook)", () => {
  assert(fileExists("src/app/api/cawl/checkout/route.ts"), "Route CAWL checkout manquante !");
  assert(fileExists("src/app/api/cawl/status/route.ts"), "Route CAWL status manquante !");
  assert(fileExists("src/app/api/cawl/webhook/route.ts"), "Route CAWL webhook manquante !");
});

test("I7 — La comptabilité ne référence pas Stripe comme mode de paiement actif", () => {
  const content = readFile("src/app/admin/comptabilite/page.tsx");
  if (!content) return;
  // Vérifier que "STRIPE" est dans un contexte de rapprochement bancaire historique, pas comme mode actif
  const stripeImport = /import.*stripe/i.test(content);
  assert(!stripeImport, "La comptabilité importe encore un module Stripe !");
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 : QUALITÉ — Fichiers debug, données sensibles, code mort
// ═══════════════════════════════════════════════════════════════════════════════

section("3. QUALITÉ — Fichiers debug & données sensibles");

test("Q1 — public/push-debug.html doit être supprimé", () => {
  assert(!fileExists("public/push-debug.html"), "public/push-debug.html existe encore !");
});

test("Q2 — public/equides-import.json ne devrait pas être public", () => {
  assert(
    !fileExists("public/equides-import.json"),
    "public/equides-import.json (données registre d'élevage 38KB) est accessible publiquement !"
  );
});

test("Q3 — Pas de console.log avec des données sensibles dans les routes API", () => {
  const sensitivePatterns = [
    /console\.log.*(?:privateKey|secret|password|apiKey|token)/i,
    /console\.log.*(?:FIREBASE_PRIVATE_KEY|CAWL_SECRET)/i,
  ];
  for (const route of apiRoutes) {
    const content = readFile(route);
    if (!content) continue;
    for (const pat of sensitivePatterns) {
      assert(
        !pat.test(content),
        `Console.log avec données sensibles dans ${route} !`
      );
    }
  }
});

test("Q4 — Pas de TODO/FIXME/HACK critiques restants", () => {
  const criticalPatterns = [
    /\/\/\s*TODO.*security/i,
    /\/\/\s*FIXME.*auth/i,
    /\/\/\s*HACK.*production/i,
    /\/\/\s*XXX/i,
  ];
  let found = [];
  const allFiles = [...findFiles("src/app/api", ".ts")];
  for (const f of allFiles) {
    const content = readFile(f);
    if (!content) continue;
    for (const pat of criticalPatterns) {
      if (pat.test(content)) {
        found.push(f);
        break;
      }
    }
  }
  if (found.length > 0) {
    warn("TODO/FIXME/HACK critiques trouvés", found.join(", "));
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 : DOCUMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

section("4. DOCUMENTATION — Cohérence");

test("D1 — README.md ne mentionne plus Stripe", () => {
  const content = readFile("README.md");
  assert(content, "README.md introuvable !");
  // Accepte "Stripe supprimé" comme commentaire mais pas comme instruction
  const lines = content.split("\n");
  const activeStripeRefs = lines.filter(
    (l) => /stripe/i.test(l) && !/supprimé|removed|migré|replaced|anciennement/i.test(l)
  );
  assert(
    activeStripeRefs.length === 0,
    `README.md référence encore Stripe activement : "${activeStripeRefs[0]?.trim()}"`
  );
});

test("D2 — .env.local.example ne contient plus les variables Stripe", () => {
  const content = readFile(".env.local.example");
  if (!content) {
    warn("D2 — .env.local.example introuvable");
    return;
  }
  assert(
    !/STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|STRIPE_PUBLISHABLE/.test(content),
    ".env.local.example contient encore des variables Stripe !"
  );
});

test("D3 — .env.local.example contient les variables CAWL", () => {
  const content = readFile(".env.local.example");
  if (!content) {
    warn("D3 — .env.local.example introuvable");
    return;
  }
  const hasCawl = /CAWL/.test(content);
  assert(hasCawl, ".env.local.example ne contient pas les variables CAWL !");
});

test("D4 — .env.local.example contient les variables Firebase Admin", () => {
  const content = readFile(".env.local.example");
  if (!content) return;
  assert(/FIREBASE_CLIENT_EMAIL/.test(content), "FIREBASE_CLIENT_EMAIL manquant dans .env.local.example !");
  assert(/FIREBASE_PRIVATE_KEY/.test(content), "FIREBASE_PRIVATE_KEY manquant dans .env.local.example !");
});

test("D5 — .env.local.example contient les variables API tierces", () => {
  const content = readFile(".env.local.example");
  if (!content) return;
  const requiredVars = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "ELEVENLABS_API_KEY",
    "CRON_SECRET",
    "RESEND_API_KEY",
  ];
  const missing = requiredVars.filter((v) => !content.includes(v));
  assert(missing.length === 0, `Variables manquantes dans .env.local.example : ${missing.join(", ")}`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 : PRODUCTION — Routes de test, fichiers inutiles
// ═══════════════════════════════════════════════════════════════════════════════

section("5. PRODUCTION — Hygiène pré-production");

test("P1 — /api/test-auth est protégée en production", () => {
  const content = readFile("src/app/api/test-auth/route.ts");
  if (!content) return; // Supprimée = OK
  assert(
    /NODE_ENV.*production|PLAYWRIGHT_TEST_MODE/.test(content),
    "/api/test-auth n'est pas protégée par un check de NODE_ENV !"
  );
});

test("P2 — Pas de route /api/debug-* en production", () => {
  const debugRoutes = findFiles("src/app/api", "route.ts").filter((f) =>
    f.includes("/debug")
  );
  assert(
    debugRoutes.length === 0,
    `Routes debug trouvées : ${debugRoutes.join(", ")}`
  );
});

test("P3 — Le service worker est présent", () => {
  assert(fileExists("public/sw.js"), "public/sw.js (service worker) manquant !");
});

test("P4 — Le manifest.json est présent", () => {
  assert(fileExists("public/manifest.json"), "public/manifest.json manquant !");
  const content = readFile("public/manifest.json");
  if (content) {
    try {
      JSON.parse(content);
    } catch {
      throw new Error("manifest.json n'est pas un JSON valide !");
    }
  }
});

test("P5 — Le favicon est présent", () => {
  assert(fileExists("public/favicon.ico"), "public/favicon.ico manquant !");
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6 : FIREBASE — Configuration sécurité
// ═══════════════════════════════════════════════════════════════════════════════

section("6. FIREBASE — Configuration sécurité");

test("F1 — firestore.rules existe dans le repo", () => {
  assert(
    fileExists("firestore.rules"),
    "Pas de fichier firestore.rules dans le repo ! Les règles Firestore doivent être versionnées."
  );
});

test("F2 — firebase.json existe dans le repo", () => {
  assert(
    fileExists("firebase.json"),
    "Pas de fichier firebase.json ! Configuration Firebase non versionnée."
  );
});

test("F3 — storage.rules existe dans le repo", () => {
  assert(
    fileExists("storage.rules"),
    "Pas de fichier storage.rules ! Les règles Storage doivent être versionnées."
  );
});

test("F4 — Les custom claims sont utilisés (auth-context)", () => {
  const content = readFile("src/lib/auth-context.tsx");
  assert(content, "auth-context.tsx introuvable !");
  assert(
    content.includes("getIdTokenResult") && content.includes("claims.admin"),
    "auth-context.tsx n'utilise pas les custom claims Firebase !"
  );
});

test("F5 — Firebase Admin utilise des variables d'environnement (pas de credentials hardcodées)", () => {
  const content = readFile("src/lib/firebase-admin.ts");
  assert(content, "firebase-admin.ts introuvable !");
  assert(
    content.includes("process.env"),
    "firebase-admin.ts n'utilise pas process.env pour les credentials !"
  );
  assert(
    !/-----BEGIN.*PRIVATE KEY-----/.test(content),
    "firebase-admin.ts contient une clé privée hardcodée !"
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7 : ROUTES CRON — Protection
// ═══════════════════════════════════════════════════════════════════════════════

section("7. CRON — Protection des routes automatisées");

const CRON_ROUTES = [
  "src/app/api/cron/rappels-j1/route.ts",
  "src/app/api/cron/daily-notifications/route.ts",
  "src/app/api/cron/daily-monitor-recap/route.ts",
  "src/app/api/cron/charge-stage-balances/route.ts",
];

for (const route of CRON_ROUTES) {
  const name = route.replace("src/app/api/", "").replace("/route.ts", "");
  test(`CR1 — ${name} est protégée par CRON_SECRET`, () => {
    const content = readFile(route);
    if (!content) return; // Route supprimée = OK
    assert(
      content.includes("CRON_SECRET") || content.includes("Authorization"),
      `${name} n'est pas protégée par CRON_SECRET !`
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8 : PAIEMENT CAWL — Sécurité spécifique
// ═══════════════════════════════════════════════════════════════════════════════

section("8. CAWL — Sécurité paiement");

test("CW1 — CAWL checkout vérifie le montant > 0", () => {
  const content = readFile("src/app/api/cawl/checkout/route.ts");
  assert(content, "Route CAWL checkout introuvable !");
  assert(
    /totalCents\s*<=\s*0|amount.*<=.*0|montant.*<=.*0/.test(content),
    "CAWL checkout ne vérifie pas que le montant est > 0 !"
  );
});

test("CW2 — CAWL checkout ne permet pas de montant négatif", () => {
  const content = readFile("src/app/api/cawl/checkout/route.ts");
  if (!content) return;
  // Vérifie qu'il y a une validation du montant
  assert(
    content.includes("totalCents <= 0") || content.includes("totalCents < 0"),
    "Pas de validation de montant négatif dans CAWL checkout !"
  );
});

test("CW3 — CAWL lib utilise des variables d'environnement", () => {
  const content = readFile("src/lib/cawl.ts");
  assert(content, "src/lib/cawl.ts introuvable !");
  assert(
    content.includes("process.env.CAWL"),
    "cawl.ts n'utilise pas de variables d'environnement !"
  );
  assert(
    !/apiKey\s*[:=]\s*["'][A-Za-z0-9]{20,}["']/.test(content),
    "cawl.ts contient une clé API hardcodée !"
  );
});

test("CW4 — CAWL status route vérifie le paiement avant confirmation", () => {
  const content = readFile("src/app/api/cawl/status/route.ts");
  assert(content, "Route CAWL status introuvable !");
  assert(
    content.includes("getHostedCheckoutStatus") || content.includes("getPayment"),
    "CAWL status ne vérifie pas le statut du paiement auprès de CAWL !"
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9 : EMAIL — Sécurité et configuration
// ═══════════════════════════════════════════════════════════════════════════════

section("9. EMAIL — Sécurité");

test("EM1 — send-email utilise RESEND_API_KEY depuis env", () => {
  const content = readFile("src/app/api/send-email/route.ts");
  assert(content, "Route send-email introuvable !");
  assert(
    content.includes("process.env.RESEND_API_KEY"),
    "send-email n'utilise pas RESEND_API_KEY depuis les variables d'environnement !"
  );
});

test("EM2 — Pas d'email personnel comme fallback en dur (hors mentions-legales)", () => {
  const criticalFiles = [
    "src/app/api/send-email/route.ts",
    "src/app/api/send-payment-link/route.ts",
    "src/app/api/cron/daily-notifications/route.ts",
    "src/app/api/cron/daily-monitor-recap/route.ts",
  ];
  for (const f of criticalFiles) {
    const content = readFile(f);
    if (!content) continue;
    if (/nicolasrichard16@hotmail\.com/.test(content)) {
      warn(
        `EM2 — Email personnel hardcodé dans ${f}`,
        "Utiliser une variable d'environnement à la place"
      );
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10 : XSS & INJECTION
// ═══════════════════════════════════════════════════════════════════════════════

section("10. XSS & INJECTION");

test("XSS1 — Pas de dangerouslySetInnerHTML sur des données utilisateur", () => {
  const allFiles = [...findFiles("src", ".tsx")];
  const dangerous = [];
  for (const f of allFiles) {
    const content = readFile(f);
    if (!content) continue;
    if (content.includes("dangerouslySetInnerHTML")) {
      // Vérifier que c'est sur du contenu admin/statique, pas des données user
      if (
        !f.includes("layout.tsx") && // Script JSON-LD = OK
        !f.includes("email-templates") // Aperçu admin = risque accepté
      ) {
        dangerous.push(f);
      }
    }
  }
  assert(
    dangerous.length === 0,
    `dangerouslySetInnerHTML trouvé dans : ${dangerous.join(", ")}`
  );
});

test("XSS2 — Les routes API valident les entrées obligatoires", () => {
  const routesWithInput = [
    { path: "src/app/api/send-email/route.ts", fields: ["to", "subject", "html"] },
    { path: "src/app/api/push/route.ts", fields: ["title", "body"] },
    { path: "src/app/api/cawl/checkout/route.ts", fields: ["items"] },
  ];
  for (const { path, fields } of routesWithInput) {
    const content = readFile(path);
    if (!content) continue;
    for (const field of fields) {
      assert(
        content.includes(`!${field}`) || content.includes(`!body.${field}`) || content.includes(`${field}.length`),
        `${path} ne valide pas le champ obligatoire '${field}' !`
      );
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11 : STRUCTURE & COHÉRENCE
// ═══════════════════════════════════════════════════════════════════════════════

section("11. STRUCTURE & COHÉRENCE");

test("S1 — Tous les composants admin sont dans src/app/admin/", () => {
  assert(fileExists("src/app/admin"), "Répertoire src/app/admin/ manquant !");
});

test("S2 — L'espace cavalier est dans src/app/espace-cavalier/", () => {
  assert(fileExists("src/app/espace-cavalier"), "Répertoire src/app/espace-cavalier/ manquant !");
});

test("S3 — firebase-admin.ts existe", () => {
  assert(fileExists("src/lib/firebase-admin.ts"), "src/lib/firebase-admin.ts manquant !");
});

test("S4 — firebase.ts (client) existe", () => {
  assert(fileExists("src/lib/firebase.ts"), "src/lib/firebase.ts manquant !");
});

test("S5 — auth-context.tsx existe", () => {
  assert(fileExists("src/lib/auth-context.tsx"), "src/lib/auth-context.tsx manquant !");
});

test("S6 — Les pages principales existent", () => {
  const requiredPages = [
    "src/app/admin/dashboard/page.tsx",
    "src/app/admin/planning/page.tsx",
    "src/app/admin/cavaliers/page.tsx",
    "src/app/admin/paiements/page.tsx",
    "src/app/espace-cavalier/dashboard/page.tsx",
    "src/app/espace-cavalier/reserver/page.tsx",
    "src/app/espace-cavalier/profil/page.tsx",
  ];
  const missing = requiredPages.filter((p) => !fileExists(p));
  assert(missing.length === 0, `Pages manquantes : ${missing.join(", ")}`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 12 : CONFORMITÉ LÉGALE
// ═══════════════════════════════════════════════════════════════════════════════

section("12. CONFORMITÉ LÉGALE");

test("L1 — Page mentions légales existe", () => {
  assert(fileExists("src/app/mentions-legales/page.tsx"), "Page mentions légales manquante !");
});

test("L2 — Page confidentialité/RGPD existe", () => {
  assert(
    fileExists("src/app/confidentialite/page.tsx"),
    "Page politique de confidentialité manquante !"
  );
});

test("L3 — Les factures contiennent le N° TVA", () => {
  const content = readFile("src/app/api/invoice-pdf/route.ts");
  if (!content) return;
  assert(
    /FR12507569184|TVA/.test(content),
    "Les factures PDF ne contiennent pas le N° TVA !"
  );
});

test("L4 — Les factures contiennent le SIRET", () => {
  const content = readFile("src/app/api/invoice-pdf/route.ts");
  if (!content) return;
  assert(
    /507\s*569\s*184|SIRET/.test(content),
    "Les factures PDF ne contiennent pas le SIRET !"
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// RÉSULTAT FINAL
// ═══════════════════════════════════════════════════════════════════════════════

console.log(`\n${"═".repeat(70)}`);
console.log(`${COLORS.bold}  RÉSULTAT DE L'AUDIT${COLORS.reset}`);
console.log(`${"═".repeat(70)}`);
console.log(
  `  ${COLORS.green}✅ ${passed} tests passés${COLORS.reset}  |  ` +
  `${COLORS.red}❌ ${failed} tests échoués${COLORS.reset}  |  ` +
  `${COLORS.yellow}⚠️  ${warned} avertissements${COLORS.reset}`
);

if (errors.length > 0) {
  console.log(`\n${COLORS.red}${COLORS.bold}  ÉCHECS :${COLORS.reset}`);
  for (const e of errors) {
    console.log(`  ${COLORS.red}•${COLORS.reset} ${e}`);
  }
}

if (warnings.length > 0) {
  console.log(`\n${COLORS.yellow}${COLORS.bold}  AVERTISSEMENTS :${COLORS.reset}`);
  for (const w of warnings) {
    console.log(`  ${COLORS.yellow}•${COLORS.reset} ${w}`);
  }
}

console.log(`\n${"═".repeat(70)}`);

if (failed > 0) {
  console.log(
    `${COLORS.red}${COLORS.bold}  ⛔ AUDIT ÉCHOUÉ — ${failed} problème(s) à corriger avant la mise en production${COLORS.reset}`
  );
  process.exit(1);
} else {
  console.log(
    `${COLORS.green}${COLORS.bold}  ✅ AUDIT RÉUSSI — Tous les tests passent${COLORS.reset}`
  );
  process.exit(0);
}
