/**
 * Générateur de données de test — Rapprochement bancaire
 * 
 * Crée 300 encaissements (10/jour × 30 jours de mars 2026)
 * + un CSV bancaire format Crédit Agricole correspondant
 * 
 * Usage : node test-data/generate-test-rapprochement.mjs
 * 
 * Répartition par jour :
 * - 6 CB terminal (regroupées en 1 remise carte le lendemain)
 * - 2 virements (apparaissent unitairement le même jour ou J+1)
 * - 2 chèques (remise groupée en fin de mois)
 * 
 * Le CSV contient aussi des "bruits" : commissions, achats perso, etc.
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { writeFileSync } from "fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const pk = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const app = initializeApp({
  credential: cert({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: pk,
  }),
});
const db = getFirestore(app);

// ── Données réalistes ──
const FAMILLES = [
  "Dupont", "Martin", "Lefebvre", "Brestaz", "Durand", "Leroy", "Moreau",
  "Simon", "Laurent", "Michel", "Garcia", "Thomas", "Robert", "Richard",
  "Petit", "Bernard", "Dubois", "Lemoine", "Roux", "David",
  "Bertrand", "Morel", "Girard", "Andre", "Mercier", "Blanchard",
  "Guerin", "Boyer", "Garnier", "Faure",
];

const ACTIVITES = [
  "Cours Galop d'Or", "Cours Baby Poney", "Cours Galop d'Argent",
  "Balade forêt", "Balade plage", "Stage Pâques", "Stage Bronze",
  "Pony Games", "Cours particulier", "Voltige",
];

const PRIX_CB = [22, 25, 26, 28, 30, 35, 40, 45, 50, 55, 60];
const PRIX_VIR = [60, 80, 100, 120, 150, 175, 200, 250];
const PRIX_CHQ = [45, 60, 80, 100, 120, 150, 175, 200];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function round2(n) { return Math.round(n * 100) / 100; }

async function generate() {
  console.log("🧪 Génération de 300 encaissements de test (mars 2026)...\n");

  const allEncaissements = [];
  const dailyCBTotals = {}; // date → total CB du jour
  const allCheques = [];

  // ── Générer 30 jours × 10 encaissements ──
  for (let day = 1; day <= 30; day++) {
    const dateStr = `2026-03-${String(day).padStart(2, "0")}`;
    const dateFR = `${String(day).padStart(2, "0")}/03/2026`;
    let dayCBTotal = 0;

    for (let i = 0; i < 10; i++) {
      const famille = FAMILLES[(day * 10 + i) % FAMILLES.length];
      const activite = pick(ACTIVITES);
      let mode, montant;

      if (i < 6) {
        // 6 CB par jour
        mode = "cb_terminal";
        montant = pick(PRIX_CB);
        dayCBTotal += montant;
      } else if (i < 8) {
        // 2 virements par jour
        mode = "virement";
        montant = pick(PRIX_VIR);
      } else {
        // 2 chèques par jour
        mode = "cheque";
        montant = pick(PRIX_CHQ);
        allCheques.push({ date: dateStr, dateFR, famille, montant, activite });
      }

      allEncaissements.push({
        familyId: `test-${famille.toLowerCase()}-${day}-${i}`,
        familyName: famille,
        montant,
        mode,
        modeLabel: mode === "cb_terminal" ? "CB Terminal" : mode === "virement" ? "Virement" : "Chèque",
        ref: `TEST-${dateStr}-${String(i).padStart(2, "0")}`,
        activityTitle: activite,
        date: Timestamp.fromDate(new Date(`${dateStr}T${String(9 + i).padStart(2, "0")}:00:00`)),
      });
    }

    dailyCBTotals[dateStr] = round2(dayCBTotal);
  }

  // ── Injecter dans Firestore ──
  console.log("📥 Injection dans Firestore...");
  let count = 0;
  const batch_size = 50;
  for (let i = 0; i < allEncaissements.length; i += batch_size) {
    const chunk = allEncaissements.slice(i, i + batch_size);
    const batch = db.batch();
    for (const enc of chunk) {
      const ref = db.collection("encaissements").doc();
      batch.set(ref, enc);
    }
    await batch.commit();
    count += chunk.length;
    process.stdout.write(`\r  ${count}/${allEncaissements.length} encaissements créés`);
  }
  console.log("\n");

  // ── Générer le CSV bancaire Crédit Agricole ──
  console.log("📄 Génération du CSV bancaire...");

  const csvLines = [];

  // En-tête CA
  csvLines.push("");
  csvLines.push("T\u00e9l\u00e9chargement du 31/03/2026;");
  csvLines.push("");
  csvLines.push("CENTRE EQUESTRE PONEY CLUB");
  csvLines.push("Compte courant carte n\u00b0 00135393432;");
  csvLines.push("Solde au 31/03/2026 12 345,67 ");
  csvLines.push("");
  csvLines.push("Liste des op\u00e9rations du compte entre le 01/03/2026 et le 31/03/2026;");
  csvLines.push("");
  csvLines.push("Date;Libell\u00e9;D\u00e9bit euros;Cr\u00e9dit euros;");

  // Opérations en ordre chronologique inversé (comme le CA)
  const operations = [];

  // 1. Remises carte : J+1 pour chaque jour
  for (let day = 1; day <= 30; day++) {
    const dateStr = `2026-03-${String(day).padStart(2, "0")}`;
    const cbTotal = dailyCBTotals[dateStr];
    if (!cbTotal) continue;

    // La remise carte apparaît le lendemain
    const remiseDay = day + 1;
    if (remiseDay > 31) continue;
    const remiseDateFR = `${String(remiseDay).padStart(2, "0")}/03/2026`;
    const remiseDateISO = `2026-03-${String(remiseDay).padStart(2, "0")}`;
    const carteNum = `${1535100 + day}`;

    operations.push({
      dateISO: remiseDateISO,
      dateFR: remiseDateFR,
      label: `REMISE CARTE            \nCARTE ${carteNum} 001 ${300000 + day * 100} ${String(day).padStart(2, "0")}/03  \n\n\n`,
      debit: "",
      credit: cbTotal.toFixed(2).replace(".", ","),
      sortKey: remiseDateISO + "a",
    });

    // Commission associée (0.3% environ)
    const commission = round2(cbTotal * 0.003);
    operations.push({
      dateISO: remiseDateISO,
      dateFR: remiseDateFR,
      label: `COMMISSION              \nCARTE ${carteNum} 001 ${300000 + day * 100} ${String(day).padStart(2, "0")}/03  \n\n\n`,
      debit: commission.toFixed(2).replace(".", ","),
      credit: "",
      sortKey: remiseDateISO + "b",
    });
  }

  // 2. Virements : apparaissent le même jour ou J+1
  const virEncaissements = allEncaissements.filter(e => e.mode === "virement");
  for (const vir of virEncaissements) {
    const d = vir.date.toDate();
    // Virement apparaît J+0 ou J+1 aléatoirement
    const offset = Math.random() > 0.5 ? 1 : 0;
    const bankDate = new Date(d);
    bankDate.setDate(bankDate.getDate() + offset);
    if (bankDate.getMonth() !== 2) continue; // rester en mars

    const dateFR = `${String(bankDate.getDate()).padStart(2, "0")}/03/2026`;
    const dateISO = `2026-03-${String(bankDate.getDate()).padStart(2, "0")}`;

    operations.push({
      dateISO,
      dateFR,
      label: `VIREMENT EN VOTRE FAVEUR\nVIR INST de ${vir.familyName.toUpperCase()} ${vir.activityTitle} \n\n\n`,
      debit: "",
      credit: vir.montant.toFixed(2).replace(".", ","),
      sortKey: dateISO + "c",
    });
  }

  // 3. Remise chèques : groupée en fin de mois
  const totalCheques = round2(allCheques.reduce((s, c) => s + c.montant, 0));
  operations.push({
    dateISO: "2026-03-28",
    dateFR: "28/03/2026",
    label: `REMISE CHEQUES          \nREMISE DE ${allCheques.length} CHEQUE(S) REF 7326084  \n\n\n`,
    debit: "",
    credit: totalCheques.toFixed(2).replace(".", ","),
    sortKey: "2026-03-28d",
  });

  // 4. Bruit : quelques dépenses perso
  const bruits = [
    { dateISO: "2026-03-05", dateFR: "05/03/2026", label: "PAIEMENT PAR CARTE      \nX4673 HELLOFRESH FR 14 RUE 04/03  \n\n\n", debit: "59,99", credit: "" },
    { dateISO: "2026-03-10", dateFR: "10/03/2026", label: "PAIEMENT PAR CARTE      \nX4673 Action 4307 Coutance 09/03  \n\n\n", debit: "23,45", credit: "" },
    { dateISO: "2026-03-15", dateFR: "15/03/2026", label: "PRELEVEMENT             \nEDF ELECTRICITE REF XXXX  \n\n\n", debit: "187,50", credit: "" },
    { dateISO: "2026-03-20", dateFR: "20/03/2026", label: "PAIEMENT PAR CARTE      \nX4673 GAMM VERT COUVILLE 19/03  \n\n\n", debit: "145,80", credit: "" },
    { dateISO: "2026-03-25", dateFR: "25/03/2026", label: "PAIEMENT PAR CARTE      \nX4673 Pharm de Coutances 24/03  \n\n\n", debit: "32,90", credit: "" },
  ];
  for (const b of bruits) {
    operations.push({ ...b, sortKey: b.dateISO + "z" });
  }

  // Trier par date décroissante (format CA)
  operations.sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  // Écrire les lignes CSV
  for (const op of operations) {
    csvLines.push(`${op.dateFR};"${op.label}";${op.debit};${op.credit};`);
  }

  const csvContent = csvLines.join("\n");
  writeFileSync("test-data/CA_test_complet.csv", csvContent, { encoding: "latin1" });

  // ── Résumé ──
  const totalCB = round2(Object.values(dailyCBTotals).reduce((s, v) => s + v, 0));
  const totalVir = round2(virEncaissements.reduce((s, e) => s + e.montant, 0));
  const nbCB = allEncaissements.filter(e => e.mode === "cb_terminal").length;
  const nbVir = virEncaissements.length;
  const nbChq = allCheques.length;

  console.log("\n✅ Données de test générées !\n");
  console.log("📊 Résumé des encaissements :");
  console.log(`   ${nbCB} CB terminal → ${totalCB.toFixed(2)}€ (30 remises carte dans le CSV)`);
  console.log(`   ${nbVir} virements → ${totalVir.toFixed(2)}€ (unitaires dans le CSV)`);
  console.log(`   ${nbChq} chèques → ${totalCheques.toFixed(2)}€ (1 remise groupée dans le CSV)`);
  console.log(`   Total : ${round2(totalCB + totalVir + totalCheques).toFixed(2)}€`);
  console.log("");
  console.log("📄 CSV bancaire : test-data/CA_test_complet.csv");
  console.log("   → Contient aussi 5 dépenses perso (filtrées automatiquement)");
  console.log("   → Contient 30 commissions CB (filtrées automatiquement)");
  console.log("");
  console.log("🧪 Pour tester :");
  console.log("   1. Ouvre Comptabilité > Rapprochement");
  console.log("   2. Sélectionne la période mars 2026");
  console.log("   3. Importe CA_test_complet.csv");
  console.log("   4. Vérifie que les remises CB, virements et chèques sont rapprochés");
  console.log("");
  console.log("🧹 Pour nettoyer : node test-data/generate-test-rapprochement.mjs --clean");
}

async function clean() {
  console.log("🧹 Nettoyage des encaissements de test...");
  const snap = await db.collection("encaissements").where("ref", ">=", "TEST-").where("ref", "<=", "TEST-~").get();
  console.log(`   ${snap.size} encaissements de test trouvés`);
  
  const batchSize = 500;
  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += batchSize) {
    const batch = db.batch();
    const chunk = snap.docs.slice(i, i + batchSize);
    for (const doc of chunk) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    deleted += chunk.length;
    process.stdout.write(`\r   ${deleted}/${snap.size} supprimés`);
  }
  console.log("\n✅ Nettoyage terminé !");
}

const isClean = process.argv.includes("--clean");
(isClean ? clean() : generate()).catch(console.error);
