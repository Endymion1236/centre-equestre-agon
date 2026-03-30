/**
 * Script de test rapprochement bancaire
 * 
 * Crée 4 encaissements dans Firestore pour tester le rapprochement
 * avec le CSV Crédit Agricole (test-data/CA_test_rapprochement.csv)
 * 
 * Usage : npx tsx test-data/seed-test-rapprochement.ts
 * 
 * Scénario :
 * - 25/03 : Dupont 45€ CB → remise carte 45€ le 26/03
 * - 26/03 : Martin 30€ CB + Lefebvre 25€ CB → remise carte 55€ le 27/03
 * - 27/03 : Brestaz 60€ virement → virement reçu 60€ le 27/03
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const app = initializeApp({
  credential: cert({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore(app);

const encaissements = [
  {
    familyId: "test-dupont",
    familyName: "Dupont",
    montant: 45,
    mode: "cb_terminal",
    modeLabel: "CB Terminal",
    ref: "TEST-ENC-001",
    activityTitle: "Cours Galop d'Or",
    date: Timestamp.fromDate(new Date("2026-03-25T14:00:00")),
  },
  {
    familyId: "test-martin",
    familyName: "Martin",
    montant: 30,
    mode: "cb_terminal",
    modeLabel: "CB Terminal",
    ref: "TEST-ENC-002",
    activityTitle: "Balade forêt",
    date: Timestamp.fromDate(new Date("2026-03-26T10:00:00")),
  },
  {
    familyId: "test-lefebvre",
    familyName: "Lefebvre",
    montant: 25,
    mode: "cb_terminal",
    modeLabel: "CB Terminal",
    ref: "TEST-ENC-003",
    activityTitle: "Cours Baby Poney",
    date: Timestamp.fromDate(new Date("2026-03-26T15:00:00")),
  },
  {
    familyId: "test-brestaz",
    familyName: "Brestaz",
    montant: 60,
    mode: "virement",
    modeLabel: "Virement",
    ref: "TEST-ENC-004",
    activityTitle: "Stage Pâques",
    date: Timestamp.fromDate(new Date("2026-03-27T09:00:00")),
  },
];

async function seed() {
  console.log("🧪 Injection des 4 encaissements de test...\n");

  for (const enc of encaissements) {
    const ref = await db.collection("encaissements").add(enc);
    console.log(`  ✅ ${enc.date.toDate().toLocaleDateString("fr-FR")} | ${enc.familyName.padEnd(10)} | ${enc.montant.toFixed(2).padStart(7)}€ | ${enc.mode.padEnd(12)} | ${enc.activityTitle} → ${ref.id}`);
  }

  console.log("\n📋 Résumé du test :");
  console.log("   CSV bancaire : test-data/CA_test_rapprochement.csv");
  console.log("   Période comptabilité : mars 2026");
  console.log("");
  console.log("   Résultat attendu après import CSV :");
  console.log("   - Remise carte 45€ (26/03) → Dupont 45€ (25/03) ✅ match exact");
  console.log("   - Remise carte 55€ (27/03) → Martin 30€ + Lefebvre 25€ (26/03) ✅ agrégat CB");
  console.log("   - Virement 60€ (27/03) → Brestaz 60€ (27/03) ✅ match virement");
  console.log("   - Commissions et paiements perso → filtrés (pas affichés)");
  console.log("");
  console.log("✅ Prêt ! Va dans Comptabilité > Rapprochement > Importer CSV");
}

seed().catch(console.error);
