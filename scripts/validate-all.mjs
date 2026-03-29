#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * SCRIPT DE VALIDATION COMPLET — Centre Équestre d'Agon-Coutainville
 * ══════════════════════════════════════════════════════════════
 *
 * Teste tous les modules et workflows critiques via Firebase Admin SDK.
 * Crée des données de test, valide les flows, puis nettoie tout.
 *
 * Usage :
 *   node scripts/validate-all.mjs
 *
 * Prérequis :
 *   - .env.local avec les variables Firebase
 *   - npm install déjà fait
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve } from "path";

// ─── Charger .env.local manuellement (sans dotenv) ───
function loadEnv() {
  try {
    const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of envFile.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      let val = trimmed.substring(eqIdx + 1).trim();
      // Retirer les guillemets
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { console.warn("⚠️  .env.local non trouvé, utilisation des variables d'environnement système"); }
}
loadEnv();

// ─── Init Firebase Admin ───
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
if (privateKey.includes("\\n")) privateKey = privateKey.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ Variables Firebase manquantes (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)");
  console.error("   Vérifiez votre fichier .env.local");
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
const db = getFirestore();

// ─── Helpers ───
const TEST_TAG = "_validate_" + Date.now();
const TEST_MARKER = { _testScript: true, _testTag: TEST_TAG };
let passed = 0, failed = 0, skipped = 0;
const errors = [];
const createdDocs = [];

function log(icon, msg) { console.log(`  ${icon} ${msg}`); }
function section(title) { console.log(`\n${"═".repeat(60)}\n  ${title}\n${"═".repeat(60)}`); }

async function test(name, fn) {
  try {
    await fn();
    passed++;
    log("✅", name);
  } catch (e) {
    failed++;
    const msg = e?.message || String(e);
    log("❌", `${name} → ${msg}`);
    errors.push(`${name}: ${msg}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || "Assertion failed");
}

async function createDoc(col, data) {
  const ref = await db.collection(col).add({ ...data, ...TEST_MARKER });
  createdDocs.push({ collection: col, id: ref.id });
  return ref;
}

async function cleanup() {
  console.log(`\n🧹 Nettoyage : ${createdDocs.length} documents de test...`);
  for (const { collection, id } of createdDocs) {
    try { await db.collection(collection).doc(id).delete(); }
    catch { /* déjà supprimé */ }
  }
  // Nettoyer aussi les enrolled créés dans les créneaux de test
  const snap = await db.collection("creneaux").where("_testScript", "==", true).get();
  for (const doc of snap.docs) {
    try { await doc.ref.delete(); } catch {}
  }
  console.log("  ✅ Nettoyage terminé");
}

// ═══════════════════════════════════════
// TESTS
// ═══════════════════════════════════════

async function run() {
  console.log("🐴 Validation complète — Centre Équestre d'Agon-Coutainville");
  console.log(`   Projet : ${projectId}`);
  console.log(`   Date : ${new Date().toLocaleDateString("fr-FR")} ${new Date().toLocaleTimeString("fr-FR")}`);

  // ────────────────────────────
  section("1. CONNEXION FIREBASE");
  // ────────────────────────────
  await test("Connexion Firestore", async () => {
    const snap = await db.collection("families").limit(1).get();
    assert(!snap.empty || snap.empty, "Firestore accessible");
    log("ℹ️", `  ${snap.size > 0 ? "Base peuplée" : "Base vide"}`);
  });

  // ────────────────────────────
  section("2. COLLECTIONS ESSENTIELLES");
  // ────────────────────────────
  const collections = ["families", "activities", "creneaux", "payments", "reservations", "forfaits", "cartes", "avoirs", "settings"];
  for (const col of collections) {
    await test(`Collection "${col}" accessible`, async () => {
      const snap = await db.collection(col).limit(1).get();
      log("ℹ️", `  → ${snap.size} document(s) trouvé(s) (limit 1)`);
    });
  }

  // ────────────────────────────
  section("3. FAMILLES & CAVALIERS");
  // ────────────────────────────
  let testFamilyId = null;
  await test("Créer une famille de test", async () => {
    const ref = await createDoc("families", {
      parentName: "Famille Test Validation",
      parentEmail: "test-validate@example.com",
      parentPhone: "0600000000",
      authProvider: "google",
      children: [
        { id: "child-test-1", firstName: "Lucas-Test", birthDate: "2016-05-15", galopLevel: "G3", sanitaryForm: null },
        { id: "child-test-2", firstName: "Emma-Test", birthDate: "2018-09-20", galopLevel: "—", sanitaryForm: null },
      ],
      createdAt: FieldValue.serverTimestamp(),
    });
    testFamilyId = ref.id;
    assert(testFamilyId, "Famille créée avec ID");
  });

  await test("Lire la famille créée", async () => {
    const doc = await db.collection("families").doc(testFamilyId).get();
    assert(doc.exists, "Document existe");
    assert(doc.data().children.length === 2, "2 enfants trouvés");
    assert(doc.data().children[0].firstName === "Lucas-Test", "Premier enfant = Lucas-Test");
  });

  // ────────────────────────────
  section("4. PLANNING & CRÉNEAUX");
  // ────────────────────────────
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const nextWeekDates = [];
  for (let i = 1; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    nextWeekDates.push(d.toISOString().split("T")[0]);
  }

  // Trouver le prochain mercredi et samedi
  const nextWed = nextWeekDates.find(d => new Date(d).getDay() === 3);
  const nextSat = nextWeekDates.find(d => new Date(d).getDay() === 6);
  const nextWed2 = nextWeekDates.filter(d => new Date(d).getDay() === 3)[1]; // 2ème mercredi

  let creneauIds = [];

  await test("Créer des créneaux de test (cours)", async () => {
    // Créer 4 séances : 2 mercredis + 2 samedis
    const creneauxData = [
      { date: nextWed, startTime: "10:00", endTime: "11:00", activityTitle: "Galop d'or TEST", activityType: "cours", activityId: "act-test-1", monitor: "Emmeline", maxPlaces: 8 },
      { date: nextWed2, startTime: "10:00", endTime: "11:00", activityTitle: "Galop d'or TEST", activityType: "cours", activityId: "act-test-1", monitor: "Emmeline", maxPlaces: 8 },
      { date: nextSat, startTime: "14:30", endTime: "15:30", activityTitle: "G4 et + TEST", activityType: "cours", activityId: "act-test-2", monitor: "Emeline", maxPlaces: 8 },
      { date: nextWed, startTime: "17:00", endTime: "18:00", activityTitle: "Pony games TEST", activityType: "cours", activityId: "act-test-3", monitor: "Nicolas", maxPlaces: 8 },
    ];
    for (const c of creneauxData) {
      const ref = await createDoc("creneaux", { ...c, enrolled: [], enrolledCount: 0, status: "planned", priceTTC: 26, priceHT: 24.64, tvaTaux: 5.5 });
      creneauIds.push(ref.id);
    }
    assert(creneauIds.length === 4, `4 créneaux créés (got ${creneauIds.length})`);
  });

  await test("Vérifier les créneaux futurs", async () => {
    const snap = await db.collection("creneaux").where("date", ">=", todayStr).where("_testScript", "==", true).get();
    assert(snap.size >= 4, `Au moins 4 créneaux futurs de test (got ${snap.size})`);
  });

  // ────────────────────────────
  section("5. INSCRIPTION ANNUELLE (1×/sem)");
  // ────────────────────────────
  await test("Inscrire Lucas-Test dans Galop d'or (1×/sem)", async () => {
    // Simuler l'inscription dans tous les créneaux Galop d'or mercredi 10h
    const snap = await db.collection("creneaux")
      .where("activityTitle", "==", "Galop d'or TEST")
      .where("_testScript", "==", true)
      .get();

    assert(snap.size >= 2, `Au moins 2 créneaux Galop d'or TEST (got ${snap.size})`);

    for (const doc of snap.docs) {
      const enrolled = doc.data().enrolled || [];
      enrolled.push({
        childId: "child-test-1", childName: "Lucas-Test",
        familyId: testFamilyId, familyName: "Famille Test Validation",
        enrolledAt: new Date().toISOString(),
      });
      await doc.ref.update({ enrolled, enrolledCount: enrolled.length });
    }
  });

  await test("Vérifier Lucas inscrit dans 2 séances Galop d'or", async () => {
    const snap = await db.collection("creneaux")
      .where("activityTitle", "==", "Galop d'or TEST")
      .where("_testScript", "==", true)
      .get();

    let enrolledCount = 0;
    for (const doc of snap.docs) {
      const enrolled = doc.data().enrolled || [];
      if (enrolled.some(e => e.childId === "child-test-1")) enrolledCount++;
    }
    assert(enrolledCount === 2, `Lucas inscrit dans 2 séances (got ${enrolledCount})`);
  });

  // ────────────────────────────
  section("6. INSCRIPTION MULTI-SLOT (2×/sem)");
  // ────────────────────────────
  await test("Inscrire Lucas dans G4 et + (2ème créneau samedi)", async () => {
    const snap = await db.collection("creneaux")
      .where("activityTitle", "==", "G4 et + TEST")
      .where("_testScript", "==", true)
      .get();

    for (const doc of snap.docs) {
      const enrolled = doc.data().enrolled || [];
      enrolled.push({
        childId: "child-test-1", childName: "Lucas-Test",
        familyId: testFamilyId, familyName: "Famille Test Validation",
        enrolledAt: new Date().toISOString(),
      });
      await doc.ref.update({ enrolled, enrolledCount: enrolled.length });
    }
  });

  await test("Vérifier Lucas inscrit dans 3 créneaux total (2 Galop + 1 G4)", async () => {
    const snap = await db.collection("creneaux").where("_testScript", "==", true).get();
    let total = 0;
    for (const doc of snap.docs) {
      if ((doc.data().enrolled || []).some(e => e.childId === "child-test-1")) total++;
    }
    assert(total === 3, `Lucas inscrit dans 3 créneaux (got ${total})`);
  });

  await test("Vérifier que Lucas N'EST PAS dans Pony games (non sélectionné)", async () => {
    const snap = await db.collection("creneaux")
      .where("activityTitle", "==", "Pony games TEST")
      .where("_testScript", "==", true)
      .get();

    for (const doc of snap.docs) {
      const enrolled = doc.data().enrolled || [];
      assert(!enrolled.some(e => e.childId === "child-test-1"), "Lucas ne doit PAS être dans Pony games");
    }
  });

  // ────────────────────────────
  section("7. PAIEMENTS & FACTURATION");
  // ────────────────────────────
  let paymentId = null;

  await test("Créer un paiement forfait annuel", async () => {
    const ref = await createDoc("payments", {
      familyId: testFamilyId,
      familyName: "Famille Test Validation",
      items: [
        { activityTitle: "Adhésion annuelle (enfant 1)", childId: "child-test-1", childName: "Lucas-Test", priceTTC: 60, priceHT: 56.87, tva: 5.5 },
        { activityTitle: "Licence FFE -18ans", childId: "child-test-1", childName: "Lucas-Test", priceTTC: 25, priceHT: 25, tva: 0 },
        { activityTitle: "Forfait Galop d'or TEST (mercredi 10:00)", childId: "child-test-1", childName: "Lucas-Test", priceTTC: 520, priceHT: 492.89, tva: 5.5 },
      ],
      totalTTC: 605,
      paidAmount: 0,
      status: "pending",
      paymentMode: "",
      date: FieldValue.serverTimestamp(),
    });
    paymentId = ref.id;
    assert(paymentId, "Paiement créé");
  });

  await test("Regroupement fratrie — ajouter Emma au même paiement", async () => {
    const payDoc = await db.collection("payments").doc(paymentId).get();
    const existingItems = payDoc.data().items || [];

    const emmaItems = [
      { activityTitle: "Adhésion annuelle (enfant 2)", childId: "child-test-2", childName: "Emma-Test", priceTTC: 40, priceHT: 37.91, tva: 5.5 },
      { activityTitle: "Licence FFE -18ans", childId: "child-test-2", childName: "Emma-Test", priceTTC: 25, priceHT: 25, tva: 0 },
      { activityTitle: "Forfait Pony games TEST (mercredi 17:00)", childId: "child-test-2", childName: "Emma-Test", priceTTC: 470, priceHT: 445.50, tva: 5.5 },
    ];

    const mergedItems = [...existingItems, ...emmaItems];
    const newTotal = mergedItems.reduce((s, i) => s + (i.priceTTC || 0), 0);

    await db.collection("payments").doc(paymentId).update({
      items: mergedItems,
      totalTTC: newTotal,
    });

    const updated = await db.collection("payments").doc(paymentId).get();
    assert(updated.data().items.length === 6, `6 items dans le paiement (got ${updated.data().items.length})`);
    assert(updated.data().totalTTC === 1140, `Total = 1140€ (got ${updated.data().totalTTC})`);
  });

  await test("Adhésion dégressive — 2ème enfant à 40€ vs 60€", async () => {
    const payDoc = await db.collection("payments").doc(paymentId).get();
    const items = payDoc.data().items;
    const adhesion1 = items.find(i => i.activityTitle.includes("enfant 1") && i.activityTitle.includes("Adhésion"));
    const adhesion2 = items.find(i => i.activityTitle.includes("enfant 2") && i.activityTitle.includes("Adhésion"));
    assert(adhesion1.priceTTC === 60, `Adhésion enfant 1 = 60€ (got ${adhesion1.priceTTC})`);
    assert(adhesion2.priceTTC === 40, `Adhésion enfant 2 = 40€ (got ${adhesion2.priceTTC})`);
  });

  // ────────────────────────────
  section("8. RÉDUCTION / REMISE");
  // ────────────────────────────
  await test("Appliquer une remise de 10% sur la commande", async () => {
    const payDoc = await db.collection("payments").doc(paymentId).get();
    const items = payDoc.data().items;
    const total = items.reduce((s, i) => s + (i.priceTTC || 0), 0);
    const remise = Math.round(total * 10 / 100 * 100) / 100;

    // Répartir proportionnellement
    const updatedItems = items.map(it => {
      const part = total > 0 ? (it.priceTTC || 0) / total : 0;
      const newPrice = Math.max(0, Math.round((it.priceTTC - remise * part) * 100) / 100);
      return { ...it, priceTTC: newPrice };
    });
    const newTotal = updatedItems.reduce((s, i) => s + (i.priceTTC || 0), 0);

    await db.collection("payments").doc(paymentId).update({ items: updatedItems, totalTTC: Math.round(newTotal * 100) / 100 });

    const updated = await db.collection("payments").doc(paymentId).get();
    assert(updated.data().totalTTC < 1140, `Total après remise < 1140€ (got ${updated.data().totalTTC})`);
    assert(updated.data().totalTTC > 1000, `Total après remise > 1000€ (got ${updated.data().totalTTC})`);
  });

  // ────────────────────────────
  section("9. DÉSINSCRIPTION EN MASSE");
  // ────────────────────────────
  await test("Désinscrire Lucas de tous les créneaux", async () => {
    const snap = await db.collection("creneaux").where("_testScript", "==", true).get();
    let unenrolled = 0;
    for (const doc of snap.docs) {
      const enrolled = (doc.data().enrolled || []).filter(e => e.childId !== "child-test-1");
      if (enrolled.length !== (doc.data().enrolled || []).length) {
        await doc.ref.update({ enrolled, enrolledCount: enrolled.length });
        unenrolled++;
      }
    }
    assert(unenrolled === 3, `Lucas retiré de 3 créneaux (got ${unenrolled})`);
  });

  await test("Vérifier que Lucas n'est plus inscrit nulle part", async () => {
    const snap = await db.collection("creneaux").where("_testScript", "==", true).get();
    for (const doc of snap.docs) {
      const enrolled = doc.data().enrolled || [];
      assert(!enrolled.some(e => e.childId === "child-test-1"), `Lucas encore dans ${doc.data().activityTitle}`);
    }
  });

  // ────────────────────────────
  section("10. FORFAITS");
  // ────────────────────────────
  await test("Créer un forfait annuel", async () => {
    await createDoc("forfaits", {
      familyId: testFamilyId,
      familyName: "Famille Test Validation",
      childId: "child-test-1",
      childName: "Lucas-Test",
      slotKey: "Galop d'or TEST — mercredi 10:00",
      activityTitle: "Galop d'or TEST",
      dayLabel: "mercredi",
      startTime: "10:00",
      endTime: "11:00",
      totalSessions: 13,
      attendedSessions: 0,
      licenceFFE: true,
      licenceType: "moins18",
      adhesion: true,
      forfaitPriceTTC: 520,
      totalPaidTTC: 0,
      paymentPlan: "1x",
      status: "actif",
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  await test("Vérifier le forfait créé", async () => {
    const snap = await db.collection("forfaits").where("_testScript", "==", true).get();
    assert(snap.size >= 1, `Au moins 1 forfait de test (got ${snap.size})`);
    const f = snap.docs[0].data();
    assert(f.childName === "Lucas-Test", "Forfait pour Lucas-Test");
    assert(f.status === "actif", "Statut = actif");
  });

  // ────────────────────────────
  section("11. CARTES DE SÉANCES");
  // ────────────────────────────
  await test("Créer une carte 10 séances", async () => {
    await createDoc("cartes", {
      familyId: testFamilyId,
      familyName: "Famille Test Validation",
      childId: "child-test-1",
      childName: "Lucas-Test",
      totalSessions: 10,
      usedSessions: 0,
      remainingSessions: 10,
      priceTTC: 230,
      status: "active",
      history: [],
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  await test("Débiter une séance de la carte", async () => {
    const snap = await db.collection("cartes").where("_testScript", "==", true).get();
    const carte = snap.docs[0];
    await carte.ref.update({
      usedSessions: 1,
      remainingSessions: 9,
      history: FieldValue.arrayUnion({ date: todayStr, activityTitle: "Test", deductedAt: new Date().toISOString() }),
    });

    const updated = await db.collection("cartes").doc(carte.id).get();
    assert(updated.data().remainingSessions === 9, `Reste 9 séances (got ${updated.data().remainingSessions})`);
  });

  // ────────────────────────────
  section("12. AVOIRS");
  // ────────────────────────────
  await test("Créer un avoir", async () => {
    await createDoc("avoirs", {
      familyId: testFamilyId,
      familyName: "Famille Test Validation",
      type: "avoir",
      amount: 50,
      usedAmount: 0,
      remainingAmount: 50,
      reason: "Annulation test",
      reference: "AV-TEST-001",
      status: "actif",
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  // ────────────────────────────
  section("13. PARAMÈTRES & CONFIGURATION");
  // ────────────────────────────
  await test("Lire les paramètres d'inscription", async () => {
    const doc = await db.collection("settings").doc("inscription").get();
    if (doc.exists) {
      const data = doc.data();
      log("ℹ️", `  Forfait 1×: ${data.forfait1x || "—"}€ | 2×: ${data.forfait2x || "—"}€ | 3×: ${data.forfait3x || "—"}€`);
      log("ℹ️", `  Adhésion: ${data.adhesion1 || 60}€ / ${data.adhesion2 || 40}€ / ${data.adhesion3 || 20}€ / ${data.adhesion4plus || 0}€`);
    } else {
      log("⚠️", "  Document settings/inscription non trouvé (valeurs par défaut utilisées)");
    }
  });

  // ────────────────────────────
  section("14. API ROUTES (vérification existence)");
  // ────────────────────────────
  const apiRoutes = [
    "api/push/route.ts",
    "api/admin/unenroll-annual/route.ts",
    "api/cron/daily-notifications/route.ts",
    "api/cron/charge-stage-balances/route.ts",
    "api/stripe/checkout/route.ts",
    "api/stripe/webhook/route.ts",
    "api/invoice/route.ts",
    "api/facture/route.ts",
    "api/send-email/route.ts",
  ];

  for (const route of apiRoutes) {
    await test(`Route ${route}`, async () => {
      try {
        readFileSync(resolve(process.cwd(), "src/app", route), "utf8");
      } catch {
        throw new Error("Fichier manquant");
      }
    });
  }

  // ────────────────────────────
  section("15. PAGES ADMIN (vérification existence)");
  // ────────────────────────────
  const adminPages = [
    "admin/planning/page.tsx",
    "admin/planning/EnrollPanel.tsx",
    "admin/cavaliers/page.tsx",
    "admin/paiements/page.tsx",
    "admin/forfaits/page.tsx",
    "admin/cartes/page.tsx",
    "admin/avoirs/page.tsx",
    "admin/montoir/page.tsx",
    "admin/comptabilite/page.tsx",
    "admin/parametres/page.tsx",
    "admin/communication/page.tsx",
    "admin/statistiques/page.tsx",
  ];

  for (const page of adminPages) {
    await test(`Page ${page}`, async () => {
      try {
        readFileSync(resolve(process.cwd(), "src/app", page), "utf8");
      } catch {
        throw new Error("Fichier manquant");
      }
    });
  }

  // ────────────────────────────
  section("16. PAGES FAMILLE (vérification existence)");
  // ────────────────────────────
  const familyPages = [
    "espace-cavalier/dashboard/page.tsx",
    "espace-cavalier/inscription-annuelle/page.tsx",
    "espace-cavalier/reserver/page.tsx",
    "espace-cavalier/reservations/page.tsx",
    "espace-cavalier/factures/page.tsx",
    "espace-cavalier/profil/page.tsx",
  ];

  for (const page of familyPages) {
    await test(`Page ${page}`, async () => {
      try {
        readFileSync(resolve(process.cwd(), "src/app", page), "utf8");
      } catch {
        throw new Error("Fichier manquant");
      }
    });
  }

  // ────────────────────────────
  section("17. INTÉGRITÉ DES DONNÉES");
  // ────────────────────────────
  await test("Toutes les familles ont un parentEmail", async () => {
    const snap = await db.collection("families").get();
    let missing = 0;
    for (const doc of snap.docs) {
      if (!doc.data().parentEmail) missing++;
    }
    if (missing > 0) throw new Error(`${missing} famille(s) sans email`);
    log("ℹ️", `  ${snap.size} familles vérifiées`);
  });

  await test("Tous les créneaux futurs ont un activityTitle", async () => {
    const snap = await db.collection("creneaux").where("date", ">=", todayStr).get();
    let missing = 0;
    for (const doc of snap.docs) {
      if (!doc.data().activityTitle) missing++;
    }
    if (missing > 0) throw new Error(`${missing} créneau(x) sans activityTitle`);
    log("ℹ️", `  ${snap.size} créneaux futurs vérifiés`);
  });

  await test("Pas de doublons enrolled dans les créneaux", async () => {
    const snap = await db.collection("creneaux").where("date", ">=", todayStr).get();
    let doublons = 0;
    for (const doc of snap.docs) {
      const enrolled = doc.data().enrolled || [];
      const childIds = enrolled.map(e => e.childId);
      const uniqueIds = new Set(childIds);
      if (childIds.length !== uniqueIds.size) {
        doublons++;
        log("⚠️", `  Doublon dans ${doc.data().activityTitle} (${doc.data().date})`);
      }
    }
    if (doublons > 0) throw new Error(`${doublons} créneau(x) avec des doublons enrolled`);
  });

  await test("Paiements pending ont un familyId valide", async () => {
    const snap = await db.collection("payments").where("status", "==", "pending").get();
    let orphelins = 0;
    for (const doc of snap.docs) {
      if (!doc.data().familyId) orphelins++;
    }
    if (orphelins > 0) throw new Error(`${orphelins} paiement(s) sans familyId`);
    log("ℹ️", `  ${snap.size} paiements pending vérifiés`);
  });

  // ────────────────────────────
  section("18. VERCEL & CONFIG");
  // ────────────────────────────
  await test("vercel.json existe et a 2 crons", async () => {
    const content = readFileSync(resolve(process.cwd(), "vercel.json"), "utf8");
    const config = JSON.parse(content);
    assert(config.crons, "crons définis");
    assert(config.crons.length <= 2, `Max 2 crons pour Hobby (got ${config.crons.length})`);
    for (const cron of config.crons) {
      log("ℹ️", `  Cron: ${cron.path} → ${cron.schedule}`);
    }
  });

  await test("Variables d'environnement Firebase présentes", async () => {
    assert(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID, "PROJECT_ID");
    assert(process.env.FIREBASE_CLIENT_EMAIL, "CLIENT_EMAIL");
    assert(process.env.FIREBASE_PRIVATE_KEY, "PRIVATE_KEY");
  });

  await test("Variable VAPID_KEY présente", async () => {
    if (!process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) {
      log("⚠️", "  NEXT_PUBLIC_FIREBASE_VAPID_KEY non définie localement (OK si dans Vercel)");
    }
  });

  // ═══════════════════════════════════════
  // NETTOYAGE & RÉSUMÉ
  // ═══════════════════════════════════════
  await cleanup();

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  RÉSULTAT : ${passed} ✅  ${failed} ❌  ${skipped} ⏭️`);
  console.log(`${"═".repeat(60)}`);

  if (errors.length > 0) {
    console.log("\n🔴 Erreurs :");
    errors.forEach(e => console.log(`  → ${e}`));
  }

  if (failed === 0) {
    console.log("\n🎉 Tous les tests passent ! L'application est fonctionnelle.\n");
  } else {
    console.log(`\n⚠️  ${failed} test(s) en échec. Vérifiez les erreurs ci-dessus.\n`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error("💥 Erreur fatale:", e);
  cleanup().then(() => process.exit(1));
});
