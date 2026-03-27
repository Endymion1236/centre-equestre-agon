/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║   SEED — Données de test Centre Équestre Agon-Coutainville          ║
 * ║                                                                      ║
 * ║   node scripts/seed.mjs          → injecter les données             ║
 * ║   node scripts/seed.mjs --clean  → tout nettoyer                    ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs,
  deleteDoc, query, where, serverTimestamp, writeBatch
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDy1vrJpa12CrnyGoDkR9t4c3E31CS7Ovc",
  authDomain: "gestion-2026.firebaseapp.com",
  projectId: "gestion-2026",
  storageBucket: "gestion-2026.firebasestorage.app",
  messagingSenderId: "785848912923",
  appId: "1:785848912923:web:47f03aa109fa13eb1c7cbe",
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);

const G = "\x1b[32m✅", R = "\x1b[31m❌", Y = "\x1b[33m⚠️ ", B = "\x1b[34m", W = "\x1b[1m", Z = "\x1b[0m";
const ok  = m => console.log(`${G} ${m}${Z}`);
const err = m => console.log(`${R} ${m}${Z}`);
const inf = m => console.log(`${B}   ${m}${Z}`);
const sec = m => console.log(`\n${W}${B}━━━ ${m} ━━━${Z}`);

const TAG = "SEED_TEST_2026"; // marqueur pour nettoyage ciblé
const ts  = () => Date.now();
const round2 = v => Math.round(Number(v) * 100) / 100;
const ht  = ttc => round2(ttc / 1.055);

// ─── Dates utilitaires ────────────────────────────────────────────────────────
const fmtDate = d => {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), j = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${j}`;
};
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r; };
const today     = new Date();
const nextWeek  = addDays(today, 7);
const in2weeks  = addDays(today, 14);
const in3weeks  = addDays(today, 21);
const in4weeks  = addDays(today, 28);
const lastWeek  = addDays(today, -7);

// Trouver prochain [jourSemaine] (0=dim,1=lun...)
const nextDay = (dow) => {
  const d = new Date(today);
  while (d.getDay() !== dow) d.setDate(d.getDate()+1);
  return d;
};
const nextMercredi  = nextDay(3);
const nextJeudi     = nextDay(4);
const nextSamedi    = nextDay(6);
const nextDimanche  = nextDay(0);

// ─── IDs créés (pour nettoyage) ───────────────────────────────────────────────
const created = { families:[], creneaux:[], payments:[], encaissements:[], forfaits:[], avoirs:[], cartes:[], reservations:[], equides:[], passages:[], fidelite:[] };

// ─── MODE NETTOYAGE ───────────────────────────────────────────────────────────
async function cleanSeedData() {
  console.log(`\n${W}${B}╔══ NETTOYAGE DES DONNÉES DE TEST ══╗${Z}`);
  let total = 0;

  const collections = [
    "families","creneaux","payments","encaissements","forfaits",
    "avoirs","cartes","reservations","equides","passages","fidelite","bonsRecup"
  ];

  for (const col of collections) {
    try {
      const snap = await getDocs(query(collection(db, col), where("_seed", "==", TAG)));
      let n = 0;
      for (const d of snap.docs) { await deleteDoc(d.ref); n++; }
      if (n > 0) { ok(`${col} : ${n} supprimé(s)`); total += n; }
    } catch(e) { /* collection vide ou erreur index */ }
  }

  // Nettoyage creneaux sans _seed (ils n'ont pas forcément ce champ)
  try {
    const snap = await getDocs(collection(db, "creneaux"));
    let n = 0;
    for (const d of snap.docs) {
      if (d.data()._seed === TAG) { await deleteDoc(d.ref); n++; total++; }
    }
    if (n > 0) ok(`creneaux (fallback) : ${n} supprimé(s)`);
  } catch(e) {}

  console.log(`\n${Y} ${total} documents de test supprimés${Z}`);
  process.exit(0);
}

// ─── HELPERS CRÉATION ─────────────────────────────────────────────────────────
async function mkFamily(data) {
  const ref = await addDoc(collection(db, "families"), { ...data, _seed: TAG, createdAt: serverTimestamp() });
  created.families.push(ref.id);
  return { id: ref.id, ...data };
}

async function mkCreneau(data) {
  const ref = await addDoc(collection(db, "creneaux"), { ...data, _seed: TAG, createdAt: serverTimestamp() });
  created.creneaux.push(ref.id);
  return ref.id;
}

async function mkPayment(data) {
  const ref = await addDoc(collection(db, "payments"), { ...data, _seed: TAG, createdAt: serverTimestamp() });
  created.payments.push(ref.id);
  return ref.id;
}

async function mkEncaissement(data) {
  const ref = await addDoc(collection(db, "encaissements"), { ...data, _seed: TAG, date: serverTimestamp() });
  created.encaissements.push(ref.id);
  return ref.id;
}

async function mkForfait(data) {
  const ref = await addDoc(collection(db, "forfaits"), { ...data, _seed: TAG, createdAt: serverTimestamp() });
  created.forfaits.push(ref.id);
  return ref.id;
}

async function mkAvoir(data) {
  const ref = await addDoc(collection(db, "avoirs"), { ...data, _seed: TAG, createdAt: serverTimestamp() });
  created.avoirs.push(ref.id);
  return ref.id;
}

async function mkCarte(data) {
  const ref = await addDoc(collection(db, "cartes"), { ...data, _seed: TAG, createdAt: serverTimestamp() });
  created.cartes.push(ref.id);
  return ref.id;
}

async function mkEquide(data) {
  const ref = await addDoc(collection(db, "equides"), { ...data, _seed: TAG, createdAt: serverTimestamp() });
  created.equides.push(ref.id);
  return ref.id;
}

// ─── SEED PRINCIPAL ───────────────────────────────────────────────────────────
async function seed() {
  console.log(`\n${W}${B}`);
  console.log(`╔══════════════════════════════════════════════════════════════════╗`);
  console.log(`║   SEED — Centre Équestre Agon-Coutainville                      ║`);
  console.log(`║   ${new Date().toLocaleString("fr-FR")}                                       ║`);
  console.log(`╚══════════════════════════════════════════════════════════════════╝${Z}`);

  // ═══════════════════════════════════════════════════════════════════
  sec("1. ÉQUIDÉS");
  // ═══════════════════════════════════════════════════════════════════

  const poneys = [
    { name:"Galipette", type:"poney", sex:"jument", birthYear:2014, race:"Shetland", robe:"Alezan", category:"poney_club", status:"actif", galopLevel:"G1-G2" },
    { name:"Coquin",    type:"poney", sex:"hongre", birthYear:2012, race:"Welsh",    robe:"Gris",   category:"poney_club", status:"actif", galopLevel:"G1-G3" },
    { name:"Tempête",   type:"poney", sex:"hongre", birthYear:2016, race:"Connemara",robe:"Isabelle",category:"poney_club",status:"actif", galopLevel:"G2-G4" },
    { name:"Caramel",   type:"poney", sex:"jument", birthYear:2010, race:"Fjord",    robe:"Isabelle",category:"poney_club",status:"actif", galopLevel:"G1" },
    { name:"Éclair",    type:"cheval",sex:"hongre", birthYear:2008, race:"Appaloosa",robe:"Léopard",category:"cheval",    status:"actif", galopLevel:"G4+" },
    { name:"Mistral",   type:"cheval",sex:"jument", birthYear:2015, race:"KWPN",     robe:"Bai",    category:"cheval",    status:"actif", galopLevel:"G4+" },
    { name:"Dolce",     type:"poney", sex:"jument", birthYear:2018, race:"Haflinger",robe:"Alezan", category:"poney_club",status:"actif", galopLevel:"G1-G2" },
    { name:"Ouragan",   type:"poney", sex:"hongre", birthYear:2011, race:"Welsh B",  robe:"Noir",   category:"poney_club",status:"actif", galopLevel:"G2-G3" },
  ];

  const equideIds = {};
  for (const p of poneys) {
    const id = await mkEquide(p);
    equideIds[p.name] = id;
    inf(`Équidé : ${p.name} (${p.type} ${p.race})`);
  }
  ok(`${poneys.length} équidés créés`);

  // ═══════════════════════════════════════════════════════════════════
  sec("2. FAMILLES & CAVALIERS");
  // ═══════════════════════════════════════════════════════════════════

  // Famille 1 — Martin : 3 enfants, forfait annuel, carte familiale
  const fam1 = await mkFamily({
    parentName: "Martin Sophie",
    parentEmail: "sophie.martin@test.fr",
    parentPhone: "06 11 22 33 44",
    children: [
      { id:"c1_martin", firstName:"Léa",    lastName:"Martin", birthDate:"2013-04-12", galopLevel:"G3",
        sanitaryForm:{ allergies:"Aucune", emergencyContactName:"Martin Paul", emergencyContactPhone:"06 99 88 77 66", parentalAuthorization:true, updatedAt:new Date().toISOString() }},
      { id:"c2_martin", firstName:"Tom",    lastName:"Martin", birthDate:"2015-08-23", galopLevel:"G1",
        sanitaryForm:{ allergies:"Arachides", emergencyContactName:"Martin Paul", emergencyContactPhone:"06 99 88 77 66", parentalAuthorization:true, updatedAt:new Date().toISOString() }},
      { id:"c3_martin", firstName:"Chloé",  lastName:"Martin", birthDate:"2017-02-05", galopLevel:"Bronze",
        sanitaryForm:null },
    ],
    notes:"Famille fidèle depuis 3 ans. Léa vise le G4 cette année.",
  });
  inf(`Famille ${fam1.parentName} : Léa (G3), Tom (G1), Chloé (Bronze)`);

  // Famille 2 — Dubois : 2 enfants, paiements en retard
  const fam2 = await mkFamily({
    parentName: "Dubois Jean",
    parentEmail: "jean.dubois@test.fr",
    parentPhone: "06 22 33 44 55",
    children: [
      { id:"c1_dubois", firstName:"Emma",   lastName:"Dubois", birthDate:"2012-11-30", galopLevel:"G4",
        sanitaryForm:{ allergies:"Pollen", emergencyContactName:"Dubois Marie", emergencyContactPhone:"06 77 66 55 44", parentalAuthorization:true, updatedAt:new Date().toISOString() }},
      { id:"c2_dubois", firstName:"Nathan", lastName:"Dubois", birthDate:"2014-06-18", galopLevel:"G2",
        sanitaryForm:{ allergies:"Aucune", emergencyContactName:"Dubois Marie", emergencyContactPhone:"06 77 66 55 44", parentalAuthorization:true, updatedAt:new Date().toISOString() }},
    ],
    notes:"Emma participe aux Pony Games. Paiement en plusieurs fois.",
  });
  inf(`Famille ${fam2.parentName} : Emma (G4), Nathan (G2)`);

  // Famille 3 — Leclerc : 1 enfant débutant, carte ponctuelle
  const fam3 = await mkFamily({
    parentName: "Leclerc Marie",
    parentEmail: "marie.leclerc@test.fr",
    parentPhone: "06 33 44 55 66",
    children: [
      { id:"c1_leclerc", firstName:"Jules", lastName:"Leclerc", birthDate:"2016-09-14", galopLevel:"Bronze",
        sanitaryForm:{ allergies:"Aucune", emergencyContactName:"Leclerc Pierre", emergencyContactPhone:"06 55 44 33 22", parentalAuthorization:true, updatedAt:new Date().toISOString() }},
    ],
    notes:"Famille nouvellement inscrite. Jules très motivé.",
  });
  inf(`Famille ${fam3.parentName} : Jules (Bronze)`);

  // Famille 4 — Bernard : 2 enfants, balades + cours
  const fam4 = await mkFamily({
    parentName: "Bernard Claire",
    parentEmail: "claire.bernard@test.fr",
    parentPhone: "06 44 55 66 77",
    children: [
      { id:"c1_bernard", firstName:"Manon", lastName:"Bernard", birthDate:"2011-03-22", galopLevel:"G4",
        sanitaryForm:{ allergies:"Aucune", emergencyContactName:"Bernard Luc", emergencyContactPhone:"06 33 22 11 00", parentalAuthorization:true, updatedAt:new Date().toISOString() }},
      { id:"c2_bernard", firstName:"Hugo",  lastName:"Bernard", birthDate:"2014-12-01", galopLevel:"G2",
        sanitaryForm:{ allergies:"Aucune", emergencyContactName:"Bernard Luc", emergencyContactPhone:"06 33 22 11 00", parentalAuthorization:true, updatedAt:new Date().toISOString() }},
    ],
    notes:"Manon en compétition Pony Games. Hugo en progression rapide.",
  });
  inf(`Famille ${fam4.parentName} : Manon (G4), Hugo (G2)`);

  // Famille 5 — Moreau : 1 enfant, carte balade
  const fam5 = await mkFamily({
    parentName: "Moreau Pierre",
    parentEmail: "pierre.moreau@test.fr",
    parentPhone: "06 55 66 77 88",
    children: [
      { id:"c1_moreau", firstName:"Zoé", lastName:"Moreau", birthDate:"2013-07-08", galopLevel:"G2",
        sanitaryForm:{ allergies:"Gluten (légère)", emergencyContactName:"Moreau Isabelle", emergencyContactPhone:"06 22 11 00 99", parentalAuthorization:true, updatedAt:new Date().toISOString() }},
    ],
    notes:"Zoé adore les balades sur la plage.",
  });
  inf(`Famille ${fam5.parentName} : Zoé (G2)`);

  ok(`5 familles créées (12 cavaliers au total)`);

  // ═══════════════════════════════════════════════════════════════════
  sec("3. CARTES DE SÉANCES");
  // ═══════════════════════════════════════════════════════════════════

  const dateDebut = fmtDate(today);
  const dateFin6m = fmtDate(addDays(today, 180));

  // Carte individuelle — Léa Martin (cours)
  const carteLea = await mkCarte({
    familyId: fam1.id, familyName: fam1.parentName,
    childId: "c1_martin", childName: "Léa", familiale: false,
    activityType: "cours", totalSessions: 10, usedSessions: 3, remainingSessions: 7,
    priceTTC: 200, priceHT: ht(200), tvaTaux: 5.5,
    status: "active", dateDebut, dateFin: dateFin6m,
    history: [
      { date: addDays(today,-21).toISOString(), activityTitle:"Galop 3", horseName:"Tempête", childName:"Léa", presence:"present", auto:true, creneauId:"past1" },
      { date: addDays(today,-14).toISOString(), activityTitle:"Galop 3", horseName:"Tempête", childName:"Léa", presence:"present", auto:true, creneauId:"past2" },
      { date: addDays(today,-7).toISOString(),  activityTitle:"Galop 3", horseName:"Ouragan", childName:"Léa", presence:"absent",  auto:true, creneauId:"past3" },
    ],
  });
  inf(`Carte Léa Martin : 7/10 séances cours`);

  // Carte familiale — Famille Martin (cours)
  const carteFamMartinCours = await mkCarte({
    familyId: fam1.id, familyName: fam1.parentName,
    childId: null, childName: "Toute la famille", familiale: true,
    activityType: "cours", totalSessions: 20, usedSessions: 5, remainingSessions: 15,
    priceTTC: 380, priceHT: ht(380), tvaTaux: 5.5,
    status: "active", dateDebut, dateFin: dateFin6m,
    history: [
      { date: addDays(today,-14).toISOString(), activityTitle:"Galop 1", horseName:"Galipette", childName:"Tom", presence:"present", auto:true, creneauId:"past10" },
      { date: addDays(today,-14).toISOString(), activityTitle:"Galop 3", horseName:"Tempête",   childName:"Léa", presence:"present", auto:true, creneauId:"past11" },
      { date: addDays(today,-7).toISOString(),  activityTitle:"Galop 1", horseName:"Caramel",   childName:"Tom", presence:"present", auto:true, creneauId:"past12" },
      { date: addDays(today,-7).toISOString(),  activityTitle:"Galop 3", horseName:"Tempête",   childName:"Léa", presence:"present", auto:true, creneauId:"past13" },
      { date: addDays(today,-7).toISOString(),  activityTitle:"Poneys Débutants", horseName:"Dolce", childName:"Chloé", presence:"absent", auto:true, creneauId:"past14" },
    ],
  });
  inf(`Carte familiale Martin : 15/20 séances cours`);

  // Carte individuelle — Zoé Moreau (balades)
  const carteZoe = await mkCarte({
    familyId: fam5.id, familyName: fam5.parentName,
    childId: "c1_moreau", childName: "Zoé", familiale: false,
    activityType: "balade", totalSessions: 5, usedSessions: 1, remainingSessions: 4,
    priceTTC: 120, priceHT: ht(120), tvaTaux: 5.5,
    status: "active", dateDebut, dateFin: dateFin6m,
    history: [
      { date: addDays(today,-10).toISOString(), activityTitle:"Balade plage", horseName:"Coquin", childName:"Zoé", presence:"present", auto:true, creneauId:"past20" },
    ],
  });
  inf(`Carte Zoé Moreau : 4/5 séances balades`);

  // Carte épuisée — Emma Dubois
  const carteEmmaUsed = await mkCarte({
    familyId: fam2.id, familyName: fam2.parentName,
    childId: "c1_dubois", childName: "Emma", familiale: false,
    activityType: "cours", totalSessions: 10, usedSessions: 10, remainingSessions: 0,
    priceTTC: 200, priceHT: ht(200), tvaTaux: 5.5,
    status: "used", dateDebut: fmtDate(addDays(today,-200)), dateFin: fmtDate(addDays(today,-10)),
    history: [],
  });
  inf(`Carte Emma Dubois : épuisée (0/10)`);

  ok(`4 cartes créées`);

  // ═══════════════════════════════════════════════════════════════════
  sec("4. FORFAITS ANNUELS");
  // ═══════════════════════════════════════════════════════════════════

  const slotLea  = `slot_G3_${nextMercredi.getDay()}_10h`;
  const slotManon = `slot_G4_${nextSamedi.getDay()}_14h`;
  const slotEmma = `slot_G4_${nextSamedi.getDay()}_14h`;

  const forfaitLea = await mkForfait({
    familyId: fam1.id, familyName: fam1.parentName,
    childId: "c1_martin", childName: "Léa", activityType: "cours",
    slotKey: slotLea, activityTitle: "Galop 3 — Mercredi 10h",
    status: "actif", priceTTC: 475, echeancesTotal: 1,
    createdAt: serverTimestamp(),
  });
  inf(`Forfait Léa Martin : Galop 3 annuel`);

  const forfaitManon = await mkForfait({
    familyId: fam4.id, familyName: fam4.parentName,
    childId: "c1_bernard", childName: "Manon", activityType: "cours",
    slotKey: slotManon, activityTitle: "Galop 4 — Samedi 14h",
    status: "actif", priceTTC: 475, echeancesTotal: 10,
    createdAt: serverTimestamp(),
  });
  inf(`Forfait Manon Bernard : Galop 4 annuel (10 échéances)`);

  const forfaitEmma = await mkForfait({
    familyId: fam2.id, familyName: fam2.parentName,
    childId: "c1_dubois", childName: "Emma", activityType: "cours",
    slotKey: slotEmma, activityTitle: "Galop 4 — Samedi 14h",
    status: "actif", priceTTC: 475, echeancesTotal: 1,
    createdAt: serverTimestamp(),
  });
  inf(`Forfait Emma Dubois : Galop 4 annuel`);

  ok(`3 forfaits annuels créés`);

  // ═══════════════════════════════════════════════════════════════════
  sec("5. PLANNING — CRÉNEAUX RÉCURRENTS");
  // ═══════════════════════════════════════════════════════════════════

  // Générer 8 semaines de cours récurrents
  const coursRecurrents = [
    { title:"Poneys Débutants",   type:"cours", time:["09:00","10:00"], prix:22,  max:6,  monitor:"Emmeline", jour:3 }, // Mercredi
    { title:"Galop 1",            type:"cours", time:["10:00","11:00"], prix:22,  max:6,  monitor:"Emmeline", jour:3 },
    { title:"Galop 2",            type:"cours", time:["11:00","12:00"], prix:22,  max:6,  monitor:"Emmeline", jour:3 },
    { title:"Galop 3",            type:"cours", time:["10:00","11:00"], prix:22,  max:8,  monitor:"Emmeline", jour:6 }, // Samedi
    { title:"Galop 4",            type:"cours", time:["14:00","15:00"], prix:26,  max:8,  monitor:"Nicolas",  jour:6 },
    { title:"Balade Plage",       type:"balade",time:["10:00","11:30"], prix:30,  max:10, monitor:"Nicolas",  jour:0 }, // Dimanche
    { title:"Pony Games",         type:"cours", time:["15:00","16:30"], prix:24,  max:8,  monitor:"Emmeline", jour:6 },
    { title:"Cours Adultes",      type:"cours", time:["18:00","19:00"], prix:26,  max:6,  monitor:"Nicolas",  jour:3 },
  ];

  let nbCreneaux = 0;
  for (const cr of coursRecurrents) {
    for (let semaine = 0; semaine < 8; semaine++) {
      const baseDate = nextDay(cr.jour);
      const dateCredit = addDays(baseDate, semaine * 7);
      // Passer les dates passées pour les 2 premières semaines
      const status = dateCredit < today ? "closed" : "planned";

      // Inscrire des enfants pour rendre le planning vivant
      const enrolled = [];
      if (cr.title === "Galop 3" && semaine < 5) {
        enrolled.push({ childId:"c1_martin", childName:"Léa", familyId:fam1.id, familyName:fam1.parentName, paymentSource:"forfait", enrolledAt:new Date().toISOString(), presence: status==="closed"?(Math.random()>0.2?"present":"absent"):undefined });
        enrolled.push({ childId:"c1_dubois", childName:"Emma", familyId:fam2.id, familyName:fam2.parentName, paymentSource:"forfait", enrolledAt:new Date().toISOString(), presence: status==="closed"?(Math.random()>0.1?"present":"absent"):undefined });
      }
      if (cr.title === "Galop 4" && semaine < 5) {
        enrolled.push({ childId:"c1_bernard", childName:"Manon", familyId:fam4.id, familyName:fam4.parentName, paymentSource:"forfait", enrolledAt:new Date().toISOString(), presence: status==="closed"?"present":undefined });
        enrolled.push({ childId:"c1_dubois", childName:"Emma", familyId:fam2.id, familyName:fam2.parentName, paymentSource:"forfait", enrolledAt:new Date().toISOString(), presence: status==="closed"?"present":undefined });
      }
      if (cr.title === "Galop 1" && semaine < 5) {
        enrolled.push({ childId:"c2_martin", childName:"Tom", familyId:fam1.id, familyName:fam1.parentName, paymentSource:"card", cardId:carteFamMartinCours, enrolledAt:new Date().toISOString(), presence: status==="closed"?(Math.random()>0.15?"present":"absent"):undefined });
        enrolled.push({ childId:"c2_dubois", childName:"Nathan", familyId:fam2.id, familyName:fam2.parentName, paymentSource:"pending", enrolledAt:new Date().toISOString(), presence: status==="closed"?"present":undefined });
      }
      if (cr.title === "Poneys Débutants" && semaine < 5) {
        enrolled.push({ childId:"c3_martin", childName:"Chloé", familyId:fam1.id, familyName:fam1.parentName, paymentSource:"card", cardId:carteFamMartinCours, enrolledAt:new Date().toISOString(), presence: status==="closed"?(Math.random()>0.3?"present":"absent"):undefined });
        enrolled.push({ childId:"c1_leclerc", childName:"Jules", familyId:fam3.id, familyName:fam3.parentName, paymentSource:"card", cardId:null, enrolledAt:new Date().toISOString(), presence: status==="closed"?"present":undefined });
      }
      if (cr.title === "Balade Plage" && semaine < 4) {
        enrolled.push({ childId:"c1_moreau", childName:"Zoé", familyId:fam5.id, familyName:fam5.parentName, paymentSource:"card", cardId:carteZoe, enrolledAt:new Date().toISOString(), presence: status==="closed"?"present":undefined });
        enrolled.push({ childId:"c2_bernard", childName:"Hugo", familyId:fam4.id, familyName:fam4.parentName, paymentSource:"paid", enrolledAt:new Date().toISOString(), presence: status==="closed"?"present":undefined });
      }
      if (cr.title === "Pony Games" && semaine < 6) {
        enrolled.push({ childId:"c1_bernard", childName:"Manon", familyId:fam4.id, familyName:fam4.parentName, paymentSource:"paid", enrolledAt:new Date().toISOString(), presence: status==="closed"?"present":undefined });
        enrolled.push({ childId:"c1_dubois", childName:"Emma", familyId:fam2.id, familyName:fam2.parentName, paymentSource:"paid", enrolledAt:new Date().toISOString(), presence: status==="closed"?"present":undefined });
      }

      await mkCreneau({
        activityId: `act_${cr.type}_${cr.title.replace(/\s/g,"_")}`,
        activityTitle: cr.title,
        activityType: cr.type,
        date: fmtDate(dateCredit),
        startTime: cr.time[0],
        endTime: cr.time[1],
        monitor: cr.monitor,
        maxPlaces: cr.max,
        priceTTC: cr.prix,
        priceHT: ht(cr.prix),
        tvaTaux: 5.5,
        enrolled,
        enrolledCount: enrolled.length,
        status,
        ...(status==="closed" ? { closedAt: serverTimestamp() } : {}),
      });
      nbCreneaux++;
    }
  }
  ok(`${nbCreneaux} créneaux récurrents créés (8 semaines × ${coursRecurrents.length} cours)`);

  // ═══════════════════════════════════════════════════════════════════
  sec("6. STAGES");
  // ═══════════════════════════════════════════════════════════════════

  // Stage Galop de Bronze — vacances de Pâques (2 jours)
  const stageGalopBronze = [
    { date: fmtDate(addDays(nextWeek, 0)), label:"Jour 1" },
    { date: fmtDate(addDays(nextWeek, 1)), label:"Jour 2" },
  ];
  const stageKey1 = `stage_galop_bronze_${fmtDate(nextWeek)}`;
  for (const jour of stageGalopBronze) {
    await mkCreneau({
      activityId:"act_stage_galop_bronze",
      activityTitle:"Stage Galop de Bronze",
      activityType:"stage",
      date: jour.date,
      startTime:"09:00", endTime:"17:00",
      monitor:"Emmeline",
      maxPlaces:8,
      priceTTC:175, priceHT:ht(175), tvaTaux:5.5,
      price1day:175, price2days:300, price3days:400, price4days:475,
      stageKey: stageKey1,
      enrolled:[
        { childId:"c3_martin", childName:"Chloé", familyId:fam1.id, familyName:fam1.parentName, paymentSource:"paid", stageKey:stageKey1, enrolledAt:new Date().toISOString() },
        { childId:"c1_leclerc", childName:"Jules", familyId:fam3.id, familyName:fam3.parentName, paymentSource:"paid", stageKey:stageKey1, enrolledAt:new Date().toISOString() },
        { childId:"c2_martin", childName:"Tom", familyId:fam1.id, familyName:fam1.parentName, paymentSource:"paid", stageKey:stageKey1, enrolledAt:new Date().toISOString() },
      ],
      enrolledCount:3,
      status:"planned",
    });
  }
  ok(`Stage Galop de Bronze (${stageGalopBronze.length}j) — ${stageGalopBronze[0].date}`);

  // Stage Perfectionnement G3/G4 — 4 jours
  const stagePerfect = [];
  for (let i=0;i<4;i++) stagePerfect.push({ date: fmtDate(addDays(in2weeks, i)) });
  const stageKey2 = `stage_perfect_${fmtDate(in2weeks)}`;
  for (const jour of stagePerfect) {
    await mkCreneau({
      activityId:"act_stage_perfect",
      activityTitle:"Stage Perfectionnement G3/G4",
      activityType:"stage",
      date: jour.date,
      startTime:"09:00", endTime:"17:00",
      monitor:"Nicolas",
      maxPlaces:6,
      priceTTC:475, priceHT:ht(475), tvaTaux:5.5,
      price1day:175, price2days:300, price3days:400, price4days:475,
      stageKey: stageKey2,
      enrolled:[
        { childId:"c1_martin", childName:"Léa", familyId:fam1.id, familyName:fam1.parentName, paymentSource:"paid", stageKey:stageKey2, enrolledAt:new Date().toISOString() },
        { childId:"c1_bernard", childName:"Manon", familyId:fam4.id, familyName:fam4.parentName, paymentSource:"paid", stageKey:stageKey2, enrolledAt:new Date().toISOString() },
        { childId:"c1_dubois", childName:"Emma", familyId:fam2.id, familyName:fam2.parentName, paymentSource:"paid", stageKey:stageKey2, enrolledAt:new Date().toISOString() },
      ],
      enrolledCount:3,
      status:"planned",
    });
  }
  ok(`Stage Perfectionnement G3/G4 (4j) — ${fmtDate(in2weeks)}`);

  // Stage Pony Games — 3 jours (dans 3 semaines)
  const stagePG = [];
  for (let i=0;i<3;i++) stagePG.push({ date: fmtDate(addDays(in3weeks, i)) });
  const stageKey3 = `stage_ponyg_${fmtDate(in3weeks)}`;
  for (const jour of stagePG) {
    await mkCreneau({
      activityId:"act_stage_ponygames",
      activityTitle:"Stage Pony Games",
      activityType:"stage",
      date: jour.date,
      startTime:"09:00", endTime:"17:00",
      monitor:"Emmeline",
      maxPlaces:10,
      priceTTC:400, priceHT:ht(400), tvaTaux:5.5,
      price1day:175, price2days:300, price3days:400, price4days:475,
      stageKey: stageKey3,
      enrolled:[
        { childId:"c1_bernard", childName:"Manon", familyId:fam4.id, familyName:fam4.parentName, paymentSource:"pending", stageKey:stageKey3, enrolledAt:new Date().toISOString() },
        { childId:"c1_dubois", childName:"Emma", familyId:fam2.id, familyName:fam2.parentName, paymentSource:"paid", stageKey:stageKey3, enrolledAt:new Date().toISOString() },
        { childId:"c2_dubois", childName:"Nathan", familyId:fam2.id, familyName:fam2.parentName, paymentSource:"paid", stageKey:stageKey3, enrolledAt:new Date().toISOString() },
      ],
      enrolledCount:3,
      status:"planned",
    });
  }
  ok(`Stage Pony Games (3j) — ${fmtDate(in3weeks)}`);

  // Stage Mini-Cowboy — 2 jours (dans 4 semaines)
  const stageCowboy = [];
  for (let i=0;i<2;i++) stageCowboy.push({ date: fmtDate(addDays(in4weeks, i)) });
  const stageKey4 = `stage_cowboy_${fmtDate(in4weeks)}`;
  for (const jour of stageCowboy) {
    await mkCreneau({
      activityId:"act_stage_minicowboy",
      activityTitle:"Stage Mini Cowboy (4-6 ans)",
      activityType:"stage_journee",
      date: jour.date,
      startTime:"09:30", endTime:"16:30",
      monitor:"Emmeline",
      maxPlaces:8,
      priceTTC:300, priceHT:ht(300), tvaTaux:5.5,
      price1day:175, price2days:300,
      stageKey: stageKey4,
      enrolled:[
        { childId:"c3_martin", childName:"Chloé", familyId:fam1.id, familyName:fam1.parentName, paymentSource:"pending", stageKey:stageKey4, enrolledAt:new Date().toISOString() },
      ],
      enrolledCount:1,
      status:"planned",
    });
  }
  ok(`Stage Mini Cowboy (2j) — ${fmtDate(in4weeks)}`);

  // ═══════════════════════════════════════════════════════════════════
  sec("7. ANIMATIONS SPÉCIALES");
  // ═══════════════════════════════════════════════════════════════════

  // Anniversaire poney
  const anniversaireId = await mkCreneau({
    activityId:"act_anniversaire",
    activityTitle:"Anniversaire Poney — Chloé",
    activityType:"anniversaire",
    date: fmtDate(addDays(nextWeek, 5)),
    startTime:"14:00", endTime:"17:00",
    monitor:"Emmeline",
    maxPlaces:10,
    priceTTC:180, priceHT:ht(180), tvaTaux:5.5,
    enrolled:[
      { childId:"c3_martin", childName:"Chloé", familyId:fam1.id, familyName:fam1.parentName, paymentSource:"paid", enrolledAt:new Date().toISOString() },
    ],
    enrolledCount:1,
    status:"planned",
    notes:"Gâteau poney prévu. Prévoir 10 enfants max.",
  });
  ok(`Anniversaire poney — ${fmtDate(addDays(nextWeek,5))}`);

  // Pony Ride (circuit découverte)
  const ponyRideId = await mkCreneau({
    activityId:"act_ponyride",
    activityTitle:"Pony Ride — Découverte",
    activityType:"ponyride",
    date: fmtDate(nextSamedi),
    startTime:"11:00", endTime:"12:00",
    monitor:"Emmeline",
    maxPlaces:12,
    priceTTC:18, priceHT:ht(18), tvaTaux:5.5,
    enrolled:[
      { childId:"c3_martin", childName:"Chloé", familyId:fam1.id, familyName:fam1.parentName, paymentSource:"paid", enrolledAt:new Date().toISOString() },
      { childId:"c1_leclerc", childName:"Jules", familyId:fam3.id, familyName:fam3.parentName, paymentSource:"card", cardId:null, enrolledAt:new Date().toISOString() },
    ],
    enrolledCount:2,
    status:"planned",
  });
  ok(`Pony Ride Découverte — ${fmtDate(nextSamedi)}`);

  // ═══════════════════════════════════════════════════════════════════
  sec("8. PAIEMENTS & ENCAISSEMENTS");
  // ═══════════════════════════════════════════════════════════════════

  // Forfait annuel Léa — payé
  const payForfaitLea = await mkPayment({
    orderId:`SEED-F-LEA-${ts()}`,
    familyId:fam1.id, familyName:fam1.parentName,
    items:[{ activityTitle:"Forfait Galop 3 — Léa", childId:"c1_martin", childName:"Léa", activityType:"cours", priceTTC:475, priceHT:ht(475), tva:5.5 }],
    totalTTC:475, status:"paid", paidAmount:475, paymentMode:"cb_terminal",
    date: serverTimestamp(),
  });
  await mkEncaissement({ paymentId:payForfaitLea, familyId:fam1.id, familyName:fam1.parentName, montant:475, mode:"cb_terminal", modeLabel:"CB (terminal)", activityTitle:"Forfait Galop 3 — Léa" });
  inf(`Forfait Léa : 475€ payé CB`);

  // Achat carte familiale Martin — payé chèque
  const payCarteFamMartin = await mkPayment({
    orderId:`SEED-C-MARTIN-${ts()}`,
    familyId:fam1.id, familyName:fam1.parentName,
    items:[{ activityTitle:"Carte 20 séances — Famille Martin", childId:null, childName:"Toute la famille", activityType:"cours", priceTTC:380, priceHT:ht(380), tva:5.5, cardId:carteFamMartinCours }],
    totalTTC:380, status:"paid", paidAmount:380, paymentMode:"cheque",
    date: serverTimestamp(),
  });
  await mkEncaissement({ paymentId:payCarteFamMartin, familyId:fam1.id, familyName:fam1.parentName, montant:380, mode:"cheque", modeLabel:"Chèque", activityTitle:"Carte 20 séances Famille Martin" });
  inf(`Carte familiale Martin : 380€ payé chèque`);

  // Stage Galop Bronze — Chloé + Jules — payé espèces
  const payStageChloé = await mkPayment({
    orderId:`SEED-SGB-CHLO-${ts()}`,
    familyId:fam1.id, familyName:fam1.parentName,
    items:[{ activityTitle:"Stage Galop de Bronze", childId:"c3_martin", childName:"Chloé", activityType:"stage", priceTTC:300, priceHT:ht(300), tva:5.5, stageKey:stageKey1 }],
    totalTTC:300, status:"paid", paidAmount:300, paymentMode:"especes",
    date: serverTimestamp(),
  });
  await mkEncaissement({ paymentId:payStageChloé, familyId:fam1.id, familyName:fam1.parentName, montant:300, mode:"especes", modeLabel:"Espèces", activityTitle:"Stage Galop Bronze — Chloé (2j)" });
  inf(`Stage Galop Bronze Chloé : 300€ espèces`);

  const payStageJules = await mkPayment({
    orderId:`SEED-SGB-JUL-${ts()}`,
    familyId:fam3.id, familyName:fam3.parentName,
    items:[{ activityTitle:"Stage Galop de Bronze", childId:"c1_leclerc", childName:"Jules", activityType:"stage", priceTTC:300, priceHT:ht(300), tva:5.5, stageKey:stageKey1 }],
    totalTTC:300, status:"paid", paidAmount:300, paymentMode:"cheque_vacances",
    date: serverTimestamp(),
  });
  await mkEncaissement({ paymentId:payStageJules, familyId:fam3.id, familyName:fam3.parentName, montant:300, mode:"cheque_vacances", modeLabel:"Chèques Vacances", activityTitle:"Stage Galop Bronze — Jules (2j)" });
  inf(`Stage Galop Bronze Jules : 300€ chèques vacances`);

  // Stage Perfectionnement — payé partiel (acompte 50%)
  const payStagePerfect = await mkPayment({
    orderId:`SEED-SP-LEA-${ts()}`,
    familyId:fam1.id, familyName:fam1.parentName,
    items:[{ activityTitle:"Stage Perfectionnement G3/G4", childId:"c1_martin", childName:"Léa", activityType:"stage", priceTTC:475, priceHT:ht(475), tva:5.5, stageKey:stageKey2 }],
    totalTTC:475, status:"partial", paidAmount:237.5, paymentMode:"cb_terminal",
    date: serverTimestamp(),
    notes:"Acompte 50% — solde à régler au stage",
  });
  await mkEncaissement({ paymentId:payStagePerfect, familyId:fam1.id, familyName:fam1.parentName, montant:237.5, mode:"cb_terminal", modeLabel:"CB (terminal)", activityTitle:"Stage Perfectionnement Léa (acompte 50%)" });
  inf(`Stage Perfectionnement Léa : 237.50€/475€ (acompte)`);

  // Stage Pony Games Emma — pending
  const payPGEmma = await mkPayment({
    orderId:`SEED-PG-EMMa-${ts()}`,
    familyId:fam2.id, familyName:fam2.parentName,
    items:[{ activityTitle:"Stage Pony Games", childId:"c1_dubois", childName:"Emma", activityType:"stage", priceTTC:400, priceHT:ht(400), tva:5.5, stageKey:stageKey3 }],
    totalTTC:400, status:"pending", paidAmount:0, paymentMode:"",
    date: serverTimestamp(),
  });
  inf(`Stage Pony Games Emma : 400€ EN ATTENTE`);

  // Stage Pony Games Manon — pending
  const payPGManon = await mkPayment({
    orderId:`SEED-PG-MAN-${ts()}`,
    familyId:fam4.id, familyName:fam4.parentName,
    items:[{ activityTitle:"Stage Pony Games", childId:"c1_bernard", childName:"Manon", activityType:"stage", priceTTC:400, priceHT:ht(400), tva:5.5, stageKey:stageKey3 }],
    totalTTC:400, status:"pending", paidAmount:0, paymentMode:"",
    date: serverTimestamp(),
  });
  inf(`Stage Pony Games Manon : 400€ EN ATTENTE`);

  // Cours ponctuel Nathan Dubois
  const payNathan = await mkPayment({
    orderId:`SEED-COURS-NAT-${ts()}`,
    familyId:fam2.id, familyName:fam2.parentName,
    items:[{ activityTitle:"Galop 2 — ponctuel", childId:"c2_dubois", childName:"Nathan", activityType:"cours", priceTTC:22, priceHT:ht(22), tva:5.5 }],
    totalTTC:22, status:"paid", paidAmount:22, paymentMode:"pass_sport",
    date: serverTimestamp(),
  });
  await mkEncaissement({ paymentId:payNathan, familyId:fam2.id, familyName:fam2.parentName, montant:22, mode:"pass_sport", modeLabel:"Pass'Sport", activityTitle:"Galop 2 — Nathan ponctuel" });
  inf(`Cours ponctuel Nathan : 22€ Pass'Sport`);

  // Anniversaire poney Chloé — payé
  const payAnnif = await mkPayment({
    orderId:`SEED-ANNIF-${ts()}`,
    familyId:fam1.id, familyName:fam1.parentName,
    items:[{ activityTitle:"Anniversaire Poney — Chloé", childId:"c3_martin", childName:"Chloé", activityType:"anniversaire", priceTTC:180, priceHT:ht(180), tva:5.5 }],
    totalTTC:180, status:"paid", paidAmount:180, paymentMode:"cb_terminal",
    date: serverTimestamp(),
  });
  await mkEncaissement({ paymentId:payAnnif, familyId:fam1.id, familyName:fam1.parentName, montant:180, mode:"cb_terminal", modeLabel:"CB (terminal)", activityTitle:"Anniversaire poney Chloé" });
  inf(`Anniversaire poney Chloé : 180€ CB`);

  // Forfait Manon — 10 échéances, 2 payées
  for (let i = 1; i <= 10; i++) {
    const paidStatus = i <= 2 ? "paid" : "pending";
    const paidAmount = i <= 2 ? 47.5 : 0;
    const payEch = await mkPayment({
      orderId:`SEED-ECH-MANON-${i}-${ts()}`,
      familyId:fam4.id, familyName:fam4.parentName,
      items:[{ activityTitle:`Forfait Galop 4 — Manon (échéance ${i}/10)`, childId:"c1_bernard", childName:"Manon", activityType:"cours", priceTTC:47.5, priceHT:ht(47.5), tva:5.5 }],
      totalTTC:47.5, status:paidStatus, paidAmount, paymentMode: i<=2?"prelevement":"",
      echeancesTotal:10, echeance:i, forfaitRef:forfaitManon,
      date: serverTimestamp(),
    });
    if (i <= 2) await mkEncaissement({ paymentId:payEch, familyId:fam4.id, familyName:fam4.parentName, montant:47.5, mode:"prelevement", modeLabel:"Prélèvement", activityTitle:`Forfait Manon éch ${i}/10` });
  }
  inf(`Forfait Manon : 10 échéances (2 payées, 8 en attente)`);

  ok(`Paiements & encaissements créés`);

  // ═══════════════════════════════════════════════════════════════════
  sec("9. AVOIRS");
  // ═══════════════════════════════════════════════════════════════════

  // Avoir annulation — famille Dubois
  const avoir1 = await mkAvoir({
    familyId:fam2.id, familyName:fam2.parentName,
    type:"avoir", amount:22, usedAmount:0, remainingAmount:22,
    reason:"Annulation cours Galop 2 (Nathan malade)",
    reference:`AV-SEED-DUB-${ts()}`,
    sourceType:"annulation", status:"actif",
    usageHistory:[], expiryDate: addDays(today, 365),
  });
  inf(`Avoir annulation Dubois : 22€`);

  // Avoir trop-perçu — famille Martin
  const avoir2 = await mkAvoir({
    familyId:fam1.id, familyName:fam1.parentName,
    type:"avoir", amount:30, usedAmount:10, remainingAmount:20,
    reason:"Trop-perçu stage Bronze (remise fratrie appliquée après paiement)",
    reference:`AV-SEED-MAR-${ts()}`,
    sourceType:"retrait_prestation", status:"actif",
    usageHistory:[{ date:addDays(today,-5).toISOString(), amount:10, paymentId:"p_seed" }],
    expiryDate: addDays(today, 365),
  });
  inf(`Avoir trop-perçu Martin : 30€ (20€ restants)`);

  ok(`2 avoirs créés`);

  // ═══════════════════════════════════════════════════════════════════
  sec("10. PROGRAMME FIDÉLITÉ");
  // ═══════════════════════════════════════════════════════════════════

  // S'assurer que le programme est activé
  try {
    const settingsSnap = await getDoc(doc(db, "settings", "fidelite"));
    if (!settingsSnap.exists()) {
      await setDoc(doc(db, "settings", "fidelite"), { enabled:true, taux:50, minPoints:500, updatedAt:new Date() });
      ok(`Paramètres fidélité activés (50 pts = 1€, seuil 500 pts)`);
    } else {
      inf(`Paramètres fidélité déjà configurés`);
    }
  } catch(e) {}

  const expiry1an = addDays(today, 365).toISOString();

  // Points famille Martin (dépenses importantes)
  const fidRef1 = doc(db, "fidelite", fam1.id);
  await setDoc(fidRef1, {
    familyId:fam1.id, familyName:fam1.parentName,
    points:1235,
    history:[
      { date:addDays(today,-90).toISOString(), points:475, type:"gain", label:"Forfait Léa Galop 3", expiry:expiry1an, montant:475 },
      { date:addDays(today,-60).toISOString(), points:380, type:"gain", label:"Carte 20 séances famille", expiry:expiry1an, montant:380 },
      { date:addDays(today,-30).toISOString(), points:300, type:"gain", label:"Stage Galop Bronze Chloé", expiry:expiry1an, montant:300 },
      { date:addDays(today,-10).toISOString(), points:180, type:"gain", label:"Anniversaire poney Chloé", expiry:expiry1an, montant:180 },
      { date:addDays(today,-5).toISOString(),  points:-100, type:"conversion", label:"Conversion en avoir (2€)" },
    ],
    _seed:TAG, createdAt:serverTimestamp(), updatedAt:serverTimestamp(),
  });
  created.fidelite.push(fam1.id);
  inf(`Fidélité Martin : 1235 points (→ 24.70€ potentiel)`);

  // Points famille Dubois
  const fidRef2 = doc(db, "fidelite", fam2.id);
  await setDoc(fidRef2, {
    familyId:fam2.id, familyName:fam2.parentName,
    points:422,
    history:[
      { date:addDays(today,-120).toISOString(), points:475, type:"gain", label:"Forfait Emma Galop 4", expiry:expiry1an, montant:475 },
      { date:addDays(today,-45).toISOString(),  points:-100, type:"conversion", label:"Conversion en avoir (2€)" },
      { date:addDays(today,-15).toISOString(),  points:47, type:"gain", label:"Cours ponctuel Nathan", expiry:expiry1an, montant:47 },
    ],
    _seed:TAG, createdAt:serverTimestamp(), updatedAt:serverTimestamp(),
  });
  created.fidelite.push(fam2.id);
  inf(`Fidélité Dubois : 422 points`);

  ok(`Programme fidélité initialisé (2 familles)`);

  // ═══════════════════════════════════════════════════════════════════
  sec("RÉSUMÉ FINAL");
  // ═══════════════════════════════════════════════════════════════════

  const counts = {
    equides:   created.equides.length,
    familles:  created.families.length,
    cartes:    created.cartes.length,
    forfaits:  created.forfaits.length,
    creneaux:  created.creneaux.length,
    payments:  created.payments.length,
    encaiss:   created.encaissements.length,
    avoirs:    created.avoirs.length,
    fidelite:  created.fidelite.length,
  };
  const total = Object.values(counts).reduce((s,n)=>s+n,0);

  console.log(`
${W}${B}  ╔══════════════════════════════════════════════╗
  ║  DONNÉES DE TEST INJECTÉES AVEC SUCCÈS       ║
  ╠══════════════════════════════════════════════╣
  ║  🐴  ${String(counts.equides).padEnd(4)} équidés                           ║
  ║  👨‍👩‍👧  ${String(counts.familles).padEnd(4)} familles (12 cavaliers)           ║
  ║  🎟️   ${String(counts.cartes).padEnd(4)} cartes de séances                  ║
  ║  📅  ${String(counts.forfaits).padEnd(4)} forfaits annuels                   ║
  ║  🗓️   ${String(counts.creneaux).padEnd(4)} créneaux planning                 ║
  ║  💳  ${String(counts.payments).padEnd(4)} paiements                          ║
  ║  🧾  ${String(counts.encaiss).padEnd(4)} encaissements                       ║
  ║  💰  ${String(counts.avoirs).padEnd(4)} avoirs                              ║
  ║  🏆  ${String(counts.fidelite).padEnd(4)} comptes fidélité                   ║
  ╠══════════════════════════════════════════════╣
  ║  TOTAL  ${String(total).padEnd(4)} documents créés               ║
  ╚══════════════════════════════════════════════╝${Z}
`);

  console.log(`${Y}  Pour nettoyer : ${W}node scripts/seed.mjs --clean${Z}\n`);
  process.exit(0);
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes("--clean")) {
  cleanSeedData();
} else {
  seed().catch(e => { console.error(R, e, Z); process.exit(1); });
}
