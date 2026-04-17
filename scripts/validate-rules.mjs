#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * VALIDATION DES RÈGLES FIRESTORE — Centre Équestre Agon
 * ══════════════════════════════════════════════════════════════
 *
 * Vérifie sans émulateur que :
 *  1. Toutes les collections du code sont couvertes dans firestore.rules
 *  2. Les collections sensibles (admin) ne sont pas accessibles publiquement
 *  3. Les collections cavalier ont bien allow create: if isAuth()
 *  4. Les collections publiques sont correctement ouvertes
 *  5. Le bloc DENY ALL est présent
 *  6. Les fonctions helpers critiques sont définies
 *  7. Cohérence entre règles et collections réellement utilisées
 *
 * Usage : npm run validate:rules
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd());
const RULES_FILE = path.join(ROOT, "firestore.rules");
const SRC_DIR = path.join(ROOT, "src");

let passed = 0, failed = 0, warned = 0;
const errors = [];
const warnings = [];

function section(title) {
  console.log(`\n${"═".repeat(62)}\n  ${title}\n${"═".repeat(62)}`);
}
function ok(msg)   { passed++; console.log(`  ✅ ${msg}`); }
function fail(msg) { failed++; errors.push(msg); console.log(`  ❌ ${msg}`); }
function warn(msg) { warned++; warnings.push(msg); console.log(`  ⚠️  ${msg}`); }
function info(msg) { console.log(`  ℹ️  ${msg}`); }

// ─── Lecture des fichiers ───────────────────────────────────────────────────

const rulesContent = fs.readFileSync(RULES_FILE, "utf8");

// Toutes les collections utilisées dans le code src/
// Recursion sur src/ pour trouver tous les .ts/.tsx
function findFiles(dir, exts) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findFiles(full, exts));
    else if (exts.some(e => entry.name.endsWith(e))) results.push(full);
  }
  return results;
}
const srcFiles = findFiles(SRC_DIR, [".ts", ".tsx"]);
const collectionRegex = /collection\(db,\s*["']([^"']+)["']/g;
const usedCollections = new Set();
for (const file of srcFiles) {
  const content = fs.readFileSync(file, "utf8");
  let match;
  while ((match = collectionRegex.exec(content)) !== null) {
    usedCollections.add(match[1]);
  }
}

// Collections couvertes dans les règles
const matchRegex = /match\s*\/([^/{]+)\//g;
const coveredCollections = new Set();
let m;
while ((m = matchRegex.exec(rulesContent)) !== null) {
  if (m[1] !== "databases" && m[1] !== "{document=**}") {
    coveredCollections.add(m[1]);
  }
}

// ─── SECTION 1 : Couverture des collections ─────────────────────────────────
section("1️⃣  COUVERTURE DES COLLECTIONS");

const missing = [...usedCollections].filter(c => !coveredCollections.has(c));
const extra = [...coveredCollections].filter(c => !usedCollections.has(c));

if (missing.length === 0) {
  ok(`Toutes les collections du code sont couvertes (${usedCollections.size} collections)`);
} else {
  for (const c of missing) fail(`Collection "${c}" utilisée dans le code mais ABSENTE des règles`);
}

if (extra.length > 0) {
  for (const c of extra) warn(`Collection "${c}" dans les règles mais non trouvée dans le code`);
} else {
  ok("Pas de collections orphelines dans les règles");
}

// ─── SECTION 2 : Bloc DENY ALL ──────────────────────────────────────────────
section("2️⃣  BLOC DENY ALL");

if (rulesContent.includes('match /{document=**}') && rulesContent.includes('allow read, write: if false')) {
  ok("Bloc DENY ALL présent en fin de fichier");
} else {
  fail("Bloc DENY ALL manquant ! Toutes les collections non listées sont accessibles");
}

// ─── SECTION 3 : Helpers critiques ──────────────────────────────────────────
section("3️⃣  FONCTIONS HELPERS");

const helpers = ["isAuth()", "isAdmin()", "isMoniteur()", "isStaff()", "isFamilyOwner("];
for (const h of helpers) {
  if (rulesContent.includes(`function ${h.replace("()", "(")}`) || rulesContent.includes(`function ${h.split("(")[0]}`)) {
    ok(`Fonction ${h} définie`);
  } else {
    fail(`Fonction helper ${h} manquante`);
  }
}

// Vérifier le fallback email dans isAdmin
if (rulesContent.includes("request.auth.token.email in [")) {
  ok("isAdmin() a un fallback email hardcodé");
} else {
  warn("isAdmin() sans fallback email — risque si custom claim absent");
}

// ─── SECTION 4 : Collections ADMIN-ONLY ─────────────────────────────────────
section("4️⃣  COLLECTIONS ADMIN-ONLY");

const adminOnlyCollections = [
  "encaissements", "mandats-sepa", "echeances-sepa", "remises-sepa",
  "rapprochements", "comptabilite", "devis", "communications",
  "email-templates", "bons-cadeaux", "salaries-management",
  "taches-planifiees", "payment_declarations", "mouvements_registre",
  "modeles", "modeles-planning", "emailsReprise", "doc_templates",
  "rdv_pro", "remises",
];

for (const col of adminOnlyCollections) {
  if (!coveredCollections.has(col)) { warn(`"${col}" non trouvée dans les règles`); continue; }
  
  // Extraire le bloc de règle pour cette collection
  const blockRegex = new RegExp(`match\\s*\\/${col}\\/\\{[^}]+\\}\\s*\\{([^}]+)\\}`, "s");
  const blockMatch = rulesContent.match(blockRegex);
  if (!blockMatch) { warn(`Impossible de parser le bloc "${col}"`); continue; }
  
  const block = blockMatch[1];
  // Vérifier qu'il n'y a pas de "if true" ou "if isAuth()" sur un write
  if (block.includes("allow read, write: if true") || block.includes("allow write: if true")) {
    fail(`"${col}" est accessible publiquement en écriture !`);
  } else if (block.includes("allow read, write: if isAuth()") || block.includes("allow write: if isAuth()")) {
    fail(`"${col}" est accessible en écriture par tout utilisateur connecté !`);
  } else {
    ok(`"${col}" correctement sécurisée`);
  }
}

// ─── SECTION 5 : Collections CAVALIER (create autorisé) ─────────────────────
section("5️⃣  COLLECTIONS CAVALIER (create: if isAuth)");

const cavalierCreateCollections = [
  "reservations", "payments", "avis-satisfaction", "waitlist",
  "encaissements", "payment_declarations",
];

for (const col of cavalierCreateCollections) {
  if (!coveredCollections.has(col)) { warn(`"${col}" non trouvée dans les règles`); continue; }
  
  const blockRegex = new RegExp(`match\\s*\\/${col}\\/\\{[^}]+\\}\\s*\\{([^}]+)\\}`, "s");
  const blockMatch = rulesContent.match(blockRegex);
  if (!blockMatch) { warn(`Impossible de parser "${col}"`); continue; }
  
  const block = blockMatch[1];
  if (block.includes("allow create: if isAuth()") || block.includes("allow write: if isAuth()")) {
    ok(`"${col}" — create autorisé pour cavaliers`);
  } else if (block.includes("allow create: if isAdmin()") || block.includes("allow write: if isAdmin()")) {
    fail(`"${col}" — create RÉSERVÉ aux admins, les cavaliers ne peuvent pas créer !`);
  } else {
    warn(`"${col}" — règle create non standard, vérifier manuellement`);
  }
}

// ─── SECTION 6 : Collections PUBLIQUES ──────────────────────────────────────
section("6️⃣  COLLECTIONS PUBLIQUES");

const publicCollections = ["settings"];

for (const col of publicCollections) {
  const blockRegex = new RegExp(`match\\s*\\/${col}\\/\\{[^}]+\\}\\s*\\{([^}]+)\\}`, "s");
  const blockMatch = rulesContent.match(blockRegex);
  if (!blockMatch) { fail(`"${col}" manquante dans les règles`); continue; }
  
  const block = blockMatch[1];
  if (block.includes("allow read: if true")) {
    ok(`"${col}" — lecture publique correctement configurée`);
  } else {
    warn(`"${col}" — lecture publique attendue mais non configurée`);
  }
}

// ─── SECTION 7 : Règles isFamilyOwner vs comparaison directe ────────────────
section("7️⃣  PERFORMANCE DES RÈGLES");

// isFamilyOwner fait 2 appels Firestore — déconseillé sur les queries
const iFOMatches = rulesContent.match(/isFamilyOwner/g) || [];
if (iFOMatches.length > 0) {
  warn(`isFamilyOwner() utilisé ${iFOMatches.length} fois — génère 2 appels Firestore par document évalué`);
  info("Préférer 'resource.data.familyId == request.auth.uid' pour les collections avec queries client");
} else {
  ok("Aucun isFamilyOwner() — performances optimales");
}

// ─── SECTION 8 : Règles version ─────────────────────────────────────────────
section("8️⃣  SYNTAXE DE BASE");

if (rulesContent.startsWith("rules_version = '2';")) {
  ok("rules_version = '2' présent");
} else {
  fail("rules_version = '2' manquant en début de fichier");
}

if (rulesContent.includes("service cloud.firestore {")) {
  ok("Déclaration service cloud.firestore présente");
} else {
  fail("Déclaration service cloud.firestore manquante");
}

// Vérifier l'équilibre des accolades
const opens = (rulesContent.match(/\{/g) || []).length;
const closes = (rulesContent.match(/\}/g) || []).length;
if (opens === closes) {
  ok(`Accolades équilibrées (${opens} paires)`);
} else {
  fail(`Accolades déséquilibrées : ${opens} ouvrantes, ${closes} fermantes`);
}

// ─── RÉSUMÉ ──────────────────────────────────────────────────────────────────
section("📊 RÉSULTAT FINAL");

console.log(`\n  Collections dans le code  : ${usedCollections.size}`);
console.log(`  Collections dans les règles: ${coveredCollections.size}`);
console.log(`  Collections manquantes     : ${missing.length}`);
console.log(`\n  ✅ ${passed} tests passés`);
if (warned > 0) console.log(`  ⚠️  ${warned} avertissements`);
if (failed > 0) {
  console.log(`  ❌ ${failed} tests échoués`);
  console.log(`\n  Erreurs :`);
  errors.forEach(e => console.log(`    • ${e}`));
}
console.log(`\n  Taux de réussite : ${Math.round(passed / (passed + failed) * 100)}%\n`);

process.exit(failed > 0 ? 1 : 0);
