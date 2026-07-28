/**
 * tests/unit/journee-management.test.ts
 *
 * Tests unitaires pour la vue « Journée » du management. Lance via :
 *   npx tsx tests/unit/journee-management.test.ts
 *
 * Ce module fusionne deux sources de verite (creneaux + taches-planifiees)
 * en rapprochant des personnes sur leur NOM en texte libre. Si le
 * rapprochement casse, un moniteur disparait du planning ou se retrouve
 * dedouble : on ne s'en apercoit qu'en salle, le matin meme.
 */

import { construireJournee, heureToMin, jourSemaineDeDate } from "../../src/app/admin/management/journee-utils";

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
console.log("  Tests unitaires vue Journee (management)");
console.log("══════════════════════════════════════════════════════════════\n");

// Le 2026-07-15 est un mercredi
const MERCREDI = "2026-07-15";

const salaries: any[] = [
  { id: "s1", nom: "Emmeline", couleur: "#2050A0", actif: true },
  { id: "s2", nom: "Éméline", couleur: "#16a34a", actif: true },
  { id: "s3", nom: "Lilou", couleur: "#dc2626", actif: true },
  { id: "s4", nom: "Zelia", couleur: "#d97706", actif: false }, // inactive
];

const tache = (over: any) => ({
  id: "t" + Math.random().toString(36).slice(2, 7),
  tacheTypeId: "tt1",
  tacheLabel: "Curage",
  categorie: "ecuries",
  salarieId: "s1",
  salarieName: "Emmeline",
  jour: "mercredi",
  heureDebut: "08:00",
  dureeMinutes: 60,
  semaine: "2026-W29",
  done: false,
  ...over,
});

const creneau = (over: any) => ({
  id: "c" + Math.random().toString(36).slice(2, 7),
  activityTitle: "Cours poney",
  date: MERCREDI,
  startTime: "10:00",
  endTime: "11:00",
  monitor: "Lilou",
  maxPlaces: 8,
  enrolled: [],
  enrolledCount: 5,
  status: "active",
  ...over,
});

// ─── Helpers de base ──────────────────────────────────────────────
console.log("✓ Helpers :");
{
  assert("heureToMin 08:30", heureToMin("08:30") === 510);
  assert("heureToMin 00:00", heureToMin("00:00") === 0);
  assert("heureToMin valeur vide", heureToMin("") === 0);
  assert("jour de la semaine correct", jourSemaineDeDate(MERCREDI) === "mercredi", jourSemaineDeDate(MERCREDI));
  assert("lundi correct", jourSemaineDeDate("2026-07-13") === "lundi");
  assert("dimanche correct", jourSemaineDeDate("2026-07-19") === "dimanche");
}

// ─── Fusion cours + taches ────────────────────────────────────────
console.log("\n✓ Fusion des deux sources :");
{
  const r = construireJournee({
    taches: [tache({})] as any,
    salaries,
    creneaux: [creneau({})],
    dateISO: MERCREDI,
  });
  assert("2 personnes en poste", r.lignes.length === 2, `got ${r.lignes.length}`);
  assert("1 cours compte", r.nbCours === 1);
  assert("1 tache comptee", r.nbTaches === 1);
  const emmeline = r.lignes.find((l) => l.nom === "Emmeline");
  const lilou = r.lignes.find((l) => l.nom === "Lilou");
  assert("Emmeline a sa tache", emmeline?.items.length === 1);
  assert("Lilou a son cours", lilou?.items.length === 1);
  assert("le cours porte le titre de l'activite", lilou?.items[0].label === "Cours poney");
  assert("places affichees sur le cours", lilou?.items[0].sousTitre === "5/8", lilou?.items[0].sousTitre);
}

// ─── Rapprochement des noms (le piege) ────────────────────────────
console.log("\n✓ Rapprochement des noms :");
{
  // Le creneau ecrit "Emeline" sans accent, la fiche dit "Éméline"
  const r = construireJournee({
    taches: [],
    salaries,
    creneaux: [creneau({ monitor: "Emeline" })],
    dateISO: MERCREDI,
  });
  assert("accent ignore au rapprochement", r.lignes.length === 1, `got ${r.lignes.length}`);
  assert("rattache a la bonne fiche", r.lignes[0]?.nom === "Éméline", r.lignes[0]?.nom);
  assert("pas marquee hors equipe", !r.lignes[0]?.sansFiche);
}
{
  // Emmeline et Éméline ne doivent JAMAIS etre confondues
  const r = construireJournee({
    taches: [tache({ salarieId: "s1", salarieName: "Emmeline" })] as any,
    salaries,
    creneaux: [creneau({ monitor: "Éméline" })],
    dateISO: MERCREDI,
  });
  assert("Emmeline et Emeline restent distinctes", r.lignes.length === 2, `got ${r.lignes.length}`);
  const noms = r.lignes.map((l) => l.nom).sort();
  assert("les deux fiches sont presentes", noms.join("|") === "Emmeline|Éméline", noms.join("|"));
}
{
  // Moniteur qui n'a pas de fiche equipe
  const r = construireJournee({
    taches: [],
    salaries,
    creneaux: [creneau({ monitor: "Aubance" })],
    dateISO: MERCREDI,
  });
  assert("moniteur sans fiche visible quand meme", r.lignes.length === 1);
  assert("marque hors equipe", r.lignes[0]?.sansFiche === true);
  assert("garde son nom", r.lignes[0]?.nom === "Aubance");
}
{
  // Creneau sans moniteur du tout : ne doit pas disparaitre
  const r = construireJournee({
    taches: [],
    salaries,
    creneaux: [creneau({ monitor: "" })],
    dateISO: MERCREDI,
  });
  assert("creneau sans moniteur visible", r.lignes.length === 1);
  assert("libelle explicite", r.lignes[0]?.nom === "Sans moniteur");
}

// ─── Filtrage par date et par statut ──────────────────────────────
console.log("\n✓ Filtrage :");
{
  const r = construireJournee({
    taches: [tache({ jour: "jeudi" })] as any,
    salaries,
    creneaux: [
      creneau({ date: "2026-07-16" }),          // autre jour
      creneau({ status: "cancelled" }),          // annule
    ],
    dateISO: MERCREDI,
  });
  assert("rien ce jour-la", r.lignes.length === 0, `got ${r.lignes.length}`);
  assert("tache d'un autre jour exclue", r.nbTaches === 0);
  assert("creneau annule exclu", r.nbCours === 0);
}
{
  const r = construireJournee({
    taches: [tache({ salarieId: "s4", salarieName: "Zelia" })] as any,
    salaries,
    creneaux: [],
    dateISO: MERCREDI,
  });
  assert("salarie inactif ignore", r.lignes.length === 0);
}

// ─── Chevauchements ───────────────────────────────────────────────
console.log("\n✓ Detection des chevauchements :");
{
  const r = construireJournee({
    taches: [tache({ salarieName: "Lilou", salarieId: "s3", heureDebut: "10:30", dureeMinutes: 60 })] as any,
    salaries,
    creneaux: [creneau({ monitor: "Lilou", startTime: "10:00", endTime: "11:00" })],
    dateISO: MERCREDI,
  });
  const lilou = r.lignes.find((l) => l.nom === "Lilou");
  assert("chevauchement detecte", lilou?.conflits === 2, `got ${lilou?.conflits}`);
  assert("les deux blocs sont marques", lilou?.items.every((i) => i.conflit) === true);
}
{
  // Contigu n'est PAS un chevauchement : 10h-11h puis 11h-12h
  const r = construireJournee({
    taches: [tache({ salarieName: "Lilou", salarieId: "s3", heureDebut: "11:00", dureeMinutes: 60 })] as any,
    salaries,
    creneaux: [creneau({ monitor: "Lilou", startTime: "10:00", endTime: "11:00" })],
    dateISO: MERCREDI,
  });
  const lilou = r.lignes.find((l) => l.nom === "Lilou");
  assert("activites contigues sans conflit", lilou?.conflits === 0, `got ${lilou?.conflits}`);
}

// ─── Amplitude et pauses ──────────────────────────────────────────
console.log("\n✓ Amplitude travaillee :");
{
  const r = construireJournee({
    taches: [
      tache({ heureDebut: "08:00", dureeMinutes: 60 }),
      tache({ heureDebut: "12:00", dureeMinutes: 60, categorie: "pause", tacheLabel: "Dejeuner" }),
      tache({ heureDebut: "14:00", dureeMinutes: 60 }),
    ] as any,
    salaries,
    creneaux: [],
    dateISO: MERCREDI,
  });
  const emmeline = r.lignes.find((l) => l.nom === "Emmeline");
  // 08:00 → 15:00 = 7h, la pause n'entre pas dans le calcul de l'amplitude
  assert("amplitude 8h-15h", emmeline?.minutes === 420, `got ${emmeline?.minutes}`);
}

// ─── Plage horaire affichee ───────────────────────────────────────
console.log("\n✓ Plage horaire :");
{
  const r = construireJournee({
    taches: [tache({ heureDebut: "08:30", dureeMinutes: 45 })] as any,
    salaries,
    creneaux: [creneau({ startTime: "17:15", endTime: "18:20" })],
    dateISO: MERCREDI,
  });
  assert("debut arrondi a l'heure basse", r.plageDebut === 8 * 60, `got ${r.plageDebut}`);
  assert("fin arrondie a l'heure haute", r.plageFin === 19 * 60, `got ${r.plageFin}`);
}
{
  // Une seule activite courte : la grille garde 2h minimum
  const r = construireJournee({
    taches: [tache({ heureDebut: "09:00", dureeMinutes: 30 })] as any,
    salaries,
    creneaux: [],
    dateISO: MERCREDI,
  });
  assert("plage minimale de 2h", r.plageFin - r.plageDebut >= 120, `got ${r.plageFin - r.plageDebut}`);
}
{
  const r = construireJournee({ taches: [], salaries, creneaux: [], dateISO: MERCREDI });
  assert("journee vide : plage par defaut 8h-18h", r.plageDebut === 480 && r.plageFin === 1080);
}

// ─── Tri et personnes libres ──────────────────────────────────────
console.log("\n✓ Tri et personnes sans rien :");
{
  const r = construireJournee({
    taches: [tache({ salarieName: "Emmeline", salarieId: "s1", heureDebut: "14:00" })] as any,
    salaries,
    creneaux: [creneau({ monitor: "Lilou", startTime: "07:00", endTime: "08:00" })],
    dateISO: MERCREDI,
  });
  assert("celui qui commence tot est en tete", r.lignes[0]?.nom === "Lilou", r.lignes[0]?.nom);
  assert("Eméline listee comme libre", r.personnesLibres.some((l) => l.nom === "Éméline"));
  assert("les occupes ne sont pas dans les libres", !r.personnesLibres.some((l) => l.nom === "Lilou"));
  assert("salarie inactif absent des libres", !r.personnesLibres.some((l) => l.nom === "Zelia"));
}

// ─── Resume ──────────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  RESUME : ${passed} passes, ${failed} echoues`);
console.log("══════════════════════════════════════════════════════════════\n");

if (failed > 0) {
  console.log("\n❌ Echecs :");
  for (const f of failures) {
    console.log("  • " + f);
  }
  process.exit(1);
} else {
  console.log("\n✅ Tous les tests sont passes !\n");
  process.exit(0);
}
