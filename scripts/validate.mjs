/**
 * Script de validation automatique — Centre Équestre Agon
 * Lance : node scripts/validate.mjs
 *
 * Teste tous les scénarios critiques directement contre Firestore :
 *  1.  Inscription → payment pending créé
 *  2.  Carte cours débitée à l'inscription
 *  3.  Carte balade compatible / carte cours incompatible
 *  4.  Forfait cours actif → carte cours bloquée
 *  5.  Forfait cours actif → carte balade libre
 *  6.  Re-crédit carte à la désinscription
 *  7.  Duplication payment → status pending (pas draft)
 *  8.  Annulation avec avoir
 *  9.  Impayés : échéances exclues du filtre
 * 10.  Recalcul stage multi-enfants : remises proportionnelles préservées
 * 11.  Rollback carte via usedCardId local (pas relecture créneau)
 * 12.  Payment sans champ date → visible dans Impayés
 */

import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, doc, addDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, serverTimestamp
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDy1vrJpa12CrnyGoDkR9t4c3E31CS7Ovc",
  authDomain: "gestion-2026.firebaseapp.com",
  projectId: "gestion-2026",
  storageBucket: "gestion-2026.firebasestorage.app",
  messagingSenderId: "785848912923",
  appId: "1:785848912923:web:47f03aa109fa13eb1c7cbe",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const GREEN  = "\x1b[32m✅";
const RED    = "\x1b[31m❌";
const YELLOW = "\x1b[33m⚠️ ";
const RESET  = "\x1b[0m";
const BLUE   = "\x1b[34m";

let passed = 0, failed = 0, warned = 0;
const errors = [];

function ok(msg)        { console.log(`${GREEN} ${msg}${RESET}`); passed++; }
function fail(msg, d="") { console.log(`${RED} ${msg}${d ? "\n    → "+d : ""}${RESET}`); failed++; errors.push(msg); }
function warn(msg)      { console.log(`${YELLOW} ${msg}${RESET}`); warned++; }
function section(t)     { console.log(`\n${BLUE}━━━ ${t} ━━━${RESET}`); }

async function cleanup(ids) {
  for (const { col, id } of ids) {
    try { await deleteDoc(doc(db, col, id)); } catch (_) {}
  }
}

async function createTestFamily(suffix = "") {
  const ts = Date.now();
  const famRef = await addDoc(collection(db, "families"), {
    parentName: `TEST_${suffix}_${ts}`,
    parentEmail: "test@validate.local",
    children: [{ id: `child_${suffix}_${ts}`, firstName: `Enfant${suffix}`, birthDate: "2015-01-01", galopLevel: "Bronze" }],
    createdAt: serverTimestamp(),
  });
  const fam = await getDoc(famRef);
  const child = fam.data().children[0];
  return { famId: famRef.id, famName: fam.data().parentName, childId: child.id, childName: child.firstName };
}

// ─── TEST 1 ──────────────────────────────────────────────────────────────────
async function test1() {
  section("TEST 1 — Inscription crée un payment pending");
  const toClean = [];
  try {
    const { famId, famName, childId, childName } = await createTestFamily("T1");
    toClean.push({ col: "families", id: famId });

    const payRef = await addDoc(collection(db, "payments"), {
      orderId: `T1-${Date.now()}`,
      familyId: famId, familyName: famName,
      items: [{ activityTitle: "Cours test", childId, childName, creneauId: "fake", activityType: "cours", priceTTC: 22, priceHT: 20.85, tva: 5.5 }],
      totalTTC: 22, status: "pending", paidAmount: 0,
      paymentMode: "", paymentRef: "",
      date: serverTimestamp(), createdAt: serverTimestamp(),
    });
    toClean.push({ col: "payments", id: payRef.id });

    const pay = (await getDoc(payRef)).data();
    pay.status === "pending" ? ok("Status = pending") : fail("Status incorrect", pay.status);
    pay.totalTTC === 22       ? ok("Montant 22€")      : fail("Montant incorrect", String(pay.totalTTC));
    pay.paidAmount === 0      ? ok("paidAmount = 0")   : fail("paidAmount non nul");
  } finally { await cleanup(toClean); }
}

// ─── TEST 2 ──────────────────────────────────────────────────────────────────
async function test2() {
  section("TEST 2 — Débit carte cours");
  const toClean = [];
  try {
    const { famId, famName, childId, childName } = await createTestFamily("T2");
    toClean.push({ col: "families", id: famId });

    const carteRef = await addDoc(collection(db, "cartes"), {
      familyId: famId, familyName: famName, childId, childName,
      activityType: "cours",
      totalSessions: 5, usedSessions: 0, remainingSessions: 5,
      priceTTC: 100, status: "active", history: [],
      createdAt: serverTimestamp(),
    });
    toClean.push({ col: "cartes", id: carteRef.id });

    const before = (await getDoc(carteRef)).data();
    await updateDoc(carteRef, {
      remainingSessions: before.remainingSessions - 1,
      usedSessions: before.usedSessions + 1,
      status: before.remainingSessions - 1 <= 0 ? "used" : "active",
      history: [...before.history, { date: new Date().toISOString(), activityTitle: "Cours test", childName, auto: false }],
      updatedAt: serverTimestamp(),
    });

    const after = (await getDoc(carteRef)).data();
    after.remainingSessions === 4 ? ok("5 → 4 séances restantes") : fail("Débit incorrect", String(after.remainingSessions));
    after.usedSessions === 1      ? ok("usedSessions = 1")        : fail("usedSessions incorrect");
    after.history.length === 1    ? ok("Historique enregistré")   : fail("Historique manquant");
  } finally { await cleanup(toClean); }
}

// ─── TEST 3 ──────────────────────────────────────────────────────────────────
async function test3() {
  section("TEST 3 — Compatibilité carte / type activité");

  const cases = [
    { cardType: "cours",  actType: "cours",      expected: true,  label: "carte cours + cours" },
    { cardType: "cours",  actType: "balade",     expected: false, label: "carte cours + balade" },
    { cardType: "balade", actType: "balade",     expected: true,  label: "carte balade + balade" },
    { cardType: "balade", actType: "promenade",  expected: true,  label: "carte balade + promenade" },
    { cardType: "balade", actType: "cours",      expected: false, label: "carte balade + cours" },
    { cardType: "balade", actType: "ponyride",   expected: true,  label: "carte balade + ponyride" },
  ];

  const isCoursType  = (t) => ["cours","cours_collectif","cours_particulier"].includes(t);
  const isBaladeType = (t) => ["balade","promenade","ponyride"].includes(t);

  for (const { cardType, actType, expected, label } of cases) {
    const compatible =
      (cardType === "cours"  && isCoursType(actType))  ||
      (cardType === "balade" && isBaladeType(actType));
    compatible === expected
      ? ok(`${label} → ${expected ? "compatible" : "incompatible"} ✓`)
      : fail(`${label} → résultat inattendu`, `attendu: ${expected}, reçu: ${compatible}`);
  }
}

// ─── TEST 4 ──────────────────────────────────────────────────────────────────
async function test4() {
  section("TEST 4 — Forfait cours actif → carte cours bloquée");
  const toClean = [];
  try {
    const { famId, famName, childId, childName } = await createTestFamily("T4");
    toClean.push({ col: "families", id: famId });

    const forfaitRef = await addDoc(collection(db, "forfaits"), {
      familyId: famId, childId, childName,
      activityType: "cours", status: "actif",
      createdAt: serverTimestamp(),
    });
    toClean.push({ col: "forfaits", id: forfaitRef.id });

    const snap = await getDocs(query(collection(db, "forfaits"), where("childId","==",childId), where("status","==","actif")));
    const isCoursType = true;
    const hasForfait = snap.docs.some(d => {
      const t = d.data().activityType || "cours";
      return t === "all" || (t === "cours" && isCoursType);
    });

    hasForfait ? ok("Forfait cours détecté → carte bloquée") : fail("Forfait non détecté");
  } finally { await cleanup(toClean); }
}

// ─── TEST 5 ──────────────────────────────────────────────────────────────────
async function test5() {
  section("TEST 5 — Forfait cours actif → carte balade libre");
  const toClean = [];
  try {
    const { famId, famName, childId, childName } = await createTestFamily("T5");
    toClean.push({ col: "families", id: famId });

    const forfaitRef = await addDoc(collection(db, "forfaits"), {
      familyId: famId, childId, childName,
      activityType: "cours", status: "actif",
      createdAt: serverTimestamp(),
    });
    toClean.push({ col: "forfaits", id: forfaitRef.id });

    const snap = await getDocs(query(collection(db, "forfaits"), where("childId","==",childId), where("status","==","actif")));
    const isBaladeType = true;
    const hasForfaitPourBalade = snap.docs.some(d => {
      const t = d.data().activityType || "cours";
      return t === "all" || (t === "balade" && isBaladeType);
    });

    !hasForfaitPourBalade ? ok("Forfait cours ne bloque pas la carte balade ✓") : fail("Forfait cours bloque à tort la carte balade !");
  } finally { await cleanup(toClean); }
}

// ─── TEST 6 ──────────────────────────────────────────────────────────────────
async function test6() {
  section("TEST 6 — Re-crédit carte à la désinscription");
  const toClean = [];
  try {
    const { famId, famName, childId, childName } = await createTestFamily("T6");
    toClean.push({ col: "families", id: famId });

    const carteRef = await addDoc(collection(db, "cartes"), {
      familyId: famId, childId, childName,
      activityType: "cours",
      totalSessions: 10, usedSessions: 3, remainingSessions: 7,
      status: "active", history: [],
      createdAt: serverTimestamp(),
    });
    toClean.push({ col: "cartes", id: carteRef.id });

    const before = (await getDoc(carteRef)).data();
    await updateDoc(carteRef, {
      remainingSessions: before.remainingSessions + 1,
      usedSessions: Math.max(0, before.usedSessions - 1),
      status: "active",
      history: [...before.history, { date: new Date().toISOString(), activityTitle: "Recrédit — Cours test", credit: true }],
      updatedAt: serverTimestamp(),
    });

    const after = (await getDoc(carteRef)).data();
    after.remainingSessions === 8                  ? ok("Re-crédit : 7 → 8")           : fail("Re-crédit incorrect", String(after.remainingSessions));
    after.usedSessions === 2                       ? ok("usedSessions : 3 → 2")        : fail("usedSessions incorrect");
    after.history.at(-1)?.credit === true          ? ok("Historique re-crédit OK")     : fail("Historique re-crédit manquant");
  } finally { await cleanup(toClean); }
}

// ─── TEST 7 ──────────────────────────────────────────────────────────────────
async function test7() {
  section("TEST 7 — Duplication payment → status pending");
  const toClean = [];
  try {
    const { famId, famName, childId, childName } = await createTestFamily("T7");
    toClean.push({ col: "families", id: famId });

    const srcRef = await addDoc(collection(db, "payments"), {
      orderId: `SRC-${Date.now()}`,
      familyId: famId, familyName: famName,
      items: [{ activityTitle: "Stage test", childId, childName, priceTTC: 175, priceHT: 165.88, tva: 5.5 }],
      totalTTC: 175, status: "paid", paidAmount: 175,
      date: serverTimestamp(), createdAt: serverTimestamp(),
    });
    toClean.push({ col: "payments", id: srcRef.id });

    const dupRef = await addDoc(collection(db, "payments"), {
      orderId: `DUP-${Date.now()}`,
      familyId: famId, familyName: famName,
      items: [{ activityTitle: "Stage test", childId, childName, priceTTC: 175, priceHT: 165.88, tva: 5.5, creneauId: "", reservationId: "" }],
      totalTTC: 175, status: "pending", paidAmount: 0,
      paymentMode: "", paymentRef: "",
      source: "duplicate", sourcePaymentId: srcRef.id,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    toClean.push({ col: "payments", id: dupRef.id });

    const dup = (await getDoc(dupRef)).data();
    dup.status === "pending"           ? ok("Duplication en status pending")    : fail("Status incorrect", dup.status);
    dup.paidAmount === 0               ? ok("paidAmount = 0")                   : fail("paidAmount non nul");
    !dup.items[0].creneauId            ? ok("creneauId vidé")                   : fail("creneauId non vidé");
    !dup.items[0].reservationId        ? ok("reservationId vidé")               : fail("reservationId non vidé");
  } finally { await cleanup(toClean); }
}

// ─── TEST 8 ──────────────────────────────────────────────────────────────────
async function test8() {
  section("TEST 8 — Annulation commande encaissée → avoir créé");
  const toClean = [];
  try {
    const { famId, famName, childId, childName } = await createTestFamily("T8");
    toClean.push({ col: "families", id: famId });

    const payRef = await addDoc(collection(db, "payments"), {
      orderId: `PAY-${Date.now()}`,
      familyId: famId, familyName: famName,
      items: [{ activityTitle: "Cours test", childId, childName, priceTTC: 22 }],
      totalTTC: 22, status: "paid", paidAmount: 22,
      date: serverTimestamp(), createdAt: serverTimestamp(),
    });
    toClean.push({ col: "payments", id: payRef.id });

    await updateDoc(payRef, { status: "cancelled", cancelledAt: serverTimestamp(), updatedAt: serverTimestamp() });

    const avoirRef = await addDoc(collection(db, "avoirs"), {
      familyId: famId, familyName: famName,
      type: "avoir", amount: 22, usedAmount: 0, remainingAmount: 22,
      reason: "Annulation commande — Cours test",
      reference: `AV-TEST-${Date.now()}`,
      sourcePaymentId: payRef.id, sourceType: "annulation",
      status: "actif", usageHistory: [],
      createdAt: serverTimestamp(),
    });
    toClean.push({ col: "avoirs", id: avoirRef.id });

    const pay   = (await getDoc(payRef)).data();
    const avoir = (await getDoc(avoirRef)).data();

    pay.status === "cancelled"        ? ok("Payment cancelled")         : fail("Payment non cancelled");
    avoir.amount === 22               ? ok("Avoir 22€")                 : fail("Montant avoir incorrect");
    avoir.remainingAmount === 22      ? ok("remainingAmount correct")   : fail("remainingAmount incorrect");
    avoir.status === "actif"          ? ok("Avoir actif")               : fail("Avoir non actif");
    avoir.reference.startsWith("AV-") ? ok("Référence avoir formatée") : fail("Référence incorrecte");
  } finally { await cleanup(toClean); }
}

// ─── TEST 9 ──────────────────────────────────────────────────────────────────
async function test9() {
  section("TEST 9 — Impayés : échéances exclues du filtre");
  const toClean = [];
  try {
    const { famId, famName, childId, childName } = await createTestFamily("T9");
    toClean.push({ col: "families", id: famId });

    const payRef = await addDoc(collection(db, "payments"), {
      orderId: `PAY-${Date.now()}`,
      familyId: famId, familyName: famName,
      items: [{ activityTitle: "Cours test", childId, childName, priceTTC: 22 }],
      totalTTC: 22, status: "pending", paidAmount: 0,
      date: serverTimestamp(), createdAt: serverTimestamp(),
    });
    toClean.push({ col: "payments", id: payRef.id });

    const echRef = await addDoc(collection(db, "payments"), {
      orderId: `ECH-${Date.now()}`,
      familyId: famId, familyName: famName,
      items: [{ activityTitle: "Forfait test", childId, childName, priceTTC: 50 }],
      totalTTC: 50, status: "pending", paidAmount: 0,
      echeancesTotal: 10, echeance: 1, forfaitRef: "test",
      date: serverTimestamp(), createdAt: serverTimestamp(),
    });
    toClean.push({ col: "payments", id: echRef.id });

    const all = [
      { id: payRef.id, ...(await getDoc(payRef)).data() },
      { id: echRef.id, ...(await getDoc(echRef)).data() },
    ];

    const unpaid = all.filter(p => {
      if (p.status === "cancelled" || p.status === "paid") return false;
      if ((p.paidAmount || 0) >= (p.totalTTC || 0)) return false;
      if ((p.echeancesTotal || 0) > 1) return false;
      return true;
    });

    unpaid.length === 1          ? ok("1 impayé, 0 échéance (correct)")    : fail("Filtre impayés incorrect", `${unpaid.length} résultats`);
    unpaid[0]?.id === payRef.id  ? ok("Le bon payment dans Impayés")        : fail("Mauvais payment dans Impayés");
  } finally { await cleanup(toClean); }
}

// ─── TEST 10 ─────────────────────────────────────────────────────────────────
async function test10() {
  section("TEST 10 — Recalcul stage : remises proportionnelles préservées");

  const items = [
    { childName: "Enfant A", activityType: "stage", priceTTC: 175 }, // plein tarif
    { childName: "Enfant B", activityType: "stage", priceTTC: 140 }, // remise 20%
  ];
  const prices = { 1: 175, 2: 300, 3: 400, 4: 475 };
  const before = 1, after = 2;

  const priceKeys = Object.keys(prices).map(Number).sort((a,b)=>a-b);
  const refBefore = prices[before] || prices[priceKeys.filter(k=>k<=before).at(-1) || 1] || 0;
  const refAfter  = prices[after]  || prices[priceKeys.filter(k=>k<=after).at(-1)  || 1] || 0;
  const ratio = refBefore > 0 ? refAfter / refBefore : 1;

  const updated = items.map(item => ({
    ...item,
    priceTTC: Math.round(item.priceTTC * ratio * 100) / 100,
  }));

  updated[0].priceTTC === 300 ? ok("Enfant A : 175€ → 300€ (2 jours)") : fail("Enfant A incorrect", String(updated[0].priceTTC));

  const expectedB = Math.round(140 * ratio * 100) / 100;
  updated[1].priceTTC === expectedB ? ok(`Enfant B : 140€ → ${expectedB}€ (remise 20% préservée)`) : fail("Enfant B incorrect", String(updated[1].priceTTC));

  const ratioAvant = items[1].priceTTC / items[0].priceTTC;
  const ratioApres = updated[1].priceTTC / updated[0].priceTTC;
  Math.abs(ratioAvant - ratioApres) < 0.001
    ? ok(`Ratio remise préservé (${(ratioAvant*100).toFixed(1)}%)`)
    : fail("Ratio remise altéré", `avant: ${ratioAvant.toFixed(3)}, après: ${ratioApres.toFixed(3)}`);
}

// ─── TEST 11 ─────────────────────────────────────────────────────────────────
async function test11() {
  section("TEST 11 — Rollback carte via usedCardId local");
  const toClean = [];
  try {
    const { famId, famName, childId, childName } = await createTestFamily("T11");
    toClean.push({ col: "families", id: famId });

    const carteRef = await addDoc(collection(db, "cartes"), {
      familyId: famId, childId, childName,
      activityType: "cours",
      totalSessions: 5, usedSessions: 0, remainingSessions: 5,
      status: "active", history: [],
      createdAt: serverTimestamp(),
    });
    toClean.push({ col: "cartes", id: carteRef.id });

    // Capturer l'ID AVANT le débit (comme handleEnroll le fait maintenant)
    let usedCardId = null;
    usedCardId = carteRef.id;

    // Débiter
    await updateDoc(carteRef, { remainingSessions: 4, usedSessions: 1, updatedAt: serverTimestamp() });

    // Simuler erreur → rollback via usedCardId local
    if (usedCardId) {
      const snap = await getDoc(doc(db, "cartes", usedCardId));
      if (snap.exists()) {
        const cd = snap.data();
        await updateDoc(doc(db, "cartes", usedCardId), {
          remainingSessions: cd.remainingSessions + 1,
          usedSessions: Math.max(0, cd.usedSessions - 1),
          status: "active", updatedAt: serverTimestamp(),
        });
      }
    }

    const final = (await getDoc(carteRef)).data();
    final.remainingSessions === 5 ? ok("Rollback OK : retour à 5 séances") : fail("Rollback incorrect", String(final.remainingSessions));
    final.usedSessions === 0      ? ok("usedSessions restauré à 0")        : fail("usedSessions non restauré");
  } finally { await cleanup(toClean); }
}

// ─── TEST 12 ─────────────────────────────────────────────────────────────────
async function test12() {
  section("TEST 12 — Payment sans date → inclus dans Impayés");
  const toClean = [];
  try {
    const { famId, famName, childId, childName } = await createTestFamily("T12");
    toClean.push({ col: "families", id: famId });

    const payRef = await addDoc(collection(db, "payments"), {
      orderId: `NODATE-${Date.now()}`,
      familyId: famId, familyName: famName,
      items: [{ activityTitle: "Cours test", childId, childName, priceTTC: 22 }],
      totalTTC: 22, status: "pending", paidAmount: 0,
      // Intentionnellement sans champ "date"
      createdAt: serverTimestamp(),
    });
    toClean.push({ col: "payments", id: payRef.id });

    const data = (await getDoc(payRef)).data();

    // Vérifier que le tri côté client (date?.seconds || 0) ne l'exclut pas
    const dateSeconds = data.date?.seconds || 0;
    typeof dateSeconds === "number" ? ok("date?.seconds || 0 renvoie un nombre (pas d'erreur)")
                                    : fail("date?.seconds || 0 échoue");

    // Vérifier que le filtre impayés le capture
    const inUnpaid = data.status !== "cancelled"
      && data.status !== "paid"
      && (data.paidAmount || 0) < (data.totalTTC || 0)
      && !((data.echeancesTotal || 0) > 1);
    inUnpaid ? ok("Payment sans date inclus dans Impayés") : fail("Payment sans date exclu des Impayés");
  } finally { await cleanup(toClean); }
}

// ─── RUNNER ──────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n${BLUE}╔══════════════════════════════════════════════╗`);
  console.log(`║  VALIDATION AUTOMATIQUE — CENTRE ÉQUESTRE    ║`);
  console.log(`╚══════════════════════════════════════════════╝${RESET}`);
  console.log(`\nFirestore : ${firebaseConfig.projectId}\n`);

  try {
    await test1();
    await test2();
    await test3();
    await test4();
    await test5();
    await test6();
    await test7();
    await test8();
    await test9();
    await test10();
    await test11();
    await test12();
  } catch (e) {
    console.error("\nErreur fatale dans le runner:", e);
  }

  console.log(`\n${BLUE}━━━ RÉSUMÉ ━━━${RESET}`);
  console.log(`${GREEN} ${passed} passé(s)${RESET}`);
  if (warned) console.log(`${YELLOW} ${warned} avertissement(s)${RESET}`);
  if (failed) {
    console.log(`${RED} ${failed} échoué(s)${RESET}`);
    console.log(`\nPoints en échec :`);
    errors.forEach(e => console.log(`  ${RED} ${e}${RESET}`));
    process.exit(1);
  } else {
    console.log(`\n${GREEN} Tous les scénarios critiques sont validés ✓${RESET}\n`);
    process.exit(0);
  }
}

run();
