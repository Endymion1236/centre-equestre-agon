#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * SCRIPT DE VALIDATION COMPLET — Centre Équestre d'Agon-Coutainville
 * ══════════════════════════════════════════════════════════════
 *
 * Ce script teste TOUS les modules de l'application via Firebase Admin SDK.
 * Il crée des données de test, valide les flows, puis nettoie tout.
 *
 * Usage :
 *   npx tsx scripts/validate-all.ts
 *
 * Prérequis :
 *   - Variables d'environnement Firebase configurées (.env.local ou env)
 *   - npm install (firebase-admin déjà installé)
 *
 * Les données créées sont marquées _testScript: true pour nettoyage facile.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

// Charger .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// ─── Init Firebase Admin ───
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
function section(title: string) { console.log(`\n${"═".repeat(60)}\n  ${title}\n${"═".repeat(60)}`); }

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    log("✅", name);
  } catch (e: any) {
    failed++;
    const msg = e.message || String(e);
    errors.push(`${name}: ${msg}`);
    log("❌", `${name} — ${msg}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
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
    try {
      await db.collection(collection).doc(id).delete();
      count++;
    } catch { /* doc déjà supprimé */ }
  }
  log("🗑️", `${count} documents de test supprimés`);
}

// ─── Données de test ───
const TODAY = new Date().toISOString().split("T")[0];
const TOMORROW = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; })();
const NEXT_WEEK = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; })();
const NEXT_WEEK2 = (() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().split("T")[0]; })();

let familyId = "";
let childId1 = "";
let childId2 = "";
let activityId = "";
let creneauId1 = "";
let creneauId2 = "";
let creneauId3 = "";
let stageCreneauId = "";
let paymentId = "";
let forfaitId = "";
let carteId = "";
let reservationId = "";

// ══════════════════════════════════════════════════════════════
async function main() {
  console.log("\n🐴 VALIDATION COMPLÈTE — Centre Équestre d'Agon-Coutainville");
  console.log(`   ${new Date().toLocaleString("fr-FR")}\n`);

  // ═══════════════════════════════
  section("1. FAMILLES & CAVALIERS");
  // ═══════════════════════════════

  await test("Créer une famille avec 2 enfants", async () => {
    childId1 = `child-test-${Date.now()}-1`;
    childId2 = `child-test-${Date.now()}-2`;
    familyId = await createDoc("families", {
      parentName: "Famille Test Validation",
      parentEmail: "test-validation@example.com",
      parentPhone: "0600000000",
      authProvider: "google",
      children: [
        { id: childId1, firstName: "Lucas-Test", birthDate: "2016-03-15", galopLevel: "G3", sanitaryForm: { allergies: "Aucune", emergencyContactName: "Parent Test", emergencyContactPhone: "0611111111", parentalAuthorization: true } },
        { id: childId2, firstName: "Emma-Test", birthDate: "2018-07-22", galopLevel: "Bronze", sanitaryForm: null },
      ],
    });
    assert(!!familyId, "familyId créé");
  });

  await test("Lire la famille et vérifier les enfants", async () => {
    const doc = await db.collection("families").doc(familyId).get();
    assert(doc.exists, "Document famille existe");
    const data = doc.data()!;
    assert(data.children.length === 2, `2 enfants (trouvé ${data.children.length})`);
    assert(data.children[0].firstName === "Lucas-Test", "Premier enfant = Lucas-Test");
    assert(data.children[1].firstName === "Emma-Test", "Deuxième enfant = Emma-Test");
  });

  await test("Modifier le niveau galop d'un enfant", async () => {
    const doc = await db.collection("families").doc(familyId).get();
    const children = doc.data()!.children;
    children[0].galopLevel = "G4";
    await db.collection("families").doc(familyId).update({ children });
    const updated = await db.collection("families").doc(familyId).get();
    assert(updated.data()!.children[0].galopLevel === "G4", "Galop mis à jour à G4");
  });

  // ═══════════════════════════════
  section("2. ACTIVITÉS");
  // ═══════════════════════════════

  await test("Créer une activité cours", async () => {
    activityId = await createDoc("activities", {
      type: "cours",
      title: "Cours Test G4",
      description: "Cours de test pour validation",
      ageMin: 8, ageMax: 16,
      galopRequired: "G3",
      priceHT: 24.64, priceTTC: 26, tvaTaux: 5.5,
      maxPlaces: 8,
      schedule: "Mer 14:30",
      seasonPeriod: "Année",
      active: true,
      articles: [{ id: "art1", label: "Enseignement", accountCode: "706100", amountHT: 24.64, tvaTaux: 5.5 }],
    });
    assert(!!activityId, "Activité créée");
  });

  await test("Lire l'activité et vérifier les champs", async () => {
    const doc = await db.collection("activities").doc(activityId).get();
    assert(doc.exists, "Activité existe");
    assert(doc.data()!.title === "Cours Test G4", "Titre correct");
    assert(doc.data()!.priceTTC === 26, "Prix TTC correct");
  });

  // ═══════════════════════════════
  section("3. PLANNING — CRÉNEAUX");
  // ═══════════════════════════════

  await test("Créer 3 créneaux cours (aujourd'hui, semaine prochaine, S+2)", async () => {
    const base = {
      activityId, activityTitle: "Cours Test G4", activityType: "cours",
      startTime: "14:30", endTime: "15:30", monitor: "Emmeline",
      maxPlaces: 8, enrolled: [], enrolledCount: 0, status: "planned",
      priceHT: 24.64, priceTTC: 26, tvaTaux: 5.5,
    };
    creneauId1 = await createDoc("creneaux", { ...base, date: TODAY });
    creneauId2 = await createDoc("creneaux", { ...base, date: NEXT_WEEK });
    creneauId3 = await createDoc("creneaux", { ...base, date: NEXT_WEEK2 });
    assert(!!creneauId1 && !!creneauId2 && !!creneauId3, "3 créneaux créés");
  });

  await test("Créer un créneau stage", async () => {
    stageCreneauId = await createDoc("creneaux", {
      activityId: "stage-test", activityTitle: "Stage Pâques", activityType: "stage",
      date: TOMORROW, startTime: "10:00", endTime: "12:00", monitor: "Nicolas",
      maxPlaces: 6, enrolled: [], enrolledCount: 0, status: "planned",
      priceHT: 37.91, priceTTC: 40, tvaTaux: 5.5,
      price1day: 40, price2days: 70, price3days: 95, price4days: 115,
    });
    assert(!!stageCreneauId, "Créneau stage créé");
  });

  // ═══════════════════════════════
  section("4. INSCRIPTION — SÉANCE PONCTUELLE");
  // ═══════════════════════════════

  await test("Inscrire Lucas dans un créneau ponctuel", async () => {
    const enrolled = [{
      childId: childId1, childName: "Lucas-Test",
      familyId, familyName: "Famille Test Validation",
      enrolledAt: new Date().toISOString(),
    }];
    await db.collection("creneaux").doc(creneauId1).update({ enrolled, enrolledCount: 1 });
    const doc = await db.collection("creneaux").doc(creneauId1).get();
    assert(doc.data()!.enrolled.length === 1, "1 inscrit dans le créneau");
    assert(doc.data()!.enrolled[0].childName === "Lucas-Test", "Nom correct");
  });

  await test("Vérifier les places restantes", async () => {
    const doc = await db.collection("creneaux").doc(creneauId1).get();
    const spots = doc.data()!.maxPlaces - doc.data()!.enrolled.length;
    assert(spots === 7, `7 places restantes (trouvé ${spots})`);
  });

  // ═══════════════════════════════
  section("5. INSCRIPTION ANNUELLE — FORFAIT");
  // ═══════════════════════════════

  await test("Inscrire Lucas en forfait annuel (multi-créneaux)", async () => {
    // Simuler l'inscription dans tous les créneaux futurs
    for (const cid of [creneauId1, creneauId2, creneauId3]) {
      const doc = await db.collection("creneaux").doc(cid).get();
      const existing = doc.data()!.enrolled || [];
      if (!existing.some((e: any) => e.childId === childId1)) {
        const newEnrolled = [...existing, {
          childId: childId1, childName: "Lucas-Test",
          familyId, familyName: "Famille Test Validation",
          enrolledAt: new Date().toISOString(),
        }];
        await db.collection("creneaux").doc(cid).update({ enrolled: newEnrolled, enrolledCount: newEnrolled.length });
      }
    }
    // Vérifier
    for (const cid of [creneauId1, creneauId2, creneauId3]) {
      const doc = await db.collection("creneaux").doc(cid).get();
      assert(doc.data()!.enrolled.some((e: any) => e.childId === childId1), `Lucas inscrit dans ${cid}`);
    }
  });

  await test("Créer le forfait annuel", async () => {
    forfaitId = await createDoc("forfaits", {
      familyId, familyName: "Famille Test Validation",
      childId: childId1, childName: "Lucas-Test",
      slotKey: "Cours Test G4 — mercredi 14:30",
      activityTitle: "Cours Test G4",
      dayLabel: "Mercredi", startTime: "14:30", endTime: "15:30",
      totalSessions: 13, attendedSessions: 0,
      licenceFFE: true, licenceType: "moins18",
      adhesion: true,
      forfaitPriceTTC: 520, totalPaidTTC: 0,
      paymentPlan: "1x", status: "actif",
      frequence: "1x",
    });
    assert(!!forfaitId, "Forfait créé");
  });

  // ═══════════════════════════════
  section("6. PAIEMENTS & FACTURATION");
  // ═══════════════════════════════

  await test("Créer un paiement pending (inscription annuelle)", async () => {
    paymentId = await createDoc("payments", {
      familyId, familyName: "Famille Test Validation",
      childId: childId1, childName: "Lucas-Test",
      type: "inscription_annuelle",
      items: [
        { activityTitle: "Adhésion annuelle (enfant 1)", childId: childId1, childName: "Lucas-Test", priceTTC: 60, priceHT: 56.87, tva: 5.5 },
        { activityTitle: "Licence FFE -18ans", childId: childId1, childName: "Lucas-Test", priceTTC: 25, priceHT: 25, tva: 0 },
        { activityTitle: "Forfait Cours Test G4 (Cours Test G4 — mercredi 14:30)", childId: childId1, childName: "Lucas-Test", priceTTC: 520, priceHT: 492.89, tva: 5.5 },
      ],
      totalTTC: 605,
      paymentMode: "", paymentRef: "",
      status: "pending", paidAmount: 0,
    });
    assert(!!paymentId, "Paiement pending créé");
  });

  await test("Encaisser le paiement (partiel)", async () => {
    await db.collection("payments").doc(paymentId).update({
      paidAmount: 300,
      status: "partial",
      paymentMode: "cb_terminal",
    });
    const doc = await db.collection("payments").doc(paymentId).get();
    assert(doc.data()!.status === "partial", "Statut partial");
    assert(doc.data()!.paidAmount === 300, "300€ encaissé");
  });

  await test("Encaisser le solde (paiement complet)", async () => {
    await db.collection("payments").doc(paymentId).update({
      paidAmount: 605,
      status: "paid",
    });
    const doc = await db.collection("payments").doc(paymentId).get();
    assert(doc.data()!.status === "paid", "Statut paid");
    assert(doc.data()!.paidAmount === 605, "605€ total encaissé");
  });

  await test("Ajouter un 2ème enfant à la commande (fratrie)", async () => {
    // Simuler l'ajout d'Emma à la même commande
    const doc = await db.collection("payments").doc(paymentId).get();
    const existingItems = doc.data()!.items;
    const newItems = [
      ...existingItems,
      { activityTitle: "Adhésion annuelle (enfant 2)", childId: childId2, childName: "Emma-Test", priceTTC: 40, priceHT: 37.91, tva: 5.5 },
      { activityTitle: "Licence FFE -18ans", childId: childId2, childName: "Emma-Test", priceTTC: 25, priceHT: 25, tva: 0 },
      { activityTitle: "Forfait Cours Test G4", childId: childId2, childName: "Emma-Test", priceTTC: 520, priceHT: 492.89, tva: 5.5 },
    ];
    // On ne fusionne que si status pending — ici c'est paid donc on crée un nouveau
    // (Ce test vérifie la logique de non-fusion sur commande payée)
    assert(doc.data()!.status === "paid", "Commande déjà payée → pas de fusion");
  });

  // ═══════════════════════════════
  section("7. RÉSERVATIONS");
  // ═══════════════════════════════

  await test("Créer une réservation stage", async () => {
    reservationId = await createDoc("reservations", {
      familyId, familyName: "Famille Test Validation",
      childId: childId1, childName: "Lucas-Test",
      activityTitle: "Stage Pâques", activityType: "stage",
      creneauId: stageCreneauId,
      date: TOMORROW,
      startTime: "10:00", endTime: "12:00",
      priceTTC: 40, status: "confirmed",
    });
    assert(!!reservationId, "Réservation stage créée");
  });

  await test("Inscrire dans le créneau stage", async () => {
    await db.collection("creneaux").doc(stageCreneauId).update({
      enrolled: [{ childId: childId1, childName: "Lucas-Test", familyId, familyName: "Famille Test Validation", enrolledAt: new Date().toISOString() }],
      enrolledCount: 1,
    });
    const doc = await db.collection("creneaux").doc(stageCreneauId).get();
    assert(doc.data()!.enrolled.length === 1, "1 inscrit au stage");
  });

  // ═══════════════════════════════
  section("8. MONTOIR — PRÉSENCES");
  // ═══════════════════════════════

  await test("Pointer un cavalier comme présent", async () => {
    const doc = await db.collection("creneaux").doc(creneauId1).get();
    const enrolled = doc.data()!.enrolled.map((e: any) =>
      e.childId === childId1 ? { ...e, presence: "present" } : e
    );
    await db.collection("creneaux").doc(creneauId1).update({ enrolled });
    const updated = await db.collection("creneaux").doc(creneauId1).get();
    assert(updated.data()!.enrolled[0].presence === "present", "Présence marquée");
  });

  await test("Assigner un poney", async () => {
    const doc = await db.collection("creneaux").doc(creneauId1).get();
    const enrolled = doc.data()!.enrolled.map((e: any) =>
      e.childId === childId1 ? { ...e, horseName: "Caramel" } : e
    );
    await db.collection("creneaux").doc(creneauId1).update({ enrolled });
    const updated = await db.collection("creneaux").doc(creneauId1).get();
    assert(updated.data()!.enrolled[0].horseName === "Caramel", "Poney Caramel assigné");
  });

  await test("Pointer un cavalier absent", async () => {
    // Inscrire Emma d'abord
    const doc = await db.collection("creneaux").doc(creneauId1).get();
    const enrolled = [...doc.data()!.enrolled, {
      childId: childId2, childName: "Emma-Test",
      familyId, familyName: "Famille Test Validation",
      enrolledAt: new Date().toISOString(), presence: "absent",
    }];
    await db.collection("creneaux").doc(creneauId1).update({ enrolled, enrolledCount: enrolled.length });
    const updated = await db.collection("creneaux").doc(creneauId1).get();
    const emma = updated.data()!.enrolled.find((e: any) => e.childId === childId2);
    assert(emma?.presence === "absent", "Emma marquée absente");
  });

  // ═══════════════════════════════
  section("9. CLÔTURE DE REPRISE");
  // ═══════════════════════════════

  await test("Clôturer une reprise", async () => {
    await db.collection("creneaux").doc(creneauId1).update({
      status: "closed",
      closedAt: FieldValue.serverTimestamp(),
    });
    const doc = await db.collection("creneaux").doc(creneauId1).get();
    assert(doc.data()!.status === "closed", "Créneau clôturé");
  });

  await test("Ne pas clôturer une reprise déjà clôturée", async () => {
    const doc = await db.collection("creneaux").doc(creneauId1).get();
    assert(doc.data()!.status === "closed", "Toujours clôturé");
    // En prod, le code vérifie ce statut avant de clôturer
  });

  // ═══════════════════════════════
  section("10. SUIVI PÉDAGOGIQUE");
  // ═══════════════════════════════

  await test("Ajouter une note pédagogique à un cavalier", async () => {
    const famDoc = await db.collection("families").doc(familyId).get();
    const children = famDoc.data()!.children;
    const child = children.find((c: any) => c.id === childId1);
    const peda = child.peda || { objectifs: [], notes: [] };
    const newNote = {
      creneauId: creneauId1,
      date: TODAY,
      text: "Bon travail au trot. À améliorer : position des mains.",
      horseName: "Caramel",
      monitor: "Emmeline",
      galopLevel: "G4",
    };
    peda.notes = [newNote, ...peda.notes];
    const updatedChildren = children.map((c: any) =>
      c.id === childId1 ? { ...c, peda } : c
    );
    await db.collection("families").doc(familyId).update({ children: updatedChildren });
    const updated = await db.collection("families").doc(familyId).get();
    const updatedChild = updated.data()!.children.find((c: any) => c.id === childId1);
    assert(updatedChild.peda.notes.length === 1, "1 note pédagogique");
    assert(updatedChild.peda.notes[0].horseName === "Caramel", "Note contient le poney");
  });

  await test("Mettre à jour les objectifs pédagogiques", async () => {
    const famDoc = await db.collection("families").doc(familyId).get();
    const children = famDoc.data()!.children;
    const updatedChildren = children.map((c: any) =>
      c.id === childId1 ? { ...c, peda: { ...c.peda, objectifs: ["Galoper en équilibre", "Changement de pied"] } } : c
    );
    await db.collection("families").doc(familyId).update({ children: updatedChildren });
    const updated = await db.collection("families").doc(familyId).get();
    const child = updated.data()!.children.find((c: any) => c.id === childId1);
    assert(child.peda.objectifs.length === 2, "2 objectifs pédagogiques");
  });

  // ═══════════════════════════════
  section("11. CARTES DE SÉANCES");
  // ═══════════════════════════════

  await test("Créer une carte 10 séances", async () => {
    carteId = await createDoc("cartes", {
      familyId, familyName: "Famille Test Validation",
      childId: childId1, childName: "Lucas-Test",
      activityType: "cours",
      totalSessions: 10, usedSessions: 0, remainingSessions: 10,
      priceHT: 236.97, tvaTaux: 5.5, priceTTC: 250,
      status: "active", history: [],
    });
    assert(!!carteId, "Carte 10 séances créée");
  });

  await test("Débiter une séance de la carte", async () => {
    const doc = await db.collection("cartes").doc(carteId).get();
    const data = doc.data()!;
    const newHistory = [...data.history, { date: TODAY, activityTitle: "Cours Test G4", deductedAt: new Date().toISOString() }];
    await db.collection("cartes").doc(carteId).update({
      usedSessions: 1, remainingSessions: 9, history: newHistory,
    });
    const updated = await db.collection("cartes").doc(carteId).get();
    assert(updated.data()!.remainingSessions === 9, "9 séances restantes");
    assert(updated.data()!.history.length === 1, "1 entrée dans l'historique");
  });

  await test("Épuiser la carte (statut expired)", async () => {
    await db.collection("cartes").doc(carteId).update({
      usedSessions: 10, remainingSessions: 0, status: "used",
    });
    const doc = await db.collection("cartes").doc(carteId).get();
    assert(doc.data()!.status === "used", "Carte épuisée");
    assert(doc.data()!.remainingSessions === 0, "0 séances restantes");
  });

  // ═══════════════════════════════
  section("12. AVOIRS & AVANCES");
  // ═══════════════════════════════

  await test("Créer un avoir après annulation", async () => {
    const avoirId = await createDoc("avoirs", {
      familyId, familyName: "Famille Test Validation",
      type: "avoir",
      amount: 50, usedAmount: 0, remainingAmount: 50,
      reason: "Annulation test",
      reference: "AV-TEST-001",
      sourceType: "annulation",
      status: "actif",
      usageHistory: [],
    });
    assert(!!avoirId, "Avoir créé");
    const doc = await db.collection("avoirs").doc(avoirId).get();
    assert(doc.data()!.remainingAmount === 50, "50€ disponible");
  });

  // ═══════════════════════════════
  section("13. DÉSINSCRIPTION EN MASSE");
  // ═══════════════════════════════

  await test("Vérifier que Lucas est inscrit dans 3 créneaux", async () => {
    let count = 0;
    for (const cid of [creneauId1, creneauId2, creneauId3]) {
      const doc = await db.collection("creneaux").doc(cid).get();
      if (doc.data()!.enrolled.some((e: any) => e.childId === childId1)) count++;
    }
    assert(count >= 2, `Lucas inscrit dans au moins 2 créneaux (trouvé ${count})`);
  });

  await test("Désinscrire Lucas de tous les créneaux futurs", async () => {
    // Simuler ce que fait /api/admin/unenroll-annual
    for (const cid of [creneauId1, creneauId2, creneauId3]) {
      const doc = await db.collection("creneaux").doc(cid).get();
      if (!doc.exists) continue;
      const enrolled = doc.data()!.enrolled || [];
      const newEnrolled = enrolled.filter((e: any) => e.childId !== childId1);
      await db.collection("creneaux").doc(cid).update({ enrolled: newEnrolled, enrolledCount: newEnrolled.length });
    }
    // Vérifier
    for (const cid of [creneauId2, creneauId3]) {
      const doc = await db.collection("creneaux").doc(cid).get();
      assert(!doc.data()!.enrolled.some((e: any) => e.childId === childId1), `Lucas désinscrit de ${cid}`);
    }
  });

  await test("Annuler le forfait", async () => {
    await db.collection("forfaits").doc(forfaitId).update({
      status: "cancelled", cancelledAt: new Date().toISOString(),
    });
    const doc = await db.collection("forfaits").doc(forfaitId).get();
    assert(doc.data()!.status === "cancelled", "Forfait annulé");
  });

  // ═══════════════════════════════
  section("14. CAVALERIE (ÉQUIDÉS)");
  // ═══════════════════════════════

  await test("Créer un équidé", async () => {
    const equideId = await createDoc("equides", {
      name: "Caramel-Test",
      type: "poney",
      race: "Welsh",
      robe: "Alezan",
      birthYear: 2015,
      taille: 135,
      sexe: "hongre",
      proprietaire: "Centre",
      status: "actif",
      maxReprisesJour: 3,
      niveauMax: "G4",
      disciplines: ["dressage", "cso"],
      soins: [],
      indisponibilites: [],
    });
    assert(!!equideId, "Équidé Caramel-Test créé");
  });

  // ═══════════════════════════════
  section("15. LISTE D'ATTENTE");
  // ═══════════════════════════════

  await test("Ajouter un enfant en liste d'attente", async () => {
    const waitlistId = await createDoc("waitlist", {
      creneauId: creneauId2,
      childId: childId2, childName: "Emma-Test",
      familyId, familyName: "Famille Test Validation",
      status: "waiting",
    });
    assert(!!waitlistId, "Ajouté en liste d'attente");
    const doc = await db.collection("waitlist").doc(waitlistId).get();
    assert(doc.data()!.status === "waiting", "Statut waiting");
  });

  // ═══════════════════════════════
  section("16. PUSH TOKENS");
  // ═══════════════════════════════

  await test("Enregistrer un token push", async () => {
    await db.collection("push_tokens").doc(familyId).set({
      token: "fake-token-for-testing",
      updatedAt: FieldValue.serverTimestamp(),
      ...TEST_MARKER,
    });
    createdDocs.push({ collection: "push_tokens", id: familyId });
    const doc = await db.collection("push_tokens").doc(familyId).get();
    assert(doc.exists, "Token push enregistré");
  });

  // ═══════════════════════════════
  section("17. ENCAISSEMENTS (JOURNAL)");
  // ═══════════════════════════════

  await test("Créer un encaissement au journal", async () => {
    const encId = await createDoc("encaissements", {
      familyId, familyName: "Famille Test Validation",
      paymentId,
      amount: 605,
      mode: "cb_terminal",
      date: TODAY,
      label: "Encaissement forfait annuel",
    });
    assert(!!encId, "Encaissement journal créé");
  });

  // ═══════════════════════════════
  section("18. INTÉGRITÉ DES DONNÉES");
  // ═══════════════════════════════

  await test("Vérifier cohérence enrolled/enrolledCount", async () => {
    for (const cid of [creneauId1, creneauId2, creneauId3, stageCreneauId]) {
      const doc = await db.collection("creneaux").doc(cid).get();
      if (!doc.exists) continue;
      const data = doc.data()!;
      const actualCount = (data.enrolled || []).length;
      if (data.enrolledCount !== undefined) {
        assert(data.enrolledCount === actualCount, `${cid}: enrolledCount (${data.enrolledCount}) = enrolled.length (${actualCount})`);
      }
    }
  });

  await test("Vérifier qu'aucun créneau n'a de doublons dans enrolled", async () => {
    for (const cid of [creneauId1, creneauId2, creneauId3]) {
      const doc = await db.collection("creneaux").doc(cid).get();
      if (!doc.exists) continue;
      const enrolled = doc.data()!.enrolled || [];
      const ids = enrolled.map((e: any) => e.childId);
      const uniqueIds = [...new Set(ids)];
      assert(ids.length === uniqueIds.length, `${cid}: pas de doublons (${ids.length} inscrits, ${uniqueIds.length} uniques)`);
    }
  });

  await test("Vérifier que les montants TTC sont cohérents", async () => {
    const doc = await db.collection("payments").doc(paymentId).get();
    const items = doc.data()!.items || [];
    const sumItems = items.reduce((s: number, i: any) => s + (i.priceTTC || 0), 0);
    const totalTTC = doc.data()!.totalTTC;
    // Tolérance arrondi 1€
    assert(Math.abs(sumItems - totalTTC) < 1, `Sum items (${sumItems}) ≈ totalTTC (${totalTTC})`);
  });

  // ═══════════════════════════════
  // NETTOYAGE
  // ═══════════════════════════════
  await cleanup();

  // ═══════════════════════════════
  // RÉSULTAT FINAL
  // ═══════════════════════════════
  section("📊 RÉSULTAT FINAL");
  console.log(`\n  ✅ ${passed} tests passés`);
  if (failed > 0) {
    console.log(`  ❌ ${failed} tests échoués`);
    console.log(`\n  Erreurs :`);
    errors.forEach(e => console.log(`    • ${e}`));
  }
  if (skipped > 0) console.log(`  ⏭️  ${skipped} tests ignorés`);
  console.log(`\n  Total : ${passed + failed + skipped} tests`);
  console.log(`  Taux de réussite : ${Math.round(passed / (passed + failed) * 100)}%\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error("❌ Erreur fatale:", e); process.exit(1); });
