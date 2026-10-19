/**
 * tests/unit/cavalerie-mouvements.test.ts — entrées et sorties des équidés.
 *   npx tsx tests/unit/cavalerie-mouvements.test.ts
 */
import assert from "node:assert/strict";
import {
  champsEquideApresMouvement, dateFr, dateISO, htmlRegistre, motifRetour, situationEquides, sortiesTemporairesEnCours, trierMouvements,
} from "../../src/lib/cavalerie-mouvements";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const ts = (iso: string) => ({ seconds: Date.parse(`${iso}T10:00:00Z`) / 1000 });
const J = "2026-10-16";

test("dateISO : Timestamp Firestore, chaîne, Date, rien", () => {
  assert.equal(dateISO(ts("2026-10-02")), "2026-10-02");
  assert.equal(dateISO("2026-10-02"), "2026-10-02");
  assert.equal(dateISO(new Date("2026-10-02T12:00:00Z")), "2026-10-02");
  assert.equal(dateISO({ toDate: () => new Date("2026-10-03T12:00:00Z") }), "2026-10-03");
  assert.equal(dateISO(null), "");
});

const pompon = { id: "pompon", name: "Pompon", status: "actif" };
const caramel = { id: "caramel", name: "Caramel", status: "actif" };
const biscuit = { id: "biscuit", name: "Biscuit", status: "actif" };
const mouvements = [
  { id: "m1", equideId: "pompon", type: "entree" as const, date: ts("2026-09-01"), motif: "Achat" },
  { id: "m2", equideId: "pompon", type: "sortie" as const, date: ts("2026-10-10"), motif: "Concours", temporaire: true, dateRetour: "2026-10-12" },
  { id: "m3", equideId: "caramel", type: "sortie" as const, date: "2026-10-01", motif: "Vente", temporaire: false },
  { id: "m4", equideId: "biscuit", type: "sortie" as const, date: ts("2026-10-05"), motif: "Prêt extérieur", temporaire: true, dateRetour: "2026-10-20" },
  { id: "m5", equideId: "biscuit", type: "entree" as const, date: ts("2026-10-08"), motif: "Retour de prêt" },
];

test("tri du plus ancien au plus récent, dates mêlées (Timestamp et chaîne)", () => {
  assert.deepEqual(trierMouvements(mouvements).map(m => m.id), ["m1", "m3", "m4", "m5", "m2"]);
});

test("situation : Pompon en concours et en retard, Caramel vendu, Biscuit rentré, un équidé sans mouvement est présent", () => {
  const s = situationEquides([pompon, caramel, biscuit, { id: "nuage", status: "actif" }], mouvements, J);
  assert.equal(s.get("pompon")?.etat, "sorti_temporaire");
  assert.equal(s.get("pompon")?.retourPrevu, "2026-10-12");
  assert.equal(s.get("pompon")?.enRetard, true);
  assert.equal(s.get("caramel")?.etat, "sorti");
  assert.equal(s.get("biscuit")?.etat, "present");
  assert.equal(s.get("nuage")?.etat, "present");
  assert.equal(s.get("nuage")?.dernier, null);
});

test("sorties temporaires en cours : Pompon seulement (Biscuit est rentré)", () => {
  assert.deepEqual(sortiesTemporairesEnCours(mouvements).map(m => m.id), ["m2"]);
});

test("motif du retour d'après le motif de sortie", () => {
  assert.equal(motifRetour("Prêt extérieur"), "Retour de prêt");
  assert.equal(motifRetour("Concours"), "Retour concours");
  assert.equal(motifRetour("Pension extérieure"), "Retour pension");
  assert.equal(motifRetour("Autre"), "Autre");
});

test("fiche : une vente sort l'équidé, un décès et une retraite ont leur statut, une sortie temporaire ne change rien", () => {
  assert.deepEqual(champsEquideApresMouvement(pompon, { equideId: "pompon", type: "sortie", date: "2026-10-16", motif: "Vente" }),
    { status: "sorti", dateSortie: "2026-10-16", motifSortie: "Vente", available: false });
  assert.equal(champsEquideApresMouvement(pompon, { equideId: "pompon", type: "sortie", date: "2026-10-16", motif: "Décès" }).status, "deces");
  assert.equal(champsEquideApresMouvement(pompon, { equideId: "pompon", type: "sortie", date: "2026-10-16", motif: "Retraite" }).status, "retraite");
  assert.deepEqual(champsEquideApresMouvement(pompon, { equideId: "pompon", type: "sortie", date: "2026-10-16", motif: "Concours", temporaire: true }), {});
});

test("fiche : une entrée pose la date d'arrivée si elle manque, et remet « actif » un équidé sorti", () => {
  assert.deepEqual(champsEquideApresMouvement({ id: "x", status: "sorti" }, { equideId: "x", type: "entree", date: ts("2026-10-16"), motif: "Achat" }),
    { dateSortie: null, motifSortie: null, dateArrivee: "2026-10-16", status: "actif", available: true });
  assert.deepEqual(champsEquideApresMouvement({ id: "x", status: "actif", dateArrivee: "2025-09-01" }, { equideId: "x", type: "entree", date: "2026-10-16", motif: "Retour concours" }),
    { dateSortie: null, motifSortie: null });
});


// ─── Impression ────────────────────────────────────────────────────────────

test("dateFr : jour/mois/année depuis les trois formes", () => {
  assert.equal(dateFr("2026-10-16"), "16/10/2026");
  assert.equal(dateFr(ts("2026-01-05")), "05/01/2026");
  assert.equal(dateFr(null), "");
});

test("registre imprimable : détenteur, présents, sortis, chronologie, texte échappé", () => {
  const html = htmlRegistre({
    club: { nom: "CE Agon", legalName: "E.A.R.L. <Agon>", address: "56 Charrière", siret: "123" },
    equides: [
      { ...pompon, sire: "12345678A", puce: "250", type: "poney", sex: "hongre", race: "Welsh", robe: "Bai", birthDate: "2015-04-01", dateArrivee: "2020-09-01", proprietaire: "Club" },
      { ...caramel, status: "sorti", dateSortie: "2026-10-01", motifSortie: "Vente" },
      biscuit,
    ],
    mouvements,
    aujourdhui: J,
  });
  assert.match(html, /E\.A\.R\.L\. &lt;Agon&gt;/, "le nom légal est échappé");
  assert.match(html, /SIRET 123/);
  assert.match(html, /Édité le 16\/10\/2026 · 2 équidé\(s\) présent\(s\) · 1 sorti\(s\) · 5 mouvement\(s\)/);
  assert.match(html, /1\. Équidés détenus \(2\)/);
  assert.match(html, /Pompon<\/td><td>12345678A<\/td><td>250<\/td><td>Poney · Hongre<\/td><td>Welsh · Bai<\/td><td>01\/04\/2015<\/td><td>01\/09\/2020/);
  assert.match(html, /Sorti temporairement \(Concours, retour prévu le 12\/10\/2026\)/, "Pompon est en concours");
  assert.match(html, /2\. Équidés sortis définitivement \(1\)/);
  assert.match(html, /Caramel<\/td><td>&nbsp;<\/td><td>&nbsp;<\/td><td>&nbsp;<\/td><td>01\/10\/2026<\/td><td>Vente/);
  // Chronologie du plus ancien au plus récent : l'achat de Pompon d'abord, son départ en concours en dernier.
  const iAchat = html.indexOf("01/09/2026</td><td>Pompon</td><td class=\"entree\">Entrée");
  const iConcours = html.indexOf("10/10/2026</td><td>Pompon</td><td class=\"sortie\">Sortie temporaire");
  assert.ok(iAchat > 0 && iConcours > iAchat, "ordre chronologique");
  assert.match(html, /retour prévu le 12\/10\/2026/);
  assert.match(html, /arrêté du 5 juin 2000/);
});

if (process.exitCode) { console.error("❌ échec"); } else console.log(`✅ ${passes} tests passés`);
