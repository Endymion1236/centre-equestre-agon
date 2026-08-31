/**
 * tests/unit/statut-paiement.test.ts
 *
 * Les pastilles du planning : rouge rien reçu, orange payé partiellement,
 * vert réglé.
 *   npx tsx tests/unit/statut-paiement.test.ts
 *
 * Signalé le 31/08/2026 : la famille FAVORY apparaissait « en attente » sur
 * les cinq inscriptions de sa commande de 831,20 € alors que rien n'était
 * encaissé — un lien de paiement avait simplement été envoyé. Le planning
 * lisait le STATUT de la commande, et `pending` (créée, jamais réglée) et
 * `partial` (acompte reçu) tombaient dans la même case orange. La couleur
 * suit désormais l'argent réellement encaissé.
 */

import { statutPaiementCavalier } from "../../src/app/admin/planning/types";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires — statut de paiement au planning");
console.log("══════════════════════════════════════════════════════════════\n");

const CRENEAU = { id: "cr1", activityTitle: "Stage galop d'argent 8/10 ans" };
const INSCRIT = { childId: "c1", familyId: "favory", stageKey: "Stage galop d'argent 8/10 ans_2026-10-19" };
const LIGNE = {
  childId: "c1",
  stageKey: "Stage galop d'argent 8/10 ans_2026-10-19",
  activityTitle: "Stage galop d'argent 8/10 ans (5j) — Romane FAVORY",
};
/** La commande FAVORY : cinq cavaliers, 831,20 €. */
const commande = (paidAmount: number, status: string, extra: Record<string, unknown> = {}) => ([{
  familyId: "favory", status, paidAmount, totalTTC: 831.2, items: [LIGNE], ...extra,
}]);

console.log("✓ Un lien de paiement envoyé n'est pas un paiement reçu :");
{
  const s = statutPaiementCavalier(INSCRIT, commande(0, "pending"), CRENEAU);
  assert("l'état est « impayé »", s.etat === "impaye", s.etat);
  assert("le libellé ne dit plus « en attente »", s.label === "non réglé", s.label);
  assert("la pastille est rouge", s.point.includes("red"), s.point);
  assert("le survol annonce le montant dû", s.detail.includes("831,20"), s.detail);
}

console.log("\n✓ Un acompte versé se distingue du rien du tout :");
{
  const s = statutPaiementCavalier(INSCRIT, commande(150, "partial", { acompteAmount: 150 }), CRENEAU);
  assert("l'état est « partiel »", s.etat === "partiel", s.etat);
  assert("le libellé parle d'acompte", s.label === "acompte versé", s.label);
  assert("la pastille est orange", s.point.includes("orange"), s.point);
  assert("le survol donne le reste dû", s.detail.includes("681,20"), s.detail);
}

console.log("\n✓ Un versement partiel sans acompte prévu reste orange :");
{
  const s = statutPaiementCavalier(INSCRIT, commande(200, "partial"), CRENEAU);
  assert("l'état est « partiel »", s.etat === "partiel", s.etat);
  assert("le libellé est explicite", s.label === "partiellement réglé", s.label);
}

console.log("\n✓ Une commande soldée passe au vert :");
{
  const s = statutPaiementCavalier(INSCRIT, commande(831.2, "paid"), CRENEAU);
  assert("l'état est « réglé »", s.etat === "regle", s.etat);
  assert("la pastille est verte", s.point.includes("green"), s.point);
}

console.log("\n✓ Une carte de séances suit le règlement de la carte :");
{
  // La place n'est pas facturée : elle est décomptée d'une carte de dix
  // séances, vendue une fois. C'est donc l'encaissement de LA CARTE qui
  // décide — une carte remise sans règlement n'est pas une place payée.
  const carteVendue = (paidAmount: number, status: string) => ([{
    familyId: "favory", status, paidAmount, totalTTC: 190, cardId: "carte1",
    items: [{ childId: "c1", cardId: "carte1", activityTitle: "Carte 10 séances — Romane" }],
  }]);
  const inscritCarte = { ...INSCRIT, paymentSource: "card", cardId: "carte1" };

  const reglee = statutPaiementCavalier(inscritCarte, carteVendue(190, "paid"), CRENEAU);
  assert("carte réglée : vert", reglee.etat === "regle", reglee.etat);
  assert("le libellé dit « carte »", reglee.label === "carte", reglee.label);

  const impayee = statutPaiementCavalier(inscritCarte, carteVendue(0, "pending"), CRENEAU);
  assert("carte remise sans encaissement : rouge", impayee.etat === "impaye", impayee.etat);
  assert("le libellé dit ce qu'il manque", impayee.label === "carte à régler", impayee.label);
  assert("le survol donne le montant de la carte", impayee.detail.includes("190,00"), impayee.detail);

  const partielle = statutPaiementCavalier(inscritCarte, carteVendue(90, "partial"), CRENEAU);
  assert("carte réglée en partie : orange", partielle.etat === "partiel", partielle.etat);

  const orpheline = statutPaiementCavalier(inscritCarte, [], CRENEAU);
  assert("carte sans commande retrouvée : vert, faute de preuve du contraire",
    orpheline.etat === "regle", orpheline.etat);
  assert("et le survol le dit", orpheline.detail.includes("aucune commande"), orpheline.detail);
}

console.log("\n✓ Le mode de règlement reste dans le libellé, pas dans la couleur :");
{
  const celeris = statutPaiementCavalier({ ...INSCRIT, paymentSource: "celeris" }, [], CRENEAU);
  assert("réglé dans Celeris : vert", celeris.etat === "regle", celeris.etat);

  const forfait = statutPaiementCavalier({ ...INSCRIT, paymentSource: "forfait" }, [], CRENEAU);
  assert("forfait sans encaissement : rouge", forfait.etat === "impaye", forfait.etat);
  assert("le libellé dit ce qu'il manque", forfait.label === "forfait à régler", forfait.label);
}

console.log("\n✓ Cas limites :");
{
  const rien = statutPaiementCavalier(INSCRIT, [], CRENEAU);
  assert("aucune commande : rouge", rien.etat === "impaye", rien.etat);

  const annulee = statutPaiementCavalier(INSCRIT, commande(0, "cancelled"), CRENEAU);
  assert("une commande annulée ne compte pas", annulee.label === "non réglé", annulee.label);

  const autreEnfant = statutPaiementCavalier({ ...INSCRIT, childId: "c2" }, commande(831.2, "paid"), CRENEAU);
  assert("la commande d'un autre enfant ne colore rien", autreEnfant.etat === "impaye", autreEnfant.etat);

  // Réglé au centime près sans que le statut ait suivi (encaissement manuel).
  const soldeeSansStatut = statutPaiementCavalier(INSCRIT, commande(831.2, "partial"), CRENEAU);
  assert("une commande soldée reste verte même si le statut a été oublié",
    soldeeSansStatut.etat === "regle", soldeeSansStatut.etat);
}

console.log(`\n──────────────────────────────────────────────────────────────`);
console.log(`  ${passed} réussis, ${failed} échoués`);
if (failed > 0) {
  console.log(`  Échecs : ${failures.join(", ")}`);
  console.log("──────────────────────────────────────────────────────────────\n");
  process.exit(1);
}
console.log("──────────────────────────────────────────────────────────────\n");
