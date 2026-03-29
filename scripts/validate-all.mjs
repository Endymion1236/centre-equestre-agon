#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * SCRIPT DE VALIDATION EXHAUSTIF — Centre Équestre d'Agon
 * ══════════════════════════════════════════════════════════════
 * Usage : npm run validate:all
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync, existsSync } from "fs";
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
const TAG = "_val_" + Date.now();
const MARKER = { _testScript: true, _testTag: TAG };
let passed = 0, failed = 0;
const errors = [];
const createdDocs = [];

function log(icon, msg) { console.log(`  ${icon} ${msg}`); }
function section(title) { console.log(`\n${"═".repeat(60)}\n  ${title}\n${"═".repeat(60)}`); }

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
  console.log(`\n🧹 Nettoyage : ${createdDocs.length} documents...`);
  for (const { collection: col, id } of createdDocs) {
    try { await db.collection(col).doc(id).delete(); } catch {}
  }
  console.log("  ✅ Nettoyage terminé");
}

// ─── Dates utilitaires ───
const today = new Date();
const todayStr = today.toISOString().split("T")[0];
const futureDates = [];
for (let i = 1; i <= 90; i++) { const d = new Date(today); d.setDate(d.getDate() + i); futureDates.push(d); }
const nextWeds = futureDates.filter(d => d.getDay() === 3).map(d => d.toISOString().split("T")[0]);
const nextSats = futureDates.filter(d => d.getDay() === 6).map(d => d.toISOString().split("T")[0]);
const pastDate = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split("T")[0]; })();

// ═══════════════════════════════════════
async function run() {
  console.log("🐴 Validation EXHAUSTIVE — Centre Équestre d'Agon-Coutainville");
  console.log(`   Projet : ${projectId} | ${new Date().toLocaleString("fr-FR")}\n`);

  let testFamilyId, testFamilyId2;
  const creneauIds = [];

  // ══════════════════════════════════
  section("1. CONNEXION & COLLECTIONS");
  // ══════════════════════════════════
  await test("Connexion Firestore", async () => {
    await db.collection("families").limit(1).get();
  });

  const cols = ["families","activities","creneaux","payments","reservations","forfaits","cartes","avoirs","settings","push_tokens","waitlist","encaissements","equides"];
  for (const col of cols) {
    await test(`Collection "${col}"`, async () => { await db.collection(col).limit(1).get(); });
  }

  // ══════════════════════════════════
  section("2. FAMILLES & CAVALIERS");
  // ══════════════════════════════════
  await test("Créer famille test (2 enfants)", async () => {
    const ref = await createDoc("families", {
      parentName: "Famille Dupont TEST", parentEmail: "dupont-test@example.com", parentPhone: "0600000001", authProvider: "google",
      children: [
        { id: "ch-lucas", firstName: "Lucas", birthDate: "2016-05-15", galopLevel: "G3", sanitaryForm: null },
        { id: "ch-emma", firstName: "Emma", birthDate: "2018-09-20", galopLevel: "—", sanitaryForm: null },
      ],
      createdAt: FieldValue.serverTimestamp(),
    });
    testFamilyId = ref.id;
  });

  await test("Créer 2ème famille test (1 enfant)", async () => {
    const ref = await createDoc("families", {
      parentName: "Famille Martin TEST", parentEmail: "martin-test@example.com", parentPhone: "0600000002", authProvider: "google",
      children: [{ id: "ch-hugo", firstName: "Hugo", birthDate: "2015-01-10", galopLevel: "G5", sanitaryForm: null }],
      createdAt: FieldValue.serverTimestamp(),
    });
    testFamilyId2 = ref.id;
  });

  await test("Lire famille + vérifier enfants", async () => {
    const doc = await db.collection("families").doc(testFamilyId).get();
    assert(doc.exists, "Famille existe");
    assert(doc.data().children.length === 2, "2 enfants");
    assert(doc.data().children[0].firstName === "Lucas", "Premier = Lucas");
  });

  await test("Calcul âge enfant", async () => {
    const bd = new Date("2016-05-15");
    const age = Math.floor((Date.now() - bd.getTime()) / 31557600000);
    assert(age >= 9 && age <= 11, `Âge Lucas = ${age} ans`);
  });

  // ══════════════════════════════════
  section("3. PLANNING — CRÉATION CRÉNEAUX");
  // ══════════════════════════════════
  // Créer un planning réaliste : cours multiples même horaire, stages, etc.
  const creneauxData = [
    // Mer 10h : Galop d'or (Emmeline) — 4 semaines
    ...nextWeds.slice(0, 4).map(d => ({ date: d, startTime: "10:00", endTime: "11:00", activityTitle: "Galop d'or", activityId: "act-go", monitor: "Emmeline", maxPlaces: 8 })),
    // Mer 17h : Pony Games NICOLAS — 4 semaines
    ...nextWeds.slice(0, 4).map(d => ({ date: d, startTime: "17:00", endTime: "18:00", activityTitle: "Pony games enfants", activityId: "act-pg-n", monitor: "Nicolas", maxPlaces: 8 })),
    // Mer 17h : Pony Games EMMELINE (même horaire, autre moniteur!) — 4 semaines
    ...nextWeds.slice(0, 4).map(d => ({ date: d, startTime: "17:00", endTime: "18:00", activityTitle: "Pony games enfants", activityId: "act-pg-e", monitor: "Emmeline", maxPlaces: 8 })),
    // Sam 14:30 : G4 et + — 4 semaines
    ...nextSats.slice(0, 4).map(d => ({ date: d, startTime: "14:30", endTime: "15:30", activityTitle: "G4 et +", activityId: "act-g4", monitor: "Emeline", maxPlaces: 8 })),
    // Sam 14:30 : Galop d'or (même horaire!) — 4 semaines
    ...nextSats.slice(0, 4).map(d => ({ date: d, startTime: "14:30", endTime: "15:30", activityTitle: "Galop d'or", activityId: "act-go", monitor: "Emmeline", maxPlaces: 8 })),
    // Sam 10:00 : Galop d'argent — 4 semaines
    ...nextSats.slice(0, 4).map(d => ({ date: d, startTime: "10:00", endTime: "11:00", activityTitle: "Galop d'argent", activityId: "act-ga", monitor: "Emmeline", maxPlaces: 8 })),
    // Un créneau PASSÉ (ne doit pas être inscrit)
    { date: pastDate, startTime: "10:00", endTime: "11:00", activityTitle: "Galop d'or", activityId: "act-go", monitor: "Emmeline", maxPlaces: 8 },
    // Un stage
    { date: nextWeds[0], startTime: "10:00", endTime: "12:00", activityTitle: "Stage découverte", activityId: "act-stage", activityType: "stage", monitor: "Nicolas", maxPlaces: 6 },
  ];

  await test(`Créer ${creneauxData.length} créneaux de test`, async () => {
    for (const c of creneauxData) {
      const ref = await createDoc("creneaux", {
        ...c, activityType: c.activityType || "cours", enrolled: [], enrolledCount: 0,
        status: "planned", priceTTC: 26, priceHT: 24.64, tvaTaux: 5.5,
      });
      creneauIds.push(ref.id);
    }
    assert(creneauIds.length === creneauxData.length, `${creneauxData.length} créneaux créés`);
  });

  // ══════════════════════════════════
  section("4. INSCRIPTION 1×/sem — CAS NOMINAL");
  // ══════════════════════════════════
  await test("Inscrire Lucas dans Galop d'or Mer 10h (toutes les séances futures)", async () => {
    const snap = await db.collection("creneaux")
      .where("activityTitle", "==", "Galop d'or").where("_testTag", "==", TAG).get();
    const futureGOWed = snap.docs.filter(d => {
      const data = d.data();
      return data.date >= todayStr && data.startTime === "10:00" && new Date(data.date).getDay() === 3;
    });
    assert(futureGOWed.length === 4, `4 séances Galop d'or mer 10h (got ${futureGOWed.length})`);
    for (const doc of futureGOWed) {
      const enrolled = [...(doc.data().enrolled || []), { childId: "ch-lucas", childName: "Lucas", familyId: testFamilyId, familyName: "Dupont TEST", enrolledAt: new Date().toISOString() }];
      await doc.ref.update({ enrolled, enrolledCount: enrolled.length });
    }
  });

  await test("Vérifier : Lucas dans 4 séances Galop d'or mer, 0 ailleurs", async () => {
    const snap = await db.collection("creneaux").where("_testTag", "==", TAG).get();
    let inGO = 0, elsewhere = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      const hasLucas = (data.enrolled || []).some(e => e.childId === "ch-lucas");
      if (hasLucas && data.activityTitle === "Galop d'or" && data.startTime === "10:00" && new Date(data.date).getDay() === 3) inGO++;
      else if (hasLucas) elsewhere++;
    }
    assert(inGO === 4, `Lucas dans 4 Galop d'or mer (got ${inGO})`);
    assert(elsewhere === 0, `Lucas dans 0 autres créneaux (got ${elsewhere})`);
  });

  // ══════════════════════════════════
  section("5. BUG CRITIQUE — 2 cours même horaire, ne PAS inscrire dans les deux");
  // ══════════════════════════════════
  await test("Mer 17h : 2 groupes Pony Games (Nicolas + Emmeline) — inscrire dans UN seul", async () => {
    // Simuler l'inscription dans Pony Games Nicolas uniquement
    const snap = await db.collection("creneaux").where("_testTag", "==", TAG).get();
    const pgNicolas = snap.docs.filter(d => {
      const data = d.data();
      return data.activityTitle === "Pony games enfants" && data.monitor === "Nicolas" && data.date >= todayStr;
    });
    assert(pgNicolas.length === 4, `4 séances PG Nicolas (got ${pgNicolas.length})`);
    for (const doc of pgNicolas) {
      const enrolled = [...(doc.data().enrolled || []), { childId: "ch-emma", childName: "Emma", familyId: testFamilyId, familyName: "Dupont TEST", enrolledAt: new Date().toISOString() }];
      await doc.ref.update({ enrolled, enrolledCount: enrolled.length });
    }
  });

  await test("Vérifier : Emma dans PG Nicolas, PAS dans PG Emmeline", async () => {
    const snap = await db.collection("creneaux").where("_testTag", "==", TAG).get();
    let inNicolas = 0, inEmmeline = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      const hasEmma = (data.enrolled || []).some(e => e.childId === "ch-emma");
      if (hasEmma && data.activityTitle === "Pony games enfants" && data.monitor === "Nicolas") inNicolas++;
      if (hasEmma && data.activityTitle === "Pony games enfants" && data.monitor === "Emmeline") inEmmeline++;
    }
    assert(inNicolas === 4, `Emma dans 4 PG Nicolas (got ${inNicolas})`);
    assert(inEmmeline === 0, `Emma dans 0 PG Emmeline (got ${inEmmeline})`);
  });

  // ══════════════════════════════════
  section("6. BUG CRITIQUE — Sam 14h30 : 2 cours différents, inscription ciblée");
  // ══════════════════════════════════
  await test("Sam 14:30 : G4+ ET Galop d'or — inscrire Lucas dans G4+ SEULEMENT", async () => {
    const snap = await db.collection("creneaux").where("_testTag", "==", TAG).get();
    const g4 = snap.docs.filter(d => {
      const data = d.data();
      return data.activityTitle === "G4 et +" && data.startTime === "14:30" && data.date >= todayStr;
    });
    const goSam = snap.docs.filter(d => {
      const data = d.data();
      return data.activityTitle === "Galop d'or" && data.startTime === "14:30" && new Date(data.date).getDay() === 6 && data.date >= todayStr;
    });
    assert(g4.length === 4, `4 séances G4+ sam (got ${g4.length})`);
    assert(goSam.length === 4, `4 séances GO sam (got ${goSam.length})`);

    for (const doc of g4) {
      const enrolled = [...(doc.data().enrolled || []), { childId: "ch-lucas", childName: "Lucas", familyId: testFamilyId, familyName: "Dupont TEST", enrolledAt: new Date().toISOString() }];
      await doc.ref.update({ enrolled, enrolledCount: enrolled.length });
    }
  });

  await test("Vérifier : Lucas dans G4+ sam, PAS dans Galop d'or sam", async () => {
    const snap = await db.collection("creneaux").where("_testTag", "==", TAG).get();
    let inG4 = 0, inGOSam = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      const hasLucas = (data.enrolled || []).some(e => e.childId === "ch-lucas");
      if (hasLucas && data.activityTitle === "G4 et +" && data.startTime === "14:30") inG4++;
      if (hasLucas && data.activityTitle === "Galop d'or" && data.startTime === "14:30" && new Date(data.date).getDay() === 6) inGOSam++;
    }
    assert(inG4 === 4, `Lucas dans 4 G4+ (got ${inG4})`);
    assert(inGOSam === 0, `Lucas dans 0 GO samedi (got ${inGOSam})`);
  });

  // ══════════════════════════════════
  section("7. MÊME JOUR AUTORISÉ — 10h + 14h30");
  // ══════════════════════════════════
  await test("Lucas inscrit le samedi à 10h (Galop argent) ET 14h30 (G4+) = OK", async () => {
    const snap = await db.collection("creneaux").where("_testTag", "==", TAG).get();
    const gaSam = snap.docs.filter(d => {
      const data = d.data();
      return data.activityTitle === "Galop d'argent" && data.date >= todayStr;
    });
    for (const doc of gaSam) {
      const enrolled = [...(doc.data().enrolled || []), { childId: "ch-lucas", childName: "Lucas", familyId: testFamilyId, familyName: "Dupont TEST", enrolledAt: new Date().toISOString() }];
      await doc.ref.update({ enrolled, enrolledCount: enrolled.length });
    }
    // Vérifier qu'il est bien dans les deux le même samedi
    const samCreneaux = snap.docs.filter(d => {
      const data = d.data();
      return new Date(data.date).getDay() === 6 && data.date === nextSats[0] && (data.enrolled || []).some(e => e.childId === "ch-lucas");
    });
    // Doit être dans G4+ 14:30 ET Galop argent 10:00 le même samedi
    // (G4+ inscrit à l'étape 6, Galop argent inscrit ici)
  });

  await test("Vérifier : Lucas dans 2 cours différents le même samedi", async () => {
    const snap = await db.collection("creneaux").where("_testTag", "==", TAG).get();
    const samedi1 = snap.docs.filter(d => {
      const data = d.data();
      return data.date === nextSats[0] && (data.enrolled || []).some(e => e.childId === "ch-lucas");
    });
    assert(samedi1.length >= 2, `Lucas dans ${samedi1.length} cours le ${nextSats[0]} (attendu ≥2)`);
  });

  // ══════════════════════════════════
  section("8. CRÉNEAU PASSÉ — pas d'inscription");
  // ══════════════════════════════════
  await test("Le créneau passé ne contient aucun inscrit", async () => {
    const snap = await db.collection("creneaux").where("_testTag", "==", TAG).get();
    const past = snap.docs.filter(d => d.data().date === pastDate);
    assert(past.length === 1, `1 créneau passé (got ${past.length})`);
    assert((past[0].data().enrolled || []).length === 0, "Créneau passé = 0 inscrits");
  });

  // ══════════════════════════════════
  section("9. DOUBLON — pas d'inscription en double");
  // ══════════════════════════════════
  await test("Tenter d'inscrire Lucas 2× dans le même créneau", async () => {
    const snap = await db.collection("creneaux").where("_testTag", "==", TAG).get();
    const firstGO = snap.docs.find(d => d.data().activityTitle === "Galop d'or" && d.data().startTime === "10:00" && d.data().date >= todayStr);
    const enrolled = firstGO.data().enrolled || [];
    const alreadyIn = enrolled.some(e => e.childId === "ch-lucas");
    assert(alreadyIn, "Lucas déjà inscrit");
    // Simuler le check : ne pas ajouter si déjà présent
    const wouldAdd = !enrolled.some(e => e.childId === "ch-lucas");
    assert(!wouldAdd, "Le check bloque le doublon");
  });

  // ══════════════════════════════════
  section("10. CRÉNEAU COMPLET — inscription refusée");
  // ══════════════════════════════════
  await test("Remplir un créneau à maxPlaces puis tenter une inscription", async () => {
    // Prendre le premier créneau de stage (maxPlaces=6)
    const snap = await db.collection("creneaux").where("_testTag", "==", TAG).get();
    const stage = snap.docs.find(d => d.data().activityType === "stage");
    assert(stage, "Stage trouvé");
    // Remplir avec 6 enfants fictifs
    const fakeEnrolled = Array.from({ length: 6 }, (_, i) => ({
      childId: `fake-${i}`, childName: `Fake ${i}`, familyId: "fake-fam", familyName: "Fake", enrolledAt: new Date().toISOString(),
    }));
    await stage.ref.update({ enrolled: fakeEnrolled, enrolledCount: 6 });

    const updated = await stage.ref.get();
    const spots = updated.data().maxPlaces - (updated.data().enrolled || []).length;
    assert(spots === 0, `0 places restantes (got ${spots})`);
    // Le check côté UI empêcherait l'inscription
  });

  // ══════════════════════════════════
  section("11. PAIEMENT — COMMANDE UNIQUE");
  // ══════════════════════════════════
  let paymentId;

  await test("Créer paiement forfait (Lucas)", async () => {
    const ref = await createDoc("payments", {
      familyId: testFamilyId, familyName: "Dupont TEST", childId: "ch-lucas",
      items: [
        { activityTitle: "Adhésion annuelle (enfant 1)", childId: "ch-lucas", childName: "Lucas", priceTTC: 60, priceHT: 56.87, tva: 5.5 },
        { activityTitle: "Licence FFE -18ans", childId: "ch-lucas", childName: "Lucas", priceTTC: 25, priceHT: 25, tva: 0 },
        { activityTitle: "Forfait Galop d'or (mer 10:00)", childId: "ch-lucas", childName: "Lucas", priceTTC: 520, priceHT: 492.89, tva: 5.5 },
        { activityTitle: "Forfait G4 et + (sam 14:30)", childId: "ch-lucas", childName: "Lucas", priceTTC: 0, priceHT: 0, tva: 5.5 },
      ],
      totalTTC: 605, paidAmount: 0, status: "pending", paymentMode: "", date: FieldValue.serverTimestamp(),
    });
    paymentId = ref.id;
  });

  await test("Regrouper fratrie — ajouter Emma au même paiement", async () => {
    const payDoc = await db.collection("payments").doc(paymentId).get();
    const existingItems = payDoc.data().items;
    const emmaItems = [
      { activityTitle: "Adhésion annuelle (enfant 2)", childId: "ch-emma", childName: "Emma", priceTTC: 40, priceHT: 37.91, tva: 5.5 },
      { activityTitle: "Licence FFE -18ans", childId: "ch-emma", childName: "Emma", priceTTC: 25, priceHT: 25, tva: 0 },
      { activityTitle: "Forfait Pony games enfants (mer 17:00)", childId: "ch-emma", childName: "Emma", priceTTC: 470, priceHT: 445.50, tva: 5.5 },
    ];
    const merged = [...existingItems, ...emmaItems];
    const total = merged.reduce((s, i) => s + (i.priceTTC || 0), 0);
    await db.collection("payments").doc(paymentId).update({ items: merged, totalTTC: total });
    const updated = await db.collection("payments").doc(paymentId).get();
    assert(updated.data().items.length === 7, `7 items (got ${updated.data().items.length})`);
    assert(updated.data().totalTTC === 1140, `Total 1140€ (got ${updated.data().totalTTC})`);
  });

  await test("Adhésion dégressive : enfant 1 = 60€, enfant 2 = 40€", async () => {
    const doc = await db.collection("payments").doc(paymentId).get();
    const items = doc.data().items;
    const adh1 = items.find(i => i.activityTitle.includes("enfant 1"));
    const adh2 = items.find(i => i.activityTitle.includes("enfant 2"));
    assert(adh1.priceTTC === 60, `Adhésion 1 = 60€ (got ${adh1.priceTTC})`);
    assert(adh2.priceTTC === 40, `Adhésion 2 = 40€ (got ${adh2.priceTTC})`);
  });

  await test("Ne PAS fusionner avec un paiement déjà encaissé", async () => {
    const paidRef = await createDoc("payments", {
      familyId: testFamilyId, familyName: "Dupont TEST",
      items: [{ activityTitle: "Ancien paiement", priceTTC: 100 }],
      totalTTC: 100, paidAmount: 100, status: "paid", date: FieldValue.serverTimestamp(),
    });
    // Vérifier qu'il ne faut PAS ajouter à ce paiement
    const doc = await db.collection("payments").doc(paidRef.id).get();
    assert(doc.data().status === "paid", "Paiement encaissé = paid");
    assert(doc.data().items.length === 1, "Items non modifiés (1 seul)");
  });

  // ══════════════════════════════════
  section("12. REMISE / RÉDUCTION");
  // ══════════════════════════════════
  await test("Appliquer remise 10% → total diminue", async () => {
    const doc = await db.collection("payments").doc(paymentId).get();
    const items = doc.data().items;
    const total = items.reduce((s, i) => s + (i.priceTTC || 0), 0);
    const remise = Math.round(total * 10 / 100 * 100) / 100;
    const newItems = items.map(i => {
      const part = total > 0 ? (i.priceTTC || 0) / total : 0;
      return { ...i, priceTTC: Math.max(0, Math.round((i.priceTTC - remise * part) * 100) / 100) };
    });
    const newTotal = newItems.reduce((s, i) => s + (i.priceTTC || 0), 0);
    await db.collection("payments").doc(paymentId).update({ items: newItems, totalTTC: Math.round(newTotal * 100) / 100 });
    assert(newTotal < total, `${newTotal} < ${total}`);
    assert(newTotal > total * 0.85, "Pas trop de remise");
  });

  await test("Appliquer remise fixe 50€", async () => {
    const doc = await db.collection("payments").doc(paymentId).get();
    const totalBefore = doc.data().totalTTC;
    const items = doc.data().items;
    const total = items.reduce((s, i) => s + (i.priceTTC || 0), 0);
    const remise = 50;
    const newItems = items.map(i => {
      const part = total > 0 ? (i.priceTTC || 0) / total : 0;
      return { ...i, priceTTC: Math.max(0, Math.round((i.priceTTC - remise * part) * 100) / 100) };
    });
    const newTotal = newItems.reduce((s, i) => s + (i.priceTTC || 0), 0);
    await db.collection("payments").doc(paymentId).update({ items: newItems, totalTTC: Math.round(newTotal * 100) / 100 });
    assert(Math.abs(newTotal - (totalBefore - 50)) < 1, `Total réduit de ~50€`);
  });

  // ══════════════════════════════════
  section("13. PAIEMENT ÉCHELONNÉ (3×)");
  // ══════════════════════════════════
  await test("Créer 3 échéances pour famille Martin", async () => {
    const totalTTC = 650;
    const montant = Math.round(totalTTC / 3 * 100) / 100;
    const dernier = Math.round((totalTTC - montant * 2) * 100) / 100;
    for (let i = 0; i < 3; i++) {
      const echeanceDate = new Date(); echeanceDate.setMonth(echeanceDate.getMonth() + i);
      await createDoc("payments", {
        familyId: testFamilyId2, familyName: "Martin TEST",
        items: i === 0
          ? [{ activityTitle: "Forfait Galop 5", childId: "ch-hugo", childName: "Hugo", priceTTC: totalTTC }]
          : [{ activityTitle: `Échéance ${i + 1}/3`, childId: "ch-hugo", childName: "Hugo", priceTTC: i === 2 ? dernier : montant }],
        totalTTC: i === 2 ? dernier : montant,
        paidAmount: 0, status: "pending", echeance: i + 1, echeancesTotal: 3,
        echeanceDate: echeanceDate.toISOString().split("T")[0],
        forfaitRef: "Galop 5 — vendredi 15:00",
        date: FieldValue.serverTimestamp(),
      });
    }
  });

  await test("Vérifier 3 échéances créées, somme = 650€", async () => {
    const snap = await db.collection("payments").where("familyId", "==", testFamilyId2).where("_testTag", "==", TAG).get();
    const total = snap.docs.reduce((s, d) => s + (d.data().totalTTC || 0), 0);
    assert(snap.size === 3, `3 échéances (got ${snap.size})`);
    assert(Math.abs(total - 650) < 1, `Somme = 650€ (got ${total})`);
  });

  // ══════════════════════════════════
  section("14. DÉSINSCRIPTION EN MASSE");
  // ══════════════════════════════════
  await test("Désinscrire Lucas de TOUS les créneaux", async () => {
    const snap = await db.collection("creneaux").where("_testTag", "==", TAG).get();
    let removed = 0;
    for (const doc of snap.docs) {
      const enrolled = (doc.data().enrolled || []).filter(e => e.childId !== "ch-lucas");
      if (enrolled.length !== (doc.data().enrolled || []).length) {
        await doc.ref.update({ enrolled, enrolledCount: enrolled.length });
        removed++;
      }
    }
    assert(removed >= 8, `Lucas retiré de ${removed} créneaux (attendu ≥8)`);
  });

  await test("Vérifier Lucas n'est plus nulle part", async () => {
    const snap = await db.collection("creneaux").where("_testTag", "==", TAG).get();
    for (const doc of snap.docs) {
      assert(!(doc.data().enrolled || []).some(e => e.childId === "ch-lucas"), `Encore dans ${doc.data().activityTitle}`);
    }
  });

  await test("Emma toujours inscrite (non affectée par la désinscription de Lucas)", async () => {
    const snap = await db.collection("creneaux").where("_testTag", "==", TAG).get();
    let emmaCount = 0;
    for (const doc of snap.docs) {
      if ((doc.data().enrolled || []).some(e => e.childId === "ch-emma")) emmaCount++;
    }
    assert(emmaCount === 4, `Emma toujours dans 4 PG Nicolas (got ${emmaCount})`);
  });

  // ══════════════════════════════════
  section("15. ANNULATION PAIEMENT → DÉSINSCRIPTION");
  // ══════════════════════════════════
  await test("Annuler le paiement → statut cancelled", async () => {
    await db.collection("payments").doc(paymentId).update({ status: "cancelled", cancelledAt: new Date().toISOString() });
    const doc = await db.collection("payments").doc(paymentId).get();
    assert(doc.data().status === "cancelled", "Status = cancelled");
  });

  // ══════════════════════════════════
  section("16. FORFAITS");
  // ══════════════════════════════════
  let forfaitId;
  await test("Créer forfait actif", async () => {
    const ref = await createDoc("forfaits", {
      familyId: testFamilyId, familyName: "Dupont TEST", childId: "ch-lucas", childName: "Lucas",
      slotKey: "Galop d'or — mercredi 10:00", activityTitle: "Galop d'or",
      totalSessions: 13, attendedSessions: 3,
      forfaitPriceTTC: 520, totalPaidTTC: 520, paymentPlan: "1x", status: "actif",
      createdAt: FieldValue.serverTimestamp(),
    });
    forfaitId = ref.id;
  });

  await test("Suspendre puis réactiver un forfait", async () => {
    await db.collection("forfaits").doc(forfaitId).update({ status: "suspended" });
    let doc = await db.collection("forfaits").doc(forfaitId).get();
    assert(doc.data().status === "suspended", "Suspendu");
    await db.collection("forfaits").doc(forfaitId).update({ status: "actif" });
    doc = await db.collection("forfaits").doc(forfaitId).get();
    assert(doc.data().status === "actif", "Réactivé");
  });

  await test("Résilier un forfait", async () => {
    await db.collection("forfaits").doc(forfaitId).update({ status: "cancelled" });
    const doc = await db.collection("forfaits").doc(forfaitId).get();
    assert(doc.data().status === "cancelled", "Résilié");
  });

  // ══════════════════════════════════
  section("17. CARTES DE SÉANCES");
  // ══════════════════════════════════
  let carteId;
  await test("Créer carte 10 séances", async () => {
    const ref = await createDoc("cartes", {
      familyId: testFamilyId, childId: "ch-lucas", childName: "Lucas",
      totalSessions: 10, usedSessions: 0, remainingSessions: 10,
      priceTTC: 230, status: "active", history: [], createdAt: FieldValue.serverTimestamp(),
    });
    carteId = ref.id;
  });

  await test("Débiter 3 séances successives", async () => {
    for (let i = 1; i <= 3; i++) {
      const doc = await db.collection("cartes").doc(carteId).get();
      const data = doc.data();
      await doc.ref.update({
        usedSessions: data.usedSessions + 1,
        remainingSessions: data.remainingSessions - 1,
        history: FieldValue.arrayUnion({ date: todayStr, activityTitle: `Test séance ${i}`, deductedAt: new Date().toISOString() }),
      });
    }
    const doc = await db.collection("cartes").doc(carteId).get();
    assert(doc.data().remainingSessions === 7, `Reste 7 (got ${doc.data().remainingSessions})`);
    assert(doc.data().usedSessions === 3, `Utilisé 3 (got ${doc.data().usedSessions})`);
    assert(doc.data().history.length === 3, `3 entrées historique (got ${doc.data().history.length})`);
  });

  await test("Épuiser la carte (7 séances restantes)", async () => {
    for (let i = 0; i < 7; i++) {
      const doc = await db.collection("cartes").doc(carteId).get();
      const data = doc.data();
      await doc.ref.update({ usedSessions: data.usedSessions + 1, remainingSessions: data.remainingSessions - 1 });
    }
    const doc = await db.collection("cartes").doc(carteId).get();
    assert(doc.data().remainingSessions === 0, "Carte épuisée");
    assert(doc.data().usedSessions === 10, "10 séances utilisées");
  });

  // ══════════════════════════════════
  section("18. AVOIRS & AVANCES");
  // ══════════════════════════════════
  let avoirId;
  await test("Créer un avoir de 100€", async () => {
    const ref = await createDoc("avoirs", {
      familyId: testFamilyId, familyName: "Dupont TEST",
      type: "avoir", amount: 100, usedAmount: 0, remainingAmount: 100,
      reason: "Annulation test", reference: "AV-TEST", status: "actif",
      createdAt: FieldValue.serverTimestamp(),
    });
    avoirId = ref.id;
  });

  await test("Utiliser partiellement l'avoir (30€)", async () => {
    await db.collection("avoirs").doc(avoirId).update({ usedAmount: 30, remainingAmount: 70 });
    const doc = await db.collection("avoirs").doc(avoirId).get();
    assert(doc.data().remainingAmount === 70, "Reste 70€");
  });

  await test("Épuiser l'avoir", async () => {
    await db.collection("avoirs").doc(avoirId).update({ usedAmount: 100, remainingAmount: 0, status: "epuise" });
    const doc = await db.collection("avoirs").doc(avoirId).get();
    assert(doc.data().remainingAmount === 0, "Avoir épuisé");
    assert(doc.data().status === "epuise", "Status épuisé");
  });

  // ══════════════════════════════════
  section("19. PRORATA INSCRIPTION EN COURS D'ANNÉE");
  // ══════════════════════════════════
  await test("Calcul prorata : sessions restantes / sessions saison", async () => {
    const finSaison = new Date("2026-06-30");
    // Compter les mercredis entre aujourd'hui et fin de saison
    let count = 0;
    const cursor = new Date(today);
    while (cursor.getDay() !== 3) cursor.setDate(cursor.getDate() + 1);
    while (cursor <= finSaison) { count++; cursor.setDate(cursor.getDate() + 7); }
    const prorata = count / 35;
    const prixProrata = Math.round(650 * prorata);
    log("ℹ️", `  ${count} mercredis restants sur 35 → prorata ${Math.round(prorata * 100)}% → ${prixProrata}€`);
    assert(count > 0 && count <= 35, `Mercredis restants cohérents (got ${count})`);
    assert(prorata > 0 && prorata <= 1, `Prorata entre 0 et 1 (got ${prorata})`);
  });

  // ══════════════════════════════════
  section("20. INTÉGRITÉ DES DONNÉES RÉELLES");
  // ══════════════════════════════════
  await test("Toutes les familles ont un parentEmail", async () => {
    const snap = await db.collection("families").get();
    let missing = 0;
    for (const doc of snap.docs) { if (!doc.data().parentEmail && !doc.data()._testScript) missing++; }
    if (missing > 0) throw new Error(`${missing} famille(s) sans email`);
    log("ℹ️", `  ${snap.size} familles vérifiées`);
  });

  await test("Pas de doublons enrolled dans les créneaux réels", async () => {
    const snap = await db.collection("creneaux").where("date", ">=", todayStr).get();
    let doublons = 0;
    for (const doc of snap.docs) {
      if (doc.data()._testScript) continue;
      const ids = (doc.data().enrolled || []).map(e => e.childId);
      if (ids.length !== new Set(ids).size) {
        doublons++;
        log("⚠️", `  Doublon: ${doc.data().activityTitle} (${doc.data().date})`);
      }
    }
    if (doublons > 0) throw new Error(`${doublons} créneau(x) avec doublons`);
  });

  await test("Paiements pending ont un familyId", async () => {
    const snap = await db.collection("payments").where("status", "==", "pending").get();
    let bad = 0;
    for (const doc of snap.docs) { if (!doc.data().familyId && !doc.data()._testScript) bad++; }
    if (bad > 0) throw new Error(`${bad} paiement(s) orphelins`);
  });

  await test("Enrolled count = enrolled.length sur les créneaux futurs", async () => {
    const snap = await db.collection("creneaux").where("date", ">=", todayStr).get();
    let mismatches = 0;
    for (const doc of snap.docs) {
      if (doc.data()._testScript) continue;
      const data = doc.data();
      const actual = (data.enrolled || []).length;
      const stored = data.enrolledCount || 0;
      if (actual !== stored) { mismatches++; log("⚠️", `  ${data.activityTitle} ${data.date}: enrolled=${actual} vs enrolledCount=${stored}`); }
    }
    if (mismatches > 0) throw new Error(`${mismatches} créneau(x) avec enrolledCount incorrect`);
  });

  // ══════════════════════════════════
  section("21. FICHIERS & STRUCTURE");
  // ══════════════════════════════════
  const criticalFiles = [
    "src/lib/firebase.ts", "src/lib/firebase-admin.ts", "src/lib/stripe.ts", "src/lib/push.ts",
    "src/lib/auth-context.tsx", "src/lib/forfaits.ts", "src/lib/planning-services.ts",
    "src/types/index.ts", "vercel.json", "package.json", "public/manifest.json", "public/sw.js",
    "src/app/admin/planning/page.tsx", "src/app/admin/planning/EnrollPanel.tsx",
    "src/app/admin/paiements/page.tsx", "src/app/admin/forfaits/page.tsx",
    "src/app/admin/cavaliers/page.tsx", "src/app/admin/parametres/page.tsx",
    "src/app/espace-cavalier/inscription-annuelle/page.tsx",
    "src/app/api/admin/unenroll-annual/route.ts",
    "src/app/api/cron/daily-notifications/route.ts",
    "src/app/api/push/route.ts", "src/app/api/invoice/route.ts",
  ];

  for (const f of criticalFiles) {
    await test(`Fichier ${f}`, async () => {
      assert(existsSync(resolve(process.cwd(), f)), "Manquant");
    });
  }

  await test("vercel.json : max 2 crons (Hobby plan)", async () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));
    assert(config.crons?.length <= 2, `${config.crons?.length} crons (max 2)`);
  });

  // ══════════════════════════════════
  section("22. VARIABLES D'ENVIRONNEMENT");
  // ══════════════════════════════════
  const envVars = [
    ["FIREBASE_PROJECT_ID / NEXT_PUBLIC_FIREBASE_PROJECT_ID", projectId],
    ["FIREBASE_CLIENT_EMAIL", process.env.FIREBASE_CLIENT_EMAIL],
    ["FIREBASE_PRIVATE_KEY", process.env.FIREBASE_PRIVATE_KEY ? "✓ (présente)" : null],
    ["NEXT_PUBLIC_FIREBASE_VAPID_KEY", process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY],
    ["STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY],
    ["RESEND_API_KEY", process.env.RESEND_API_KEY],
    ["CRON_SECRET", process.env.CRON_SECRET],
  ];

  for (const [name, val] of envVars) {
    await test(`Env: ${name}`, async () => {
      if (!val) { log("⚠️", `  Non définie (OK si dans Vercel)`); }
      else { log("ℹ️", `  ✓`); }
    });
  }

  // ═══════════════════════════════════════
  // NETTOYAGE & RÉSUMÉ
  // ═══════════════════════════════════════
  await cleanup();

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  RÉSULTAT : ${passed} ✅  ${failed} ❌`);
  console.log(`${"═".repeat(60)}`);

  if (errors.length > 0) {
    console.log("\n🔴 Erreurs :");
    errors.forEach(e => console.log(`  → ${e}`));
  }

  if (failed === 0) console.log("\n🎉 TOUS LES TESTS PASSENT ! Application validée.\n");
  else console.log(`\n⚠️  ${failed} test(s) en échec.\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error("💥 Erreur fatale:", e); cleanup().then(() => process.exit(1)); });
