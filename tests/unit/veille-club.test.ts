import assert from "node:assert/strict";
import { analyserVeille, decalerJours, htmlVeille, type DonneesVeille } from "../../src/lib/veille-club";

let passes = 0;
function test(nom: string, fn: () => void) {
  try {
    fn();
    passes++;
    console.log(`  ✅ ${nom}`);
  } catch (e: any) {
    console.error(`  ❌ ${nom}\n     ${e.message}`);
    process.exitCode = 1;
  }
}

const J = "2026-09-30"; // un mercredi
const ts = (iso: string) => ({ seconds: Date.parse(`${iso}T10:00:00Z`) / 1000 });
const vide = (): DonneesVeille => ({
  aujourdhui: J, maintenant: new Date(`${J}T05:30:00Z`),
  paiements: [], echeancesSepa: [], encaissements: [], creneaux: [], reservations: [], cartes: [], forfaits: [],
  familles: [], chequesDifferes: [], listeAttente: [], messagesContact: [], avis: [], cloturesJournalieres: [],
});
const codes = (d: DonneesVeille) => analyserVeille(d).map(p => p.code);
const pointDe = (d: DonneesVeille, code: string) => analyserVeille(d).find(p => p.code === code);

test("rien à signaler : aucune ligne (pas d'email)", () => {
  assert.deepEqual(analyserVeille(vide()), []);
});

test("dates : décalage au jour près, à travers les mois", () => {
  assert.equal(decalerJours(J, 1), "2026-10-01");
  assert.equal(decalerJours(J, -30), "2026-08-31");
});

test("1-2. SEPA : date passée jamais remise (rouge) ; remise à préparer dans les 5 jours", () => {
  const d = vide();
  d.echeancesSepa = [
    { familyName: "LECONTE", montant: 55, dateEcheance: "2026-09-25", status: "pending" },
    { familyName: "DUHEM", montant: 150, dateEcheance: "2026-10-03", status: "pending" },
    { familyName: "OK", montant: 10, dateEcheance: "2026-09-05", status: "preleve" },
  ];
  const nonRemis = pointDe(d, "sepa-non-remis")!;
  assert.equal(nonRemis.nb, 1);
  assert.ok(nonRemis.lignes[0].includes("LECONTE"));
  assert.ok(pointDe(d, "sepa-a-remettre")!.titre.includes("150,00 €"));
});

test("1 bis. « Prélèvement SEPA » encaissé à la main sans échéance : signalé ; vrai prélèvement, annulé ou ancien : non", () => {
  const d = vide();
  d.encaissements = [
    { id: "duhem", familyName: "DUHEM Julie", montant: 650, mode: "prelevement_sepa", date: ts("2026-09-29") },
    { id: "vrai", familyName: "LECONTE", montant: 55, mode: "prelevement_sepa", sepaEcheanceId: "e1", date: ts("2026-09-29") },
    { id: "annule", familyName: "X", montant: 40, mode: "prelevement_sepa", date: ts("2026-09-28") },
    { id: "contre", familyName: "X", montant: -40, mode: "prelevement_sepa", correctionDe: "annule", date: ts("2026-09-28") },
    { id: "ancien", familyName: "Y", montant: 30, mode: "prelevement_sepa", date: ts("2026-09-01") },
  ];
  const p = pointDe(d, "sepa-encaisse-sans-echeance")!;
  assert.equal(p.nb, 1);
  assert.ok(p.lignes[0].includes("DUHEM Julie") && p.lignes[0].includes("650,00 €"));
});

test("4. impayé de plus de 7 jours signalé, impayé récent non", () => {
  const d = vide();
  d.paiements = [
    { id: "a", familyName: "EDET", status: "pending", totalTTC: 26, paidAmount: 0, date: ts("2026-09-10"), items: [{ activityTitle: "Pony games" }] },
    { id: "b", familyName: "RECENT", status: "pending", totalTTC: 30, paidAmount: 0, date: ts("2026-09-28"), items: [] },
  ];
  const p = pointDe(d, "impayes-anciens")!;
  assert.equal(p.nb, 1);
  assert.ok(p.lignes[0].includes("EDET") && p.lignes[0].includes("26,00 €"));
});

test("5. écart journal / commande repris de Cohérence", () => {
  const d = vide();
  d.paiements = [{ id: "p", familyName: "ANDRIEU", status: "sepa_scheduled", totalTTC: 1139, paidAmount: 0, items: [], date: ts("2026-09-01") }];
  d.encaissements = [{ paymentId: "p", montant: 113.9, date: ts("2026-09-05") }];
  assert.ok(codes(d).includes("coherence"));
});

test("7. reprise passée non clôturée ; 8. cours recopié un jour inhabituel", () => {
  const d = vide();
  const vendredis = ["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25", "2026-10-02"];
  d.creneaux = [
    ...vendredis.map((date, i) => ({ id: `v${i}`, date, startTime: "11:00", activityTitle: "Adultes G1 à G4", activityType: "cours", status: "closed", enrolled: [] })),
    { id: "sam", date: "2026-10-03", startTime: "11:00", activityTitle: "Adultes G1 à G4", activityType: "cours", enrolled: [] },
    { id: "hier", date: "2026-09-29", startTime: "17:00", activityTitle: "Baby", activityType: "cours", enrolled: [{ childId: "c", childName: "Lou" }] },
  ];
  assert.ok(pointDe(d, "reprises-non-cloturees")!.lignes[0].includes("Baby"));
  const s = pointDe(d, "creneaux-suspects")!;
  assert.equal(s.nb, 1);
  assert.ok(s.lignes[0].includes("vendredi"), s.lignes[0]);
});

test("10. place libre et liste d'attente ; 11. carte à 1 séance", () => {
  const d = vide();
  d.creneaux = [{ id: "c1", date: "2026-10-02", startTime: "10:00", activityTitle: "Balade", maxPlaces: 6, enrolled: [{ childId: "x" }] }];
  d.listeAttente = [{ creneauId: "c1", status: "waiting" }, { creneauId: "c1", status: "expired" }];
  d.cartes = [{ status: "active", remainingSessions: 1, totalSessions: 10, childName: "Anne" }, { status: "active", remainingSessions: 4 }];
  assert.ok(pointDe(d, "places-liste-attente")!.lignes[0].includes("1 en attente"));
  assert.equal(pointDe(d, "cartes-bientot-epuisees")!.nb, 1);
});

test("12. forfait en double et au mauvais prix ; 13. commande SEPA sans échéancier", () => {
  const d = vide();
  const f = { childId: "anouk", childName: "Anouk", familyId: "leconte", slotKey: "Galop bronze — samedi 15:45", activityTitle: "Galop bronze", seasonStartYear: 2026, status: "actif", forfaitPriceTTC: 699 };
  d.forfaits = [f, { ...f }];
  d.paiements = [{ id: "p", familyId: "leconte", familyName: "LECONTE", forfaitRef: f.slotKey, status: "sepa_scheduled", totalTTC: 550, paidAmount: 0, items: [{ childId: "anouk", priceTTC: 550 }], date: ts("2026-09-26") }];
  const p12 = pointDe(d, "forfaits-doublon-prix")!;
  assert.ok(p12.lignes.some(l => l.includes("2 fiches")));
  assert.ok(p12.lignes.some(l => l.includes("550,00 €")));
  assert.ok(pointDe(d, "forfaits-sans-commande")!.lignes.some(l => l.includes("sans prélèvement")));
});

test("14-16. email rejeté, message du site vieux de 3 jours, avis à 2/5 sans réponse", () => {
  const d = vide();
  d.paiements = [{ id: "p", familyName: "X", status: "paid", totalTTC: 10, paidAmount: 10, alerteEmail: { to: "x@y.fr", raison: "boîte pleine" }, items: [] }];
  d.messagesContact = [{ firstName: "Léa", subject: "Stage Toussaint", traite: false, createdAt: ts("2026-09-27") }, { traite: false, createdAt: ts("2026-09-30") }];
  d.avis = [{ familyName: "Z", globalNote: 2 }, { familyName: "OK", globalNote: 5 }, { familyName: "R", globalNote: 1, reponse: "merci" }];
  assert.ok(pointDe(d, "emails-rejetes")!.lignes[0].includes("boîte pleine"));
  assert.equal(pointDe(d, "messages-sans-reponse")!.nb, 1);
  assert.equal(pointDe(d, "avis-negatifs")!.nb, 1);
});

test("17. ticket Z d'hier oublié ; 18. TVA seulement en début de trimestre", () => {
  const d = vide();
  d.encaissements = [{ montant: 20, date: ts("2026-09-29") }];
  assert.ok(codes(d).includes("cloture-z-oubliee"));
  d.cloturesJournalieres = [{ date: "2026-09-29" }];
  assert.ok(!codes(d).includes("cloture-z-oubliee"));
  assert.ok(!codes(d).includes("tva-trimestre"));
  assert.ok(codes({ ...vide(), aujourdhui: "2026-10-05" }).includes("tva-trimestre"));
});

test("3. pré-notification à vérifier ; 6. chèque échu ; 9. cavalier sans règlement dans 7 jours", () => {
  const d = vide();
  d.paiements = [{ id: "p", familyName: "DUHEM", status: "sepa_scheduled", prenotificationSepa: "a_verifier", totalTTC: 3691.36, paidAmount: 0, items: [], date: ts("2026-09-29") }];
  d.echeancesSepa = [{ paymentId: "p", status: "pending", dateEcheance: "2026-11-05", montant: 100 }];
  d.chequesDifferes = [{ familyName: "MARTIN", montant: 80, status: "pending", dateEncaissementPrevue: "2026-09-28" }, { status: "deposited", dateEncaissementPrevue: "2026-09-01" }];
  d.creneaux = [{ id: "c", date: "2026-10-01", startTime: "14:00", activityTitle: "Stage", maxPlaces: 8, enrolled: [{ childId: "k", familyId: "fam", childName: "Mia" }, { childId: "pre", preinscription: true }] }];
  assert.ok(pointDe(d, "prenotification-a-verifier")!.lignes[0].includes("DUHEM"));
  assert.ok(pointDe(d, "cheques-a-deposer")!.lignes[0].includes("échu"));
  const p9 = pointDe(d, "inscrits-sans-reglement")!;
  assert.equal(p9.nb, 1, "le pré-inscrit n'est pas compté");
  assert.ok(p9.lignes[0].includes("Mia"));
});

test("email : sections par niveau, liens absolus, texte échappé, liste coupée à 8", () => {
  const d = vide();
  d.cartes = Array.from({ length: 10 }, (_, i) => ({ status: "active", remainingSessions: 1, childName: `<b>C${i}</b>` }));
  const html = htmlVeille(analyserVeille(d), "https://club.fr", "mercredi 30 septembre");
  assert.ok(html.includes("https://club.fr/admin/cartes"));
  assert.ok(html.includes("&lt;b&gt;C0"));
  assert.ok(html.includes("… et 2 autre(s)"));
});

console.log(`\n✅ ${passes} tests passés\n`);
