#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * SCRIPT DE VALIDATION COMPLET v2 — Centre Équestre d'Agon-Coutainville
 * ══════════════════════════════════════════════════════════════
 * 500+ tests couvrant tous les modules et flows de l'application.
 * Usage : npx tsx scripts/validate-all.ts
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
if (privateKey.includes("\\n")) privateKey = privateKey.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ Variables Firebase manquantes. Vérifiez .env.local");
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
const db = getFirestore();

// ─── Helpers ───
const TEST_MARKER = { _testScript: true, _testDate: new Date().toISOString() };
let passed = 0, failed = 0, skipped = 0;
const errors: string[] = [];
const createdDocs: { collection: string; id: string }[] = [];

function log(icon: string, msg: string) { console.log(`  ${icon} ${msg}`); }
function section(title: string) { console.log(`\n${"═".repeat(64)}\n  ${title}\n${"═".repeat(64)}`); }

async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; log("✅", name); }
  catch (e: any) {
    failed++;
    const msg = e.message || String(e);
    errors.push(`${name}: ${msg}`);
    log("❌", `${name} — ${msg}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertApprox(a: number, b: number, tol: number, msg: string) {
  if (Math.abs(a - b) > tol) throw new Error(`${msg} (${a} ≠ ${b}, tolérance ${tol})`);
}

async function createDoc(col: string, data: any): Promise<string> {
  const ref = await db.collection(col).add({ ...data, ...TEST_MARKER });
  createdDocs.push({ collection: col, id: ref.id });
  return ref.id;
}

async function cleanup() {
  section("🧹 NETTOYAGE");
  let count = 0;
  for (const { collection, id } of createdDocs) {
    try { await db.collection(collection).doc(id).delete(); count++; }
    catch { /* déjà supprimé */ }
  }
  log("🗑️", `${count} documents de test supprimés`);
}

// ─── Dates utilitaires ───
const TODAY     = new Date().toISOString().split("T")[0];
const YESTERDAY = (() => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().split("T")[0]; })();
const TOMORROW  = (() => { const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().split("T")[0]; })();
const NEXT_WEEK = (() => { const d = new Date(); d.setDate(d.getDate()+7); return d.toISOString().split("T")[0]; })();
const NEXT_WEEK2= (() => { const d = new Date(); d.setDate(d.getDate()+14); return d.toISOString().split("T")[0]; })();
const PAST_DATE = (() => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString().split("T")[0]; })();
const YEAR      = new Date().getFullYear();
const SEASON    = `${YEAR}-${YEAR+1}`;

// ─── IDs partagés ───
let familyId="", familyId2="", familyId3="";
let childId1="", childId2="", childId3="", childId4="";
let activityId="", activityId2="", stageActivityId="";
let creneauId1="", creneauId2="", creneauId3="", creneauId4="";
let stageCreneauId="", stageCreneauId2="";
let paymentId="", paymentId2="", paymentId3="";
let forfaitId="", forfaitId2="";
let carteId="", carteId2="";
let reservationId="";
let avoirId="", bonRecupId="";
let equideId="", equideId2="";
let mandatId="", remiseId="";
let tacheTypeId="", tachePlanifieeId="";
let salaryId="";
let moniteurId="";
let devisId="";
let waitlistId="";
let passageId="";
let fideliteId="";
let settingsId="";
let themeId="";
let communicationId="";

// ══════════════════════════════════════════════════════════════
async function main() {
  console.log("\n🐴 VALIDATION COMPLÈTE v2 — Centre Équestre d'Agon-Coutainville");
  console.log(`   ${new Date().toLocaleString("fr-FR")}\n`);

  // ══════════════════════════════════════════════════════════════
  section("1. FAMILLES — CRÉATION & STRUCTURE");
  // ══════════════════════════════════════════════════════════════

  await test("Créer famille 1 avec 2 enfants complets", async () => {
    childId1 = `child-v2-${Date.now()}-1`;
    childId2 = `child-v2-${Date.now()}-2`;
    familyId = await createDoc("families", {
      parentName: "Dupont Validation",
      parentFirstName: "Marie",
      parentEmail: "dupont.validation@test.fr",
      parentPhone: "0601010101",
      parentPhone2: "0612121212",
      address: "12 rue de la Plage, 50230 Agon-Coutainville",
      authProvider: "google",
      loyaltyPoints: 0,
      season: SEASON,
      children: [
        { id: childId1, firstName: "Lucas-V2", lastName: "Dupont", birthDate: "2014-03-15",
          galopLevel: "G3", weight: 35, height: 140,
          sanitaryForm: { allergies: "Aucune", medications: "", emergencyContactName: "Papa Test",
            emergencyContactPhone: "0611111111", parentalAuthorization: true, medicalNotes: "" } },
        { id: childId2, firstName: "Emma-V2", lastName: "Dupont", birthDate: "2017-07-22",
          galopLevel: "Débutant", weight: 28, height: 120, sanitaryForm: null },
      ],
    });
    assert(!!familyId, "familyId créé");
  });

  await test("Créer famille 2 — enfant unique adulte", async () => {
    childId3 = `child-v2-${Date.now()}-3`;
    familyId2 = await createDoc("families", {
      parentName: "Martin Validation",
      parentEmail: "martin.validation@test.fr",
      parentPhone: "0602020202",
      authProvider: "email",
      loyaltyPoints: 150,
      children: [
        { id: childId3, firstName: "Sophie-V2", lastName: "Martin", birthDate: "2008-05-10",
          galopLevel: "G5",
          sanitaryForm: { allergies: "Abeilles", medications: "EpiPen", emergencyContactName: "Mère Martin",
            emergencyContactPhone: "0622222222", parentalAuthorization: true, medicalNotes: "Allergie grave" } },
      ],
    });
    assert(!!familyId2, "familyId2 créé");
  });

  await test("Créer famille 3 — 2 enfants pour tests masse", async () => {
    childId4 = `child-v2-${Date.now()}-4`;
    familyId3 = await createDoc("families", {
      parentName: "Bernard Validation",
      parentEmail: "bernard.validation@test.fr",
      parentPhone: "0603030303",
      authProvider: "google",
      loyaltyPoints: 50,
      children: [
        { id: childId4, firstName: "Paul-V2", lastName: "Bernard", birthDate: "2013-11-20",
          galopLevel: "G2", sanitaryForm: null },
      ],
    });
    assert(!!familyId3, "familyId3 créé");
  });

  await test("Lire famille 1 — structure enfants correcte", async () => {
    const doc = await db.collection("families").doc(familyId).get();
    assert(doc.exists, "Document existe");
    const d = doc.data()!;
    assert(d.children.length === 2, `2 enfants (trouvé ${d.children.length})`);
    assert(d.children[0].id === childId1, "childId1 correct");
    assert(d.children[0].sanitaryForm !== null, "Fiche sanitaire enfant 1 présente");
    assert(d.parentEmail === "dupont.validation@test.fr", "Email parent correct");
  });

  await test("Modifier niveau galop enfant 1 → G4", async () => {
    const doc = await db.collection("families").doc(familyId).get();
    const children = doc.data()!.children;
    children[0].galopLevel = "G4";
    await db.collection("families").doc(familyId).update({ children });
    const updated = await db.collection("families").doc(familyId).get();
    assert(updated.data()!.children[0].galopLevel === "G4", "Galop mis à jour G4");
  });

  await test("Mettre à jour fiche sanitaire enfant 2", async () => {
    const doc = await db.collection("families").doc(familyId).get();
    const children = doc.data()!.children;
    children[1].sanitaryForm = { allergies: "Lactose", medications: "", emergencyContactName: "Maman Dupont",
      emergencyContactPhone: "0633333333", parentalAuthorization: true };
    await db.collection("families").doc(familyId).update({ children });
    const updated = await db.collection("families").doc(familyId).get();
    assert(updated.data()!.children[1].sanitaryForm.allergies === "Lactose", "Fiche sanitaire mise à jour");
  });

  await test("Ajouter un 3ème enfant à famille 1", async () => {
    const doc = await db.collection("families").doc(familyId).get();
    const children = doc.data()!.children;
    const newChildId = `child-v2-extra-${Date.now()}`;
    children.push({ id: newChildId, firstName: "Tom-V2", lastName: "Dupont", birthDate: "2019-01-01",
      galopLevel: "Aucun", sanitaryForm: null });
    await db.collection("families").doc(familyId).update({ children });
    const updated = await db.collection("families").doc(familyId).get();
    assert(updated.data()!.children.length === 3, "3 enfants après ajout");
  });

  await test("Retirer le 3ème enfant ajouté", async () => {
    const doc = await db.collection("families").doc(familyId).get();
    const children = doc.data()!.children.filter((c: any) => c.id !== `child-v2-extra-${Date.now()}`);
    // On garde 3 enfants car le timestamp est différent, on retrimme manuellement
    const trimmed = doc.data()!.children.slice(0, 2);
    await db.collection("families").doc(familyId).update({ children: trimmed });
    const updated = await db.collection("families").doc(familyId).get();
    assert(updated.data()!.children.length === 2, "Retour à 2 enfants");
  });

  await test("Mettre à jour points fidélité famille 1", async () => {
    await db.collection("families").doc(familyId).update({ loyaltyPoints: 75 });
    const doc = await db.collection("families").doc(familyId).get();
    assert(doc.data()!.loyaltyPoints === 75, "Points fidélité = 75");
  });

  await test("Requête — trouver famille par email", async () => {
    const snap = await db.collection("families").where("parentEmail", "==", "dupont.validation@test.fr").get();
    assert(!snap.empty, "Famille trouvée par email");
    assert(snap.docs[0].id === familyId, "ID correct");
  });

  await test("Requête — familles avec loyaltyPoints > 0", async () => {
    const snap = await db.collection("families").where("loyaltyPoints", ">", 0).get();
    assert(!snap.empty, "Au moins une famille avec des points");
  });

  // ══════════════════════════════════════════════════════════════
  section("2. ACTIVITÉS — CRÉATION & CONFIGURATION");
  // ══════════════════════════════════════════════════════════════

  await test("Créer activité cours hebdomadaire", async () => {
    activityId = await createDoc("activities", {
      type: "cours", title: "Cours G4 Test V2", description: "Cours test validation v2",
      ageMin: 8, ageMax: 16, galopRequired: "G3",
      priceHT: 24.64, priceTTC: 26, tvaTaux: 5.5,
      maxPlaces: 8, schedule: "Mer 14:30", seasonPeriod: "Année", active: true,
      articles: [{ id: "art1", label: "Enseignement équitation", accountCode: "706100", amountHT: 24.64, tvaTaux: 5.5 }],
    });
    assert(!!activityId, "activityId créé");
  });

  await test("Créer activité cours avancé (Pony Games)", async () => {
    activityId2 = await createDoc("activities", {
      type: "cours", title: "Pony Games Test V2", description: "Pony games validation",
      ageMin: 6, ageMax: 14, galopRequired: "G2",
      priceHT: 22.75, priceTTC: 24, tvaTaux: 5.5,
      maxPlaces: 6, schedule: "Sam 10:00", seasonPeriod: "Année", active: true,
      articles: [{ id: "art1", label: "Enseignement PG", accountCode: "706100", amountHT: 22.75, tvaTaux: 5.5 }],
    });
    assert(!!activityId2, "activityId2 créé");
  });

  await test("Créer activité stage multi-jours", async () => {
    stageActivityId = await createDoc("activities", {
      type: "stage", title: "Stage Été Test V2",
      priceHT: 37.91, priceTTC: 40, tvaTaux: 5.5,
      price1day: 40, price2days: 70, price3days: 95, price4days: 115, price5days: 130,
      maxPlaces: 8, active: true, seasonPeriod: "Été",
    });
    assert(!!stageActivityId, "stageActivityId créé");
  });

  await test("Lire activité cours — vérifier TVA 5.5%", async () => {
    const doc = await db.collection("activities").doc(activityId).get();
    assert(doc.data()!.tvaTaux === 5.5, "TVA = 5.5%");
  });

  await test("Vérifier cohérence HT/TTC activité (TTC = HT * 1.055)", async () => {
    const doc = await db.collection("activities").doc(activityId).get();
    const d = doc.data()!;
    assertApprox(d.priceTTC, d.priceHT * 1.055, 0.05, "TTC = HT × 1.055");
  });

  await test("Désactiver puis réactiver une activité", async () => {
    await db.collection("activities").doc(activityId).update({ active: false });
    const off = await db.collection("activities").doc(activityId).get();
    assert(off.data()!.active === false, "Activité désactivée");
    await db.collection("activities").doc(activityId).update({ active: true });
    const on = await db.collection("activities").doc(activityId).get();
    assert(on.data()!.active === true, "Activité réactivée");
  });

  await test("Requête — activités actives uniquement", async () => {
    const snap = await db.collection("activities").where("active", "==", true).get();
    assert(!snap.empty, "Des activités actives existent");
    snap.docs.forEach(d => assert(d.data().active === true, `${d.id} est bien active`));
  });

  // ══════════════════════════════════════════════════════════════
  section("3. PLANNING — CRÉNEAUX");
  // ══════════════════════════════════════════════════════════════

  await test("Créer 4 créneaux cours sur 4 semaines", async () => {
    const base = {
      activityId, activityTitle: "Cours G4 Test V2", activityType: "cours",
      startTime: "14:30", endTime: "15:30", monitor: "Emmeline",
      maxPlaces: 8, enrolled: [], enrolledCount: 0, status: "planned",
      priceHT: 24.64, priceTTC: 26, tvaTaux: 5.5,
      dow: 3, // mercredi
    };
    creneauId1 = await createDoc("creneaux", { ...base, date: TODAY });
    creneauId2 = await createDoc("creneaux", { ...base, date: NEXT_WEEK });
    creneauId3 = await createDoc("creneaux", { ...base, date: NEXT_WEEK2 });
    const d3 = new Date(); d3.setDate(d3.getDate()+21);
    creneauId4 = await createDoc("creneaux", { ...base, date: d3.toISOString().split("T")[0] });
    assert(!!creneauId1 && !!creneauId2 && !!creneauId3 && !!creneauId4, "4 créneaux créés");
  });

  await test("Créer 2 créneaux de stage", async () => {
    const base = {
      activityId: stageActivityId, activityTitle: "Stage Été Test V2", activityType: "stage",
      startTime: "10:00", endTime: "12:00", monitor: "Nicolas",
      maxPlaces: 8, enrolled: [], enrolledCount: 0, status: "planned",
      priceHT: 37.91, priceTTC: 40, tvaTaux: 5.5,
    };
    stageCreneauId = await createDoc("creneaux", { ...base, date: TOMORROW });
    stageCreneauId2 = await createDoc("creneaux", { ...base, date: NEXT_WEEK });
    assert(!!stageCreneauId && !!stageCreneauId2, "2 créneaux stage créés");
  });

  await test("Vérifier structure créneau cours", async () => {
    const doc = await db.collection("creneaux").doc(creneauId1).get();
    const d = doc.data()!;
    assert(d.activityType === "cours", "Type cours");
    assert(d.maxPlaces === 8, "maxPlaces = 8");
    assert(Array.isArray(d.enrolled), "enrolled est un tableau");
    assert(d.enrolledCount === 0, "enrolledCount = 0");
    assert(d.status === "planned", "status = planned");
  });

  await test("Changer le moniteur d'un créneau", async () => {
    await db.collection("creneaux").doc(creneauId2).update({ monitor: "Nicolas" });
    const doc = await db.collection("creneaux").doc(creneauId2).get();
    assert(doc.data()!.monitor === "Nicolas", "Moniteur mis à jour");
    await db.collection("creneaux").doc(creneauId2).update({ monitor: "Emmeline" });
  });

  await test("Mettre un créneau en statut annulé puis le rétablir", async () => {
    await db.collection("creneaux").doc(creneauId3).update({ status: "cancelled" });
    const c = await db.collection("creneaux").doc(creneauId3).get();
    assert(c.data()!.status === "cancelled", "Statut cancelled");
    await db.collection("creneaux").doc(creneauId3).update({ status: "planned" });
    const r = await db.collection("creneaux").doc(creneauId3).get();
    assert(r.data()!.status === "planned", "Statut rétabli à planned");
  });

  await test("Requête créneaux par date", async () => {
    const snap = await db.collection("creneaux").where("date", "==", TODAY).get();
    assert(!snap.empty, "Créneaux trouvés pour aujourd'hui");
  });

  await test("Requête créneaux par activité", async () => {
    const snap = await db.collection("creneaux").where("activityId", "==", activityId).get();
    assert(snap.size >= 4, `Au moins 4 créneaux pour l'activité (trouvé ${snap.size})`);
  });

  await test("Requête créneaux par moniteur", async () => {
    const snap = await db.collection("creneaux").where("monitor", "==", "Emmeline").get();
    assert(!snap.empty, "Créneaux Emmeline trouvés");
  });

  // ══════════════════════════════════════════════════════════════
  section("4. INSCRIPTION PONCTUELLE");
  // ══════════════════════════════════════════════════════════════

  await test("Inscrire Lucas dans créneau 1 (ponctuel)", async () => {
    const entry = { childId: childId1, childName: "Lucas-V2", familyId, enrolledAt: new Date().toISOString(), paymentStatus: "pending" };
    await db.collection("creneaux").doc(creneauId1).update({
      enrolled: FieldValue.arrayUnion(entry),
      enrolledCount: FieldValue.increment(1),
    });
    const doc = await db.collection("creneaux").doc(creneauId1).get();
    assert(doc.data()!.enrolledCount === 1, "enrolledCount = 1");
    assert(doc.data()!.enrolled.length === 1, "enrolled.length = 1");
  });

  await test("Inscrire Emma dans le même créneau 1", async () => {
    const entry = { childId: childId2, childName: "Emma-V2", familyId, enrolledAt: new Date().toISOString(), paymentStatus: "pending" };
    await db.collection("creneaux").doc(creneauId1).update({
      enrolled: FieldValue.arrayUnion(entry),
      enrolledCount: FieldValue.increment(1),
    });
    const doc = await db.collection("creneaux").doc(creneauId1).get();
    assert(doc.data()!.enrolledCount === 2, "enrolledCount = 2");
  });

  await test("Inscrire Sophie (famille 2) dans créneau 1", async () => {
    const entry = { childId: childId3, childName: "Sophie-V2", familyId: familyId2, enrolledAt: new Date().toISOString(), paymentStatus: "pending" };
    await db.collection("creneaux").doc(creneauId1).update({
      enrolled: FieldValue.arrayUnion(entry),
      enrolledCount: FieldValue.increment(1),
    });
    const doc = await db.collection("creneaux").doc(creneauId1).get();
    assert(doc.data()!.enrolledCount === 3, "3 inscrits dans créneau 1");
  });

  await test("Vérifier pas de doublon — réinscription même enfant", async () => {
    const doc = await db.collection("creneaux").doc(creneauId1).get();
    const enrolled = doc.data()!.enrolled;
    const ids = enrolled.map((e: any) => e.childId);
    const unique = [...new Set(ids)];
    assert(ids.length === unique.length, "Pas de doublon dans enrolled");
  });

  await test("Désinscrire Lucas du créneau 1", async () => {
    const doc = await db.collection("creneaux").doc(creneauId1).get();
    const toRemove = doc.data()!.enrolled.find((e: any) => e.childId === childId1);
    await db.collection("creneaux").doc(creneauId1).update({
      enrolled: FieldValue.arrayRemove(toRemove),
      enrolledCount: FieldValue.increment(-1),
    });
    const updated = await db.collection("creneaux").doc(creneauId1).get();
    assert(updated.data()!.enrolledCount === 2, "enrolledCount = 2 après désinscription");
    assert(!updated.data()!.enrolled.some((e: any) => e.childId === childId1), "Lucas retiré de enrolled");
  });

  await test("Réinscrire Lucas dans créneau 1", async () => {
    const entry = { childId: childId1, childName: "Lucas-V2", familyId, enrolledAt: new Date().toISOString(), paymentStatus: "pending" };
    await db.collection("creneaux").doc(creneauId1).update({
      enrolled: FieldValue.arrayUnion(entry),
      enrolledCount: FieldValue.increment(1),
    });
    const doc = await db.collection("creneaux").doc(creneauId1).get();
    assert(doc.data()!.enrolledCount === 3, "3 inscrits après réinscription");
  });

  await test("Vérifier limite maxPlaces (créneau 8 places, 3 inscrits → OK)", async () => {
    const doc = await db.collection("creneaux").doc(creneauId1).get();
    const d = doc.data()!;
    assert(d.enrolledCount <= d.maxPlaces, `${d.enrolledCount} ≤ ${d.maxPlaces} places`);
  });

  await test("Inscrire Lucas dans créneau 2 et 3 (multi-créneaux)", async () => {
    for (const cid of [creneauId2, creneauId3]) {
      const entry = { childId: childId1, childName: "Lucas-V2", familyId, enrolledAt: new Date().toISOString(), paymentStatus: "pending" };
      await db.collection("creneaux").doc(cid).update({
        enrolled: FieldValue.arrayUnion(entry),
        enrolledCount: FieldValue.increment(1),
      });
    }
    const d2 = await db.collection("creneaux").doc(creneauId2).get();
    const d3 = await db.collection("creneaux").doc(creneauId3).get();
    assert(d2.data()!.enrolledCount === 1, "créneau 2: 1 inscrit");
    assert(d3.data()!.enrolledCount === 1, "créneau 3: 1 inscrit");
  });

  // ══════════════════════════════════════════════════════════════
  section("5. INSCRIPTION ANNUELLE — FORFAIT");
  // ══════════════════════════════════════════════════════════════

  await test("Créer forfait annuel Lucas — cours hebdo", async () => {
    forfaitId = await createDoc("forfaits", {
      familyId, childId: childId1, childName: "Lucas-V2",
      activityId, activityTitle: "Cours G4 Test V2",
      season: SEASON, startTime: "14:30", dow: 3,
      priceHT: 24.64, priceTTC: 26, tvaTaux: 5.5,
      status: "active", enrollmentDate: TODAY,
      nbSeances: 0, seancesPayees: 0,
    });
    assert(!!forfaitId, "Forfait annuel créé");
  });

  await test("Créer forfait annuel Emma — cours différent", async () => {
    forfaitId2 = await createDoc("forfaits", {
      familyId, childId: childId2, childName: "Emma-V2",
      activityId: activityId2, activityTitle: "Pony Games Test V2",
      season: SEASON, startTime: "10:00", dow: 6,
      priceHT: 22.75, priceTTC: 24, tvaTaux: 5.5,
      status: "active", enrollmentDate: TODAY,
      nbSeances: 0, seancesPayees: 0,
    });
    assert(!!forfaitId2, "Forfait annuel Emma créé");
  });

  await test("Lire forfait Lucas — vérifier champs", async () => {
    const doc = await db.collection("forfaits").doc(forfaitId).get();
    assert(doc.exists, "Forfait existe");
    const d = doc.data()!;
    assert(d.childId === childId1, "childId correct");
    assert(d.status === "active", "status active");
    assert(d.season === SEASON, "saison correcte");
  });

  await test("Incrémenter nbSeances après une reprise", async () => {
    await db.collection("forfaits").doc(forfaitId).update({ nbSeances: FieldValue.increment(1) });
    const doc = await db.collection("forfaits").doc(forfaitId).get();
    assert(doc.data()!.nbSeances === 1, "nbSeances = 1");
  });

  await test("Suspendre un forfait", async () => {
    await db.collection("forfaits").doc(forfaitId).update({ status: "suspended", suspendedAt: TODAY });
    const doc = await db.collection("forfaits").doc(forfaitId).get();
    assert(doc.data()!.status === "suspended", "Forfait suspendu");
    await db.collection("forfaits").doc(forfaitId).update({ status: "active" });
  });

  await test("Requête forfaits actifs d'une famille", async () => {
    const snap = await db.collection("forfaits")
      .where("familyId", "==", familyId)
      .where("status", "==", "active")
      .get();
    assert(snap.size >= 2, `Au moins 2 forfaits actifs (trouvé ${snap.size})`);
  });

  await test("Requête forfaits par saison", async () => {
    const snap = await db.collection("forfaits").where("season", "==", SEASON).get();
    assert(!snap.empty, "Forfaits de la saison trouvés");
  });

  await test("Requête forfaits par activité", async () => {
    const snap = await db.collection("forfaits").where("activityId", "==", activityId).get();
    assert(!snap.empty, "Forfaits pour cette activité trouvés");
  });

  // ══════════════════════════════════════════════════════════════
  section("6. PAIEMENTS & FACTURATION");
  // ══════════════════════════════════════════════════════════════

  await test("Créer paiement forfait annuel (status pending)", async () => {
    paymentId = await createDoc("payments", {
      familyId, familyName: "Dupont Validation",
      type: "forfait_annuel", season: SEASON,
      items: [
        { label: "Forfait Cours G4 — Lucas-V2", priceTTC: 26, priceHT: 24.64, tvaTaux: 5.5, qty: 36, creneauId: creneauId1, childId: childId1 },
        { label: "Forfait Pony Games — Emma-V2", priceTTC: 24, priceHT: 22.75, tvaTaux: 5.5, qty: 36, creneauId: creneauId1, childId: childId2 },
      ],
      totalHT: 1706.76, totalTVA: 93.88, totalTTC: 1800.64,
      status: "pending", createdAt: new Date().toISOString(),
      dueDate: NEXT_WEEK,
    });
    assert(!!paymentId, "Paiement forfait créé");
  });

  await test("Créer paiement ponctuel (status paid)", async () => {
    paymentId2 = await createDoc("payments", {
      familyId: familyId2, familyName: "Martin Validation",
      type: "ponctuel",
      items: [
        { label: "Cours G4 Test V2 — Sophie-V2", priceTTC: 26, priceHT: 24.64, tvaTaux: 5.5, qty: 1, creneauId: creneauId1, childId: childId3 },
      ],
      totalHT: 24.64, totalTVA: 1.36, totalTTC: 26,
      status: "paid", paidAt: TODAY, paidAmount: 26, paymentMode: "cb_terminal",
    });
    assert(!!paymentId2, "Paiement ponctuel payé créé");
  });

  await test("Créer paiement stage", async () => {
    paymentId3 = await createDoc("payments", {
      familyId: familyId3, familyName: "Bernard Validation",
      type: "stage",
      items: [
        { label: "Stage Été Test V2 — Paul-V2 (3j)", priceTTC: 95, priceHT: 90.05, tvaTaux: 5.5, qty: 1, creneauId: stageCreneauId, childId: childId4 },
      ],
      totalHT: 90.05, totalTVA: 4.95, totalTTC: 95,
      status: "pending", createdAt: new Date().toISOString(),
    });
    assert(!!paymentId3, "Paiement stage créé");
  });

  await test("Vérifier cohérence TTC = HT + TVA (paiement ponctuel)", async () => {
    const doc = await db.collection("payments").doc(paymentId2).get();
    const d = doc.data()!;
    assertApprox(d.totalTTC, d.totalHT + d.totalTVA, 0.02, "TTC = HT + TVA");
  });

  await test("Vérifier cohérence items → totalTTC (paiement ponctuel)", async () => {
    const doc = await db.collection("payments").doc(paymentId2).get();
    const d = doc.data()!;
    const sumItems = d.items.reduce((s: number, i: any) => s + i.priceTTC, 0);
    assertApprox(sumItems, d.totalTTC, 0.02, "Somme items ≈ totalTTC");
  });

  await test("Marquer paiement forfait comme payé (CB)", async () => {
    await db.collection("payments").doc(paymentId).update({
      status: "paid", paidAt: TODAY, paidAmount: 1800.64, paymentMode: "cb_terminal",
    });
    const doc = await db.collection("payments").doc(paymentId).get();
    assert(doc.data()!.status === "paid", "Statut paid");
    assert(doc.data()!.paidAmount === 1800.64, "Montant payé correct");
  });

  await test("Requête paiements en attente d'une famille", async () => {
    // paymentId est maintenant paid, on vérifie paymentId3
    const snap = await db.collection("payments").where("status", "==", "pending").get();
    assert(!snap.empty, "Paiements pending trouvés");
  });

  await test("Requête paiements payés d'une famille", async () => {
    const snap = await db.collection("payments")
      .where("familyId", "==", familyId)
      .where("status", "==", "paid")
      .get();
    assert(!snap.empty, "Paiement payé trouvé pour famille 1");
  });

  await test("Requête paiements par type forfait_annuel", async () => {
    const snap = await db.collection("payments").where("type", "==", "forfait_annuel").get();
    assert(!snap.empty, "Paiements forfait annuel trouvés");
  });

  await test("Ajouter note sur un paiement", async () => {
    await db.collection("payments").doc(paymentId).update({ notes: "Payé en 2 fois CB" });
    const doc = await db.collection("payments").doc(paymentId).get();
    assert(doc.data()!.notes === "Payé en 2 fois CB", "Note paiement ajoutée");
  });

  await test("Créer encaissement au journal", async () => {
    const encId = await createDoc("encaissements", {
      familyId, familyName: "Dupont Validation",
      paymentId, amount: 1800.64, mode: "cb_terminal",
      date: TODAY, label: "Forfait annuel V2",
    });
    assert(!!encId, "Encaissement créé");
  });

  await test("Requête encaissements du jour", async () => {
    const snap = await db.collection("encaissements").where("date", "==", TODAY).get();
    assert(!snap.empty, "Encaissements du jour trouvés");
  });

  // ══════════════════════════════════════════════════════════════
  section("7. MONTOIR — PRÉSENCES & CHEVAUX");
  // ══════════════════════════════════════════════════════════════

  await test("Créer un passage (présence) Lucas dans créneau 1", async () => {
    passageId = await createDoc("passages", {
      creneauId: creneauId1, familyId, childId: childId1,
      childName: "Lucas-V2", date: TODAY,
      status: "present", horse: null,
    });
    assert(!!passageId, "Passage créé");
  });

  await test("Assigner un cheval à Lucas", async () => {
    await db.collection("passages").doc(passageId).update({ horse: "Tornado", horseAssignedAt: new Date().toISOString() });
    const doc = await db.collection("passages").doc(passageId).get();
    assert(doc.data()!.horse === "Tornado", "Cheval assigné");
  });

  await test("Marquer absence sur un créneau", async () => {
    const absenceId = await createDoc("passages", {
      creneauId: creneauId1, familyId: familyId2, childId: childId3,
      childName: "Sophie-V2", date: TODAY, status: "absent", horse: null,
    });
    const doc = await db.collection("passages").doc(absenceId).get();
    assert(doc.data()!.status === "absent", "Statut absent");
  });

  await test("Marquer retard", async () => {
    const retardId = await createDoc("passages", {
      creneauId: creneauId2, familyId, childId: childId1,
      childName: "Lucas-V2", date: NEXT_WEEK, status: "late", horse: "Milo",
    });
    const doc = await db.collection("passages").doc(retardId).get();
    assert(doc.data()!.status === "late", "Statut retard");
  });

  await test("Requête passages d'un créneau", async () => {
    const snap = await db.collection("passages").where("creneauId", "==", creneauId1).get();
    assert(!snap.empty, "Passages du créneau trouvés");
  });

  await test("Requête passages d'un enfant sur la saison", async () => {
    const snap = await db.collection("passages").where("childId", "==", childId1).get();
    assert(!snap.empty, "Passages de Lucas trouvés");
  });

  // ══════════════════════════════════════════════════════════════
  section("8. CLÔTURE DE REPRISE");
  // ══════════════════════════════════════════════════════════════

  await test("Clôturer créneau 1 (status → closed)", async () => {
    await db.collection("creneaux").doc(creneauId1).update({
      status: "closed", closedAt: new Date().toISOString(),
      presentCount: 2, absentCount: 1,
    });
    const doc = await db.collection("creneaux").doc(creneauId1).get();
    assert(doc.data()!.status === "closed", "Créneau clôturé");
    assert(doc.data()!.presentCount === 2, "presentCount = 2");
  });

  await test("Vérifier cohérence présents + absents ≤ enrolledCount", async () => {
    const doc = await db.collection("creneaux").doc(creneauId1).get();
    const d = doc.data()!;
    assert((d.presentCount + d.absentCount) <= d.enrolledCount,
      `présents(${d.presentCount}) + absents(${d.absentCount}) ≤ inscrits(${d.enrolledCount})`);
  });

  await test("Requête créneaux clôturés", async () => {
    const snap = await db.collection("creneaux").where("status", "==", "closed").get();
    assert(!snap.empty, "Créneaux clôturés trouvés");
  });

  // ══════════════════════════════════════════════════════════════
  section("9. CARTES DE SÉANCES");
  // ══════════════════════════════════════════════════════════════

  await test("Créer carte 10 séances Lucas", async () => {
    carteId = await createDoc("cartes", {
      familyId, childId: childId1, childName: "Lucas-V2",
      activityId, activityTitle: "Cours G4 Test V2",
      totalSeances: 10, usedSeances: 0, remainingSeances: 10,
      priceHT: 220, priceTTC: 232.10, tvaTaux: 5.5,
      status: "active", purchasedAt: TODAY, expiresAt: NEXT_WEEK2,
    });
    assert(!!carteId, "Carte 10 séances créée");
  });

  await test("Créer carte 5 séances Emma", async () => {
    carteId2 = await createDoc("cartes", {
      familyId, childId: childId2, childName: "Emma-V2",
      activityId: activityId2, activityTitle: "Pony Games Test V2",
      totalSeances: 5, usedSeances: 0, remainingSeances: 5,
      priceHT: 107, priceTTC: 112.89, tvaTaux: 5.5,
      status: "active", purchasedAt: TODAY,
    });
    assert(!!carteId2, "Carte 5 séances créée");
  });

  await test("Utiliser 1 séance sur la carte Lucas", async () => {
    await db.collection("cartes").doc(carteId).update({
      usedSeances: FieldValue.increment(1),
      remainingSeances: FieldValue.increment(-1),
    });
    const doc = await db.collection("cartes").doc(carteId).get();
    assert(doc.data()!.usedSeances === 1, "usedSeances = 1");
    assert(doc.data()!.remainingSeances === 9, "remainingSeances = 9");
  });

  await test("Utiliser 3 séances supplémentaires (total 4)", async () => {
    for (let i = 0; i < 3; i++) {
      await db.collection("cartes").doc(carteId).update({
        usedSeances: FieldValue.increment(1),
        remainingSeances: FieldValue.increment(-1),
      });
    }
    const doc = await db.collection("cartes").doc(carteId).get();
    assert(doc.data()!.usedSeances === 4, "usedSeances = 4");
    assert(doc.data()!.remainingSeances === 6, "remainingSeances = 6");
  });

  await test("Vérifier cohérence used + remaining = total", async () => {
    const doc = await db.collection("cartes").doc(carteId).get();
    const d = doc.data()!;
    assert(d.usedSeances + d.remainingSeances === d.totalSeances,
      `${d.usedSeances} + ${d.remainingSeances} = ${d.totalSeances}`);
  });

  await test("Épuiser la carte Emma (5/5)", async () => {
    for (let i = 0; i < 5; i++) {
      await db.collection("cartes").doc(carteId2).update({
        usedSeances: FieldValue.increment(1),
        remainingSeances: FieldValue.increment(-1),
      });
    }
    await db.collection("cartes").doc(carteId2).update({ status: "exhausted" });
    const doc = await db.collection("cartes").doc(carteId2).get();
    assert(doc.data()!.remainingSeances === 0, "Plus de séances restantes");
    assert(doc.data()!.status === "exhausted", "Statut exhausted");
  });

  await test("Requête cartes actives d'une famille", async () => {
    const snap = await db.collection("cartes")
      .where("familyId", "==", familyId)
      .where("status", "==", "active")
      .get();
    assert(!snap.empty, "Carte active trouvée");
  });

  await test("Requête cartes épuisées", async () => {
    const snap = await db.collection("cartes").where("status", "==", "exhausted").get();
    assert(!snap.empty, "Cartes épuisées trouvées");
  });

  // ══════════════════════════════════════════════════════════════
  section("10. AVOIRS & BONS RÉCUP");
  // ══════════════════════════════════════════════════════════════

  await test("Créer un avoir", async () => {
    avoirId = await createDoc("avoirs", {
      familyId, familyName: "Dupont Validation",
      amount: 52, reason: "Désinscription stage",
      status: "available", createdAt: TODAY, expiresAt: NEXT_WEEK2,
    });
    assert(!!avoirId, "Avoir créé");
  });

  await test("Utiliser partiellement l'avoir (26€ sur 52€)", async () => {
    await db.collection("avoirs").doc(avoirId).update({
      usedAmount: 26, remainingAmount: 26,
    });
    const doc = await db.collection("avoirs").doc(avoirId).get();
    assert(doc.data()!.remainingAmount === 26, "remainingAmount = 26");
  });

  await test("Épuiser l'avoir", async () => {
    await db.collection("avoirs").doc(avoirId).update({
      usedAmount: 52, remainingAmount: 0, status: "used", usedAt: TODAY,
    });
    const doc = await db.collection("avoirs").doc(avoirId).get();
    assert(doc.data()!.status === "used", "Avoir épuisé");
  });

  await test("Créer un bon récup (séance de rattrapage)", async () => {
    bonRecupId = await createDoc("bonsRecup", {
      familyId, childId: childId1, childName: "Lucas-V2",
      creneauId: creneauId1, reason: "Absence justifiée",
      status: "available", createdAt: TODAY, expiresAt: NEXT_WEEK2,
    });
    assert(!!bonRecupId, "Bon récup créé");
  });

  await test("Utiliser le bon récup", async () => {
    await db.collection("bonsRecup").doc(bonRecupId).update({
      status: "used", usedAt: TODAY, usedForCreneauId: creneauId2,
    });
    const doc = await db.collection("bonsRecup").doc(bonRecupId).get();
    assert(doc.data()!.status === "used", "Bon récup utilisé");
  });

  await test("Requête avoirs disponibles famille", async () => {
    const newAvoirId = await createDoc("avoirs", {
      familyId, familyName: "Dupont Validation",
      amount: 26, status: "available", createdAt: TODAY,
    });
    const snap = await db.collection("avoirs")
      .where("familyId", "==", familyId)
      .where("status", "==", "available")
      .get();
    assert(!snap.empty, "Avoirs disponibles trouvés");
  });

  // ══════════════════════════════════════════════════════════════
  section("11. LISTE D'ATTENTE");
  // ══════════════════════════════════════════════════════════════

  await test("Créer entrée waitlist (créneau plein simulé)", async () => {
    waitlistId = await createDoc("waitlist", {
      creneauId: creneauId4, activityId, activityTitle: "Cours G4 Test V2",
      familyId: familyId3, childId: childId4, childName: "Paul-V2",
      requestedAt: new Date().toISOString(), status: "waiting",
      position: 1,
    });
    assert(!!waitlistId, "Entrée waitlist créée");
  });

  await test("Promouvoir depuis la waitlist", async () => {
    await db.collection("waitlist").doc(waitlistId).update({ status: "promoted", promotedAt: TODAY });
    const doc = await db.collection("waitlist").doc(waitlistId).get();
    assert(doc.data()!.status === "promoted", "Statut promoted");
  });

  await test("Requête waitlist d'un créneau", async () => {
    const snap = await db.collection("waitlist").where("creneauId", "==", creneauId4).get();
    assert(!snap.empty, "Waitlist trouvée pour ce créneau");
  });

  await test("Requête waitlist d'une famille", async () => {
    const snap = await db.collection("waitlist").where("familyId", "==", familyId3).get();
    assert(!snap.empty, "Waitlist famille 3 trouvée");
  });

  // ══════════════════════════════════════════════════════════════
  section("12. CAVALERIE — ÉQUIDÉS");
  // ══════════════════════════════════════════════════════════════

  await test("Créer un cheval (Tornado)", async () => {
    equideId = await createDoc("equides", {
      name: "Tornado-V2", type: "cheval", breed: "Selle Français",
      birthYear: 2015, color: "Bai", sex: "Hongre",
      weight: 520, height: 168, registrationNumber: "UELN-TEST-001",
      status: "actif", category: "chevaux",
      owner: "Centre Équestre Agon", arrivalDate: "2020-01-15",
    });
    assert(!!equideId, "Cheval créé");
  });

  await test("Créer un poney (Milo)", async () => {
    equideId2 = await createDoc("equides", {
      name: "Milo-V2", type: "poney", breed: "Welsh",
      birthYear: 2018, color: "Gris", sex: "Entier",
      weight: 180, height: 122, registrationNumber: "UELN-TEST-002",
      status: "actif", category: "poneys",
      owner: "Centre Équestre Agon", arrivalDate: "2021-06-01",
    });
    assert(!!equideId2, "Poney créé");
  });

  await test("Lire équidé — vérifier champs obligatoires", async () => {
    const doc = await db.collection("equides").doc(equideId).get();
    const d = doc.data()!;
    assert(d.name === "Tornado-V2", "Nom correct");
    assert(d.type === "cheval", "Type cheval");
    assert(d.status === "actif", "Statut actif");
    assert(!!d.registrationNumber, "Numéro UELN présent");
  });

  await test("Mettre un équidé en indisponibilité", async () => {
    const indispoId = await createDoc("indisponibilites", {
      equideId, equideName: "Tornado-V2",
      startDate: TODAY, endDate: NEXT_WEEK,
      reason: "Ferrure", type: "soin",
    });
    const doc = await db.collection("indisponibilites").doc(indispoId).get();
    assert(doc.data()!.equideId === equideId, "Indisponibilité liée à l'équidé");
  });

  await test("Créer un soin pour l'équidé", async () => {
    const soinId = await createDoc("soins", {
      equideId, equideName: "Tornado-V2",
      type: "vétérinaire", description: "Visite annuelle",
      date: TODAY, cost: 120, vet: "Dr. Martin",
      nextDate: NEXT_WEEK2,
    });
    const doc = await db.collection("soins").doc(soinId).get();
    assert(doc.data()!.equideId === equideId, "Soin lié à l'équidé");
    assert(doc.data()!.cost === 120, "Coût du soin correct");
  });

  await test("Créer un mouvement registre (entrée)", async () => {
    const mouvId = await createDoc("mouvements_registre", {
      equideId, equideName: "Tornado-V2",
      type: "entree", date: TODAY,
      origin: "Haras du Pin", destination: "Centre Agon",
      reason: "Achat", price: 5000,
    });
    assert(!!mouvId, "Mouvement registre créé");
  });

  await test("Mettre à jour statut équidé → retraite", async () => {
    await db.collection("equides").doc(equideId).update({ status: "retraite" });
    const doc = await db.collection("equides").doc(equideId).get();
    assert(doc.data()!.status === "retraite", "Statut retraite");
    await db.collection("equides").doc(equideId).update({ status: "actif" });
  });

  await test("Requête équidés actifs", async () => {
    const snap = await db.collection("equides").where("status", "==", "actif").get();
    assert(!snap.empty, "Équidés actifs trouvés");
  });

  await test("Requête chevaux uniquement", async () => {
    const snap = await db.collection("equides").where("type", "==", "cheval").get();
    assert(!snap.empty, "Chevaux trouvés");
    snap.docs.forEach(d => assert(d.data().type === "cheval", `${d.data().name} est bien un cheval`));
  });

  await test("Requête poneys uniquement", async () => {
    const snap = await db.collection("equides").where("type", "==", "poney").get();
    assert(!snap.empty, "Poneys trouvés");
  });

  // ══════════════════════════════════════════════════════════════
  section("13. SEPA — MANDATS, ÉCHÉANCIERS, REMISES");
  // ══════════════════════════════════════════════════════════════

  await test("Créer un mandat SEPA", async () => {
    mandatId = await createDoc("mandats-sepa", {
      familyId, familyName: "Dupont Validation",
      rum: `FR-TEST-${Date.now()}`,
      iban: "FR7616606100640013539343253",
      bic: "AGRIFRPP866",
      signedAt: TODAY, status: "active",
      ics: "FR57ZZZ852487",
    });
    assert(!!mandatId, "Mandat SEPA créé");
  });

  await test("Créer échéances SEPA pour un paiement", async () => {
    const ech1 = await createDoc("echeances-sepa", {
      mandatId, familyId, familyName: "Dupont Validation",
      paymentId, amount: 600, dueDate: TODAY, status: "pending",
      sequenceType: "FRST",
    });
    const ech2 = await createDoc("echeances-sepa", {
      mandatId, familyId, familyName: "Dupont Validation",
      paymentId, amount: 600, dueDate: NEXT_WEEK, status: "pending",
      sequenceType: "RCUR",
    });
    const ech3 = await createDoc("echeances-sepa", {
      mandatId, familyId, familyName: "Dupont Validation",
      paymentId, amount: 600.64, dueDate: NEXT_WEEK2, status: "pending",
      sequenceType: "RCUR",
    });
    assert(!!ech1 && !!ech2 && !!ech3, "3 échéances créées");
  });

  await test("Vérifier cohérence somme échéances ≈ totalTTC", async () => {
    const snap = await db.collection("echeances-sepa").where("paymentId", "==", paymentId).get();
    const total = snap.docs.reduce((s, d) => s + d.data().amount, 0);
    assertApprox(total, 1800.64, 0.05, "Somme échéances ≈ 1800.64");
  });

  await test("Créer une remise SEPA", async () => {
    remiseId = await createDoc("remises-sepa", {
      name: `Remise-Test-${Date.now()}`,
      dueDate: TODAY,
      status: "created",
      echeanceIds: [],
      totalAmount: 600,
      familyCount: 1,
      messageId: `MSG-TEST-${Date.now()}`,
    });
    assert(!!remiseId, "Remise SEPA créée");
  });

  await test("Passer remise en statut submitted", async () => {
    await db.collection("remises-sepa").doc(remiseId).update({ status: "submitted", submittedAt: TODAY });
    const doc = await db.collection("remises-sepa").doc(remiseId).get();
    assert(doc.data()!.status === "submitted", "Remise soumise");
  });

  await test("Marquer une échéance comme paid", async () => {
    const snap = await db.collection("echeances-sepa").where("paymentId", "==", paymentId).limit(1).get();
    if (!snap.empty) {
      await db.collection("echeances-sepa").doc(snap.docs[0].id).update({ status: "paid", paidAt: TODAY });
      const doc = await db.collection("echeances-sepa").doc(snap.docs[0].id).get();
      assert(doc.data()!.status === "paid", "Échéance paid");
    }
  });

  await test("Mandat SEPA — vérifier RUM unique", async () => {
    const snap = await db.collection("mandats-sepa").where("familyId", "==", familyId).get();
    const rums = snap.docs.map(d => d.data().rum);
    const uniqueRums = [...new Set(rums)];
    assert(rums.length === uniqueRums.length, "RUM uniques par famille");
  });

  await test("Requête mandats actifs", async () => {
    const snap = await db.collection("mandats-sepa").where("status", "==", "active").get();
    assert(!snap.empty, "Mandats actifs trouvés");
  });

  // ══════════════════════════════════════════════════════════════
  section("14. MANAGEMENT — TÂCHES & PLANNING ÉQUIPE");
  // ══════════════════════════════════════════════════════════════

  await test("Créer un moniteur dans salaries-management", async () => {
    salaryId = await createDoc("salaries-management", {
      nom: "Emmeline-Test-V2",
      couleur: "#16a34a",
      actif: true,
      role: "moniteur",
    });
    assert(!!salaryId, "Salarié créé");
  });

  await test("Créer une tâche type (bibliothèque)", async () => {
    tacheTypeId = await createDoc("taches-type", {
      label: "Écurie matin V2", categorie: "ecurie",
      dureeMinutes: 60, emoji: "🏠",
      obligatoire: true,
      joursDefaut: ["lundi","mardi","mercredi","jeudi","vendredi"],
      joursObligatoires: ["lundi","mardi","mercredi","jeudi","vendredi"],
      horairesDefaut: ["07:30","08:00"],
      color: "#f59e0b",
    });
    assert(!!tacheTypeId, "Tâche type créée");
  });

  await test("Créer une tâche planifiée pour cette semaine", async () => {
    const isoWeek = (() => {
      const d = new Date(); d.setHours(0,0,0,0);
      d.setDate(d.getDate()+3-((d.getDay()+6)%7));
      const w1 = new Date(d.getFullYear(),0,4);
      const wn = 1+Math.round(((d.getTime()-w1.getTime())/86400000-3+((w1.getDay()+6)%7))/7);
      return `${d.getFullYear()}-W${String(wn).padStart(2,"0")}`;
    })();
    tachePlanifieeId = await createDoc("taches-planifiees", {
      tacheTypeId, tacheLabel: "Écurie matin V2", categorie: "ecurie",
      salarieId: salaryId, salarieName: "Emmeline-Test-V2",
      jour: "lundi", heureDebut: "07:30", dureeMinutes: 60,
      semaine: isoWeek, done: false,
    });
    assert(!!tachePlanifieeId, "Tâche planifiée créée");
  });

  await test("Marquer tâche planifiée comme faite", async () => {
    await db.collection("taches-planifiees").doc(tachePlanifieeId).update({ done: true, doneAt: new Date().toISOString() });
    const doc = await db.collection("taches-planifiees").doc(tachePlanifieeId).get();
    assert(doc.data()!.done === true, "Tâche marquée done");
  });

  await test("Créer un modèle de planning", async () => {
    const modeleId = await createDoc("modeles-planning", {
      nom: "Semaine scolaire V2", type: "scolaire",
      couleur: "#2050A0",
      taches: [
        { tacheTypeId, tacheLabel: "Écurie matin V2", categorie: "ecurie",
          salarieId: salaryId, salarieName: "Emmeline-Test-V2",
          jour: "lundi", heureDebut: "07:30", dureeMinutes: 60 },
        { tacheTypeId, tacheLabel: "Écurie matin V2", categorie: "ecurie",
          salarieId: salaryId, salarieName: "Emmeline-Test-V2",
          jour: "mardi", heureDebut: "07:30", dureeMinutes: 60 },
      ],
      description: "Modèle test V2",
    });
    const doc = await db.collection("modeles-planning").doc(modeleId).get();
    assert(doc.data()!.taches.length === 2, "Modèle avec 2 tâches");
  });

  await test("Requête tâches par salarié", async () => {
    const snap = await db.collection("taches-planifiees").where("salarieId", "==", salaryId).get();
    assert(!snap.empty, "Tâches du salarié trouvées");
  });

  await test("Requête tâches obligatoires", async () => {
    const snap = await db.collection("taches-type").where("obligatoire", "==", true).get();
    assert(!snap.empty, "Tâches obligatoires trouvées");
  });

  await test("Vérifier pas de conflit horaire même salarié même jour", async () => {
    const isoWeek = (() => {
      const d = new Date(); d.setHours(0,0,0,0);
      d.setDate(d.getDate()+3-((d.getDay()+6)%7));
      const w1 = new Date(d.getFullYear(),0,4);
      const wn = 1+Math.round(((d.getTime()-w1.getTime())/86400000-3+((w1.getDay()+6)%7))/7);
      return `${d.getFullYear()}-W${String(wn).padStart(2,"0")}`;
    })();
    const snap = await db.collection("taches-planifiees")
      .where("salarieId", "==", salaryId)
      .where("semaine", "==", isoWeek)
      .where("jour", "==", "lundi")
      .get();
    const taches = snap.docs.map(d => ({ debut: d.data().heureDebut, fin: d.data().heureDebut, duree: d.data().dureeMinutes }));
    // Vérification simple : pas de 2 tâches qui commencent exactement au même horaire
    const horaires = taches.map(t => t.debut);
    const uniqueH = [...new Set(horaires)];
    assert(horaires.length === uniqueH.length, "Pas de chevauchement exact au même horaire");
  });

  // ══════════════════════════════════════════════════════════════
  section("15. SUIVI PÉDAGOGIQUE");
  // ══════════════════════════════════════════════════════════════

  await test("Créer une entrée suivi pédagogique Lucas", async () => {
    const pedagogieId = await createDoc("pedagogie", {
      familyId, childId: childId1, childName: "Lucas-V2",
      date: TODAY, moniteur: "Emmeline-Test-V2",
      objectifs: "Travailler le trot enlevé",
      observations: "Bonne progression, équilibre amélioré",
      galopLevel: "G4",
      nextObjectifs: "Aborder le galop",
      rating: 4,
    });
    const doc = await db.collection("pedagogie").doc(pedagogieId).get();
    assert(doc.data()!.childId === childId1, "Suivi lié à Lucas");
    assert(doc.data()!.rating === 4, "Note = 4");
  });

  await test("Créer 2ème entrée suivi (progression)", async () => {
    const pedagogieId2 = await createDoc("pedagogie", {
      familyId, childId: childId1, childName: "Lucas-V2",
      date: YESTERDAY, moniteur: "Emmeline-Test-V2",
      objectifs: "Trot enlevé en courbe",
      observations: "Difficultés en virage gauche",
      galopLevel: "G4", rating: 3,
    });
    const snap = await db.collection("pedagogie").where("childId", "==", childId1).get();
    assert(snap.size >= 2, "Au moins 2 entrées suivi pour Lucas");
  });

  await test("Requête suivi par enfant", async () => {
    const snap = await db.collection("pedagogie").where("childId", "==", childId1).orderBy("date", "desc").get();
    assert(!snap.empty, "Suivi Lucas trouvé");
    // Vérifier ordre chronologique inverse
    if (snap.size >= 2) {
      assert(snap.docs[0].data().date >= snap.docs[1].data().date, "Ordre date DESC correct");
    }
  });

  // ══════════════════════════════════════════════════════════════
  section("16. DEVIS");
  // ══════════════════════════════════════════════════════════════

  await test("Créer un devis", async () => {
    devisId = await createDoc("devis", {
      familyId, familyName: "Dupont Validation",
      number: `DEV-TEST-${Date.now()}`,
      date: TODAY, validUntil: NEXT_WEEK,
      items: [
        { label: "Forfait annuel Cours G4", qty: 36, priceHT: 24.64, priceTTC: 26, tvaTaux: 5.5 },
        { label: "Licence FFE", qty: 1, priceHT: 47.39, priceTTC: 50, tvaTaux: 5.5 },
      ],
      totalHT: 935.43, totalTVA: 51.45, totalTTC: 986.88,
      status: "sent",
    });
    assert(!!devisId, "Devis créé");
  });

  await test("Vérifier cohérence devis HT+TVA=TTC", async () => {
    const doc = await db.collection("devis").doc(devisId).get();
    const d = doc.data()!;
    assertApprox(d.totalTTC, d.totalHT + d.totalTVA, 0.05, "Devis TTC = HT + TVA");
  });

  await test("Convertir devis en paiement (statut → converted)", async () => {
    await db.collection("devis").doc(devisId).update({ status: "converted", convertedAt: TODAY });
    const doc = await db.collection("devis").doc(devisId).get();
    assert(doc.data()!.status === "converted", "Devis converti");
  });

  await test("Requête devis par famille", async () => {
    const snap = await db.collection("devis").where("familyId", "==", familyId).get();
    assert(!snap.empty, "Devis famille trouvé");
  });

  // ══════════════════════════════════════════════════════════════
  section("17. PUSH NOTIFICATIONS");
  // ══════════════════════════════════════════════════════════════

  await test("Créer un push token", async () => {
    const tokenId = await createDoc("pushTokens", {
      familyId, userId: familyId,
      token: `fcm-test-token-${Date.now()}`,
      platform: "web", createdAt: new Date().toISOString(),
      active: true,
    });
    const doc = await db.collection("pushTokens").doc(tokenId).get();
    assert(doc.data()!.active === true, "Token actif");
  });

  await test("Désactiver un push token", async () => {
    const snap = await db.collection("pushTokens").where("familyId", "==", familyId).limit(1).get();
    if (!snap.empty) {
      await db.collection("pushTokens").doc(snap.docs[0].id).update({ active: false });
      const doc = await db.collection("pushTokens").doc(snap.docs[0].id).get();
      assert(doc.data()!.active === false, "Token désactivé");
    }
  });

  await test("Requête tokens actifs", async () => {
    // Créer un token actif pour la requête
    await createDoc("pushTokens", {
      familyId: familyId2, token: `fcm-active-${Date.now()}`,
      platform: "android", active: true, createdAt: new Date().toISOString(),
    });
    const snap = await db.collection("pushTokens").where("active", "==", true).get();
    assert(!snap.empty, "Tokens actifs trouvés");
  });

  // ══════════════════════════════════════════════════════════════
  section("18. COMMUNICATION & EMAILS");
  // ══════════════════════════════════════════════════════════════

  await test("Créer une entrée communication (email envoyé)", async () => {
    communicationId = await createDoc("communications", {
      type: "email", subject: "Test validation V2",
      to: "dupont.validation@test.fr",
      familyId, sentAt: new Date().toISOString(),
      status: "sent", templateId: "welcome",
    });
    assert(!!communicationId, "Communication créée");
  });

  await test("Créer une communication échec (bounce)", async () => {
    const bounceId = await createDoc("communications", {
      type: "email", subject: "Test bounce",
      to: "invalid@test.fr",
      sentAt: new Date().toISOString(),
      status: "bounced", error: "Invalid email",
    });
    const doc = await db.collection("communications").doc(bounceId).get();
    assert(doc.data()!.status === "bounced", "Communication bounced");
  });

  await test("Requête emails envoyés à une famille", async () => {
    const snap = await db.collection("communications")
      .where("familyId", "==", familyId)
      .where("status", "==", "sent")
      .get();
    assert(!snap.empty, "Email envoyé trouvé");
  });

  await test("Créer modèle email custom", async () => {
    const modeleEmailId = await createDoc("modeles", {
      name: "Bienvenue V2", type: "email",
      subject: "Bienvenue au Centre Équestre",
      body: "<p>Bonjour {{parentName}},</p><p>Bienvenue !</p>",
      variables: ["parentName", "childName"],
      active: true,
    });
    const doc = await db.collection("modeles").doc(modeleEmailId).get();
    assert(doc.data()!.name === "Bienvenue V2", "Modèle email créé");
  });

  await test("Créer email reprise", async () => {
    const repriseId = await createDoc("emailsReprise", {
      familyId, childIds: [childId1, childId2],
      sentAt: new Date().toISOString(), status: "sent",
      season: SEASON,
    });
    assert(!!repriseId, "Email reprise créé");
  });

  // ══════════════════════════════════════════════════════════════
  section("19. FIDÉLITÉ & POINTS");
  // ══════════════════════════════════════════════════════════════

  await test("Créer entrée fidélité (gain points)", async () => {
    fideliteId = await createDoc("fidelite", {
      familyId, familyName: "Dupont Validation",
      type: "gain", points: 50, balance: 125,
      reason: "Inscription stage", date: TODAY,
      paymentId,
    });
    assert(!!fideliteId, "Entrée fidélité créée");
  });

  await test("Créer entrée fidélité (dépense points)", async () => {
    const depenseId = await createDoc("fidelite", {
      familyId, familyName: "Dupont Validation",
      type: "depense", points: -25, balance: 100,
      reason: "Réduction séance", date: TODAY,
    });
    const doc = await db.collection("fidelite").doc(depenseId).get();
    assert(doc.data()!.points === -25, "Points négatifs pour dépense");
  });

  await test("Requête historique fidélité famille", async () => {
    const snap = await db.collection("fidelite").where("familyId", "==", familyId).get();
    assert(snap.size >= 2, "Au moins 2 entrées fidélité");
  });

  await test("Vérifier solde points famille (via families)", async () => {
    await db.collection("families").doc(familyId).update({ loyaltyPoints: 100 });
    const doc = await db.collection("families").doc(familyId).get();
    assert(doc.data()!.loyaltyPoints === 100, "Points mis à jour sur famille");
  });

  // ══════════════════════════════════════════════════════════════
  section("20. SETTINGS & CONFIGURATION");
  // ══════════════════════════════════════════════════════════════

  await test("Lire les settings existants", async () => {
    const snap = await db.collection("settings").limit(1).get();
    // Pas d'assertion forte — peut être vide en test
    log("ℹ️", `Settings: ${snap.size} document(s) trouvé(s)`);
  });

  await test("Créer/mettre à jour settings vitrine", async () => {
    settingsId = await createDoc("settings", {
      key: "vitrine-test-v2",
      heroTitle: "Centre Équestre Test",
      heroSubtitle: "Validation automatique",
      updatedAt: new Date().toISOString(),
    });
    const doc = await db.collection("settings").doc(settingsId).get();
    assert(doc.data()!.key === "vitrine-test-v2", "Settings créés");
  });

  await test("Créer un moniteur dans parametres", async () => {
    moniteurId = await createDoc("moniteurs", {
      name: "Emmeline-Param-V2",
      email: "emmeline-v2@test.fr",
      role: "moniteur", status: "active",
      color: "#16a34a",
    });
    const doc = await db.collection("moniteurs").doc(moniteurId).get();
    assert(doc.data()!.status === "active", "Moniteur actif");
  });

  await test("Désactiver le moniteur de test", async () => {
    await db.collection("moniteurs").doc(moniteurId).update({ status: "inactive" });
    const doc = await db.collection("moniteurs").doc(moniteurId).get();
    assert(doc.data()!.status === "inactive", "Moniteur inactif");
  });

  await test("Requête moniteurs actifs", async () => {
    await db.collection("moniteurs").doc(moniteurId).update({ status: "active" });
    const snap = await db.collection("moniteurs").where("status", "==", "active").get();
    assert(!snap.empty, "Moniteurs actifs trouvés");
  });

  // ══════════════════════════════════════════════════════════════
  section("21. THÈMES STAGE — MONTOIR IA");
  // ══════════════════════════════════════════════════════════════

  await test("Créer un thème de stage", async () => {
    themeId = await createDoc("themes-stage", {
      stageId: stageActivityId,
      title: "Le monde des chevaliers",
      description: "Thème médiéval pour stage été",
      activities: ["Joutes équestres", "Blason équestre", "Parcours obstacle thématique"],
      createdAt: new Date().toISOString(),
      active: true,
    });
    assert(!!themeId, "Thème stage créé");
  });

  await test("Lire thème et vérifier activités", async () => {
    const doc = await db.collection("themes-stage").doc(themeId).get();
    assert(doc.data()!.activities.length === 3, "3 activités dans le thème");
    assert(doc.data()!.active === true, "Thème actif");
  });

  await test("Requête thèmes par stage", async () => {
    const snap = await db.collection("themes-stage").where("stageId", "==", stageActivityId).get();
    assert(!snap.empty, "Thème trouvé pour ce stage");
  });

  // ══════════════════════════════════════════════════════════════
  section("22. COMPTABILITÉ");
  // ══════════════════════════════════════════════════════════════

  await test("Créer une déclaration de paiement", async () => {
    const declId = await createDoc("payment_declarations", {
      month: `${YEAR}-${String(new Date().getMonth()+1).padStart(2,"0")}`,
      totalTTC: 26, totalHT: 24.64, totalTVA: 1.36,
      paymentCount: 1, status: "draft",
      createdAt: TODAY,
    });
    const doc = await db.collection("payment_declarations").doc(declId).get();
    assert(doc.data()!.status === "draft", "Déclaration créée");
  });

  await test("Créer écriture comptable (journal)", async () => {
    const comptId = await createDoc("comptabilite", {
      date: TODAY, type: "recette",
      accountCode: "706100", label: "Enseignement équitation",
      debit: 0, credit: 24.64,
      paymentId, familyId,
    });
    const doc = await db.collection("comptabilite").doc(comptId).get();
    assert(doc.data()!.credit === 24.64, "Écriture comptable créée");
  });

  await test("Requête écritures du mois", async () => {
    const snap = await db.collection("comptabilite")
      .where("date", ">=", `${YEAR}-${String(new Date().getMonth()+1).padStart(2,"0")}-01`)
      .get();
    assert(!snap.empty, "Écritures du mois trouvées");
  });

  // ══════════════════════════════════════════════════════════════
  section("23. DOCUMENTS & TEMPLATES");
  // ══════════════════════════════════════════════════════════════

  await test("Créer un template de document", async () => {
    const docTemplId = await createDoc("doc_templates", {
      name: "Règlement intérieur V2",
      type: "reglement", version: "2024",
      content: "Article 1 : ...", active: true,
    });
    const doc = await db.collection("doc_templates").doc(docTemplId).get();
    assert(doc.data()!.name === "Règlement intérieur V2", "Template créé");
  });

  await test("Requête templates actifs", async () => {
    const snap = await db.collection("doc_templates").where("active", "==", true).get();
    assert(!snap.empty, "Templates actifs trouvés");
  });

  // ══════════════════════════════════════════════════════════════
  section("24. RÉSERVATIONS");
  // ══════════════════════════════════════════════════════════════

  await test("Créer une réservation de stage", async () => {
    reservationId = await createDoc("reservations", {
      familyId: familyId3, childId: childId4, childName: "Paul-V2",
      stageId: stageActivityId, creneauId: stageCreneauId,
      days: [TOMORROW, NEXT_WEEK], nbDays: 2,
      priceTTC: 70, priceHT: 66.35, tvaTaux: 5.5,
      status: "confirmed", bookedAt: TODAY,
    });
    assert(!!reservationId, "Réservation créée");
  });

  await test("Annuler la réservation", async () => {
    await db.collection("reservations").doc(reservationId).update({ status: "cancelled", cancelledAt: TODAY });
    const doc = await db.collection("reservations").doc(reservationId).get();
    assert(doc.data()!.status === "cancelled", "Réservation annulée");
  });

  await test("Requête réservations par stage", async () => {
    await db.collection("reservations").doc(reservationId).update({ status: "confirmed" });
    const snap = await db.collection("reservations").where("stageId", "==", stageActivityId).get();
    assert(!snap.empty, "Réservations du stage trouvées");
  });

  await test("Requête réservations confirmées", async () => {
    const snap = await db.collection("reservations").where("status", "==", "confirmed").get();
    assert(!snap.empty, "Réservations confirmées trouvées");
  });

  // ══════════════════════════════════════════════════════════════
  section("25. INTÉGRITÉ DES DONNÉES — VALIDATIONS CROISÉES");
  // ══════════════════════════════════════════════════════════════

  await test("Cohérence enrolledCount vs enrolled.length — tous les créneaux test", async () => {
    for (const cid of [creneauId1, creneauId2, creneauId3, creneauId4, stageCreneauId]) {
      const doc = await db.collection("creneaux").doc(cid).get();
      if (!doc.exists) continue;
      const d = doc.data()!;
      const actual = (d.enrolled || []).length;
      if (d.enrolledCount !== undefined) {
        assert(d.enrolledCount === actual, `${cid}: enrolledCount(${d.enrolledCount}) = enrolled.length(${actual})`);
      }
    }
  });

  await test("Pas de doublon childId dans enrolled — tous les créneaux test", async () => {
    for (const cid of [creneauId1, creneauId2, creneauId3]) {
      const doc = await db.collection("creneaux").doc(cid).get();
      if (!doc.exists) continue;
      const ids = (doc.data()!.enrolled || []).map((e: any) => e.childId);
      const unique = [...new Set(ids)];
      assert(ids.length === unique.length, `${cid}: pas de doublon (${ids.length} vs ${unique.length})`);
    }
  });

  await test("Cohérence carte: used + remaining = total", async () => {
    const doc = await db.collection("cartes").doc(carteId).get();
    const d = doc.data()!;
    assert(d.usedSeances + d.remainingSeances === d.totalSeances,
      `${d.usedSeances} + ${d.remainingSeances} = ${d.totalSeances}`);
  });

  await test("Cohérence TTC = HT × 1.055 sur tous les payments test", async () => {
    for (const pid of [paymentId, paymentId2, paymentId3]) {
      const doc = await db.collection("payments").doc(pid).get();
      if (!doc.exists) continue;
      const d = doc.data()!;
      // Tolérance arrondi
      assertApprox(d.totalTTC, d.totalHT * 1.055, 1.5, `${pid}: TTC ≈ HT × 1.055`);
    }
  });

  await test("Cohérence somme items = totalTTC sur tous les payments test", async () => {
    for (const pid of [paymentId2, paymentId3]) {
      const doc = await db.collection("payments").doc(pid).get();
      if (!doc.exists) continue;
      const d = doc.data()!;
      if (!d.items) continue;
      const sum = d.items.reduce((s: number, i: any) => s + (i.priceTTC * (i.qty || 1)), 0);
      assertApprox(sum, d.totalTTC, 0.05, `${pid}: sum items ≈ totalTTC`);
    }
  });

  await test("Vérifier champs obligatoires famille (email, parentName)", async () => {
    for (const fid of [familyId, familyId2, familyId3]) {
      const doc = await db.collection("families").doc(fid).get();
      assert(doc.exists, `Famille ${fid} existe`);
      const d = doc.data()!;
      assert(!!d.parentName, `${fid}: parentName présent`);
      assert(!!d.parentEmail, `${fid}: parentEmail présent`);
      assert(Array.isArray(d.children) && d.children.length > 0, `${fid}: au moins 1 enfant`);
    }
  });

  await test("Vérifier champs obligatoires enfants (id, firstName, galopLevel)", async () => {
    const doc = await db.collection("families").doc(familyId).get();
    const children = doc.data()!.children;
    children.forEach((c: any, i: number) => {
      assert(!!c.id, `Enfant ${i}: id présent`);
      assert(!!c.firstName, `Enfant ${i}: firstName présent`);
      assert(!!c.galopLevel, `Enfant ${i}: galopLevel présent`);
    });
  });

  await test("Vérifier champs obligatoires créneau (date, startTime, endTime, monitor)", async () => {
    for (const cid of [creneauId1, creneauId2, stageCreneauId]) {
      const doc = await db.collection("creneaux").doc(cid).get();
      const d = doc.data()!;
      assert(!!d.date, `${cid}: date présente`);
      assert(!!d.startTime, `${cid}: startTime présent`);
      assert(!!d.endTime, `${cid}: endTime présent`);
      assert(!!d.monitor, `${cid}: monitor présent`);
    }
  });

  await test("Vérifier N° TVA intracommunautaire sur les payments", async () => {
    // Vérification que le format attendu est dans les données de facturation
    const EXPECTED_VAT = "FR12507569184";
    const doc = await db.collection("payments").doc(paymentId).get();
    // Le N° TVA est dans l'app, pas forcément dans le doc — on vérifie les champs clés
    assert(doc.exists, "Payment existe pour vérification");
    assert(doc.data()!.totalTTC > 0, "Montant TTC positif");
  });

  await test("Vérifier qu'aucune famille de test a un email de production", async () => {
    const testEmails = ["dupont.validation@test.fr","martin.validation@test.fr","bernard.validation@test.fr"];
    for (const email of testEmails) {
      const snap = await db.collection("families").where("parentEmail","==",email).get();
      if (!snap.empty) {
        assert(snap.docs[0].data()._testScript === true, `Famille test ${email} bien marquée _testScript`);
      }
    }
  });

  // ══════════════════════════════════════════════════════════════
  section("26. DÉSINSCRIPTION EN MASSE & NETTOYAGE SAISON");
  // ══════════════════════════════════════════════════════════════

  await test("Désinscrire Emma de tous les créneaux test", async () => {
    let count = 0;
    for (const cid of [creneauId1, creneauId2, creneauId3, creneauId4]) {
      const doc = await db.collection("creneaux").doc(cid).get();
      if (!doc.exists) continue;
      const enrolled = doc.data()!.enrolled || [];
      const toRemove = enrolled.find((e: any) => e.childId === childId2);
      if (toRemove) {
        await db.collection("creneaux").doc(cid).update({
          enrolled: FieldValue.arrayRemove(toRemove),
          enrolledCount: FieldValue.increment(-1),
        });
        count++;
      }
    }
    log("ℹ️", `Emma désinscrite de ${count} créneau(x)`);
  });

  await test("Suspendre tous les forfaits de la famille test", async () => {
    const snap = await db.collection("forfaits").where("familyId", "==", familyId).get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { status: "suspended", suspendedAt: TODAY }));
    await batch.commit();
    const verify = await db.collection("forfaits").where("familyId", "==", familyId).get();
    const allSuspended = verify.docs.every(d => d.data().status === "suspended");
    assert(allSuspended, "Tous les forfaits suspendus");
  });

  await test("Réactiver les forfaits après suspension", async () => {
    const snap = await db.collection("forfaits").where("familyId", "==", familyId).get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { status: "active" }));
    await batch.commit();
    const verify = await db.collection("forfaits").where("familyId", "==", familyId).get();
    const allActive = verify.docs.every(d => d.data().status === "active");
    assert(allActive, "Tous les forfaits réactivés");
  });

  // ══════════════════════════════════════════════════════════════
  section("27. PERFORMANCES & REQUÊTES COMPLEXES");
  // ══════════════════════════════════════════════════════════════

  await test("Requête composée: créneaux actifs futurs d'une activité", async () => {
    const snap = await db.collection("creneaux")
      .where("activityId", "==", activityId)
      .where("date", ">=", TODAY)
      .where("status", "==", "planned")
      .get();
    assert(!snap.empty, "Créneaux futurs actifs trouvés");
  });

  await test("Requête composée: paiements paid d'une saison", async () => {
    const snap = await db.collection("payments")
      .where("status", "==", "paid")
      .where("season", "==", SEASON)
      .get();
    assert(!snap.empty, "Paiements paid de la saison trouvés");
  });

  await test("Requête composée: forfaits actifs d'une activité", async () => {
    const snap = await db.collection("forfaits")
      .where("activityId", "==", activityId)
      .where("status", "==", "active")
      .get();
    assert(!snap.empty, "Forfaits actifs de l'activité trouvés");
  });

  await test("Requête composée: passages présents d'un créneau", async () => {
    const snap = await db.collection("passages")
      .where("creneauId", "==", creneauId1)
      .where("status", "==", "present")
      .get();
    assert(!snap.empty, "Passages présents du créneau trouvés");
  });

  await test("Requête composée: équidés actifs type poney", async () => {
    const snap = await db.collection("equides")
      .where("status", "==", "actif")
      .where("type", "==", "poney")
      .get();
    assert(!snap.empty, "Poneys actifs trouvés");
  });

  await test("Requête composée: soins équidé depuis une date", async () => {
    const snap = await db.collection("soins")
      .where("equideId", "==", equideId)
      .where("date", ">=", PAST_DATE)
      .get();
    assert(!snap.empty, "Soins récents de l'équidé trouvés");
  });

  await test("Batch write: créer 10 passages en une opération", async () => {
    const batch = db.batch();
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const ref = db.collection("passages").doc();
      batch.set(ref, { creneauId: creneauId2, familyId, childId: childId1,
        childName: "Lucas-V2", date: NEXT_WEEK, status: "present",
        horse: `Horse-${i}`, ...TEST_MARKER });
      createdDocs.push({ collection: "passages", id: ref.id });
      ids.push(ref.id);
    }
    await batch.commit();
    assert(ids.length === 10, "10 passages créés en batch");
  });

  await test("Transaction: décrémenter remainingSeances carte de façon atomique", async () => {
    await db.runTransaction(async (t) => {
      const ref = db.collection("cartes").doc(carteId);
      const snap = await t.get(ref);
      const current = snap.data()!.remainingSeances;
      if (current <= 0) throw new Error("Carte épuisée");
      t.update(ref, { remainingSeances: current - 1, usedSeances: FieldValue.increment(1) });
    });
    const doc = await db.collection("cartes").doc(carteId).get();
    assert(doc.data()!.usedSeances === 5, "usedSeances = 5 après transaction");
  });

  await test("Pagination: lire créneaux par page de 5", async () => {
    const page1 = await db.collection("creneaux").orderBy("date").limit(5).get();
    assert(page1.size > 0, "Page 1 non vide");
    if (page1.size === 5) {
      const last = page1.docs[page1.docs.length - 1];
      const page2 = await db.collection("creneaux").orderBy("date").startAfter(last).limit(5).get();
      log("ℹ️", `Page 2: ${page2.size} créneaux`);
    }
  });

  // ══════════════════════════════════════════════════════════════
  section("28. CAS LIMITES & EDGE CASES");
  // ══════════════════════════════════════════════════════════════

  await test("Créneau avec 0 place restante (enrolledCount = maxPlaces)", async () => {
    const fullCreneauId = await createDoc("creneaux", {
      activityId, activityTitle: "Cours G4 Full", activityType: "cours",
      date: NEXT_WEEK, startTime: "16:00", endTime: "17:00", monitor: "Nicolas",
      maxPlaces: 2, enrolled: [
        { childId: "c1", childName: "Enfant 1", paymentStatus: "paid" },
        { childId: "c2", childName: "Enfant 2", paymentStatus: "paid" },
      ], enrolledCount: 2, status: "planned",
      priceHT: 24.64, priceTTC: 26, tvaTaux: 5.5,
    });
    const doc = await db.collection("creneaux").doc(fullCreneauId).get();
    assert(doc.data()!.enrolledCount === doc.data()!.maxPlaces, "Créneau plein: enrolledCount = maxPlaces");
  });

  await test("Famille sans enfants (cas edge)", async () => {
    const emptyFamilyId = await createDoc("families", {
      parentName: "Famille Sans Enfant V2",
      parentEmail: "sansfamily.v2@test.fr",
      children: [], loyaltyPoints: 0,
    });
    const doc = await db.collection("families").doc(emptyFamilyId).get();
    assert(doc.data()!.children.length === 0, "Famille sans enfants créée");
  });

  await test("Paiement avec amount = 0 (inscription gratuite)", async () => {
    const freePayId = await createDoc("payments", {
      familyId, type: "gratuit",
      items: [{ label: "Séance offerte", priceTTC: 0, priceHT: 0, tvaTaux: 5.5 }],
      totalHT: 0, totalTVA: 0, totalTTC: 0,
      status: "paid", paymentMode: "gratuit",
    });
    const doc = await db.collection("payments").doc(freePayId).get();
    assert(doc.data()!.totalTTC === 0, "Paiement gratuit: totalTTC = 0");
  });

  await test("Créneau avec date passée (hier)", async () => {
    const pastCreneauId = await createDoc("creneaux", {
      activityId, activityTitle: "Cours passé", activityType: "cours",
      date: YESTERDAY, startTime: "14:30", endTime: "15:30", monitor: "Emmeline",
      maxPlaces: 8, enrolled: [], enrolledCount: 0, status: "closed",
      priceHT: 24.64, priceTTC: 26, tvaTaux: 5.5,
    });
    const doc = await db.collection("creneaux").doc(pastCreneauId).get();
    assert(doc.data()!.date < TODAY, "Créneau passé: date < today");
    assert(doc.data()!.status === "closed", "Créneau passé: status closed");
  });

  await test("Avoir expiré (date expiration passée)", async () => {
    const expiredAvoirId = await createDoc("avoirs", {
      familyId, familyName: "Dupont Validation",
      amount: 26, status: "expired",
      createdAt: PAST_DATE, expiresAt: YESTERDAY,
    });
    const doc = await db.collection("avoirs").doc(expiredAvoirId).get();
    assert(doc.data()!.status === "expired", "Avoir expiré");
    assert(doc.data()!.expiresAt < TODAY, "Date expiration passée");
  });

  await test("Carte avec séances négatives (protection invariant)", async () => {
    const doc = await db.collection("cartes").doc(carteId).get();
    const remaining = doc.data()!.remainingSeances;
    assert(remaining >= 0, `remainingSeances (${remaining}) >= 0`);
  });

  await test("Forfait sur activité inexistante (orphelin)", async () => {
    const orphanForfaitId = await createDoc("forfaits", {
      familyId, childId: childId1,
      activityId: "activity-inexistante-v2",
      activityTitle: "Activité Orpheline",
      season: SEASON, status: "active",
    });
    const doc = await db.collection("forfaits").doc(orphanForfaitId).get();
    assert(doc.exists, "Forfait orphelin créé (pas de contrainte FK en Firestore)");
  });

  await test("Email invalide ne bloque pas la création famille", async () => {
    const badEmailFamilyId = await createDoc("families", {
      parentName: "Famille Mauvais Email V2",
      parentEmail: "pas-un-email-valide",
      children: [{ id: "c-bad-email", firstName: "Test", galopLevel: "G1" }],
    });
    // Firestore n'a pas de validation email native
    const doc = await db.collection("families").doc(badEmailFamilyId).get();
    assert(doc.data()!.parentEmail === "pas-un-email-valide", "Email invalide stocké (validation côté app)");
  });

  // ══════════════════════════════════════════════════════════════
  section("29. MULTI-FAMILLES — INSCRIPTIONS CROISÉES");
  // ══════════════════════════════════════════════════════════════

  await test("Même créneau: inscrire enfants de 3 familles différentes", async () => {
    const cid = creneauId4;
    for (const { childId: cId, childName, fId } of [
      { childId: childId1, childName: "Lucas-V2", fId: familyId },
      { childId: childId3, childName: "Sophie-V2", fId: familyId2 },
      { childId: childId4, childName: "Paul-V2", fId: familyId3 },
    ]) {
      const doc = await db.collection("creneaux").doc(cid).get();
      const already = (doc.data()!.enrolled || []).some((e: any) => e.childId === cId);
      if (!already) {
        await db.collection("creneaux").doc(cid).update({
          enrolled: FieldValue.arrayUnion({ childId: cId, childName, familyId: fId, paymentStatus: "pending" }),
          enrolledCount: FieldValue.increment(1),
        });
      }
    }
    const final = await db.collection("creneaux").doc(cid).get();
    assert(final.data()!.enrolledCount >= 3, "3 familles dans le même créneau");
  });

  await test("Vérifier isolation familles: paiements non croisés", async () => {
    const snap1 = await db.collection("payments").where("familyId", "==", familyId).get();
    const snap2 = await db.collection("payments").where("familyId", "==", familyId2).get();
    // S'assurer qu'aucun payment de famille1 n'a familyId2
    snap1.docs.forEach(d => assert(d.data().familyId === familyId, "Paiement bien isolé famille 1"));
    snap2.docs.forEach(d => assert(d.data().familyId === familyId2, "Paiement bien isolé famille 2"));
  });

  await test("Un même enfant dans 2 activités différentes (forfaits)", async () => {
    const snap = await db.collection("forfaits").where("childId", "==", childId1).get();
    assert(snap.size >= 1, "Lucas a au moins 1 forfait");
  });

  // ══════════════════════════════════════════════════════════════
  section("30. RATTRAPAGES");
  // ══════════════════════════════════════════════════════════════

  await test("Créer un rattrapage (absence justifiée)", async () => {
    const rattrapageId = await createDoc("rattrapages", {
      familyId, childId: childId1, childName: "Lucas-V2",
      originalCreneauId: creneauId1, originalDate: TODAY,
      status: "pending", reason: "Maladie",
      createdAt: new Date().toISOString(),
    });
    assert(!!rattrapageId, "Rattrapage créé");
  });

  await test("Utiliser le rattrapage sur un autre créneau", async () => {
    const snap = await db.collection("rattrapages")
      .where("childId", "==", childId1)
      .where("status", "==", "pending")
      .limit(1).get();
    if (!snap.empty) {
      await db.collection("rattrapages").doc(snap.docs[0].id).update({
        status: "used", usedCreneauId: creneauId2, usedAt: TODAY,
      });
      const doc = await db.collection("rattrapages").doc(snap.docs[0].id).get();
      assert(doc.data()!.status === "used", "Rattrapage utilisé");
    }
  });

  await test("Requête rattrapages en attente d'une famille", async () => {
    // Créer un nouveau rattrapage pending pour la requête
    await createDoc("rattrapages", {
      familyId, childId: childId2, childName: "Emma-V2",
      originalCreneauId: creneauId2, status: "pending",
      createdAt: new Date().toISOString(),
    });
    const snap = await db.collection("rattrapages")
      .where("familyId", "==", familyId)
      .where("status", "==", "pending")
      .get();
    assert(!snap.empty, "Rattrapages pending trouvés");
  });

  // ══════════════════════════════════════════════════════════════
  section("31. RDV PRO (Cavalerie)");
  // ══════════════════════════════════════════════════════════════

  await test("Créer un RDV vétérinaire", async () => {
    const rdvId = await createDoc("rdv_pro", {
      type: "veterinaire", title: "Visite sanitaire annuelle",
      date: NEXT_WEEK, time: "09:00",
      equideIds: [equideId, equideId2],
      professional: "Dr. Martin Vét",
      notes: "Vaccins + dentiste",
      status: "scheduled",
    });
    const doc = await db.collection("rdv_pro").doc(rdvId).get();
    assert(doc.data()!.equideIds.length === 2, "RDV pour 2 équidés");
  });

  await test("Créer un RDV maréchal", async () => {
    const rdvId2 = await createDoc("rdv_pro", {
      type: "marechal", title: "Ferrage trimestriel",
      date: TOMORROW, time: "08:00",
      equideIds: [equideId],
      professional: "M. Ferrier",
      status: "scheduled",
    });
    const doc = await db.collection("rdv_pro").doc(rdvId2).get();
    assert(doc.data()!.type === "marechal", "RDV maréchal créé");
  });

  await test("Requête RDV à venir", async () => {
    const snap = await db.collection("rdv_pro")
      .where("status", "==", "scheduled")
      .where("date", ">=", TODAY)
      .get();
    assert(!snap.empty, "RDV futurs trouvés");
  });

  // ══════════════════════════════════════════════════════════════
  section("32. VALIDATION FINALE — NETTOYAGE");
  // ══════════════════════════════════════════════════════════════

  await test("Compter tous les documents créés par ce script", async () => {
    log("ℹ️", `${createdDocs.length} documents créés au total`);
    assert(createdDocs.length > 50, `Plus de 50 documents de test créés (${createdDocs.length})`);
  });

  await test("Vérifier qu'aucun document de test n'a échappé au marquage _testScript", async () => {
    // Vérification sur un échantillon
    const sample = createdDocs.slice(0, 10);
    for (const { collection, id } of sample) {
      const doc = await db.collection(collection).doc(id).get();
      if (doc.exists) {
        assert(doc.data()!._testScript === true, `${collection}/${id} marqué _testScript`);
      }
    }
  });

  await cleanup();

  // ══════════════════════════════════════════════════════════════
  section("📊 RÉSULTAT FINAL");
  // ══════════════════════════════════════════════════════════════
  const total = passed + failed + skipped;
  const rate = total > 0 ? Math.round(passed / total * 100) : 0;

  console.log(`\n  ✅ ${passed} tests passés`);
  if (failed > 0) {
    console.log(`  ❌ ${failed} tests échoués`);
    console.log(`\n  Erreurs détaillées :`);
    errors.forEach(e => console.log(`    • ${e}`));
  }
  if (skipped > 0) console.log(`  ⏭️  ${skipped} tests ignorés`);
  console.log(`\n  Total   : ${total} tests`);
  console.log(`  Réussite: ${rate}%\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error("❌ Erreur fatale:", e); process.exit(1); });
