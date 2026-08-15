/**
 * Correction — inscriptions « une semaine sur deux » posées sur toutes les semaines
 *
 *   node scripts/corriger-quinzaine.mjs           → liste ce qui serait retiré
 *   node scripts/corriger-quinzaine.mjs --appliquer → retire réellement
 *
 * Pourquoi ce script existe : la première version du rythme quinzaine calculait
 * bien le tarif, mais inscrivait quand même le cavalier sur TOUTES les séances
 * de la saison. Résultat, il apparaissait au planning les semaines où il est
 * chez son autre parent, et la feuille d'appel — qui compte présent tout
 * inscrit non marqué absent — lui comptait le double de séances.
 *
 * Le correctif ne pose plus que les semaines attendues. Restent les
 * inscriptions créées AVANT : c'est ce que ce script nettoie.
 *
 * Il ne touche qu'aux séances FUTURES. Le passé est de la comptabilité : une
 * séance déjà faite, déjà pointée, déjà facturée ne se réécrit pas depuis un
 * script, même si elle n'aurait pas dû être posée.
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc, query, where } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDy1vrJpa12CrnyGoDkR9t4c3E31CS7Ovc",
  authDomain: "gestion-2026.firebaseapp.com",
  projectId: "gestion-2026",
  storageBucket: "gestion-2026.firebasestorage.app",
  messagingSenderId: "785848912923",
  appId: "1:785848912923:web:47f03aa109fa13eb1c7cbe",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const G = "\x1b[32m✅", Y = "\x1b[33m⚠️ ", Z = "\x1b[0m", C = "\x1b[36m", W = "\x1b[1m";
const APPLIQUER = process.argv.includes("--appliquer");

// Même calcul que src/lib/rythme.ts — dupliqué ici parce qu'un script .mjs ne
// traverse pas les alias TypeScript. Si l'un change, changer l'autre.
function numeroSemaineISO(date) {
  const d = new Date(`${String(date).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const premiere = new Date(d.getFullYear(), 0, 4, 12, 0, 0);
  return 1 + Math.round(((d - premiere) / 86400000 - 3 + ((premiere.getDay() + 6) % 7)) / 7);
}
function estSemaineAttendue(date, f) {
  if (f.rythme !== "quinzaine") return true;
  return (numeroSemaineISO(date) % 2 === 0) === (f.semainePaire !== false);
}

async function main() {
  console.log(`\n${C}${W}Correction des inscriptions « une semaine sur deux »${Z}`);
  console.log(APPLIQUER ? `${Y}Mode réel — les inscriptions seront retirées${Z}\n`
                        : `${C}Simulation — rien ne sera modifié (ajoutez --appliquer)${Z}\n`);

  const forfaitsSnap = await getDocs(query(collection(db, "forfaits"), where("status", "==", "actif")));
  const quinzaines = forfaitsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(f => f.rythme === "quinzaine");

  if (quinzaines.length === 0) {
    console.log(`${G} Aucun forfait au rythme quinzaine — rien à corriger.${Z}\n`);
    return;
  }
  console.log(`${quinzaines.length} forfait(s) en quinzaine :`);
  for (const f of quinzaines) {
    console.log(`   • ${f.childName} — ${f.activityTitle} ${f.dayLabel} ${f.startTime} (semaines ${f.semainePaire !== false ? "paires" : "impaires"})`);
  }
  console.log("");

  const aujourdhui = new Date().toISOString().split("T")[0];
  const creneauxSnap = await getDocs(query(collection(db, "creneaux"), where("date", ">=", aujourdhui)));

  let creneauxTouches = 0, retraits = 0;
  for (const cDoc of creneauxSnap.docs) {
    const c = cDoc.data();
    const enrolled = c.enrolled || [];
    if (enrolled.length === 0) continue;

    const jour = new Date(c.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();
    const restants = enrolled.filter(e => {
      const f = quinzaines.find(f =>
        f.childId === e.childId &&
        (f.activityTitle || "").toLowerCase() === (c.activityTitle || "").toLowerCase() &&
        (f.dayLabel || "").toLowerCase() === jour &&
        (f.startTime || "") === (c.startTime || "")
      );
      if (!f) return true;
      if (estSemaineAttendue(c.date, f)) return true;
      // Une présence déjà pointée est un fait constaté : le cavalier est venu,
      // quoi qu'en dise son forfait. On ne l'efface pas, on le signale.
      if (e.presence) {
        console.log(`${Y}${e.childName} — ${c.date} : pas attendu mais déjà pointé « ${e.presence} », laissé en place${Z}`);
        return true;
      }
      console.log(`   − ${e.childName} retiré du ${c.date} (S${numeroSemaineISO(c.date)}) — ${c.activityTitle} ${c.startTime}`);
      retraits++;
      return false;
    });

    if (restants.length === enrolled.length) continue;
    creneauxTouches++;
    if (APPLIQUER) {
      await updateDoc(doc(db, "creneaux", cDoc.id), {
        enrolled: restants,
        enrolledCount: restants.length,
      });
    }
  }

  console.log("");
  if (retraits === 0) {
    console.log(`${G} Rien à corriger : aucune inscription posée sur une semaine non attendue.${Z}\n`);
  } else if (APPLIQUER) {
    console.log(`${G} ${retraits} inscription(s) retirée(s) sur ${creneauxTouches} séance(s).${Z}\n`);
  } else {
    console.log(`${C}${retraits} inscription(s) à retirer sur ${creneauxTouches} séance(s).`);
    console.log(`Relancez avec --appliquer pour les retirer.${Z}\n`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
