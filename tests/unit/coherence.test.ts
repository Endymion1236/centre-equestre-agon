/**
 * tests/unit/coherence.test.ts
 *
 * L'écran Cohérence : ce que la machine peut vérifier seule.
 *   npx tsx tests/unit/coherence.test.ts
 *
 * Chaque vérification est ici confrontée au cas réel qui l'a motivée, tous
 * découverts par hasard le 31 août et le 1er septembre 2026 — et tous
 * détectables d'avance.
 */

import { analyserCoherence, grouperAnomalies } from "../../src/lib/coherence";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

const MAINTENANT = new Date("2026-09-01T18:00:00Z");
const vide = {
  paiements: [], creneaux: [], reservations: [], encaissements: [],
  echeancesSepa: [], cartes: [], maintenant: MAINTENANT,
};
const codes = (a: ReturnType<typeof analyserCoherence>) => a.map((x) => x.code);

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires — analyse de cohérence");
console.log("══════════════════════════════════════════════════════════════\n");

console.log("✓ Une base saine ne dit rien :");
{
  const a = analyserCoherence({
    ...vide,
    paiements: [{ id: "p1", familyName: "Dupont", status: "paid", totalTTC: 57, paidAmount: 57, invoiceNumber: "F-2026-0200", items: [{ childId: "c1", creneauId: "cr1" }] }],
    creneaux: [{ id: "cr1", date: "2026-10-23", activityTitle: "Promenade", enrolled: [{ childId: "c1" }], enrolledCount: 1 }],
    encaissements: [{ paymentId: "p1", montant: 57 }],
  });
  assert("aucune anomalie", a.length === 0, codes(a).join(", "));
}

console.log("\n✓ Commande soldée sans numéro de facture (CGI art. 242 nonies A) :");
{
  const a = analyserCoherence({
    ...vide,
    paiements: [{ id: "p1", familyName: "Andrieu", status: "paid", totalTTC: 699, paidAmount: 699, items: [] }],
    encaissements: [{ paymentId: "p1", montant: 699 }],
  });
  assert("signalée", codes(a).includes("facture-sans-numero"), codes(a).join(", "));
  assert("classée à traiter", a[0].gravite === "bloquant");
  assert("une réparation est proposée", a[0].action === "attribuer-numero", String(a[0].action));
  const offerte = analyserCoherence({
    ...vide,
    paiements: [{ id: "p2", status: "paid", totalTTC: 0, paidAmount: 0, isFree: true, items: [] }],
  });
  assert("une inscription offerte n'en réclame pas", offerte.length === 0, codes(offerte).join(", "));
}

console.log("\n✓ Réglé mais absent du planning (cas WAGNER, 350 €) :");
{
  const a = analyserCoherence({
    ...vide,
    paiements: [{
      id: "p1", familyName: "Wagner", status: "paid", totalTTC: 350, paidAmount: 350,
      invoiceNumber: "F-2026-0201",
      items: [{ childId: "alois", childName: "Aloïs", creneauIds: ["lun", "mar"] }],
    }],
    creneaux: [
      { id: "lun", date: "2026-10-26", activityTitle: "Premiers Sabots", enrolled: [], enrolledCount: 0 },
      { id: "mar", date: "2026-10-27", activityTitle: "Premiers Sabots", enrolled: [{ childId: "alois" }], enrolledCount: 1 },
    ],
    encaissements: [{ paymentId: "p1", montant: 350 }],
  });
  assert("signalée", codes(a).includes("paye-mais-absent-du-planning"), codes(a).join(", "));
  const anomalie = a.find((x) => x.code === "paye-mais-absent-du-planning")!;
  assert("le lundi manquant est nommé", anomalie.detail.includes("26"), anomalie.detail);
  assert("le mardi, déjà inscrit, ne l'est pas", !anomalie.detail.includes("27"), anomalie.detail);
  assert("une réparation est proposée", anomalie.action === "replacer-au-planning");
}

console.log("\n✓ Le journal et la commande divergent :");
{
  const a = analyserCoherence({
    ...vide,
    paiements: [{ id: "p1", familyName: "Duhem", status: "partial", totalTTC: 699, paidAmount: 213.3, invoiceNumber: "F-1", items: [] }],
    encaissements: [{ paymentId: "p1", montant: 69.9 }],
  });
  assert("signalée", codes(a).includes("journal-different-de-la-commande"), codes(a).join(", "));
  assert("l'écart est chiffré", a[0].detail.includes("143,40"), a[0].detail);

  const sansEcriture = analyserCoherence({
    ...vide,
    paiements: [{ id: "p2", status: "pending", totalTTC: 100, paidAmount: 0, items: [] }],
  });
  assert("une commande sans écriture n'est pas comparée", sansEcriture.length === 0, codes(sansEcriture).join(", "));
}

console.log("\n✓ Réservation mal datée (cas ROZIER, promenade d'octobre au 31 août) :");
{
  const a = analyserCoherence({
    ...vide,
    creneaux: [{ id: "cr1", date: "2026-10-23", activityTitle: "Promenade", enrolled: [], enrolledCount: 0 }],
    reservations: [
      { id: "r1", childName: "Loucia", familyName: "Rozier", activityTitle: "Promenade", creneauId: "cr1", date: "2026-08-31" },
      { id: "r2", childName: "Sans date", creneauId: "cr1" },
    ],
  });
  assert("date incohérente signalée", codes(a).includes("reservation-date-incoherente"), codes(a).join(", "));
  assert("réservation sans date signalée", codes(a).includes("reservation-sans-date"), codes(a).join(", "));

  const incoherente = a.find((x) => x.code === "reservation-date-incoherente")!;
  assert("la réparation est proposée", incoherente.action === "corriger-date-reservation", String(incoherente.action));
  assert("elle porte la réservation à recaler", incoherente.reservationId === "r1", String(incoherente.reservationId));

  const sansDate = a.find((x) => x.code === "reservation-sans-date")!;
  assert("pas de réparation automatique sans date de créneau", !sansDate.action, String(sansDate.action));
}

console.log("\n✓ Prélèvement passé sans écriture au journal :");
{
  const a = analyserCoherence({
    ...vide,
    echeancesSepa: [
      { id: "e1", familyName: "Duhem", status: "preleve", montant: 213.3, dateEcheance: "2026-08-31" },
      { id: "e2", familyName: "Duhem", status: "preleve", montant: 105.6, dateEcheance: "2026-08-31" },
    ],
    encaissements: [{ paymentId: "p1", montant: 105.6, sepaEcheanceId: "e2" }],
  });
  const sepa = a.filter((x) => x.code === "sepa-preleve-sans-ecriture");
  assert("seule l'échéance sans écriture est signalée", sepa.length === 1, String(sepa.length));
  assert("avec son montant", sepa[0].detail.includes("213,30"), sepa[0].detail);
}

console.log("\n✓ Places tenues et compteurs :");
{
  const a = analyserCoherence({
    ...vide,
    creneaux: [{
      id: "cr1", date: "2026-09-10", activityTitle: "Baby",
      enrolled: [
        { childId: "a", childName: "Ancien", pending: true, holdUntil: "2026-09-01T10:00:00.000Z" },
        { childId: "b", childName: "Récent", pending: true, holdUntil: "2026-09-01T17:45:00.000Z" },
      ],
      enrolledCount: 5,
    }],
  });
  const holds = a.filter((x) => x.code === "place-tenue-expiree");
  assert("une place tenue depuis huit heures est signalée", holds.length === 1, String(holds.length));
  assert("une place tenue depuis un quart d'heure ne l'est pas", !holds[0].detail.includes("Récent"), holds[0].detail);
  assert("le compteur faux est signalé", codes(a).includes("compteur-de-places-faux"), codes(a).join(", "));
}

console.log("\n✓ Carte de séances remise sans encaissement :");
{
  const a = analyserCoherence({
    ...vide,
    cartes: [
      { id: "carte1", status: "active", familyName: "Duhem", childName: "Toute la famille", remainingSessions: 10 },
      { id: "carte2", status: "active", familyName: "Payée", remainingSessions: 8 },
      { id: "carte3", status: "active", familyName: "Importée", remainingSessions: 3 },
    ],
    paiements: [
      { id: "p1", familyName: "Duhem", status: "pending", totalTTC: 247, paidAmount: 0, cardId: "carte1", items: [{ cardId: "carte1" }] },
      { id: "p2", familyName: "Payée", status: "paid", totalTTC: 190, paidAmount: 190, invoiceNumber: "F-2", cardId: "carte2", items: [{ cardId: "carte2" }] },
    ],
    encaissements: [{ paymentId: "p2", montant: 190 }],
  });
  const cartes = a.filter((x) => x.code === "carte-non-reglee");
  assert("seule la carte impayée est signalée", cartes.length === 1, String(cartes.length));
  assert("la carte réglée est ignorée", !cartes[0].detail.includes("Payée"));
  assert("la carte sans commande ne présume rien", !cartes[0].detail.includes("Importée"));
}

console.log("\n✓ Le plus grave d'abord, et regroupé :");
{
  const a = analyserCoherence({
    ...vide,
    paiements: [{ id: "p1", familyName: "A", status: "paid", totalTTC: 100, paidAmount: 100, items: [] }],
    creneaux: [{ id: "cr1", date: "2026-09-10", enrolled: [], enrolledCount: 3 }],
  });
  assert("le bloquant est en tête", a[0].gravite === "bloquant", a.map((x) => x.gravite).join(", "));
  const groupes = grouperAnomalies(a);
  assert("deux groupes distincts", groupes.length === 2, String(groupes.length));
  assert("chaque groupe porte son titre", groupes.every((g) => !!g.titre));
}

console.log("\n✓ Une commande annulée est hors du champ :");
{
  const a = analyserCoherence({
    ...vide,
    paiements: [{ id: "p1", status: "cancelled", totalTTC: 350, paidAmount: 350, items: [{ childId: "c1", creneauId: "cr1" }] }],
    creneaux: [{ id: "cr1", date: "2026-10-26", enrolled: [], enrolledCount: 0 }],
  });
  assert("rien n'est signalé", a.length === 0, codes(a).join(", "));
}

console.log(`\n──────────────────────────────────────────────────────────────`);
console.log(`  ${passed} réussis, ${failed} échoués`);
if (failed > 0) {
  console.log(`  Échecs : ${failures.join(", ")}`);
  console.log("──────────────────────────────────────────────────────────────\n");
  process.exit(1);
}
console.log("──────────────────────────────────────────────────────────────\n");
