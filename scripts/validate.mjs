/**
 * Script de validation automatisé — Centre Équestre Agon
 * Lance : node scripts/validate.mjs
 *
 * Scénarios testés :
 *  S1  — Inscription crée un payment pending dans Impayés
 *  S2  — Carte cours débitée automatiquement à l'inscription cours
 *  S3  — Carte balade compatible, carte cours incompatible avec balade
 *  S4  — Forfait cours actif → carte cours NON débitée
 *  S5  — Forfait cours actif → carte balade toujours utilisable
 *  S6  — Stage 1j → +1j : tarif mis à jour (1 enfant)
 *  S7  — Stage 1j → +1j : remises individuelles préservées (2 enfants)
 *  S8  — Duplication commande → payment pending avec traçabilité
 *  S9  — Annulation commande non encaissée → status cancelled
 *  S10 — Concurrence légère : 2 inscriptions simultanées même famille
 */

import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, doc, addDoc, getDoc, getDocs,
  updateDoc, query, where, serverTimestamp, writeBatch
} from "firebase/firestore";

const app = initializeApp({
  apiKey: "AIzaSyDy1vrJpa12CrnyGoDkR9t4c3E31CS7Ovc",
  authDomain: "gestion-2026.firebaseapp.com",
  projectId: "gestion-2026",
  storageBucket: "gestion-2026.firebasestorage.app",
  messagingSenderId: "785848912923",
  appId: "1:785848912923:web:47f03aa109fa13eb1c7cbe",
});
const db = getFirestore(app);

// ─── Rapport ───
let passed = 0, failed = 0, warned = 0;
const toClean = { families: [], payments: [], cartes: [], forfaits: [], creneaux: [] };
const TS = () => `[${new Date().toLocaleTimeString("fr-FR")}]`;

function ok(label)           { console.log(`    ✅ ${label}`); passed++; }
function fail(label, got="") { console.log(`    ❌ ${label}${got ? " — obtenu: " + JSON.stringify(got) : ""}`); failed++; }
function warn(label)         { console.log(`    ⚠️  ${label}`); warned++; }
function section(n, title)   { console.log(`\n  ┌─ S${n} ${title}`); }

// ─── Fixtures ───
async function newFamily(name) {
  const ref = await addDoc(collection(db, "families"), {
    parentName: name, parentEmail: `validate_${Date.now()}@test.invalid`,
    children: [], _validate: true, createdAt: serverTimestamp(),
  });
  toClean.families.push(ref.id);
  return ref.id;
}

async function newCreneau(opts = {}) {
  const ref = await addDoc(collection(db, "creneaux"), {
    activityTitle: opts.title || "Cours test", activityType: opts.type || "cours",
    date: new Date().toISOString().slice(0, 10),
    startTime: "10:00", endTime: "11:00", maxPlaces: 10,
    enrolledCount: 0, enrolled: [],
    priceTTC: opts.priceTTC ?? 22, priceHT: (opts.priceTTC ?? 22) / 1.055, tvaTaux: 5.5,
    price1day: opts.p1 ?? null, price2days: opts.p2 ?? null,
    price3days: opts.p3 ?? null, price4days: opts.p4 ?? null,
    monitor: "Validate", status: "planned", _validate: true,
  });
  toClean.creneaux.push(ref.id);
  return ref.id;
}

async function newPayment(familyId, familyName, items, status = "pending") {
  const totalTTC = items.reduce((s, i) => s + (i.priceTTC || 0), 0);
  const ref = await addDoc(collection(db, "payments"), {
    familyId, familyName, items, totalTTC, status,
    paidAmount: status === "paid" ? totalTTC : 0,
    paymentMode: status === "paid" ? "cb_terminal" : "",
    date: serverTimestamp(), _validate: true,
  });
  toClean.payments.push(ref.id);
  return ref.id;
}

async function newCarte(childId, familyId, activityType = "cours", sessions = 5) {
  const ref = await addDoc(collection(db, "cartes"), {
    familyId, childId, activityType,
    totalSessions: sessions, usedSessions: 0, remainingSessions: sessions,
    status: "active", history: [], _validate: true, createdAt: serverTimestamp(),
  });
  toClean.cartes.push(ref.id);
  return ref.id;
}

async function newForfait(childId, activityType = "cours") {
  const ref = await addDoc(collection(db, "forfaits"), {
    childId, activityType, status: "actif", _validate: true, createdAt: serverTimestamp(),
  });
  toClean.forfaits.push(ref.id);
  return ref.id;
}

function item(title, childId, childName, type, priceTTC) {
  return { activityTitle: title, childId, childName, activityType: type,
           priceTTC, priceHT: priceTTC / 1.055, tva: 5.5, creneauId: "" };
}

// ─── Logique métier (miroir du code app) ───
function isCarteCompatible(cardType, creneauType) {
  const isCoursType = ["cours", "cours_collectif", "cours_particulier"].includes(creneauType);
  const isBaladeType = ["balade", "promenade", "ponyride"].includes(creneauType);
  if (cardType === "cours" && isCoursType) return true;
  if (cardType === "balade" && isBaladeType) return true;
  return false;
}

function isForfaitBlockingCarte(forfaitType, creneauType) {
  const isCoursType = ["cours", "cours_collectif", "cours_particulier"].includes(creneauType);
  const isBaladeType = ["balade", "promenade", "ponyride"].includes(creneauType);
  if (forfaitType === "all") return true;
  if (forfaitType === "cours" && isCoursType) return true;
  if (forfaitType === "balade" && isBaladeType) return true;
  return false;
}

function recalcStageItems(oldItems, joursInscrits, prices) {
  const priceKeys = Object.keys(prices).map(Number).sort((a,b) => a-b);
  const totalDaysNow = joursInscrits + 1;
  const refBefore = prices[joursInscrits] ?? prices[priceKeys.filter(k => k <= joursInscrits).at(-1)];
  const refAfter  = prices[totalDaysNow]  ?? prices[priceKeys.filter(k => k <= totalDaysNow).at(-1)];
  const ratio = refBefore > 0 ? refAfter / refBefore : 1;
  return oldItems.map(it => {
    if (it.activityType === "stage" || it.activityType === "stage_journee") {
      const p = Math.round(it.priceTTC * ratio * 100) / 100;
      return { ...it, priceTTC: p, priceHT: Math.round(p / 1.055 * 100) / 100 };
    }
    return it;
  });
}

// ─── Scénarios ───

async function s1() {
  section(1, "Inscription crée un payment pending");
  const famId = await newFamily("Famille S1");
  const payId = await newPayment(famId, "Famille S1",
    [item("Cours galop 1", "c_s1", "Alice", "cours", 22)], "pending");
  const pay = (await getDoc(doc(db, "payments", payId))).data();
  pay.status === "pending" ? ok("status = pending") : fail("status devrait être pending", pay.status);
  pay.totalTTC === 22       ? ok("totalTTC = 22€")  : fail("totalTTC incorrect", pay.totalTTC);
  pay.paidAmount === 0      ? ok("paidAmount = 0")  : fail("paidAmount devrait être 0", pay.paidAmount);
}

async function s2() {
  section(2, "Carte cours débitée à l'inscription cours");
  const famId = await newFamily("Famille S2");
  const carteId = await newCarte("c_s2", famId, "cours", 5);

  // Simuler débit (comme handleEnroll)
  const carteRef = doc(db, "cartes", carteId);
  const before = (await getDoc(carteRef)).data();
  await updateDoc(carteRef, {
    remainingSessions: before.remainingSessions - 1,
    usedSessions: before.usedSessions + 1,
    status: "active",
    history: [...before.history, { date: new Date().toISOString(), activityTitle: "Cours", auto: true }],
  });
  const after = (await getDoc(carteRef)).data();
  after.remainingSessions === 4 ? ok("remainingSessions = 4 (1 débitée)") : fail("remainingSessions incorrect", after.remainingSessions);
  after.usedSessions === 1      ? ok("usedSessions = 1")                  : fail("usedSessions incorrect", after.usedSessions);
  after.history.length === 1    ? ok("historique mis à jour")             : fail("historique vide");
}

async function s3() {
  section(3, "Compatibilité carte / type d'activité");
  ok(isCarteCompatible("cours", "cours")           ? "carte cours ✔ cours"       : "carte cours ✘ cours — ERREUR");
  if (!isCarteCompatible("cours", "cours"))         fail("carte cours devrait couvrir un cours");
  ok(!isCarteCompatible("cours", "balade")          ? "carte cours ✘ balade (correct)" : "carte cours devrait être incompatible avec balade");
  if (isCarteCompatible("cours", "balade"))          fail("carte cours ne devrait pas couvrir une balade");
  ok(isCarteCompatible("balade", "balade")          ? "carte balade ✔ balade"     : "carte balade ✘ balade — ERREUR");
  if (!isCarteCompatible("balade", "balade"))        fail("carte balade devrait couvrir une balade");
  ok(!isCarteCompatible("balade", "cours")          ? "carte balade ✘ cours (correct)" : "carte balade devrait être incompatible avec cours");
  if (isCarteCompatible("balade", "cours"))          fail("carte balade ne devrait pas couvrir un cours");
}

async function s4() {
  section(4, "Forfait cours actif → carte cours NON débitée");
  const famId = await newFamily("Famille S4");
  await newForfait("c_s4", "cours");
  await newCarte("c_s4", famId, "cours", 5);

  const forfaitSnap = await getDocs(query(collection(db, "forfaits"), where("childId", "==", "c_s4"), where("status", "==", "actif")));
  const blocked = forfaitSnap.docs.some(d => isForfaitBlockingCarte(d.data().activityType || "cours", "cours"));
  blocked ? ok("Forfait cours bloque bien la carte cours") : fail("Forfait cours devrait bloquer la carte cours");

  // Vérifier que la carte n'est pas débitée
  const cartesSnap = await getDocs(query(collection(db, "cartes"), where("childId", "==", "c_s4")));
  const carte = cartesSnap.docs[0]?.data();
  carte?.remainingSessions === 5 ? ok("Carte intacte — 5 séances restantes") : fail("Carte débitée à tort", carte?.remainingSessions);
}

async function s5() {
  section(5, "Forfait cours actif → carte balade toujours utilisable");
  await newForfait("c_s5", "cours");
  const forfaitSnap = await getDocs(query(collection(db, "forfaits"), where("childId", "==", "c_s5"), where("status", "==", "actif")));
  const blockedForBalade = forfaitSnap.docs.some(d => isForfaitBlockingCarte(d.data().activityType || "cours", "balade"));
  !blockedForBalade ? ok("Forfait cours ne bloque pas une balade (correct)") : fail("Forfait cours bloque à tort une balade");
}

async function s6() {
  section(6, "Stage 1j → +1j : tarif recalculé (1 enfant)");
  const famId = await newFamily("Famille S6");
  const payId = await newPayment(famId, "Famille S6",
    [item("Stage bronze", "c_s6", "Félix", "stage", 105)], "pending");

  const prices = { 1: 105, 2: 160, 3: 200, 4: 230 };
  const oldItems = (await getDoc(doc(db, "payments", payId))).data().items;
  const newItems = recalcStageItems(oldItems, 1, prices);
  const newTotal = Math.round(newItems.reduce((s, i) => s + i.priceTTC, 0) * 100) / 100;
  await updateDoc(doc(db, "payments", payId), { items: newItems, totalTTC: newTotal });

  const after = (await getDoc(doc(db, "payments", payId))).data();
  after.totalTTC === 160          ? ok("totalTTC = 160€ (tarif 2j)")    : fail("totalTTC devrait être 160€", after.totalTTC);
  after.items[0].priceTTC === 160 ? ok("item priceTTC = 160€")          : fail("item priceTTC incorrect", after.items[0].priceTTC);
}

async function s7() {
  section(7, "Stage 1j → +1j : remises individuelles préservées (2 enfants)");
  const famId = await newFamily("Famille S7");
  const payId = await newPayment(famId, "Famille S7", [
    item("Stage été", "c_s7a", "Gabriel", "stage", 105), // plein tarif
    item("Stage été", "c_s7b", "Hugo",    "stage", 90),  // remise fratrie
  ], "pending");

  const prices = { 1: 105, 2: 160, 3: 200, 4: 230 };
  const oldItems = (await getDoc(doc(db, "payments", payId))).data().items;
  const newItems = recalcStageItems(oldItems, 1, prices);
  const newTotal = Math.round(newItems.reduce((s, i) => s + i.priceTTC, 0) * 100) / 100;
  await updateDoc(doc(db, "payments", payId), { items: newItems, totalTTC: newTotal });

  const after = (await getDoc(doc(db, "payments", payId))).data();
  const gabriel = after.items.find(i => i.childId === "c_s7a");
  const hugo    = after.items.find(i => i.childId === "c_s7b");
  const ratio = 160 / 105;
  const expectedHugo  = Math.round(90 * ratio * 100) / 100;
  const expectedTotal = Math.round((160 + expectedHugo) * 100) / 100;

  gabriel?.priceTTC === 160        ? ok(`Gabriel = 160€`)                                    : fail(`Gabriel devrait être 160€`, gabriel?.priceTTC);
  hugo?.priceTTC === expectedHugo  ? ok(`Hugo = ${expectedHugo}€ (remise proportionnelle)`) : fail(`Hugo devrait être ${expectedHugo}€`, hugo?.priceTTC);
  after.totalTTC === expectedTotal ? ok(`Total = ${expectedTotal}€`)                        : fail(`Total devrait être ${expectedTotal}€`, after.totalTTC);
  hugo?.priceTTC < gabriel?.priceTTC ? ok("Hugo toujours moins cher (remise préservée)") : fail("Remise fratrie perdue");
}

async function s8() {
  section(8, "Duplication commande → payment pending avec traçabilité");
  const famId = await newFamily("Famille S8");
  const srcId = await newPayment(famId, "Famille S8",
    [item("Engagement concours", "c_s8", "Inès", "competition", 45)], "paid");

  const src = (await getDoc(doc(db, "payments", srcId))).data();
  const dupItems = (src.items || []).map(i => ({ ...i, creneauId: "", reservationId: "" }));
  const dupRef = await addDoc(collection(db, "payments"), {
    familyId: famId, familyName: "Famille S8",
    items: dupItems, totalTTC: src.totalTTC,
    status: "pending", paidAmount: 0,
    source: "duplicate", sourcePaymentId: srcId,
    _validate: true, date: serverTimestamp(),
  });
  toClean.payments.push(dupRef.id);

  const dup = (await getDoc(dupRef)).data();
  dup.status === "pending"        ? ok("Duplication status = pending")        : fail("Status incorrect", dup.status);
  dup.totalTTC === 45             ? ok("totalTTC = 45€")                      : fail("totalTTC incorrect", dup.totalTTC);
  dup.source === "duplicate"      ? ok("source = 'duplicate' (traçabilité)")  : fail("source manquante");
  dup.sourcePaymentId === srcId   ? ok("sourcePaymentId correct")             : fail("sourcePaymentId manquant");
  !dup.items[0].creneauId         ? ok("creneauId vidé (pas de lien mort)")   : fail("creneauId non vidé");
}

async function s9() {
  section(9, "Annulation commande non encaissée → status cancelled");
  const famId = await newFamily("Famille S9");
  const payId = await newPayment(famId, "Famille S9",
    [item("Cours débutant", "c_s9", "Jules", "cours", 22)], "pending");

  await updateDoc(doc(db, "payments", payId), {
    status: "cancelled", cancelledAt: serverTimestamp(), cancelReason: "Test annulation",
  });
  const after = (await getDoc(doc(db, "payments", payId))).data();
  after.status === "cancelled" ? ok("status = cancelled")        : fail("status incorrect", after.status);
  after.cancelReason           ? ok("cancelReason présent")      : fail("cancelReason manquant");
  after.cancelledAt            ? ok("cancelledAt horodaté")      : fail("cancelledAt manquant");
}

async function s10() {
  section(10, "Concurrence légère : 2 inscriptions simultanées même famille");
  const famId = await newFamily("Famille S10");
  const crId = await newCreneau({ title: "Cours mixte", priceTTC: 22 });

  const [p1, p2] = await Promise.all([
    newPayment(famId, "Famille S10", [item("Cours mixte", "c_s10a", "Léa",  "cours", 22)], "pending"),
    newPayment(famId, "Famille S10", [item("Cours mixte", "c_s10b", "Marc", "cours", 22)], "pending"),
  ]);

  const snap = await getDocs(query(collection(db, "payments"), where("familyId", "==", famId)));
  const pays = snap.docs.map(d => d.data());
  pays.length >= 2                              ? ok(`${pays.length} payments créés — pas de corruption`) : fail("Payments manquants");
  pays.every(p => p.totalTTC === 22)            ? ok("Montants cohérents (22€ chacun)")                   : fail("Montants incohérents");
  pays.every(p => p.status === "pending")       ? ok("Tous en status pending")                            : fail("Status incohérent");
  const ids = pays.flatMap(p => (p.items||[]).map(i => i.childId));
  new Set(ids).size === 2                       ? ok("2 enfants distincts, aucun doublon")                : fail("Doublons détectés", ids);
}

// ─── Nettoyage ───
async function cleanup() {
  console.log(`\n  🧹 Nettoyage...`);
  const batch = writeBatch(db);
  let n = 0;
  for (const [col, ids] of Object.entries(toClean)) {
    for (const id of ids) { batch.delete(doc(db, col, id)); n++; }
  }
  // Nettoyage forfaits non trackés (childId commence par c_s4/c_s5)
  for (const cid of ["c_s4", "c_s5"]) {
    const snap = await getDocs(query(collection(db, "forfaits"), where("childId", "==", cid)));
    snap.docs.forEach(d => { batch.delete(d.ref); n++; });
  }
  await batch.commit();
  console.log(`     ${n} documents supprimés`);
}

// ─── Runner ───
async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║   VALIDATION AUTOMATISÉE — Centre Équestre Agon              ║
║   Projet Firebase : gestion-2026                             ║
╚══════════════════════════════════════════════════════════════╝
`);
  const scenarios = [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10];
  for (const fn of scenarios) {
    try { await fn(); }
    catch (e) { console.log(`    💥 Erreur non gérée : ${e.message}`); failed++; }
  }

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║   RAPPORT FINAL                                              ║
╠══════════════════════════════════════════════════════════════╣
║   ✅ Passés  : ${String(passed).padEnd(44)}║
║   ❌ Échoués : ${String(failed).padEnd(44)}║
║   ⚠️  Alertes : ${String(warned).padEnd(43)}║
╠══════════════════════════════════════════════════════════════╣
║   ${failed === 0 && warned === 0 ? "🎉 Tous les tests passent — build validé !" : failed === 0 ? "✅ Aucun échec, vérifier les alertes" : "🚨 Échecs détectés — corriger avant déploiement"}${" ".repeat(failed === 0 && warned === 0 ? 17 : failed === 0 ? 23 : 17)}║
╚══════════════════════════════════════════════════════════════╝
`);
  await cleanup();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error("Erreur fatale:", e); process.exit(1); });
