/**
 * tests/unit/horse-history.test.ts
 *
 * Tests unitaires de l'historique des poneys du montoir. Lance via :
 *   npx tsx tests/unit/horse-history.test.ts
 *
 * Contexte : l'historique n'a longtemps eu qu'une source (les notes peda),
 * reecrites en bloc a chaque cloture. Des notes disparaissaient, et avec
 * elles le poney monte. Ces tests verrouillent le croisement des deux
 * sources et surtout le scenario reel signale : lundi et mardi valides,
 * un seul des deux visible le mercredi.
 */

import { construireHistoriquePoneys, libelleJourCourt } from "../../src/app/admin/montoir/horse-history";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(label: string, condition: boolean, details?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    failures.push(`${label}${details ? " — " + details : ""}`);
    console.log(`  ❌ ${label}${details ? " — " + details : ""}`);
  }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires historique poneys (montoir)");
console.log("══════════════════════════════════════════════════════════════\n");

const LUNDI = "2026-07-27";
const MARDI = "2026-07-28";

const familleAvecNotes = (notes: any[]) => ([{
  id: "f1",
  parentName: "Dupont",
  children: [{ id: "kid1", firstName: "Lea", peda: { notes } }],
}]);

const creneauAvec = (date: string, horseName: string, over: any = {}) => ({
  id: `cr_${date}_${horseName}`,
  date,
  enrolled: [{ childId: "kid1", childName: "Lea", horseName, ...over }],
});

// ─── Source 1 : notes pedagogiques ────────────────────────────────
console.log("✓ Notes pedagogiques :");
{
  const r = construireHistoriquePoneys({
    families: familleAvecNotes([
      { date: `${MARDI}T10:00:00`, horseName: "Vasco", creneauId: "c2" },
      { date: `${LUNDI}T10:00:00`, horseName: "Ulysse", creneauId: "c1" },
    ]),
    creneauxHistorique: [],
  });
  assert("deux montes retrouvees", r.kid1?.length === 2, `got ${r.kid1?.length}`);
  assert("la plus recente en tete", r.kid1?.[0].horseName === "Vasco", r.kid1?.[0].horseName);
  assert("puis la precedente", r.kid1?.[1].horseName === "Ulysse");
}
{
  const r = construireHistoriquePoneys({
    families: familleAvecNotes([
      { date: `${LUNDI}T10:00:00`, horseName: "", creneauId: "c1" },
      { date: `${LUNDI}T11:00:00`, creneauId: "c9" },
    ]),
    creneauxHistorique: [],
  });
  assert("note sans poney ignoree", (r.kid1 || []).length === 0);
}

// ─── Source 2 : creneaux (le filet de securite) ───────────────────
console.log("\n✓ Creneaux passes :");
{
  const r = construireHistoriquePoneys({
    families: familleAvecNotes([]),
    creneauxHistorique: [creneauAvec(LUNDI, "Ulysse"), creneauAvec(MARDI, "Vasco")],
  });
  assert("historique reconstruit sans aucune note", r.kid1?.length === 2, `got ${r.kid1?.length}`);
  assert("ordre chronologique inverse", r.kid1?.[0].horseName === "Vasco");
  assert("source tracee", r.kid1?.[0].source === "creneau");
}
{
  const r = construireHistoriquePoneys({
    families: familleAvecNotes([]),
    creneauxHistorique: [creneauAvec(LUNDI, "Ulysse", { presence: "absent" })],
  });
  assert("un absent n'a pas monte", (r.kid1 || []).length === 0);
}
{
  const r = construireHistoriquePoneys({
    families: familleAvecNotes([]),
    creneauxHistorique: [creneauAvec(LUNDI, "Ulysse", { presence: "absent_nonjustified" })],
  });
  assert("absent non justifie ignore aussi", (r.kid1 || []).length === 0);
}

// ─── LE scenario signale ──────────────────────────────────────────
console.log("\n✓ Scenario reel : note de lundi perdue :");
{
  // Mardi a ecrase la note de lundi. Le creneau de lundi, lui, a garde
  // l'affectation : l'historique doit malgre tout afficher les deux.
  const r = construireHistoriquePoneys({
    families: familleAvecNotes([
      { date: `${MARDI}T10:00:00`, horseName: "Vasco", creneauId: "cr_mardi" },
    ]),
    creneauxHistorique: [
      { id: "cr_lundi", date: LUNDI, enrolled: [{ childId: "kid1", horseName: "Ulysse" }] },
      { id: "cr_mardi", date: MARDI, enrolled: [{ childId: "kid1", horseName: "Vasco" }] },
    ],
  });
  assert("lundi ET mardi visibles", r.kid1?.length === 2, `got ${r.kid1?.length}`);
  const noms = r.kid1.map((m) => m.horseName);
  assert("Vasco puis Ulysse", noms.join("|") === "Vasco|Ulysse", noms.join("|"));
}

// ─── Dedoublonnage ────────────────────────────────────────────────
console.log("\n✓ Dedoublonnage :");
{
  // La meme seance vue par les deux sources ne doit compter qu'une fois
  const r = construireHistoriquePoneys({
    families: familleAvecNotes([
      { date: `${LUNDI}T10:00:00`, horseName: "Ulysse", creneauId: "cr_lundi" },
    ]),
    creneauxHistorique: [
      { id: "cr_lundi", date: LUNDI, enrolled: [{ childId: "kid1", horseName: "Ulysse" }] },
    ],
  });
  assert("une seule entree malgre deux sources", r.kid1?.length === 1, `got ${r.kid1?.length}`);
}
{
  // Meme poney deux jours de suite : on ne l'affiche qu'une fois
  const r = construireHistoriquePoneys({
    families: familleAvecNotes([]),
    creneauxHistorique: [
      { id: "a", date: LUNDI, enrolled: [{ childId: "kid1", horseName: "Ulysse" }] },
      { id: "b", date: MARDI, enrolled: [{ childId: "kid1", horseName: "Ulysse" }] },
      { id: "c", date: "2026-07-29", enrolled: [{ childId: "kid1", horseName: "Vasco" }] },
    ],
  });
  assert("poneys distincts uniquement", r.kid1?.length === 2, `got ${r.kid1?.length}`);
  assert("la monte la plus recente est gardee", r.kid1?.[1].date.startsWith(MARDI), r.kid1?.[1].date);
}
{
  const r = construireHistoriquePoneys({
    families: familleAvecNotes([]),
    creneauxHistorique: [
      { id: "a", date: LUNDI, enrolled: [{ childId: "kid1", horseName: "ulysse" }] },
      { id: "b", date: MARDI, enrolled: [{ childId: "kid1", horseName: "Ulysse" }] },
    ],
  });
  assert("casse ignoree au dedoublonnage", r.kid1?.length === 1, `got ${r.kid1?.length}`);
}

// ─── Troncature ───────────────────────────────────────────────────
console.log("\n✓ Limite d'affichage :");
{
  const creneaux = ["Ulysse", "Vasco", "Nougat", "Filou", "Bijou", "Caramel"].map((h, i) => ({
    id: `c${i}`,
    date: `2026-07-${String(20 + i).padStart(2, "0")}`,
    enrolled: [{ childId: "kid1", horseName: h }],
  }));
  const r = construireHistoriquePoneys({ families: familleAvecNotes([]), creneauxHistorique: creneaux });
  assert("4 montes maximum par defaut", r.kid1?.length === 4, `got ${r.kid1?.length}`);
  assert("les plus recentes conservees", r.kid1?.[0].horseName === "Caramel", r.kid1?.[0].horseName);
  const r2 = construireHistoriquePoneys({ families: familleAvecNotes([]), creneauxHistorique: creneaux, max: 2 });
  assert("limite configurable", r2.kid1?.length === 2);
}

// ─── Robustesse ───────────────────────────────────────────────────
console.log("\n✓ Robustesse :");
{
  const r = construireHistoriquePoneys({ families: [], creneauxHistorique: [] });
  assert("entrees vides ne plantent pas", Object.keys(r).length === 0);
}
{
  const r = construireHistoriquePoneys({
    families: [{ id: "f1", children: [{ id: "kid1" }] }] as any,
    creneauxHistorique: [{ id: "x", date: LUNDI }, { id: "y" }] as any,
  });
  assert("enfant sans peda et creneau sans enrolled", (r.kid1 || []).length === 0);
}
{
  const r = construireHistoriquePoneys({
    families: familleAvecNotes([{ date: "pas-une-date", horseName: "Ulysse", creneauId: "c1" }]),
    creneauxHistorique: [],
  });
  assert("date invalide ecartee", (r.kid1 || []).length === 0);
}
{
  const r = construireHistoriquePoneys({
    families: familleAvecNotes([]),
    creneauxHistorique: [{ id: "a", date: LUNDI, enrolled: [{ horseName: "Ulysse" }] }] as any,
  });
  assert("inscrit sans childId ignore", Object.keys(r).length === 0);
}

// ─── Libelle du jour ──────────────────────────────────────────────
console.log("\n✓ Libelle du jour :");
{
  assert("lundi abrege", libelleJourCourt(`${LUNDI}T12:00:00`) === "lun", libelleJourCourt(`${LUNDI}T12:00:00`));
  assert("mardi abrege", libelleJourCourt(`${MARDI}T12:00:00`) === "mar", libelleJourCourt(`${MARDI}T12:00:00`));
  assert("date invalide -> chaine vide", libelleJourCourt("n'importe quoi") === "");
}

// ─── Resume ──────────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  RESUME : ${passed} passes, ${failed} echoues`);
console.log("══════════════════════════════════════════════════════════════\n");

if (failed > 0) {
  console.log("\n❌ Echecs :");
  for (const f of failures) console.log("  • " + f);
  process.exit(1);
} else {
  console.log("\n✅ Tous les tests sont passes !\n");
  process.exit(0);
}
