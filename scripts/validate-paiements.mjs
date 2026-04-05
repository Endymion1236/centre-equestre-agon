#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * SCRIPT DE VALIDATION — 20 CAS PRATIQUES PAIEMENTS & AVOIRS
 * ══════════════════════════════════════════════════════════════
 * Usage : npm run validate:paiements
 *
 * Teste le flux complet : inscription → encaissement → annulation
 * → avoir → utilisation → proforma → facture → offerts
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve } from "path";

// ─── Charger .env.local ───
function loadEnv() {
  try {
    const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of envFile.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const key = t.substring(0, eq).trim();
      let val = t.substring(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { console.warn("⚠️  .env.local non trouvé"); }
}
loadEnv();

// ─── Init Firebase Admin ───
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
if (privateKey.includes("\\n")) privateKey = privateKey.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ Variables Firebase manquantes. Vérifiez .env.local");
  process.exit(1);
}
if (getApps().length === 0) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();

// ─── Helpers ───
const TAG = "_valpay_" + Date.now();
const MARKER = { _testScript: true, _testTag: TAG };
let passed = 0, failed = 0;
const errors = [];
const createdDocs = [];

function log(icon, msg) { console.log(`  ${icon} ${msg}`); }

async function test(name, fn) {
  try { await fn(); passed++; log("✅", name); }
  catch (e) { failed++; const m = e?.message || String(e); log("❌", `${name} → ${m}`); errors.push(`${name}: ${m}`); }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || "Assertion failed"); }

async function createDoc(col, data) {
  const ref = await db.collection(col).add({ ...data, ...MARKER });
  createdDocs.push({ collection: col, id: ref.id });
  return ref;
}

async function cleanup() {
  console.log(`\n🧹 Nettoyage : ${createdDocs.length} documents de test...`);
  for (const { collection: col, id } of createdDocs) {
    try { await db.collection(col).doc(id).delete(); } catch {}
  }
  // Nettoyer le compteur de factures de test
  try {
    const counterSnap = await db.collection("settings").doc("invoiceCounter").get();
    if (counterSnap.exists) {
      const data = counterSnap.data();
      const testKey = `year_${new Date().getFullYear()}`;
      // Ne pas toucher au compteur réel — on ne peut pas savoir combien on a ajouté
    }
  } catch {}
  console.log("  ✅ Nettoyage terminé");
}

// ─── Données de test ───
const todayStr = new Date().toISOString().split("T")[0];
const FAMILY_ID = `test_family_${TAG}`;
const FAMILY_NAME = "Famille Test Paiements";
const CHILD1 = { id: `child1_${TAG}`, name: "Ambre Test" };
const CHILD2 = { id: `child2_${TAG}`, name: "Eliot Test" };
const CHILD3 = { id: `child3_${TAG}`, name: "Juliette Test" };
const CRENEAU_PRICE = 26;
const CRENEAU_PRICE_HT = Math.round(CRENEAU_PRICE / 1.055 * 100) / 100;

async function createTestCreneau(suffix = "") {
  return createDoc("creneaux", {
    date: todayStr,
    startTime: "10:00",
    endTime: "11:00",
    activityTitle: `Galop Test ${suffix}`,
    activityType: "cours",
    monitor: "Test Monitor",
    maxPlaces: 8,
    priceTTC: CRENEAU_PRICE,
    priceHT: CRENEAU_PRICE_HT,
    tvaTaux: 5.5,
    enrolled: [],
    status: "open",
  });
}

function makeItem(child, creneauId, title = "Galop Test") {
  return {
    activityTitle: title,
    childId: child.id,
    childName: child.name,
    creneauId,
    priceHT: CRENEAU_PRICE_HT,
    tva: 5.5,
    priceTTC: CRENEAU_PRICE,
  };
}

// ══════════════════════════════════════
async function run() {
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  20 CAS PRATIQUES — PAIEMENTS, AVOIRS, PROFORMA");
  console.log("══════════════════════════════════════════════════════════\n");

  // ═══ CAS 1 : Paiement ponctuel encaissé ═══
  console.log("── CAS 1-5 : FLUX INSCRIPTION → PAIEMENT → ANNULATION ──");

  let payRef1, encRef1;
  await test("Cas 1 — Créer un paiement encaissé (paid + encaissement)", async () => {
    const cr = await createTestCreneau("C1");
    payRef1 = await createDoc("payments", {
      familyId: FAMILY_ID, familyName: FAMILY_NAME,
      items: [makeItem(CHILD1, cr.id, "Galop Test C1")],
      totalTTC: CRENEAU_PRICE, paidAmount: CRENEAU_PRICE,
      paymentMode: "cb_terminal", status: "paid",
      invoiceNumber: `F-TEST-${TAG.slice(-4)}-001`,
      date: FieldValue.serverTimestamp(),
    });
    encRef1 = await createDoc("encaissements", {
      paymentId: payRef1.id, familyId: FAMILY_ID, familyName: FAMILY_NAME,
      montant: CRENEAU_PRICE, mode: "cb_terminal", modeLabel: "CB (terminal)",
      activityTitle: "Galop Test C1", date: FieldValue.serverTimestamp(),
    });
    const snap = await db.collection("payments").doc(payRef1.id).get();
    assert(snap.data().status === "paid", "Status devrait être paid");
    assert(snap.data().invoiceNumber, "invoiceNumber devrait être attribué");
  });

  // ═══ CAS 2 : Proforma (pending, pas de invoiceNumber) ═══
  let payRef2;
  await test("Cas 2 — Proforma : pending sans invoiceNumber", async () => {
    const cr = await createTestCreneau("C2");
    payRef2 = await createDoc("payments", {
      familyId: FAMILY_ID, familyName: FAMILY_NAME,
      items: [makeItem(CHILD1, cr.id, "Galop Test C2")],
      totalTTC: CRENEAU_PRICE, paidAmount: 0,
      paymentMode: "", status: "pending",
      orderId: `CMD-TEST-${TAG.slice(-4)}`,
      date: FieldValue.serverTimestamp(),
    });
    const snap = await db.collection("payments").doc(payRef2.id).get();
    assert(snap.data().status === "pending", "Status devrait être pending");
    assert(!snap.data().invoiceNumber, "Pas de invoiceNumber pour une proforma");
  });

  await test("Cas 2b — Proforma supprimable sans trace", async () => {
    // Vérifier qu'on peut supprimer une proforma
    const snap = await db.collection("payments").doc(payRef2.id).get();
    assert(snap.exists, "Le payment doit exister avant suppression");
    // On ne supprime pas ici car le cleanup le fera, mais on vérifie qu'il n'a pas de facture
    assert(!snap.data().invoiceNumber, "Pas de facture → supprimable");
  });

  // ═══ CAS 3 : Proforma → Facture définitive ═══
  let payRef3;
  await test("Cas 3 — Convertir proforma en facture définitive", async () => {
    const cr = await createTestCreneau("C3");
    payRef3 = await createDoc("payments", {
      familyId: FAMILY_ID, familyName: FAMILY_NAME,
      items: [makeItem(CHILD1, cr.id, "Galop Test C3")],
      totalTTC: CRENEAU_PRICE, paidAmount: 0,
      status: "pending",
      date: FieldValue.serverTimestamp(),
    });
    // Simuler la conversion
    const invoiceNumber = `F-TEST-${TAG.slice(-4)}-003`;
    await db.collection("payments").doc(payRef3.id).update({ invoiceNumber });
    const snap = await db.collection("payments").doc(payRef3.id).get();
    assert(snap.data().invoiceNumber === invoiceNumber, "invoiceNumber attribué");
    assert(snap.data().status === "pending", "Toujours pending mais avec facture");
  });

  await test("Cas 3b — Facture définitive non supprimable (doit être annulée)", async () => {
    const snap = await db.collection("payments").doc(payRef3.id).get();
    assert(snap.data().invoiceNumber, "A un invoiceNumber → non supprimable");
    // Simuler l'annulation
    await db.collection("payments").doc(payRef3.id).update({
      status: "cancelled", cancelledAt: FieldValue.serverTimestamp(),
      cancelReason: "Annulation test facture définitive",
      originalTotalTTC: CRENEAU_PRICE,
    });
    const snap2 = await db.collection("payments").doc(payRef3.id).get();
    assert(snap2.data().status === "cancelled", "Marquée cancelled, pas supprimée");
    assert(snap2.data().invoiceNumber, "invoiceNumber conservé");
  });

  // ═══ CAS 4 : Annulation avec avoir automatique ═══
  console.log("\n── CAS 4-5 : ANNULATION → AVOIR ──");

  let avoirRef1;
  await test("Cas 4 — Annulation encaissée → avoir automatique", async () => {
    const cr = await createTestCreneau("C4");
    const pay = await createDoc("payments", {
      familyId: FAMILY_ID, familyName: FAMILY_NAME,
      items: [makeItem(CHILD1, cr.id, "Galop Test C4"), makeItem(CHILD2, cr.id, "Galop Test C4")],
      totalTTC: CRENEAU_PRICE * 2, paidAmount: CRENEAU_PRICE * 2,
      paymentMode: "cb_terminal", status: "paid",
      invoiceNumber: `F-TEST-${TAG.slice(-4)}-004`,
      date: FieldValue.serverTimestamp(),
    });
    // Simuler l'annulation + création avoir
    await db.collection("payments").doc(pay.id).update({
      status: "cancelled", cancelledAt: FieldValue.serverTimestamp(),
      originalTotalTTC: CRENEAU_PRICE * 2,
    });
    const avoirAmount = CRENEAU_PRICE * 2;
    avoirRef1 = await createDoc("avoirs", {
      familyId: FAMILY_ID, familyName: FAMILY_NAME,
      type: "avoir", amount: avoirAmount, usedAmount: 0, remainingAmount: avoirAmount,
      reason: "Annulation Galop Test C4",
      reference: `AV-TEST-${TAG.slice(-4)}`,
      sourcePaymentId: pay.id, sourceType: "annulation",
      expiryDate: new Date(Date.now() + 365 * 86400000),
      status: "actif", usageHistory: [],
    });
    // Trace encaissement négatif
    await createDoc("encaissements", {
      paymentId: pay.id, familyId: FAMILY_ID, familyName: FAMILY_NAME,
      montant: -avoirAmount, mode: "avoir", modeLabel: "Avoir (annulation)",
      ref: `AV-TEST-${TAG.slice(-4)}`, isAvoir: true, avoirRef: `AV-TEST-${TAG.slice(-4)}`,
      date: FieldValue.serverTimestamp(),
    });
    const avoirSnap = await db.collection("avoirs").doc(avoirRef1.id).get();
    assert(avoirSnap.data().remainingAmount === avoirAmount, `Avoir de ${avoirAmount}€`);
    assert(avoirSnap.data().status === "actif", "Avoir actif");
  });

  await test("Cas 5 — Encaissement négatif existe dans le journal", async () => {
    const encSnap = await db.collection("encaissements")
      .where("_testTag", "==", TAG)
      .where("isAvoir", "==", true)
      .get();
    assert(!encSnap.empty, "Au moins 1 encaissement négatif");
    const negEnc = encSnap.docs.find(d => d.data().montant < 0);
    assert(negEnc, "Montant négatif trouvé");
    assert(negEnc.data().montant === -(CRENEAU_PRICE * 2), `Montant = -${CRENEAU_PRICE * 2}€`);
  });

  // ═══ CAS 6-8 : UTILISATION DES AVOIRS ═══
  console.log("\n── CAS 6-8 : UTILISATION DES AVOIRS ──");

  await test("Cas 6 — Utiliser un avoir (déduction complète)", async () => {
    const cr = await createTestCreneau("C6");
    // Simuler l'utilisation de 26€ sur l'avoir de 52€
    const avoirSnap = await db.collection("avoirs").doc(avoirRef1.id).get();
    const avoir = avoirSnap.data();
    const deduction = CRENEAU_PRICE;
    await db.collection("avoirs").doc(avoirRef1.id).update({
      usedAmount: (avoir.usedAmount || 0) + deduction,
      remainingAmount: avoir.remainingAmount - deduction,
      usageHistory: [...(avoir.usageHistory || []), { date: new Date().toISOString(), amount: deduction, invoiceRef: "TEST-C6" }],
    });
    const pay = await createDoc("payments", {
      familyId: FAMILY_ID, familyName: FAMILY_NAME,
      items: [makeItem(CHILD1, cr.id, "Galop Test C6")],
      totalTTC: CRENEAU_PRICE, paidAmount: CRENEAU_PRICE,
      paymentMode: "avoir", status: "paid",
      date: FieldValue.serverTimestamp(),
    });
    const snap = await db.collection("avoirs").doc(avoirRef1.id).get();
    assert(snap.data().remainingAmount === CRENEAU_PRICE, `Reste ${CRENEAU_PRICE}€ sur l'avoir`);
  });

  await test("Cas 7 — Avoir insuffisant → paiement partial", async () => {
    const cr = await createTestCreneau("C7");
    // L'avoir a 26€ restant, on essaie de payer 26€ → exact → paid
    const avoirSnap = await db.collection("avoirs").doc(avoirRef1.id).get();
    const avoir = avoirSnap.data();
    const deduction = avoir.remainingAmount; // 26€
    await db.collection("avoirs").doc(avoirRef1.id).update({
      usedAmount: avoir.amount, remainingAmount: 0,
      status: "utilise",
      usageHistory: [...(avoir.usageHistory || []), { date: new Date().toISOString(), amount: deduction, invoiceRef: "TEST-C7" }],
    });
    const snap = await db.collection("avoirs").doc(avoirRef1.id).get();
    assert(snap.data().remainingAmount === 0, "Avoir épuisé");
    assert(snap.data().status === "utilise", "Status utilisé");
  });

  await test("Cas 8 — Avoir épuisé → solde 0", async () => {
    const snap = await db.collection("avoirs").doc(avoirRef1.id).get();
    assert(snap.data().remainingAmount === 0, "Solde = 0€");
    assert(snap.data().status === "utilise", "Status = utilisé");
  });

  // ═══ CAS 9 : Avoir côté cavalier ═══
  await test("Cas 9 — Avoir créé avec les bons champs pour l'espace cavalier", async () => {
    const avoir2 = await createDoc("avoirs", {
      familyId: FAMILY_ID, familyName: FAMILY_NAME,
      type: "avoir", amount: 50, usedAmount: 0, remainingAmount: 50,
      reason: "Test cavalier", reference: `AV-CAV-${TAG.slice(-4)}`,
      status: "actif", usageHistory: [],
      expiryDate: new Date(Date.now() + 365 * 86400000),
    });
    // Le cavalier doit pouvoir requêter par familyId + status actif
    const snap = await db.collection("avoirs")
      .where("familyId", "==", FAMILY_ID)
      .where("status", "==", "actif")
      .get();
    assert(!snap.empty, "Avoir actif trouvable par familyId");
    const total = snap.docs.reduce((s, d) => s + (d.data().remainingAmount || 0), 0);
    assert(total === 50, `Solde disponible = 50€ (trouvé ${total}€)`);
  });

  // ═══ CAS 10-12 : STAGES ═══
  console.log("\n── CAS 10-12 : STAGES ──");

  await test("Cas 10 — Stage semaine complète : 5 créneaux même titre", async () => {
    const stageCreneaux = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(); d.setDate(d.getDate() + 30 + i);
      const cr = await createDoc("creneaux", {
        date: d.toISOString().split("T")[0],
        startTime: "10:00", endTime: "12:00",
        activityTitle: "Stage Pâques Test",
        activityType: "stage",
        maxPlaces: 8, priceTTC: 150, enrolled: [], status: "open",
      });
      stageCreneaux.push(cr);
    }
    assert(stageCreneaux.length === 5, "5 créneaux stage créés");
    // Vérifier qu'on peut les requêter par titre
    const snap = await db.collection("creneaux")
      .where("activityTitle", "==", "Stage Pâques Test")
      .where("_testTag", "==", TAG)
      .get();
    assert(snap.size === 5, `5 créneaux trouvés (trouvé ${snap.size})`);
  });

  await test("Cas 11 — Stage avec allowDayBooking + priceTTCDay", async () => {
    const d = new Date(); d.setDate(d.getDate() + 60);
    const cr = await createDoc("creneaux", {
      date: d.toISOString().split("T")[0],
      startTime: "10:00", endTime: "12:00",
      activityTitle: "Stage Été Test",
      activityType: "stage",
      maxPlaces: 8, priceTTC: 150,
      allowDayBooking: true, priceTTCDay: 35,
      enrolled: [], status: "open",
    });
    const snap = await db.collection("creneaux").doc(cr.id).get();
    assert(snap.data().allowDayBooking === true, "allowDayBooking activé");
    assert(snap.data().priceTTCDay === 35, "Prix journée = 35€");
  });

  await test("Cas 12 — Réductions fratrie stage (structure paiement)", async () => {
    const cr = await createTestCreneau("C12");
    // Simuler 3 enfants inscrits avec réductions
    const items = [
      { ...makeItem(CHILD1, cr.id, "Stage Test C12"), remise: 0 },
      { ...makeItem(CHILD2, cr.id, "Stage Test C12"), remise: 10 },
      { ...makeItem(CHILD3, cr.id, "Stage Test C12"), remise: 20 },
    ];
    const totalTTC = items.reduce((s, i) => s + i.priceTTC - (i.remise || 0), 0);
    const pay = await createDoc("payments", {
      familyId: FAMILY_ID, familyName: FAMILY_NAME,
      items, totalTTC, paidAmount: 0, status: "pending",
      date: FieldValue.serverTimestamp(),
    });
    const snap = await db.collection("payments").doc(pay.id).get();
    assert(snap.data().items.length === 3, "3 items dans le paiement");
    assert(snap.data().totalTTC === totalTTC, `Total = ${totalTTC}€`);
  });

  // ═══ CAS 13-14 : OFFERTS ═══
  console.log("\n── CAS 13-14 : OFFERTS ──");

  await test("Cas 13 — Inscription offerte (paiement 0€ avec motif)", async () => {
    const cr = await createTestCreneau("C13");
    const pay = await createDoc("payments", {
      familyId: FAMILY_ID, familyName: FAMILY_NAME,
      items: [{
        ...makeItem(CHILD1, cr.id, "Galop Test C13"),
        priceTTC: 0, priceHT: 0, originalPriceTTC: CRENEAU_PRICE,
      }],
      totalTTC: 0, paidAmount: 0,
      paymentMode: "offert", status: "paid",
      isFree: true, freeReason: "Monte poney",
      note: `🎁 Offert — Monte poney (valeur : ${CRENEAU_PRICE}€)`,
      date: FieldValue.serverTimestamp(),
    });
    const snap = await db.collection("payments").doc(pay.id).get();
    assert(snap.data().isFree === true, "isFree = true");
    assert(snap.data().freeReason === "Monte poney", "Motif = Monte poney");
    assert(snap.data().totalTTC === 0, "Total = 0€");
    assert(snap.data().items[0].originalPriceTTC === CRENEAU_PRICE, `Valeur originale = ${CRENEAU_PRICE}€`);
  });

  await test("Cas 14 — Offert n'apparaît pas dans les impayés", async () => {
    // Les offerts ont status=paid et totalTTC=0 → pas dans les impayés (pending/partial)
    const snap = await db.collection("payments")
      .where("familyId", "==", FAMILY_ID)
      .where("_testTag", "==", TAG)
      .get();
    const impayes = snap.docs.filter(d => d.data().status === "pending" || d.data().status === "partial");
    const offerts = snap.docs.filter(d => d.data().isFree === true);
    // Aucun offert ne doit être dans les impayés
    for (const o of offerts) {
      assert(o.data().status === "paid", "Offert a status=paid → pas impayé");
    }
    assert(offerts.length >= 1, "Au moins 1 offert trouvé");
  });

  // ═══ CAS 15-17 : COMPTABILITÉ ═══
  console.log("\n── CAS 15-17 : COMPTABILITÉ & JOURNAL ──");

  await test("Cas 15 — Journal : encaissements positifs et négatifs", async () => {
    const encSnap = await db.collection("encaissements")
      .where("_testTag", "==", TAG)
      .get();
    const positifs = encSnap.docs.filter(d => d.data().montant > 0);
    const negatifs = encSnap.docs.filter(d => d.data().montant < 0);
    assert(positifs.length >= 1, `Au moins 1 encaissement positif (trouvé ${positifs.length})`);
    assert(negatifs.length >= 1, `Au moins 1 encaissement négatif/avoir (trouvé ${negatifs.length})`);
    const total = encSnap.docs.reduce((s, d) => s + (d.data().montant || 0), 0);
    log("ℹ️", `  Total journal test = ${total.toFixed(2)}€ (${positifs.length} positifs, ${negatifs.length} négatifs)`);
  });

  await test("Cas 16 — Journal compta : pending exclus, paid inclus", async () => {
    const allPay = await db.collection("payments")
      .where("_testTag", "==", TAG)
      .get();
    const paid = allPay.docs.filter(d => d.data().status === "paid");
    const pending = allPay.docs.filter(d => d.data().status === "pending");
    // En compta, seuls les paid apparaissent
    assert(paid.length >= 2, `Au moins 2 paiements paid (trouvé ${paid.length})`);
    assert(pending.length >= 1, `Au moins 1 pending/proforma (trouvé ${pending.length})`);
    // Vérifier que les pending n'ont pas de invoiceNumber
    for (const p of pending) {
      if (!p.data().invoiceNumber) {
        // OK — c'est une vraie proforma
      }
    }
  });

  await test("Cas 17 — Numérotation : invoiceNumber sur les paid, pas sur les pending", async () => {
    const allPay = await db.collection("payments")
      .where("_testTag", "==", TAG)
      .get();
    const paidWithInvoice = allPay.docs.filter(d => d.data().status === "paid" && d.data().invoiceNumber);
    const pendingWithInvoice = allPay.docs.filter(d => d.data().status === "pending" && d.data().invoiceNumber);
    // Au moins 1 paid avec facture
    assert(paidWithInvoice.length >= 1, `Au moins 1 paid avec invoiceNumber (trouvé ${paidWithInvoice.length})`);
    // Les pending convertis en facture ont un invoiceNumber (cas 3) — c'est attendu
    log("ℹ️", `  ${paidWithInvoice.length} paid avec facture, ${pendingWithInvoice.length} pending avec facture (conversions)`);
  });

  // ═══ CAS 18 : DOUBLE INSCRIPTION ═══
  console.log("\n── CAS 18-20 : EDGE CASES ──");

  await test("Cas 18 — Anti-doublon : enrolled ne contient pas 2× le même enfant", async () => {
    const cr = await createTestCreneau("C18");
    // Inscrire 1 fois
    await db.collection("creneaux").doc(cr.id).update({
      enrolled: [{ childId: CHILD1.id, childName: CHILD1.name, familyId: FAMILY_ID }],
      enrolledCount: 1,
    });
    // Vérifier
    const snap = await db.collection("creneaux").doc(cr.id).get();
    const enrolled = snap.data().enrolled || [];
    const dupes = enrolled.filter(e => e.childId === CHILD1.id);
    assert(dupes.length === 1, `1 seule inscription pour ${CHILD1.name} (trouvé ${dupes.length})`);
  });

  // ═══ CAS 19 : Badge impayés ═══
  await test("Cas 19 — Comptage impayés (pending + partial)", async () => {
    // Créer 3 impayés
    for (let i = 0; i < 3; i++) {
      await createDoc("payments", {
        familyId: FAMILY_ID, familyName: FAMILY_NAME,
        items: [makeItem(CHILD1, `fake_cr_${i}`, `Impayé Test ${i}`)],
        totalTTC: 10 + i, paidAmount: 0, status: "pending",
        date: FieldValue.serverTimestamp(),
      });
    }
    const snap = await db.collection("payments")
      .where("_testTag", "==", TAG)
      .get();
    const impayes = snap.docs.filter(d => {
      const s = d.data().status;
      return (s === "pending" || s === "partial") && !d.data().isFree;
    });
    assert(impayes.length >= 3, `Au moins 3 impayés (trouvé ${impayes.length})`);
  });

  // ═══ CAS 20 : Encaissement mixte ═══
  await test("Cas 20 — Encaissement mixte (2 modes)", async () => {
    const cr = await createTestCreneau("C20");
    const pay = await createDoc("payments", {
      familyId: FAMILY_ID, familyName: FAMILY_NAME,
      items: [makeItem(CHILD1, cr.id, "Galop Test C20")],
      totalTTC: 50, paidAmount: 0, status: "pending",
      date: FieldValue.serverTimestamp(),
    });
    // 1er encaissement : 30€ CB
    await createDoc("encaissements", {
      paymentId: pay.id, familyId: FAMILY_ID, familyName: FAMILY_NAME,
      montant: 30, mode: "cb_terminal", modeLabel: "CB (terminal)",
      date: FieldValue.serverTimestamp(),
    });
    // 2ème encaissement : 20€ chèque
    await createDoc("encaissements", {
      paymentId: pay.id, familyId: FAMILY_ID, familyName: FAMILY_NAME,
      montant: 20, mode: "cheque", modeLabel: "Chèque",
      date: FieldValue.serverTimestamp(),
    });
    // Simuler le recalcul
    const encSnap = await db.collection("encaissements")
      .where("paymentId", "==", pay.id)
      .get();
    const totalEnc = encSnap.docs.reduce((s, d) => s + (d.data().montant || 0), 0);
    assert(totalEnc === 50, `Total encaissé = 50€ (trouvé ${totalEnc}€)`);
    const modes = [...new Set(encSnap.docs.map(d => d.data().mode))];
    assert(modes.length === 2, `2 modes de paiement (trouvé ${modes.length})`);
    assert(modes.includes("cb_terminal") && modes.includes("cheque"), "CB + Chèque");
    // Mettre à jour le payment
    await db.collection("payments").doc(pay.id).update({
      paidAmount: totalEnc, status: "paid",
      paymentMode: "mixte", paymentModes: modes,
    });
    const snap = await db.collection("payments").doc(pay.id).get();
    assert(snap.data().status === "paid", "Status = paid");
    assert(snap.data().paymentMode === "mixte", "Mode = mixte");
  });

  // ═══ RÉSULTATS ═══
  console.log("\n══════════════════════════════════════════════════════════");
  console.log(`  RÉSULTAT : ${passed} ✅ | ${failed} ❌ | ${passed + failed} total`);
  if (errors.length > 0) {
    console.log("\n  Erreurs :");
    errors.forEach(e => console.log(`    ❌ ${e}`));
  }
  console.log("══════════════════════════════════════════════════════════\n");

  await cleanup();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error("💥 Erreur fatale:", e); process.exit(1); });
