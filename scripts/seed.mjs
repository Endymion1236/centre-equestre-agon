/**
 * SEED — CENTRE ÉQUESTRE AGON-COUTAINVILLE
 *
 * node scripts/seed.mjs          → créer les données de test
 * node scripts/seed.mjs --purge  → tout supprimer en 1 clic
 * node scripts/seed.mjs --status → voir ce qui existe
 */

import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, addDoc, getDocs,
  deleteDoc, query, where, writeBatch
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
const db  = getFirestore(app);

const G = "\x1b[32m\u2705", Z = "\x1b[0m", B = "\x1b[34m", W = "\x1b[1m";
const C = "\x1b[36m", Y = "\x1b[33m\u26a0\ufe0f ";
const SEED_TAG = "SEED_2026";

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function nextWeekday(d, t) {
  const r = new Date(d);
  const cur = (r.getDay()+6)%7;
  const diff = (t-cur+7)%7 || 7;
  r.setDate(r.getDate()+diff);
  return r;
}

const PRENOMS = ["Emma","Lucas","Léa","Noah","Chloé","Nathan","Inès","Tom","Camille","Jules",
  "Alice","Hugo","Manon","Théo","Juliette","Louis","Zoé","Enzo","Lucie","Mathis",
  "Elisa","Paul","Clara","Maxime","Lola","Baptiste","Mia","Arthur","Eva","Romain",
  "Ambre","Victor","Sarah","Antoine","Lisa","Clément","Jade","Florian","Nina","Pierre",
  "Maëva","Simon","Eliot","Alexis","Louna","Raphaël","Célia","Thomas","Lilou","Gabriel"];
const NOMS = ["Martin","Bernard","Thomas","Petit","Robert","Richard","Durand","Dubois","Moreau","Laurent",
  "Simon","Michel","Lefebvre","Leroy","Roux","David","Bertrand","Morel","Fournier","Girard",
  "Bonnet","Dupont","Lambert","Fontaine","Rousseau","Vincent","Muller","Lecomte","Faure","André",
  "Mercier","Blanc","Guérin","Boyer","Garnier","Chevalier","François","Legrand","Gauthier","Garcia",
  "Perrin","Robin","Clément","Morin","Nicolas","Henry","Roussel","Mathieu","Gautier","Masson"];
const GALOPS = ["—","Bronze","Argent","Or","G1","G2","G3","G4","G5","G6"];
const EQUIDES = ["Gucci","Rocky","Candy","Star","Pinto","Caramel","Flash","Bijou","Tornado","Princesse",
  "Diego","Luna","Éclair","Papillon","Sultan","Cocotte","Noisette","Mistral","Aurore","Pixel"];

const PERIODES_COURS = [
  { start:"2025-09-01", end:"2025-10-17" },
  { start:"2025-11-03", end:"2025-12-19" },
  { start:"2026-01-05", end:"2026-02-13" },
  { start:"2026-03-02", end:"2026-04-10" },
  { start:"2026-04-27", end:"2026-06-30" },
];

const VACANCES = [
  { label:"Toussaint",   start:"2025-10-20", end:"2025-10-31", p1:175, p2:300, p3:400, p4:475 },
  { label:"Noël",        start:"2025-12-22", end:"2026-01-02", p1:175, p2:300, p3:400, p4:475 },
  { label:"Hiver",       start:"2026-02-16", end:"2026-02-27", p1:195, p2:330, p3:440, p4:525 },
  { label:"Pâques",      start:"2026-04-13", end:"2026-04-24", p1:195, p2:330, p3:440, p4:525 },
  { label:"Été juillet", start:"2026-07-06", end:"2026-07-24", p1:195, p2:330, p3:440, p4:525 },
  { label:"Été août",    start:"2026-08-03", end:"2026-08-21", p1:195, p2:330, p3:440, p4:525 },
];

const ACT_DEFS = [
  {title:"Galop d'Or",           type:"cours",             ageMin:6,  ageMax:12, maxPlaces:8,  priceHT:20.85, tvaTaux:5.5, description:"Cours collectif débutants"},
  {title:"Galop de Bronze",      type:"stage",             ageMin:7,  ageMax:14, maxPlaces:8,  priceHT:165.88,tvaTaux:5.5, description:"Stage galop de bronze"},
  {title:"Galop d'Argent",       type:"cours",             ageMin:8,  ageMax:15, maxPlaces:8,  priceHT:22.75, tvaTaux:5.5, description:"Cours collectif intermédiaires"},
  {title:"Cours Ados",           type:"cours",             ageMin:12, ageMax:18, maxPlaces:8,  priceHT:24.64, tvaTaux:5.5, description:"Cours ados"},
  {title:"Cours Adultes",        type:"cours",             ageMin:18, ageMax:99, maxPlaces:6,  priceHT:26.54, tvaTaux:5.5, description:"Cours adultes"},
  {title:"Pony Games",           type:"cours",             ageMin:5,  ageMax:12, maxPlaces:6,  priceHT:22.75, tvaTaux:5.5, description:"Jeux poneys"},
  {title:"Balade découverte",    type:"balade",            ageMin:8,  ageMax:99, maxPlaces:8,  priceHT:28.44, tvaTaux:5.5, description:"Balade 1h"},
  {title:"Grande balade",        type:"balade",            ageMin:12, ageMax:99, maxPlaces:6,  priceHT:37.92, tvaTaux:5.5, description:"Balade 2h"},
  {title:"Pony ride",            type:"ponyride",          ageMin:2,  ageMax:6,  maxPlaces:10, priceHT:9.48,  tvaTaux:5.5, description:"Poney en longe"},
  {title:"Anniversaire poney",   type:"anniversaire",      ageMin:4,  ageMax:10, maxPlaces:12, priceHT:170.05,tvaTaux:5.5, description:"Anniversaire à thème"},
  {title:"Cours particulier",    type:"cours_particulier", ageMin:6,  ageMax:99, maxPlaces:1,  priceHT:56.87, tvaTaux:5.5, description:"Cours individuel"},
];

// ── Générateurs ───────────────────────────────────────────────────────────────

function genFamilles(n=50) {
  const used = new Set();
  return Array.from({length:n}, (_,i) => {
    let nom; do { nom = rand(NOMS); } while(used.has(nom)); used.add(nom);
    const nb = [1,1,1,2,2,2,3,3,4][randInt(0,8)];
    const children = Array.from({length:nb}, (_,j) => {
      const age = randInt(4,18);
      return {
        id:`c_${i}_${j}_${Date.now()}`,
        firstName: rand(PRENOMS),
        lastName: nom,
        birthDate:`${new Date().getFullYear()-age}-${String(randInt(1,12)).padStart(2,"0")}-${String(randInt(1,28)).padStart(2,"0")}`,
        galopLevel: age<6?"—":GALOPS[Math.min(Math.floor(age/2),GALOPS.length-1)],
        sanitaryForm: Math.random()>0.3 ? {
          allergies:rand(["Aucune","Aucune","Arachides","Pollen","Lactose"]),
          emergencyContactName:`Parent ${nom}`,
          emergencyContactPhone:`06${String(randInt(10000000,99999999))}`,
          parentalAuthorization:true,
          updatedAt:new Date().toISOString(),
        } : null,
      };
    });
    return { parentName:`Famille ${nom}`, parentEmail:`famille.${nom.toLowerCase()}@seed-test.fr`,
      parentPhone:`06${String(randInt(10000000,99999999))}`,
      authProvider:Math.random()>0.5?"google":"facebook",
      children, _seed:SEED_TAG };
  });
}

function genEquides() {
  return EQUIDES.map((name,i) => ({
    name, type:i<12?"poney":"cheval", sex:rand(["hongre","jument","étalon"]),
    birthYear:randInt(2010,2020), race:rand(["Welsh","Shetland","Connemara","Quarter Horse","Fjord"]),
    robe:rand(["Alezan","Bai","Gris","Noir","Isabelle","Pie"]),
    sire:`SIRE${String(i+1).padStart(6,"0")}`, status:"actif",
    category:i<12?"poney_club":"cheval_club", _seed:SEED_TAG,
  }));
}

function genCours() {
  const list = [];
  const slots = [
    {title:"Galop d'Or",    type:"cours",             day:2,s:"10:00",e:"11:00",mon:"Emmeline",max:8, p:22},
    {title:"Galop d'Or",    type:"cours",             day:3,s:"14:00",e:"15:00",mon:"Emmeline",max:8, p:22},
    {title:"Galop d'Argent",type:"cours",             day:2,s:"11:00",e:"12:00",mon:"Emmeline",max:8, p:24},
    {title:"Galop d'Argent",type:"cours",             day:4,s:"16:00",e:"17:00",mon:"Sophie",  max:8, p:24},
    {title:"Cours Ados",    type:"cours",             day:3,s:"17:00",e:"18:00",mon:"Julien",  max:8, p:26},
    {title:"Cours Adultes", type:"cours",             day:5,s:"09:00",e:"10:00",mon:"Nicolas", max:6, p:28},
    {title:"Pony Games",    type:"cours",             day:6,s:"10:00",e:"11:00",mon:"Emmeline",max:6, p:24},
    {title:"Cours part.",   type:"cours_particulier", day:1,s:"09:00",e:"10:00",mon:"Nicolas", max:1, p:60},
    {title:"Balade déc.",   type:"balade",            day:6,s:"14:00",e:"15:00",mon:"Sophie",  max:8, p:30},
    {title:"Grande balade", type:"balade",            day:0,s:"09:30",e:"11:30",mon:"Nicolas", max:6, p:40},
    {title:"Pony ride",     type:"ponyride",          day:2,s:"13:30",e:"15:30",mon:"Emmeline",max:10,p:10},
  ];
  for (const per of PERIODES_COURS) {
    for (const slot of slots) {
      let cur = nextWeekday(new Date(per.start), slot.day);
      const end = new Date(per.end);
      while (cur <= end) {
        list.push({
          activityTitle:slot.title, activityType:slot.type,
          date:fmtDate(cur), startTime:slot.s, endTime:slot.e,
          monitor:slot.mon, maxPlaces:slot.max, enrolledCount:0, enrolled:[],
          priceTTC:slot.p, priceHT:Math.round(slot.p/1.055*100)/100, tvaTaux:5.5,
          status:new Date(fmtDate(cur))<new Date()?"closed":"planned", _seed:SEED_TAG,
        });
        cur = addDays(cur,7);
      }
    }
  }
  return list;
}

function genStages() {
  const list = [];
  for (const vac of VACANCES) {
    const types = [
      {title:`Stage Galop d'Or — ${vac.label}`,   mon:"Emmeline",max:10},
      {title:`Stage Galop Argent — ${vac.label}`, mon:"Sophie",  max:8 },
      {title:`Stage Ados — ${vac.label}`,         mon:"Julien",  max:8 },
    ];
    for (const t of types) {
      let wk = nextWeekday(new Date(vac.start),0);
      const end = new Date(vac.end);
      while (wk <= end) {
        for (let d=0;d<5;d++) {
          const day = addDays(wk,d);
          if (day>end) break;
          list.push({
            activityTitle:t.title, activityType:"stage",
            date:fmtDate(day), startTime:"10:00", endTime:"12:00",
            monitor:t.mon, maxPlaces:t.max, enrolledCount:0, enrolled:[],
            priceTTC:vac.p1, priceHT:Math.round(vac.p1/1.055*100)/100,
            price1day:vac.p1, price2days:vac.p2, price3days:vac.p3, price4days:vac.p4,
            tvaTaux:5.5, stageVacances:vac.label,
            status:new Date(fmtDate(day))<new Date()?"closed":"planned", _seed:SEED_TAG,
          });
        }
        wk = addDays(wk,7);
      }
    }
  }
  const annivDates = ["2025-10-04","2025-11-08","2025-12-06","2026-01-17","2026-02-07","2026-03-14","2026-04-04","2026-05-09","2026-06-06"];
  for (const d of annivDates) {
    list.push({
      activityTitle:"Anniversaire poney", activityType:"anniversaire",
      date:d, startTime:"14:00", endTime:"17:00",
      monitor:"Emmeline", maxPlaces:12, enrolledCount:0, enrolled:[],
      priceTTC:179.38, priceHT:170.03, tvaTaux:5.5,
      status:new Date(d)<new Date()?"closed":"planned", _seed:SEED_TAG,
    });
  }
  return list;
}

function genCartes(fams, famIds) {
  const list = [];
  const dateDebut = fmtDate(new Date());
  const df = new Date(); df.setMonth(df.getMonth()+6);
  const dateFin = fmtDate(df);
  for (let i=0;i<fams.length;i++) {
    if (Math.random()<0.4) {
      const child = rand(fams[i].children);
      const rem = randInt(1,10);
      list.push({ familyId:famIds[i], familyName:fams[i].parentName,
        childId:child.id, childName:child.firstName, activityType:rand(["cours","balade"]),
        totalSessions:10, usedSessions:10-rem, remainingSessions:rem,
        priceTTC:200, priceHT:189.57, tvaTaux:5.5,
        status:rem>0?"active":"used", dateDebut, dateFin, history:[], _seed:SEED_TAG });
    }
    if (Math.random()<0.15 && fams[i].children.length>1) {
      list.push({ familyId:famIds[i], familyName:fams[i].parentName,
        childId:null, childName:"Toute la famille", familiale:true, activityType:"cours",
        totalSessions:20, usedSessions:randInt(0,10), remainingSessions:randInt(5,20),
        priceTTC:380, priceHT:360.19, tvaTaux:5.5,
        status:"active", dateDebut, dateFin, history:[], _seed:SEED_TAG });
    }
  }
  return list;
}

function genPaiements(fams, famIds, creneaux) {
  const pays=[], encs=[];
  const cours  = creneaux.filter(c=>c.activityType==="cours"&&c.status==="planned").slice(0,20);
  const stages = creneaux.filter(c=>c.activityType==="stage"&&c.status==="planned").slice(0,15);
  const balades= creneaux.filter(c=>c.activityType==="balade"&&c.status==="planned").slice(0,10);
  for (let fi=0;fi<fams.length;fi++) {
    const fam=fams[fi]; const fid=famIds[fi];
    for (const child of fam.children) {
      const ts = Date.now()+Math.random()*999;
      if (Math.random()<0.6 && cours.length) {
        const cr=rand(cours); const p=cr.priceTTC||22;
        const st=rand(["paid","paid","paid","pending"]);
        pays.push({ orderId:`CMD-${ts}`, familyId:fid, familyName:fam.parentName,
          items:[{activityTitle:cr.activityTitle,childId:child.id,childName:child.firstName,activityType:"cours",priceTTC:p,priceHT:Math.round(p/1.055*100)/100,tva:5.5}],
          totalTTC:p, status:st, paidAmount:st==="paid"?p:0,
          paymentMode:st==="paid"?rand(["cb_terminal","cheque","especes"]):"",
          _seed:SEED_TAG, date:new Date().toISOString() });
        if (st==="paid") encs.push({ familyId:fid, familyName:fam.parentName,
          montant:p, mode:rand(["cb_terminal","cheque","especes"]),
          activityTitle:cr.activityTitle, _seed:SEED_TAG, date:new Date().toISOString() });
      }
      if (Math.random()<0.3 && stages.length) {
        const cr=rand(stages); const p=cr.price1day||175;
        const st=rand(["paid","paid","pending"]);
        pays.push({ orderId:`STG-${ts}`, familyId:fid, familyName:fam.parentName,
          items:[{activityTitle:cr.activityTitle,childId:child.id,childName:child.firstName,activityType:"stage",priceTTC:p,priceHT:Math.round(p/1.055*100)/100,tva:5.5}],
          totalTTC:p, status:st, paidAmount:st==="paid"?p:0,
          _seed:SEED_TAG, date:new Date().toISOString() });
      }
      if (Math.random()<0.2 && balades.length) {
        const cr=rand(balades); const p=cr.priceTTC||30;
        pays.push({ orderId:`BAL-${ts}`, familyId:fid, familyName:fam.parentName,
          items:[{activityTitle:cr.activityTitle,childId:child.id,childName:child.firstName,activityType:"balade",priceTTC:p,priceHT:Math.round(p/1.055*100)/100,tva:5.5}],
          totalTTC:p, status:"paid", paidAmount:p,
          paymentMode:rand(["cb_terminal","cheque","especes"]),
          _seed:SEED_TAG, date:new Date().toISOString() });
        encs.push({ familyId:fid, familyName:fam.parentName,
          montant:p, mode:rand(["cb_terminal","cheque","especes"]),
          activityTitle:cr.activityTitle, _seed:SEED_TAG, date:new Date().toISOString() });
      }
    }
  }
  return {pays,encs};
}

function genAvoirs(fams, famIds) {
  return fams.map((fam,i) => Math.random()<0.15 ? {
    familyId:famIds[i], familyName:fam.parentName, type:"avoir",
    amount:rand([22,30,44,50,175]), usedAmount:0, remainingAmount:rand([22,30,44,50,175]),
    reason:rand(["Annulation stage","Cours annulé","Avoir vacances"]),
    reference:`AV-SEED-${i}-${Date.now()}`, sourceType:"annulation",
    status:"actif", usageHistory:[], _seed:SEED_TAG,
  } : null).filter(Boolean);
}

// ── Purge ─────────────────────────────────────────────────────────────────────
async function purge() {
  console.log(`\n${B}${W}PURGE DES DONNEES DE SEED${Z}\n`);
  const cols = ["families","creneaux","payments","encaissements","cartes","avoirs",
    "equides","activities","reservations","forfaits","passages","fidelite","bonsRecup","soins","rdv_pro"];
  let total=0;
  for (const col of cols) {
    try {
      const snap = await getDocs(query(collection(db,col),where("_seed","==",SEED_TAG)));
      for (let i=0;i<snap.docs.length;i+=400) {
        const batch=writeBatch(db);
        snap.docs.slice(i,i+400).forEach(d=>batch.delete(d.ref));
        await batch.commit();
      }
      if (snap.size>0) console.log(`  ${G} ${col} : ${snap.size} supprime(s)${Z}`);
      total+=snap.size;
    } catch(e) { console.log(`  ${Y} ${col} ignore${Z}`); }
  }
  console.log(`\n${G}${W} Purge terminee : ${total} documents supprimes${Z}\n`);
  process.exit(0);
}

// ── Status ────────────────────────────────────────────────────────────────────
async function status() {
  console.log(`\n${B}${W}DONNEES DE SEED${Z}\n`);
  let total=0;
  for (const col of ["families","creneaux","payments","encaissements","cartes","avoirs","equides","activities"]) {
    try {
      const snap=await getDocs(query(collection(db,col),where("_seed","==",SEED_TAG)));
      console.log(`  ${C}${col.padEnd(20)}${Z}: ${snap.size}`);
      total+=snap.size;
    } catch(e) { console.log(`  ${Y}${col.padEnd(20)}: inaccessible${Z}`); }
  }
  console.log(`\n  Total : ${total} documents de seed\n`);
  process.exit(0);
}

// ── Seed principal ────────────────────────────────────────────────────────────
async function seed() {
  console.log(`\n${B}${W}`);
  console.log(`╔══════════════════════════════════════════════════════════╗`);
  console.log(`║   SEED — CENTRE EQUESTRE AGON-COUTAINVILLE              ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝${Z}\n`);

  let total=0;

  process.stdout.write(`${C}Activites...${Z} `);
  for (const a of ACT_DEFS) { await addDoc(collection(db,"activities"),{...a,_seed:SEED_TAG}); process.stdout.write("."); }
  console.log(` ${G} ${ACT_DEFS.length}`); total+=ACT_DEFS.length;

  process.stdout.write(`${C}Equides...${Z} `);
  const eqs=genEquides();
  for (const e of eqs) { await addDoc(collection(db,"equides"),e); process.stdout.write("."); }
  console.log(` ${G} ${eqs.length}`); total+=eqs.length;

  process.stdout.write(`${C}Familles (50)...${Z} `);
  const fams=genFamilles(50); const famIds=[];
  for (const f of fams) { const r=await addDoc(collection(db,"families"),f); famIds.push(r.id); process.stdout.write("."); }
  console.log(` ${G} ${fams.length} familles · ${fams.reduce((s,f)=>s+f.children.length,0)} cavaliers`); total+=fams.length;

  process.stdout.write(`${C}Cours reguliers...${Z} `);
  const cours=genCours();
  for (let i=0;i<cours.length;i++) { await addDoc(collection(db,"creneaux"),cours[i]); if(i%20===0)process.stdout.write("."); }
  console.log(` ${G} ${cours.length}`); total+=cours.length;

  process.stdout.write(`${C}Stages vacances...${Z} `);
  const stages=genStages();
  for (let i=0;i<stages.length;i++) { await addDoc(collection(db,"creneaux"),stages[i]); if(i%10===0)process.stdout.write("."); }
  console.log(` ${G} ${stages.length}`); total+=stages.length;

  process.stdout.write(`${C}Cartes...${Z} `);
  const cartes=genCartes(fams,famIds);
  for (const c of cartes) { await addDoc(collection(db,"cartes"),c); process.stdout.write("."); }
  console.log(` ${G} ${cartes.length}`); total+=cartes.length;

  process.stdout.write(`${C}Paiements...${Z} `);
  const {pays,encs}=genPaiements(fams,famIds,[...cours,...stages]);
  for (let i=0;i<pays.length;i++) { await addDoc(collection(db,"payments"),pays[i]); if(i%10===0)process.stdout.write("."); }
  for (const e of encs) await addDoc(collection(db,"encaissements"),e);
  console.log(` ${G} ${pays.length} paiements · ${encs.length} encaissements`); total+=pays.length+encs.length;

  process.stdout.write(`${C}Avoirs...${Z} `);
  const avs=genAvoirs(fams,famIds);
  for (const a of avs) { await addDoc(collection(db,"avoirs"),a); process.stdout.write("."); }
  console.log(` ${G} ${avs.length}`); total+=avs.length;

  console.log(`\n${B}${W}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${Z}`);
  console.log(`${G}${W} SEED TERMINE — ${total} documents crees${Z}`);
  console.log(`${B}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${Z}`);
  console.log(`\n  ${C}Voir l'etat :${Z}  node scripts/seed.mjs --status`);
  console.log(`  ${C}Tout effacer :${Z} node scripts/seed.mjs --purge\n`);
  process.exit(0);
}

const arg = process.argv[2];
if (arg==="--purge") purge();
else if (arg==="--status") status();
else seed();
