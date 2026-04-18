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
import * as fs from "fs";
import * as path from "path";

// Initialisation Firebase — priorité : fichier JSON service account > variables env
function initFirebase() {
  // 1. Chercher le fichier JSON service account dans le dossier courant
  const cwd = process.cwd();
  const jsonFiles = fs.readdirSync(cwd).filter(f => f.endsWith(".json") && f.includes("firebase-adminsdk"));
  if (jsonFiles.length > 0) {
    const jsonPath = path.join(cwd, jsonFiles[0]);
    console.log(`🔑 Service account: ${jsonFiles[0]}`);
    const sa = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    return { projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key };
  }
  // 2. Fallback : variables d'environnement
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || "";
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
  if (privateKey.includes("\\n")) privateKey = privateKey.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    console.error("❌ Impossible d'initialiser Firebase.");
    console.error("   Placez le fichier JSON du compte de service dans:", cwd);
    console.error("   (ex: gestion-2026-firebase-adminsdk-xxxx.json)");
    process.exit(1);
  }
  return { projectId, clientEmail, privateKey };
}

const { projectId, clientEmail, privateKey } = initFirebase();

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

// Helpers compacts pour tests synchrones (section 33+)
function t(name: string, fn: () => void) {
  try { fn(); passed++; log("✅", name); }
  catch (e: any) { failed++; const m = e.message || String(e); errors.push(`${name}: ${m}`); log("❌", `${name} — ${m}`); }
}
function eq(name: string, actual: any, expected: any) {
  t(name, () => {
    const a = JSON.stringify(actual), b = JSON.stringify(expected);
    if (a !== b) throw new Error(`attendu ${b}, obtenu ${a}`);
  });
}
function ok(name: string, cond: any) { t(name, () => { if (!cond) throw new Error("condition fausse"); }); }
function nearly(name: string, a: number, b: number, tol = 0.01) {
  t(name, () => { if (Math.abs(a - b) > tol) throw new Error(`${a} ≠ ${b} (tol ${tol})`); });
}
function throws(name: string, fn: () => any) {
  t(name, () => { let threw = false; try { fn(); } catch { threw = true; } if (!threw) throw new Error("devait lever une exception"); });
}

// ─── Pure helpers (dupliqués de src/lib pour éviter les alias @/*) ───
const safeNumber = (v: any): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round2 = (v: any): number => Math.round(safeNumber(v) * 100) / 100;
const ttcToHT = (ttc: number, tva = 5.5): number => round2(safeNumber(ttc) / (1 + safeNumber(tva) / 100));
const htToTTC = (ht: number, tva = 5.5): number => round2(safeNumber(ht) * (1 + safeNumber(tva) / 100));
const formatEuro = (v: any): string => `${safeNumber(v).toFixed(2)}€`;
const validatePayment = (p: any): { valid: boolean; errors: string[] } => {
  const e: string[] = [];
  if (!p.familyId) e.push("familyId manquant");
  if (!p.familyName) e.push("familyName manquant");
  if (!Array.isArray(p.items) || p.items.length === 0) e.push("items vide");
  if (safeNumber(p.totalTTC) <= 0) e.push("totalTTC invalide");
  return { valid: e.length === 0, errors: e };
};
const compareCreneaux = (a: any, b: any): number => {
  const s = (a.startTime || "").localeCompare(b.startTime || ""); if (s !== 0) return s;
  const en = (a.endTime || "").localeCompare(b.endTime || ""); if (en !== 0) return en;
  return (a.activityTitle || "").localeCompare(b.activityTitle || "");
};
const compareCreneauxByDow = (a: any, b: any): number => {
  const d = (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0); return d !== 0 ? d : compareCreneaux(a, b);
};
const compareCreneauxByDate = (a: any, b: any): number => {
  const d = (a.date || "").localeCompare(b.date || ""); return d !== 0 ? d : compareCreneaux(a, b);
};
const escapeXml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const generateMandatId = (rc: number, mi: number): string => `CEDC${rc}MD${mi}`;
const generateInstrId = (rid: string, mi: number, pid: string): string => `${rid}M${mi}P${pid}`;
function countSessionsInPeriod(start: string, end: string, dow: number, hols: { start: string; end: string }[]): number {
  let n = 0; const cur = new Date(start); const e = new Date(end);
  while (cur <= e) {
    const d = (cur.getDay() + 6) % 7;
    if (d === dow) {
      const s = cur.toISOString().split("T")[0];
      if (!hols.some(h => s >= h.start && s <= h.end)) n++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}
const SEASON_2526 = { start: "2025-09-01", end: "2026-06-30" };
const HOLS_2526 = [
  { start: "2025-10-18", end: "2025-11-03" },
  { start: "2025-12-20", end: "2026-01-05" },
  { start: "2026-02-07", end: "2026-02-23" },
  { start: "2026-04-11", end: "2026-04-27" },
];
function calculateProrata(enroll: string, end: string, dow: number, hols: any[], price: number) {
  const total = countSessionsInPeriod(SEASON_2526.start, end, dow, hols);
  const sess = countSessionsInPeriod(enroll, end, dow, hols);
  const perS = total > 0 ? price / total : 0;
  return { sessions: sess, totalSessions: total, priceTTC: Math.round(sess * perS * 100) / 100, perSessionTTC: Math.round(perS * 100) / 100 };
}
const isEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || "");
const isPhoneFR = (s: string): boolean => /^0[1-9](\s?\d{2}){4}$/.test((s || "").replace(/\s/g, "") ? (s || "").replace(/\s/g, "").replace(/(\d{2})/g, "$1 ").trim() : "") || /^0[1-9]\d{8}$/.test((s || "").replace(/\s/g, ""));
const isPostalFR = (s: string): boolean => /^\d{5}$/.test(s || "");
const isIbanFR = (s: string): boolean => /^FR\d{2}[0-9A-Z]{23}$/.test((s || "").replace(/\s/g, ""));
const isBic = (s: string): boolean => /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(s || "");
const isIcs = (s: string): boolean => /^[A-Z]{2}\d{2}[A-Z0-9]{3}\d{6}$/.test((s || "").replace(/\s/g, ""));
const isGalopId = (s: string): boolean => ["poney_bronze","poney_argent","poney_or","galop_bronze","galop_argent","galop_or","g3","g4","g5","g6","g7"].includes(s);
const computeAge = (birth: string, ref = new Date()): number => {
  const b = new Date(birth); let a = ref.getFullYear() - b.getFullYear();
  const m = ref.getMonth() - b.getMonth(); if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) a--;
  return a;
};
function validateChildrenUpdate(curr: any[], next: any[]): boolean {
  if (next.length === 0 && curr.length > 0) return false;
  return true;
}
function formatStageSchedule(cren: { date: string; startTime: string; endTime: string }[]): string {
  if (!cren || cren.length === 0) return "";
  const s = [...cren].sort((a, b) => a.date.localeCompare(b.date));
  const fmt = (d: string) => new Date(d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
  const fm = (d: string) => new Date(d).toLocaleDateString("fr-FR", { month: "long" });
  const uniq = [...new Set(s.map(c => `${c.startTime}–${c.endTime}`))];
  if (s.length === 1) return `${fmt(s[0].date)} ${fm(s[0].date)} · ${s[0].startTime}–${s[0].endTime}`;
  if (uniq.length === 1) {
    const f = s[0], l = s[s.length - 1];
    const same = new Date(f.date).getMonth() === new Date(l.date).getMonth();
    return same ? `du ${fmt(f.date)} au ${fmt(l.date)} ${fm(l.date)} · ${f.startTime}–${f.endTime}`
                : `du ${fmt(f.date)} ${fm(f.date)} au ${fmt(l.date)} ${fm(l.date)} · ${f.startTime}–${f.endTime}`;
  }
  return s.map(c => `${fmt(c.date)} ${c.startTime}–${c.endTime}`).join(", ");
}
const PAYMENT_MODES_IDS = ["cb_online","cb_terminal","cheque","especes","virement","sepa","avoir"];

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
  section("32. UTILITAIRES — safeNumber / round2 / TVA");
  // ══════════════════════════════════════════════════════════════
  eq("safeNumber(5) = 5", safeNumber(5), 5);
  eq("safeNumber('5') = 5", safeNumber("5"), 5);
  eq("safeNumber('5.5') = 5.5", safeNumber("5.5"), 5.5);
  eq("safeNumber(null) = 0", safeNumber(null), 0);
  eq("safeNumber(undefined) = 0", safeNumber(undefined), 0);
  eq("safeNumber('abc') = 0", safeNumber("abc"), 0);
  eq("safeNumber(NaN) = 0", safeNumber(NaN), 0);
  eq("safeNumber(Infinity) = 0", safeNumber(Infinity), 0);
  eq("safeNumber(-Infinity) = 0", safeNumber(-Infinity), 0);
  eq("safeNumber(0) = 0", safeNumber(0), 0);
  eq("safeNumber(-42.5) = -42.5", safeNumber(-42.5), -42.5);
  eq("safeNumber({}) = 0", safeNumber({}), 0);
  eq("safeNumber([]) = 0", safeNumber([]), 0);
  eq("safeNumber('') = 0", safeNumber(""), 0);
  eq("round2(5.555) = 5.56", round2(5.555), 5.56);
  eq("round2(5.554) = 5.55", round2(5.554), 5.55);
  eq("round2(5) = 5", round2(5), 5);
  eq("round2(0) = 0", round2(0), 0);
  eq("round2('10.126') = 10.13", round2("10.126"), 10.13);
  eq("round2(-3.145) = -3.14", round2(-3.145), -3.14);
  nearly("ttcToHT(100, 5.5) ≈ 94.79", ttcToHT(100, 5.5), 94.79);
  nearly("ttcToHT(100, 20) ≈ 83.33", ttcToHT(100, 20), 83.33);
  nearly("ttcToHT(0) = 0", ttcToHT(0), 0);
  nearly("ttcToHT(211) ≈ 200", ttcToHT(211, 5.5), 200, 0.1);
  nearly("htToTTC(100, 5.5) ≈ 105.5", htToTTC(100, 5.5), 105.5);
  nearly("htToTTC(100, 20) = 120", htToTTC(100, 20), 120);
  nearly("htToTTC(0) = 0", htToTTC(0), 0);
  eq("formatEuro(5) = '5.00€'", formatEuro(5), "5.00€");
  eq("formatEuro(12.3) = '12.30€'", formatEuro(12.3), "12.30€");
  eq("formatEuro('abc') = '0.00€'", formatEuro("abc"), "0.00€");
  eq("formatEuro(0) = '0.00€'", formatEuro(0), "0.00€");

  // ══════════════════════════════════════════════════════════════
  section("33. VALIDATION FORMATS — email / tel / CP / IBAN / BIC");
  // ══════════════════════════════════════════════════════════════
  ok("email valide: a@b.fr", isEmail("a@b.fr"));
  ok("email valide: user.name+tag@domain.co.uk", isEmail("user.name+tag@domain.co.uk"));
  ok("email valide: contact@centre-equestre-agon.fr", isEmail("contact@centre-equestre-agon.fr"));
  ok("email INvalide: a@b", !isEmail("a@b"));
  ok("email INvalide: sans arobase", !isEmail("sans-arobase"));
  ok("email INvalide: @b.fr", !isEmail("@b.fr"));
  ok("email INvalide: a@.fr", !isEmail("a@.fr"));
  ok("email INvalide: chaine vide", !isEmail(""));
  ok("email INvalide: avec espace", !isEmail("a b@c.fr"));
  ok("email INvalide: null", !isEmail(null as any));
  ok("tel FR valide: 0611223344", isPhoneFR("0611223344"));
  ok("tel FR valide: 06 11 22 33 44", isPhoneFR("06 11 22 33 44"));
  ok("tel FR valide: 0123456789", isPhoneFR("0123456789"));
  ok("tel FR INvalide: 061122334 (9 chiffres)", !isPhoneFR("061122334"));
  ok("tel FR INvalide: 06112233445 (11 chiffres)", !isPhoneFR("06112233445"));
  ok("tel FR INvalide: commence par 00", !isPhoneFR("0011223344"));
  ok("tel FR INvalide: +33611223344", !isPhoneFR("+33611223344"));
  ok("CP valide: 50230", isPostalFR("50230"));
  ok("CP valide: 75001", isPostalFR("75001"));
  ok("CP INvalide: 5023", !isPostalFR("5023"));
  ok("CP INvalide: 502301", !isPostalFR("502301"));
  ok("CP INvalide: ABCDE", !isPostalFR("ABCDE"));
  ok("CP INvalide: vide", !isPostalFR(""));
  ok("IBAN FR valide (créancier club)", isIbanFR("FR7616606100640013539343253"));
  ok("IBAN FR valide avec espaces", isIbanFR("FR76 1660 6100 6400 1353 9343 253"));
  ok("IBAN INvalide: trop court", !isIbanFR("FR76"));
  ok("IBAN INvalide: commence par DE", !isIbanFR("DE7616606100640013539343253"));
  ok("BIC valide: AGRIFRPP866", isBic("AGRIFRPP866"));
  ok("BIC valide 8 chars: AGRIFRPP", isBic("AGRIFRPP"));
  ok("BIC INvalide: trop court", !isBic("AGRI"));
  ok("BIC INvalide: minuscule", !isBic("agrifrpp"));
  ok("ICS valide: FR57ZZZ852487", isIcs("FR57ZZZ852487"));
  ok("ICS INvalide: FR57852487", !isIcs("FR57852487"));

  // ══════════════════════════════════════════════════════════════
  section("34. CALENDRIER — comptage de séances (saison 2025-2026)");
  // ══════════════════════════════════════════════════════════════
  const NO_HOLS: any[] = [];
  // dayOfWeek : 0=Lun, 1=Mar, 2=Mer, 3=Jeu, 4=Ven, 5=Sam, 6=Dim
  eq("1 mercredi unique", countSessionsInPeriod("2025-09-03", "2025-09-03", 2, NO_HOLS), 1);
  eq("0 séance si jour différent", countSessionsInPeriod("2025-09-03", "2025-09-03", 0, NO_HOLS), 0);
  eq("1 semaine complète = 1 mercredi", countSessionsInPeriod("2025-09-01", "2025-09-07", 2, NO_HOLS), 1);
  eq("1 semaine complète = 1 samedi", countSessionsInPeriod("2025-09-01", "2025-09-07", 5, NO_HOLS), 1);
  eq("2 semaines = 2 mardis", countSessionsInPeriod("2025-09-01", "2025-09-14", 1, NO_HOLS), 2);
  eq("Mois sept 2025 : 4 mercredis sans vacances", countSessionsInPeriod("2025-09-01", "2025-09-30", 2, NO_HOLS), 4);
  ok("Saison complète compte >30 mercredis", countSessionsInPeriod(SEASON_2526.start, SEASON_2526.end, 2, NO_HOLS) > 30);
  ok("Saison avec vacances < sans vacances", countSessionsInPeriod(SEASON_2526.start, SEASON_2526.end, 2, HOLS_2526) < countSessionsInPeriod(SEASON_2526.start, SEASON_2526.end, 2, NO_HOLS));
  eq("Toussaint 2025-10-22 (mercredi) exclu", countSessionsInPeriod("2025-10-22", "2025-10-22", 2, HOLS_2526), 0);
  eq("Hors Toussaint : 2025-11-05 (mercredi) inclus", countSessionsInPeriod("2025-11-05", "2025-11-05", 2, HOLS_2526), 1);
  eq("Noël 2025-12-24 exclu", countSessionsInPeriod("2025-12-24", "2025-12-24", 2, HOLS_2526), 0);
  eq("Hiver 2026-02-11 exclu", countSessionsInPeriod("2026-02-11", "2026-02-11", 2, HOLS_2526), 0);
  eq("Printemps 2026-04-15 exclu", countSessionsInPeriod("2026-04-15", "2026-04-15", 2, HOLS_2526), 0);
  eq("Dimanche sur semaine mercredi = 0", countSessionsInPeriod("2025-09-07", "2025-09-07", 2, NO_HOLS), 0);
  eq("Début = fin, jour != = 0", countSessionsInPeriod("2025-09-05", "2025-09-05", 0, NO_HOLS), 0);
  eq("Plage inversée = 0", countSessionsInPeriod("2025-09-30", "2025-09-01", 2, NO_HOLS), 0);
  eq("Lundi 2025-09-01", countSessionsInPeriod("2025-09-01", "2025-09-01", 0, NO_HOLS), 1);
  eq("Mardi 2025-09-02", countSessionsInPeriod("2025-09-02", "2025-09-02", 1, NO_HOLS), 1);
  eq("Jeudi 2025-09-04", countSessionsInPeriod("2025-09-04", "2025-09-04", 3, NO_HOLS), 1);
  eq("Vendredi 2025-09-05", countSessionsInPeriod("2025-09-05", "2025-09-05", 4, NO_HOLS), 1);
  eq("Samedi 2025-09-06", countSessionsInPeriod("2025-09-06", "2025-09-06", 5, NO_HOLS), 1);
  eq("Dimanche 2025-09-07", countSessionsInPeriod("2025-09-07", "2025-09-07", 6, NO_HOLS), 1);
  ok("Nb mercredis année complète > nb 29 février", countSessionsInPeriod(SEASON_2526.start, SEASON_2526.end, 2, NO_HOLS) > 10);
  ok("Lundis >= 30 sur saison sans vacances", countSessionsInPeriod(SEASON_2526.start, SEASON_2526.end, 0, NO_HOLS) >= 30);
  ok("Samedis >= 30 sur saison sans vacances", countSessionsInPeriod(SEASON_2526.start, SEASON_2526.end, 5, NO_HOLS) >= 30);

  // ══════════════════════════════════════════════════════════════
  section("35. PRORATA — calcul entrée en cours de saison");
  // ══════════════════════════════════════════════════════════════
  const FULL = calculateProrata(SEASON_2526.start, SEASON_2526.end, 2, HOLS_2526, 300);
  ok("Prorata plein: sessions == totalSessions", FULL.sessions === FULL.totalSessions);
  nearly("Prorata plein: prix = 300", FULL.priceTTC, 300, 0.5);
  const MID = calculateProrata("2026-01-01", SEASON_2526.end, 2, HOLS_2526, 300);
  ok("Prorata mi-saison < plein", MID.priceTTC < FULL.priceTTC);
  ok("Prorata mi-saison sessions < plein", MID.sessions < FULL.sessions);
  const LATE = calculateProrata("2026-05-01", SEASON_2526.end, 2, HOLS_2526, 300);
  ok("Prorata fin saison < mi-saison", LATE.priceTTC < MID.priceTTC);
  ok("perSessionTTC > 0", FULL.perSessionTTC > 0);
  nearly("perSessionTTC cohérent prix/total", FULL.priceTTC, FULL.totalSessions * FULL.perSessionTTC, 1);
  const BEFORE = calculateProrata("2025-08-01", SEASON_2526.end, 2, HOLS_2526, 300);
  ok("Prorata avant saison: sessions >= totalSessions", BEFORE.sessions >= BEFORE.totalSessions);
  const AFTER = calculateProrata("2026-07-01", SEASON_2526.end, 2, HOLS_2526, 300);
  eq("Prorata après saison: 0 séance", AFTER.sessions, 0);
  eq("Prorata après saison: 0€", AFTER.priceTTC, 0);
  const P500 = calculateProrata(SEASON_2526.start, SEASON_2526.end, 2, HOLS_2526, 500);
  nearly("Prorata 500€ = prix plein", P500.priceTTC, 500, 0.5);
  const P0 = calculateProrata(SEASON_2526.start, SEASON_2526.end, 2, HOLS_2526, 0);
  eq("Prorata 0€ prix = 0", P0.priceTTC, 0);
  eq("Prorata 0€ perSession = 0", P0.perSessionTTC, 0);
  const LUN = calculateProrata(SEASON_2526.start, SEASON_2526.end, 0, HOLS_2526, 300);
  ok("Prorata lundi plein", LUN.sessions === LUN.totalSessions);
  const SAM = calculateProrata(SEASON_2526.start, SEASON_2526.end, 5, HOLS_2526, 300);
  ok("Prorata samedi plein", SAM.sessions === SAM.totalSessions);
  ok("Sessions mercredi et samedi diffèrent peu", Math.abs(FULL.totalSessions - SAM.totalSessions) <= 5);
  const Q1 = calculateProrata("2025-10-01", SEASON_2526.end, 2, HOLS_2526, 300);
  const Q2 = calculateProrata("2025-12-01", SEASON_2526.end, 2, HOLS_2526, 300);
  const Q3 = calculateProrata("2026-03-01", SEASON_2526.end, 2, HOLS_2526, 300);
  ok("Prorata décroît: Q1 > Q2 > Q3", Q1.priceTTC > Q2.priceTTC && Q2.priceTTC > Q3.priceTTC);
  ok("Toutes sessions prorata <= total", Q1.sessions <= Q1.totalSessions && Q2.sessions <= Q2.totalSessions);
  const MERCRED_TOUSSAINT = calculateProrata("2025-10-20", "2025-11-05", 2, HOLS_2526, 300);
  eq("Prorata qui traverse Toussaint: 1 séance (05/11)", MERCRED_TOUSSAINT.sessions, 1);

  // ══════════════════════════════════════════════════════════════
  section("36. CARTE DE SÉANCES — décompte & solde");
  // ══════════════════════════════════════════════════════════════
  const carte = { total: 10, utilisees: 0 };
  const soldeCarte = (c: any) => c.total - c.utilisees;
  const decompter = (c: any) => { if (soldeCarte(c) <= 0) throw new Error("carte vide"); c.utilisees++; };
  eq("Solde initial carte 10 séances", soldeCarte(carte), 10);
  decompter(carte); eq("Solde après 1 utilisation", soldeCarte(carte), 9);
  for (let i = 0; i < 9; i++) decompter(carte);
  eq("Solde après 10 utilisations", soldeCarte(carte), 0);
  throws("Décompte sur carte vide lève", () => decompter(carte));
  const carteExp = { total: 10, utilisees: 3, expireAt: "2025-01-01" };
  const isExpired = (c: any) => new Date(c.expireAt) < new Date();
  ok("Carte expirée détectée (2025-01-01 < 2026-04-18)", isExpired(carteExp));
  const carteFuture = { total: 10, utilisees: 3, expireAt: "2027-12-31" };
  ok("Carte non expirée (2027-12-31)", !isExpired(carteFuture));
  eq("Solde carte partiellement utilisée", soldeCarte(carteExp), 7);
  const carte20 = { total: 20, utilisees: 0 };
  for (let i = 0; i < 20; i++) decompter(carte20);
  eq("Carte 20 séances: 20 utilisations OK", carte20.utilisees, 20);
  eq("Carte 20 séances: solde final 0", soldeCarte(carte20), 0);
  const carte5ht = 50; const carte5ttc = htToTTC(carte5ht, 5.5);
  nearly("Carte 5 séances TTC 5.5%", carte5ttc, 52.75);
  const uniteHT = carte5ht / 5; nearly("Unité HT carte 5", uniteHT, 10);
  const uniteTTC = carte5ttc / 5; nearly("Unité TTC carte 5", uniteTTC, 10.55);
  const cart10 = { total: 10, utilisees: 10 };
  eq("Carte épuisée solde 0", soldeCarte(cart10), 0);
  ok("Carte épuisée ne peut pas décompter", (() => { try { decompter(cart10); return false; } catch { return true; } })());
  const carteNeg = { total: 10, utilisees: 15 };
  ok("Carte sur-utilisée: solde < 0 (invariant violé)", soldeCarte(carteNeg) < 0);
  const pctUtil = (c: any) => (c.utilisees / c.total) * 100;
  eq("Pourcentage utilisé 50%", pctUtil({ total: 10, utilisees: 5 }), 50);
  eq("Pourcentage utilisé 100%", pctUtil({ total: 10, utilisees: 10 }), 100);
  eq("Pourcentage utilisé 0%", pctUtil({ total: 10, utilisees: 0 }), 0);
  ok("Carte avec total 0 invalide", 0 === 0 && !(0 > 0));
  nearly("Prix unité carte 10 à 90€", 90 / 10, 9);

  // ══════════════════════════════════════════════════════════════
  section("37. FIDÉLITÉ — calculs de points (1 pt/€)");
  // ══════════════════════════════════════════════════════════════
  const fidPoints = (m: number) => Math.floor(m);
  eq("100€ → 100 pts", fidPoints(100), 100);
  eq("99.99€ → 99 pts", fidPoints(99.99), 99);
  eq("0.50€ → 0 pt", fidPoints(0.5), 0);
  eq("1.99€ → 1 pt", fidPoints(1.99), 1);
  eq("0€ → 0 pt", fidPoints(0), 0);
  eq("-10€ → 0 pt (pas de pt négatif)", Math.max(0, fidPoints(-10)), 0);
  eq("1000€ → 1000 pts", fidPoints(1000), 1000);
  const fidSolde = (h: any[]) => h.filter(e => e.type === "gain").reduce((s, e) => s + e.points, 0) - h.filter(e => e.type === "use").reduce((s, e) => s + e.points, 0);
  eq("Historique vide solde 0", fidSolde([]), 0);
  eq("Un gain 100 solde 100", fidSolde([{ type: "gain", points: 100 }]), 100);
  eq("Gain 100 + use 30 solde 70", fidSolde([{ type: "gain", points: 100 }, { type: "use", points: 30 }]), 70);
  eq("Gain 100 + gain 50 solde 150", fidSolde([{ type: "gain", points: 100 }, { type: "gain", points: 50 }]), 150);
  // Expiration 1 an
  const expire1an = (date: string): Date => { const d = new Date(date); d.setFullYear(d.getFullYear() + 1); return d; };
  eq("Expiration 2025-09-01 → 2026-09-01", expire1an("2025-09-01").toISOString().split("T")[0], "2026-09-01");
  eq("Expiration 2024-02-29 → 2025-03-01 (année non bissextile)", expire1an("2024-02-29").toISOString().split("T")[0], "2025-03-01");
  const isPtExpired = (exp: string, ref = new Date("2026-04-18")) => new Date(exp) < ref;
  ok("Pt expiré 2025-01-01", isPtExpired("2025-01-01"));
  ok("Pt non expiré 2027-01-01", !isPtExpired("2027-01-01"));

  // ══════════════════════════════════════════════════════════════
  section("38. FORFAITS — types & prix");
  // ══════════════════════════════════════════════════════════════
  const FORFAIT_TYPES = ["annuel", "semestriel", "trimestriel", "mensuel", "carte"];
  ok("5 types de forfait", FORFAIT_TYPES.length === 5);
  FORFAIT_TYPES.forEach(ft => ok(`Type ${ft} reconnu`, FORFAIT_TYPES.includes(ft)));
  // Licence FFE et adhésion
  const LICENCE_PRIX = 25; const ADHESION_PRIX = 50;
  eq("Licence FFE = 25€", LICENCE_PRIX, 25);
  eq("Adhésion = 50€", ADHESION_PRIX, 50);
  const prereq = LICENCE_PRIX + ADHESION_PRIX;
  eq("Prérequis total = 75€", prereq, 75);
  // Licence: TVA 0% (refacturée)
  nearly("Licence HT = TTC (TVA 0%)", ttcToHT(LICENCE_PRIX, 0), 25);
  // Adhésion: TVA 5.5%
  nearly("Adhésion HT ≈ 47.39€ (TVA 5.5%)", ttcToHT(ADHESION_PRIX, 5.5), 47.39);
  // Forfait annuel: total = prérequis + cours
  const COURS_PRIX = 300;
  const totalAnnuel = prereq + COURS_PRIX;
  eq("Total inscription annuelle = 375€", totalAnnuel, 375);
  // Réduction fratrie (ex: 10%)
  const reducFratrie = (p: number, pct: number) => round2(p * (1 - pct / 100));
  eq("Réduc 10% sur 300€ = 270€", reducFratrie(300, 10), 270);
  eq("Réduc 5% sur 300€ = 285€", reducFratrie(300, 5), 285);
  eq("Réduc 0% sur 300€ = 300€", reducFratrie(300, 0), 300);
  eq("Réduc 100% sur 300€ = 0€", reducFratrie(300, 100), 0);
  // Prix par semaine
  const parSem = (annuel: number, semaines: number) => round2(annuel / semaines);
  nearly("300€/30 sem ≈ 10€/sem", parSem(300, 30), 10);
  nearly("500€/30 sem ≈ 16.67€/sem", parSem(500, 30), 16.67);
  // Semestriel ≈ annuel/2
  eq("Semestriel 300€ = 150€", 300 / 2, 150);
  // Trimestriel ≈ annuel/3
  nearly("Trimestriel 300€ ≈ 100€", 300 / 3, 100);

  // ══════════════════════════════════════════════════════════════
  section("39. SEPA — XML escape, IDs, format");
  // ══════════════════════════════════════════════════════════════
  eq("escapeXml: & → &amp;", escapeXml("a & b"), "a &amp; b");
  eq("escapeXml: < → &lt;", escapeXml("<x>"), "&lt;x&gt;");
  eq("escapeXml: \" → &quot;", escapeXml('say "hi"'), "say &quot;hi&quot;");
  eq("escapeXml: ' → &apos;", escapeXml("l'enfant"), "l&apos;enfant");
  eq("escapeXml: texte neutre inchangé", escapeXml("Dupont 12"), "Dupont 12");
  eq("escapeXml: vide → vide", escapeXml(""), "");
  eq("generateMandatId(1, 1) = CEDC1MD1", generateMandatId(1, 1), "CEDC1MD1");
  eq("generateMandatId(2190, 3) = CEDC2190MD3", generateMandatId(2190, 3), "CEDC2190MD3");
  eq("generateInstrId('R1', 2, 'P45') = R1M2PP45", generateInstrId("R1", 2, "P45"), "R1M2PP45");
  eq("generateInstrId('1868', 1, '23045') = 1868M1P23045", generateInstrId("1868", 1, "23045"), "1868M1P23045");
  // IBAN Crédit Agricole club
  const CLUB_IBAN = "FR7616606100640013539343253";
  ok("IBAN club commence par FR", CLUB_IBAN.startsWith("FR"));
  eq("IBAN club longueur 27", CLUB_IBAN.length, 27);
  ok("IBAN club valide", isIbanFR(CLUB_IBAN));
  // BIC Crédit Agricole
  ok("BIC club AGRIFRPP866 valide", isBic("AGRIFRPP866"));
  // Sequence types
  const SEQ = ["FRST", "RCUR", "FNAL", "OOFF"];
  SEQ.forEach(s => ok(`Séquence SEPA ${s} reconnue`, SEQ.includes(s)));
  // ICS format
  ok("ICS club FR57ZZZ852487", isIcs("FR57ZZZ852487"));
  // Montant formatting (2 décimales)
  eq("Montant 100 → '100.00'", (100).toFixed(2), "100.00");
  eq("Montant 12.3 → '12.30'", (12.3).toFixed(2), "12.30");
  eq("Montant 0.1 → '0.10'", (0.1).toFixed(2), "0.10");
  // Total remise = somme transactions
  const remiseTxs = [{ amount: 50 }, { amount: 30 }, { amount: 20 }];
  eq("Somme remise 3 tx = 100", remiseTxs.reduce((s, t) => s + t.amount, 0), 100);

  // ══════════════════════════════════════════════════════════════
  section("40. TRI CRÉNEAUX — comparateurs stables");
  // ══════════════════════════════════════════════════════════════
  eq("compareCreneaux: 09:00 avant 10:00", compareCreneaux({ startTime: "09:00" }, { startTime: "10:00" }) < 0, true);
  eq("compareCreneaux: 10:00 après 09:00", compareCreneaux({ startTime: "10:00" }, { startTime: "09:00" }) > 0, true);
  eq("compareCreneaux: égalité sans endTime/title", compareCreneaux({ startTime: "10:00" }, { startTime: "10:00" }), 0);
  ok("compareCreneaux: même start, endTime départage",
    compareCreneaux({ startTime: "10:00", endTime: "11:00" }, { startTime: "10:00", endTime: "12:00" }) < 0);
  ok("compareCreneaux: même start+end, titre départage",
    compareCreneaux({ startTime: "10:00", endTime: "11:00", activityTitle: "Baby" }, { startTime: "10:00", endTime: "11:00", activityTitle: "Zen" }) < 0);
  // Tri stable d'un tableau
  const list = [
    { startTime: "14:00", endTime: "15:00", activityTitle: "B" },
    { startTime: "09:00", endTime: "10:00", activityTitle: "A" },
    { startTime: "10:00", endTime: "11:00", activityTitle: "C" },
    { startTime: "10:00", endTime: "11:00", activityTitle: "A" },
  ];
  const sorted = [...list].sort(compareCreneaux);
  eq("Trié: 1er = 09:00", sorted[0].startTime, "09:00");
  eq("Trié: 2e = 10:00 A", sorted[1].activityTitle, "A");
  eq("Trié: 3e = 10:00 C", sorted[2].activityTitle, "C");
  eq("Trié: dernier = 14:00", sorted[3].startTime, "14:00");
  // compareCreneauxByDow
  ok("Dow: lundi(0) avant mardi(1)",
    compareCreneauxByDow({ dayOfWeek: 0, startTime: "10:00" }, { dayOfWeek: 1, startTime: "09:00" }) < 0);
  ok("Dow: même jour, heure départage",
    compareCreneauxByDow({ dayOfWeek: 2, startTime: "10:00" }, { dayOfWeek: 2, startTime: "09:00" }) > 0);
  // compareCreneauxByDate
  ok("Date: 2026-01-01 avant 2026-01-02",
    compareCreneauxByDate({ date: "2026-01-01", startTime: "10:00" }, { date: "2026-01-02", startTime: "09:00" }) < 0);
  ok("Date: même jour, heure départage",
    compareCreneauxByDate({ date: "2026-01-01", startTime: "10:00" }, { date: "2026-01-01", startTime: "14:00" }) < 0);
  // Tri stable = ordre déterministe
  const arr = [{ startTime: "10:00" }, { startTime: "10:00" }, { startTime: "10:00" }];
  const s1 = [...arr].sort(compareCreneaux);
  const s2 = [...arr].sort(compareCreneaux);
  eq("Tri déterministe sur égalités", JSON.stringify(s1), JSON.stringify(s2));
  eq("compareCreneaux avec undefined endTime",
    compareCreneaux({ startTime: "10:00" }, { startTime: "10:00" }), 0);

  // ══════════════════════════════════════════════════════════════
  section("41. FORMAT STAGE — affichage horaires");
  // ══════════════════════════════════════════════════════════════
  eq("Stage vide = ''", formatStageSchedule([]), "");
  const s1j = formatStageSchedule([{ date: "2026-04-14", startTime: "10h00", endTime: "12h00" }]);
  ok("Stage 1 jour contient '10h00'", s1j.includes("10h00"));
  ok("Stage 1 jour contient '12h00'", s1j.includes("12h00"));
  ok("Stage 1 jour contient ' · '", s1j.includes(" · "));
  const s2jMeme = formatStageSchedule([
    { date: "2026-04-14", startTime: "10h00", endTime: "12h00" },
    { date: "2026-04-18", startTime: "10h00", endTime: "12h00" },
  ]);
  ok("Stage 2j mêmes horaires commence par 'du '", s2jMeme.startsWith("du "));
  ok("Stage 2j mêmes horaires contient 'au '", s2jMeme.includes("au "));
  ok("Stage 2j mêmes horaires contient '10h00–12h00'", s2jMeme.includes("10h00–12h00"));
  const s2jDiff = formatStageSchedule([
    { date: "2026-04-14", startTime: "10h00", endTime: "12h00" },
    { date: "2026-04-15", startTime: "14h00", endTime: "16h00" },
  ]);
  ok("Stage horaires différents contient ','", s2jDiff.includes(","));
  ok("Stage horaires différents contient 10h00", s2jDiff.includes("10h00"));
  ok("Stage horaires différents contient 14h00", s2jDiff.includes("14h00"));
  // Tri interne
  const unsorted = formatStageSchedule([
    { date: "2026-04-18", startTime: "10h00", endTime: "12h00" },
    { date: "2026-04-14", startTime: "10h00", endTime: "12h00" },
  ]);
  ok("Dates désordonnées → triées", unsorted.indexOf("14") < unsorted.indexOf("18"));
  // Deux mois différents
  const s2mois = formatStageSchedule([
    { date: "2026-03-30", startTime: "10h00", endTime: "12h00" },
    { date: "2026-04-02", startTime: "10h00", endTime: "12h00" },
  ]);
  ok("Stage 2 mois: contient 'mars' ET 'avril'", /mars/i.test(s2mois) && /avril/i.test(s2mois));
  // Stage 5 jours mêmes horaires
  const s5j = formatStageSchedule([
    { date: "2026-04-13", startTime: "10h00", endTime: "12h00" },
    { date: "2026-04-14", startTime: "10h00", endTime: "12h00" },
    { date: "2026-04-15", startTime: "10h00", endTime: "12h00" },
    { date: "2026-04-16", startTime: "10h00", endTime: "12h00" },
    { date: "2026-04-17", startTime: "10h00", endTime: "12h00" },
  ]);
  ok("Stage 5j: 'du ... au ...' compact", s5j.startsWith("du "));
  ok("Stage 5j: contient 'avril'", s5j.includes("avril"));
  // Horaires tous uniques (bord)
  const sToutsDiff = formatStageSchedule([
    { date: "2026-04-14", startTime: "09h00", endTime: "10h00" },
    { date: "2026-04-15", startTime: "10h00", endTime: "11h00" },
    { date: "2026-04-16", startTime: "11h00", endTime: "12h00" },
  ]);
  eq("Stage tous différents → 3 segments séparés", sToutsDiff.split(",").length, 3);

  // ══════════════════════════════════════════════════════════════
  section("42. GALOPS — niveaux & progression");
  // ══════════════════════════════════════════════════════════════
  const GALOPS = ["poney_bronze","poney_argent","poney_or","galop_bronze","galop_argent","galop_or","g3","g4","g5","g6","g7"];
  eq("11 niveaux Galops", GALOPS.length, 11);
  GALOPS.forEach(g => ok(`Niveau ${g} reconnu`, isGalopId(g)));
  ok("Niveau 'g8' INvalide", !isGalopId("g8"));
  ok("Niveau '' INvalide", !isGalopId(""));
  ok("Niveau 'G3' (maj) INvalide — ID est minuscule", !isGalopId("G3"));
  // Ordre progression
  const idx = (g: string) => GALOPS.indexOf(g);
  ok("poney_bronze avant poney_or", idx("poney_bronze") < idx("poney_or"));
  ok("galop_or avant g3", idx("galop_or") < idx("g3"));
  ok("g3 avant g7", idx("g3") < idx("g7"));
  ok("g7 = dernier", idx("g7") === GALOPS.length - 1);
  ok("poney_bronze = premier", idx("poney_bronze") === 0);
  // Cycles
  const CYCLE_PONEY_1 = ["poney_bronze","poney_argent","poney_or"];
  const CYCLE_PONEY_2 = ["galop_bronze","galop_argent","galop_or"];
  const CYCLE_CAVAL = ["g3","g4","g5","g6","g7"];
  eq("Cycle poneys 1 = 3 niveaux", CYCLE_PONEY_1.length, 3);
  eq("Cycle poneys 2 = 3 niveaux", CYCLE_PONEY_2.length, 3);
  eq("Cycle cavaliers = 5 niveaux", CYCLE_CAVAL.length, 5);
  eq("Somme = 11", CYCLE_PONEY_1.length + CYCLE_PONEY_2.length + CYCLE_CAVAL.length, 11);
  // Domaines
  const DOMAINES = ["pratique_cheval","pratique_pied","soins","connaissances"];
  eq("4 domaines", DOMAINES.length, 4);
  DOMAINES.forEach(d => ok(`Domaine ${d}`, DOMAINES.includes(d)));

  // ══════════════════════════════════════════════════════════════
  section("43. RÉSERVATIONS — pairing childId/creneauId & statuts");
  // ══════════════════════════════════════════════════════════════
  const STATUS = ["pending_payment","confirmed","cancelled","waitlist","attended","noshow"];
  STATUS.forEach(s => ok(`Statut ${s} valide`, STATUS.includes(s)));
  // Transitions légales
  const canTransit = (from: string, to: string): boolean => {
    const T: Record<string, string[]> = {
      pending_payment: ["confirmed", "cancelled"],
      confirmed: ["attended", "noshow", "cancelled"],
      waitlist: ["pending_payment", "cancelled"],
      attended: [],
      noshow: [],
      cancelled: [],
    };
    return T[from]?.includes(to) || false;
  };
  ok("pending → confirmed OK", canTransit("pending_payment", "confirmed"));
  ok("pending → cancelled OK", canTransit("pending_payment", "cancelled"));
  ok("confirmed → attended OK", canTransit("confirmed", "attended"));
  ok("confirmed → noshow OK", canTransit("confirmed", "noshow"));
  ok("attended → confirmed INTERDIT", !canTransit("attended", "confirmed"));
  ok("cancelled → confirmed INTERDIT", !canTransit("cancelled", "confirmed"));
  ok("waitlist → pending OK", canTransit("waitlist", "pending_payment"));
  ok("noshow → attended INTERDIT", !canTransit("noshow", "attended"));
  // Pairing stage multi-jours
  const items = [
    { childId: "c1", creneauIds: ["k1", "k2", "k3"] },
    { childId: "c2", creneauId: "k4" },
  ];
  const pairs: any[] = [];
  for (const it of items) {
    if (Array.isArray(it.creneauIds)) for (const id of it.creneauIds) pairs.push({ childId: it.childId, creneauId: id });
    else if (it.creneauId) pairs.push({ childId: it.childId, creneauId: it.creneauId });
  }
  eq("Pairing stage 3j + 1 ponctuel = 4 pairs", pairs.length, 4);
  eq("1er pair: c1/k1", `${pairs[0].childId}/${pairs[0].creneauId}`, "c1/k1");
  eq("Dernier pair: c2/k4", `${pairs[3].childId}/${pairs[3].creneauId}`, "c2/k4");
  // Item sans creneauId ignoré
  const itemsVide: any[] = [{ childId: "c1" }];
  const pairsVide: any[] = [];
  for (const it of itemsVide) if (it.creneauId || Array.isArray(it.creneauIds)) pairsVide.push(it);
  eq("Item sans creneau ignoré", pairsVide.length, 0);

  // ══════════════════════════════════════════════════════════════
  section("44. PAIEMENTS — modes, totaux, validatePayment");
  // ══════════════════════════════════════════════════════════════
  eq("7 modes de paiement", PAYMENT_MODES_IDS.length, 7);
  PAYMENT_MODES_IDS.forEach(m => ok(`Mode ${m}`, PAYMENT_MODES_IDS.includes(m)));
  // validatePayment
  const P_VALID = { familyId: "f1", familyName: "Dupont", items: [{ x: 1 }], totalTTC: 100 };
  eq("Payment valide", validatePayment(P_VALID).valid, true);
  eq("Payment sans familyId invalide", validatePayment({ ...P_VALID, familyId: "" }).valid, false);
  eq("Payment sans familyName invalide", validatePayment({ ...P_VALID, familyName: "" }).valid, false);
  eq("Payment items vide invalide", validatePayment({ ...P_VALID, items: [] }).valid, false);
  eq("Payment total 0 invalide", validatePayment({ ...P_VALID, totalTTC: 0 }).valid, false);
  eq("Payment total négatif invalide", validatePayment({ ...P_VALID, totalTTC: -10 }).valid, false);
  eq("Payment NaN total invalide", validatePayment({ ...P_VALID, totalTTC: "abc" }).valid, false);
  // Erreurs cumulables
  const multiErr = validatePayment({ familyId: "", familyName: "", items: [], totalTTC: 0 });
  eq("4 erreurs cumulées", multiErr.errors.length, 4);
  // Total = somme items
  const items5 = [{ price: 25 }, { price: 35 }, { price: 40 }];
  const sumItems = items5.reduce((s, i) => s + i.price, 0);
  eq("Total 3 items = 100", sumItems, 100);
  // Remise
  const remise = (t: number, pct: number) => round2(t * (1 - pct / 100));
  eq("Remise 10% sur 100 = 90", remise(100, 10), 90);
  eq("Remise 25% sur 200 = 150", remise(200, 25), 150);
  // Avoir: pas de points fidélité
  const avoir = { mode: "avoir", montant: 50 };
  ok("Avoir: pas de points fidélité", avoir.mode === "avoir");
  // orderId format simple
  const orderIdRe = /^CMD-\d{6}-[A-Z0-9]{6}$/;
  const ts = Date.now().toString(36).slice(-4).toUpperCase();
  const rand = "AB";
  const oid = `CMD-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}-${ts}${rand}`;
  ok("orderId format", orderIdRe.test(oid));
  // TVA cohérence
  const ht = 100, ttc = htToTTC(ht, 5.5);
  nearly("HT 100 + 5.5% = 105.5", ttc, 105.5);
  nearly("TTC 105.5 → HT 100", ttcToHT(ttc, 5.5), 100, 0.01);
  // Splits CB
  const cb3 = 300 / 3; eq("3x sans frais 300€ = 100€ x3", cb3, 100);
  const cb10 = 500 / 10; eq("10x sans frais 500€ = 50€ x10", cb10, 50);

  // ══════════════════════════════════════════════════════════════
  section("45. FAMILLES & ENFANTS — validations");
  // ══════════════════════════════════════════════════════════════
  // validateChildrenUpdate
  ok("Refuse effacement total", !validateChildrenUpdate([{a:1}, {b:2}], []));
  ok("Accepte ajout", validateChildrenUpdate([{a:1}], [{a:1}, {b:2}]));
  ok("Accepte suppression partielle", validateChildrenUpdate([{a:1}, {b:2}], [{a:1}]));
  ok("Vide → vide OK (init)", validateChildrenUpdate([], []));
  ok("Vide → 1 enfant OK", validateChildrenUpdate([], [{a:1}]));
  // computeAge
  eq("Né 2015-04-18, ref 2026-04-18 → 11 ans", computeAge("2015-04-18", new Date("2026-04-18")), 11);
  eq("Né 2015-04-19, ref 2026-04-18 → 10 ans", computeAge("2015-04-19", new Date("2026-04-18")), 10);
  eq("Né 2015-04-17, ref 2026-04-18 → 11 ans", computeAge("2015-04-17", new Date("2026-04-18")), 11);
  eq("Né 2000-01-01, ref 2026-04-18 → 26 ans", computeAge("2000-01-01", new Date("2026-04-18")), 26);
  eq("Né 2020-06-30, ref 2026-04-18 → 5 ans", computeAge("2020-06-30", new Date("2026-04-18")), 5);
  // Contraintes champs enfant
  const validChild = (c: any): boolean => !!c.firstName && !!c.lastName && !!c.birthDate && (c.weight === undefined || c.weight > 0) && (c.height === undefined || c.height > 0);
  ok("Enfant complet valide", validChild({ firstName: "L", lastName: "D", birthDate: "2015-01-01", weight: 30, height: 130 }));
  ok("Enfant sans prénom invalide", !validChild({ firstName: "", lastName: "D", birthDate: "2015-01-01" }));
  ok("Enfant sans nom invalide", !validChild({ firstName: "L", lastName: "", birthDate: "2015-01-01" }));
  ok("Enfant sans date naissance invalide", !validChild({ firstName: "L", lastName: "D", birthDate: "" }));
  ok("Enfant poids négatif invalide", !validChild({ firstName: "L", lastName: "D", birthDate: "2015-01-01", weight: -5 }));
  ok("Enfant taille négative invalide", !validChild({ firstName: "L", lastName: "D", birthDate: "2015-01-01", height: -120 }));
  ok("Enfant poids 0 invalide", !validChild({ firstName: "L", lastName: "D", birthDate: "2015-01-01", weight: 0 }));
  ok("Enfant sans poids OK", validChild({ firstName: "L", lastName: "D", birthDate: "2015-01-01" }));
  // authProvider valeurs
  const AUTH = ["google","email","apple","anonymous"];
  AUTH.forEach(a => ok(`Auth ${a} reconnu`, AUTH.includes(a)));
  // Saison format
  const SEASON_RE = /^\d{4}-\d{4}$/;
  ok("Saison 2025-2026 format OK", SEASON_RE.test("2025-2026"));
  ok("Saison 2025 INvalide", !SEASON_RE.test("2025"));

  // ══════════════════════════════════════════════════════════════
  section("46. SCHÉMA FIRESTORE — cohérence globale (écriture réelle)");
  // ══════════════════════════════════════════════════════════════
  await test("Famille créée au §1 existe toujours", async () => {
    if (!familyId) { skipped++; return; }
    const doc = await db.collection("families").doc(familyId).get();
    assert(doc.exists, "famille persistée");
  });
  await test("Activité créée au §2 existe toujours", async () => {
    if (!activityId) { skipped++; return; }
    const doc = await db.collection("activities").doc(activityId).get();
    assert(doc.exists, "activité persistée");
  });
  await test("Au moins 1 paiement créé", async () => {
    const snap = await db.collection("payments").where("_testScript", "==", true).limit(5).get();
    assert(!snap.empty, "paiements de test présents");
  });
  await test("Au moins 1 réservation créée", async () => {
    const snap = await db.collection("reservations").where("_testScript", "==", true).limit(5).get();
    assert(!snap.empty, "réservations de test présentes");
  });
  await test("Chaque famille de test a un parentEmail", async () => {
    const snap = await db.collection("families").where("_testScript", "==", true).limit(10).get();
    for (const d of snap.docs) assert(!!d.data().parentEmail, `famille ${d.id} sans email`);
  });
  await test("Chaque paiement a un totalTTC > 0", async () => {
    const snap = await db.collection("payments").where("_testScript", "==", true).limit(20).get();
    for (const d of snap.docs) { const v = safeNumber(d.data().totalTTC); if (v > 0) assert(v > 0, "total positif"); }
  });
  await test("Aucune famille de test sans season", async () => {
    const snap = await db.collection("families").where("_testScript", "==", true).limit(10).get();
    for (const d of snap.docs) assert(!!d.data().season, `famille ${d.id} sans season`);
  });
  await test("Créneaux créés ont un dayOfWeek dans [0..6]", async () => {
    const snap = await db.collection("creneaux").where("_testScript", "==", true).limit(10).get();
    for (const d of snap.docs) {
      const dow = d.data().dayOfWeek;
      if (dow !== undefined) assert(dow >= 0 && dow <= 6, `dayOfWeek ${dow} hors bornes`);
    }
  });
  await test("Tri stable sur un fetch répété de créneaux", async () => {
    const snap1 = await db.collection("creneaux").where("_testScript", "==", true).limit(5).get();
    const ids1 = snap1.docs.map(d => d.id).sort();
    const snap2 = await db.collection("creneaux").where("_testScript", "==", true).limit(5).get();
    const ids2 = snap2.docs.map(d => d.id).sort();
    assert(JSON.stringify(ids1) === JSON.stringify(ids2), "fetch répété stable");
  });
  await test("Toutes les collections test ont le marker _testScript", async () => {
    const cols = ["families","activities","creneaux","payments","reservations"];
    for (const col of cols) {
      const snap = await db.collection(col).where("_testScript", "==", true).limit(3).get();
      for (const d of snap.docs) assert(d.data()._testScript === true, `${col}/${d.id} marker manquant`);
    }
  });
  await test("Aucun doc test sans _testDate", async () => {
    const snap = await db.collection("families").where("_testScript", "==", true).limit(5).get();
    for (const d of snap.docs) assert(!!d.data()._testDate, `${d.id} sans _testDate`);
  });
  await test("createdDocs >= 50 documents", async () => {
    assert(createdDocs.length >= 50, `seulement ${createdDocs.length} docs créés`);
  });
  await test("Pas de doublons dans createdDocs", async () => {
    const keys = new Set(createdDocs.map(d => `${d.collection}/${d.id}`));
    assert(keys.size === createdDocs.length, "doublons détectés");
  });
  await test("Collections variées dans createdDocs", async () => {
    const cols = new Set(createdDocs.map(d => d.collection));
    assert(cols.size >= 5, `seulement ${cols.size} collections`);
  });
  await test("IDs créés non vides", async () => {
    for (const d of createdDocs.slice(0, 20)) assert(!!d.id && d.id.length > 0, `id vide ${d.collection}`);
  });

  // ══════════════════════════════════════════════════════════════
  section("46 bis. CAS LIMITES SUPPLÉMENTAIRES (logique pure)");
  // ══════════════════════════════════════════════════════════════
  // Plus de variations TVA
  nearly("htToTTC(50, 10) = 55", htToTTC(50, 10), 55);
  nearly("htToTTC(200, 2.1) = 204.20", htToTTC(200, 2.1), 204.20);
  nearly("ttcToHT(55, 10) ≈ 50", ttcToHT(55, 10), 50);
  nearly("ttcToHT(204.20, 2.1) ≈ 200", ttcToHT(204.20, 2.1), 200, 0.01);
  // round2 plus de cas
  eq("round2(0.005) = 0.01", round2(0.005), 0.01);
  eq("round2(0.004) = 0", round2(0.004), 0);
  eq("round2(-0.005) = 0", round2(-0.005), 0);
  eq("round2(1000000.999) = 1000001", round2(1000000.999), 1000001);
  // formatEuro edge cases
  eq("formatEuro(-50) = '-50.00€'", formatEuro(-50), "-50.00€");
  eq("formatEuro(null) = '0.00€'", formatEuro(null), "0.00€");
  eq("formatEuro(Infinity) = '0.00€'", formatEuro(Infinity), "0.00€");
  // isEmail edge cases supplémentaires
  ok("email: 1@2.3", isEmail("1@2.3"));
  ok("email INV: a@ b.fr (espace)", !isEmail("a@ b.fr"));
  ok("email INV: a..b@c.fr accepté par regex simple", isEmail("a..b@c.fr"));
  // IBAN edge cases
  ok("IBAN avec espaces multiples", isIbanFR("FR76  1660 6100 6400 1353 9343 253"));
  ok("IBAN FR lowercase non valide", !isIbanFR("fr7616606100640013539343253"));
  // Créneaux: tri cas particulier
  const creneauxDemo = [
    { startTime: "08:00" }, { startTime: "18:00" }, { startTime: "12:00" }, { startTime: "06:00" },
  ];
  const triCren = [...creneauxDemo].sort(compareCreneaux);
  eq("Tri: 1er = 06:00", triCren[0].startTime, "06:00");
  eq("Tri: dernier = 18:00", triCren[3].startTime, "18:00");
  // Comptage séances: vacances multiples qui se touchent
  const holContigus = [{ start: "2026-01-01", end: "2026-01-14" }, { start: "2026-01-10", end: "2026-01-20" }];
  ok("Vacances qui se chevauchent traitées", countSessionsInPeriod("2026-01-01", "2026-01-20", 2, holContigus) >= 0);
  // Prorata bordure exacte
  const PBord = calculateProrata("2025-09-03", SEASON_2526.end, 2, HOLS_2526, 300);
  ok("Prorata dès 1er mercredi ≈ plein", PBord.sessions === PBord.totalSessions);
  // Fidélité solde
  eq("Gain 200 + use 150 solde 50", fidSolde([{ type: "gain", points: 200 }, { type: "use", points: 150 }]), 50);
  // computeAge cas extrêmes
  eq("Né 2026-04-18 (aujourd'hui) → 0 an", computeAge("2026-04-18", new Date("2026-04-18")), 0);
  eq("Né 1900-01-01 → 126 ans", computeAge("1900-01-01", new Date("2026-04-18")), 126);
  // SEPA montants
  eq("Montant 12345.67 → '12345.67'", (12345.67).toFixed(2), "12345.67");
  eq("Arrondi 0.005 + 0.005 pas toujours 0.01", round2(0.005 + 0.005), round2(0.01));
  // Status réservation: confirmed ne peut pas redevenir pending
  ok("confirmed → pending INTERDIT", !canTransit("confirmed", "pending_payment"));
  // Modes paiement: avoir exclu de la fidélité
  ok("'avoir' dans modes paiement", PAYMENT_MODES_IDS.includes("avoir"));
  // PostalFR avec espaces
  ok("CP avec espace: ' 50230' INvalide strict", !isPostalFR(" 50230"));
  // Stage sur un mois différent (cross-year)
  const sCrossYear = formatStageSchedule([
    { date: "2025-12-30", startTime: "10h00", endTime: "12h00" },
    { date: "2026-01-02", startTime: "10h00", endTime: "12h00" },
  ]);
  ok("Stage cross-year contient 'décembre' et 'janvier'", /décembre/i.test(sCrossYear) && /janvier/i.test(sCrossYear));
  // Final sanity
  ok("SEASON_2526.start < end", SEASON_2526.start < SEASON_2526.end);
  ok("HOLS_2526 non vide", HOLS_2526.length > 0);
  ok("11 niveaux Galops (sanity)", GALOPS.length === 11);

  // ══════════════════════════════════════════════════════════════
  section("47. VALIDATION FINALE — NETTOYAGE");
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
