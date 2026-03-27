/**
 * Migration : enrichir childName avec prénom + nom dans tous les documents
 *
 * node scripts/migrate-childname.mjs
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc } from "firebase/firestore";

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

const G = "\x1b[32m✅", R = "\x1b[31m❌", Y = "\x1b[33m⚠️ ", Z = "\x1b[0m", C = "\x1b[36m";

async function migrate() {
  console.log(`\n${C}Migration childName — prénom + nom${Z}\n`);

  // 1. Charger toutes les familles → index childId → { firstName, lastName }
  console.log("Chargement des familles...");
  const famSnap = await getDocs(collection(db, "families"));
  const childIndex: Record<string, { firstName: string; lastName: string; fullName: string }> = {};

  for (const d of famSnap.docs) {
    const fam = d.data();
    for (const child of (fam.children || [])) {
      const firstName = child.firstName || "";
      const lastName  = child.lastName  || "";
      const fullName  = lastName ? `${firstName} ${lastName}` : firstName;
      childIndex[child.id] = { firstName, lastName, fullName };
    }
  }
  console.log(`  ${G} ${Object.keys(childIndex).length} enfants indexés\n`);

  // 2. Collections à migrer
  const colsToMigrate = [
    { name: "payments",       childIdField: null,       childNameField: "items" }, // items[].childName
    { name: "forfaits",       childIdField: "childId",  childNameField: "childName" },
    { name: "cartes",         childIdField: "childId",  childNameField: "childName" },
    { name: "bonsRecup",      childIdField: "childId",  childNameField: "childName" },
    { name: "reservations",   childIdField: "childId",  childNameField: "childName" },
    { name: "encaissements",  childIdField: "childId",  childNameField: "childName" },
    { name: "passages",       childIdField: "childId",  childNameField: "childName" },
  ];

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const col of colsToMigrate) {
    process.stdout.write(`${C}${col.name}...${Z} `);
    try {
      const snap = await getDocs(collection(db, col.name));
      let updated = 0;

      for (const d of snap.docs) {
        const data = d.data();

        // Cas spécial payments : items[] contient childId + childName
        if (col.name === "payments") {
          const items = data.items || [];
          let changed = false;
          const newItems = items.map((item: any) => {
            if (!item.childId) return item;
            const info = childIndex[item.childId];
            if (!info || !info.lastName) return item; // pas de nom → rien à faire
            // Vérifier si childName est déjà complet (contient le nom de famille)
            const currentName = (item.childName || "").toLowerCase();
            if (currentName.includes(info.lastName.toLowerCase())) return item; // déjà à jour
            changed = true;
            return { ...item, childName: info.fullName };
          });
          if (changed) {
            await updateDoc(doc(db, col.name, d.id), { items: newItems });
            updated++;
          }
          continue;
        }

        // Cas général : childId + childName sur le doc
        const childId = data[col.childIdField!];
        if (!childId) { totalSkipped++; continue; }
        const info = childIndex[childId];
        if (!info || !info.lastName) { totalSkipped++; continue; }

        const currentName = (data[col.childNameField!] || "").toLowerCase();
        if (currentName.includes(info.lastName.toLowerCase())) { totalSkipped++; continue; } // déjà à jour

        await updateDoc(doc(db, col.name, d.id), {
          [col.childNameField!]: info.fullName,
        });
        updated++;
      }

      console.log(`${G} ${updated} mis à jour (${snap.size - updated} déjà OK ou sans nom)`);
      totalUpdated += updated;
    } catch (e: any) {
      console.log(`${Y} ignoré (${e.message})`);
    }
  }

  // 3. Créneaux : enrolled[].childName
  process.stdout.write(`${C}creneaux (enrolled)...${Z} `);
  try {
    const snap = await getDocs(collection(db, "creneaux"));
    let updated = 0;
    for (const d of snap.docs) {
      const data = d.data();
      const enrolled = data.enrolled || [];
      let changed = false;
      const newEnrolled = enrolled.map((e: any) => {
        if (!e.childId) return e;
        const info = childIndex[e.childId];
        if (!info || !info.lastName) return e;
        const current = (e.childName || "").toLowerCase();
        if (current.includes(info.lastName.toLowerCase())) return e;
        changed = true;
        return { ...e, childName: info.fullName };
      });
      if (changed) {
        await updateDoc(doc(db, "creneaux", d.id), { enrolled: newEnrolled });
        updated++;
      }
    }
    console.log(`${G} ${updated} créneaux mis à jour`);
    totalUpdated += updated;
  } catch (e: any) {
    console.log(`${Y} creneaux ignoré (${e.message})`);
  }

  console.log(`\n${G} Migration terminée — ${totalUpdated} documents mis à jour, ${totalSkipped} ignorés\n`);
  process.exit(0);
}

migrate().catch(e => { console.error(R, e); process.exit(1); });
