/**
 * tests/unit/lien-paiement.test.ts
 *
 * Règles autour des liens de paiement CAWL (src/lib/lien-paiement-regles.ts).
 *   npx tsx tests/unit/lien-paiement.test.ts
 *
 * Scénario de septembre 2026 : deux enfants inscrits l'un après l'autre
 * depuis le planning, un lien de 30 € puis un de 60 € partis pour la même
 * commande, et une lettre de confirmation qui annonçait 199,20 € d'acompte.
 * Ces tests figent ce qui doit désormais se passer :
 *
 *   1. un lien a un état lisible : valable 7 jours, puis expiré ; annulé ; réglé ;
 *      à l'ouverture, le montant est relu sur la commande et une page CAWL
 *      fraîche est réutilisée plutôt que rouverte ;
 *   2. un règlement en trop est reconnu (commande soldée, cumul dépassé,
 *      lien annulé) et chiffré ;
 *   3. le lien d'acompte se calcule sur la COMMANDE : 30 € × enfants, moins
 *      ce qui est réglé ;
 *   4. la lettre annonce les montants de la commande quand elle porte les
 *      mêmes lignes.
 */

import {
  DUREE_VALIDITE_LIEN_MS,
  etatLien,
  expirationLien,
  FRAICHEUR_CHECKOUT_MS,
  montantOuvertureLien,
  checkoutReutilisable,
  detecterEncaissementInattendu,
  montantLienAcompte,
  montantsConfirmationDepuisCommande,
} from "../../src/lib/lien-paiement-regles";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}
const eq = (a: number, b: number) => Math.abs(a - b) < 0.005;

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires — liens de paiement");
console.log("══════════════════════════════════════════════════════════════\n");

// ── 1. État d'un lien ─────────────────────────────────────────────────────
{
  console.log("État d'un lien");
  const t0 = Date.parse("2026-09-09T10:00:00Z");
  const envoye = { status: "sent", sentAt: new Date(t0).toISOString(), expiresAt: expirationLien(t0).toISOString() };

  assert("un lien vit 7 jours", DUREE_VALIDITE_LIEN_MS === 7 * 24 * 60 * 60 * 1000);
  assert("juste envoyé : valable", etatLien(envoye, t0 + 60_000) === "valide");
  assert("le lendemain : encore valable", etatLien(envoye, t0 + 24 * 60 * 60_000) === "valide");
  assert("7 jours après : expiré", etatLien(envoye, t0 + DUREE_VALIDITE_LIEN_MS) === "expire");
  assert("annulé prime sur la validité", etatLien({ ...envoye, status: "cancelled" }, t0 + 60_000) === "annule");
  assert("réglé prime sur tout", etatLien({ ...envoye, status: "paid" }, t0 + 3 * DUREE_VALIDITE_LIEN_MS) === "paye");
  assert("trace ancienne sans expiresAt : déduite de l'envoi",
    etatLien({ status: "sent", sentAt: new Date(t0).toISOString() }, t0 + DUREE_VALIDITE_LIEN_MS + 1) === "expire");
  assert("trace sans aucune date : valable (on ne sait pas)", etatLien({ status: "sent" }, t0) === "valide");
}

// ── 1 bis. Ouverture du lien par la famille ──────────────────────────────
{
  console.log("\nOuverture du lien");
  assert("lien de 60 € sur une commande qui doit 349,20 € : 60 €", eq(montantOuvertureLien(60, { totalTTC: 349.2, paidAmount: 0 }), 60));
  assert("lien de 60 € mais 30 € réglés entre-temps sur 90 € : 60 €", eq(montantOuvertureLien(60, { totalTTC: 90, paidAmount: 30 }), 60));
  assert("lien de 60 € alors qu'il ne reste que 30 € : 30 €", eq(montantOuvertureLien(60, { totalTTC: 90, paidAmount: 60 }), 30));
  assert("commande soldée : 0, le lien se ferme", montantOuvertureLien(60, { totalTTC: 90, paidAmount: 90 }) === 0);
  assert("lien de 30 € puis lien de 60 € sur 60 € dus : le second ne demande que le reste",
    eq(montantOuvertureLien(60, { totalTTC: 349.2, paidAmount: 30 }), 60) && eq(montantOuvertureLien(60, { totalTTC: 60, paidAmount: 30 }), 30));

  const t0 = Date.parse("2026-09-09T10:00:00Z");
  const page = { url: "https://cawl/x", createdAt: new Date(t0).toISOString(), amount: 60 };
  assert("page CAWL ouverte il y a 10 min, même montant : réutilisée", checkoutReutilisable(page, 60, t0 + 10 * 60_000));
  assert("page ouverte il y a plus de 100 min : rouverte", !checkoutReutilisable(page, 60, t0 + FRAICHEUR_CHECKOUT_MS + 1));
  assert("montant devenu différent : rouverte", !checkoutReutilisable(page, 30, t0 + 10 * 60_000));
  assert("aucune page encore : ouverte", !checkoutReutilisable(undefined, 60, t0));
}

// ── 2. Encaissement inattendu ─────────────────────────────────────────────
{
  console.log("\nEncaissement inattendu");
  const normal = detecterEncaissementInattendu({ statutCommande: "pending", totalTTC: 349.2, dejaPaye: 0, montant: 60, lienAnnule: false });
  assert("acompte de 60 € sur 349,20 € : rien à signaler", normal === null);

  const soldeOk = detecterEncaissementInattendu({ statutCommande: "partial", totalTTC: 349.2, dejaPaye: 60, montant: 289.2, lienAnnule: false });
  assert("solde exact : rien à signaler", soldeOk === null);

  const deuxLiens = detecterEncaissementInattendu({ statutCommande: "paid", totalTTC: 90, dejaPaye: 90, montant: 60, lienAnnule: false });
  assert("commande déjà soldée : second lien signalé", deuxLiens?.motif === "deja_solde");
  assert("… et tout le montant est à rembourser", !!deuxLiens && eq(deuxLiens.exces, 60), String(deuxLiens?.exces));

  const cumulDepasse = detecterEncaissementInattendu({ statutCommande: "partial", totalTTC: 90, dejaPaye: 60, montant: 60, lienAnnule: false });
  assert("30 € + 60 € réglés sur 90 € puis 60 € encore : trop-perçu", cumulDepasse?.motif === "trop_percu");
  assert("… de 30 €", !!cumulDepasse && eq(cumulDepasse.exces, 30), String(cumulDepasse?.exces));

  const lienAnnule = detecterEncaissementInattendu({ statutCommande: "pending", totalTTC: 349.2, dejaPaye: 0, montant: 30, lienAnnule: true });
  assert("lien annulé mais réglé, somme due : signalé sans excédent", lienAnnule?.motif === "lien_annule" && lienAnnule.exces === 0);

  const arrondi = detecterEncaissementInattendu({ statutCommande: "partial", totalTTC: 100, dejaPaye: 60, montant: 40.01, lienAnnule: false });
  assert("un centime d'arrondi n'est pas un trop-perçu", arrondi === null);
}

// ── 3. Montant du lien d'acompte, lu sur la commande ──────────────────────
{
  console.log("\nMontant du lien d'acompte");
  assert("deux enfants, rien réglé : 60 €", eq(montantLienAcompte({ totalTTC: 349.2, paidAmount: 0, acompteAmount: 60 }), 60));
  assert("30 € déjà réglés sur un acompte de 60 € : 30 €", eq(montantLienAcompte({ totalTTC: 349.2, paidAmount: 30, acompteAmount: 60 }), 30));
  assert("acompte déjà couvert : 0 €, pas de lien", montantLienAcompte({ totalTTC: 349.2, paidAmount: 60, acompteAmount: 60 }) === 0);
  assert("sans acompte : le reste dû", eq(montantLienAcompte({ totalTTC: 180, paidAmount: 0 }), 180));
  assert("jamais plus que le reste dû", eq(montantLienAcompte({ totalTTC: 50, paidAmount: 30, acompteAmount: 60 }), 20));
  assert("commande vide : 0", montantLienAcompte({}) === 0);
}

// ── 4. La lettre suit la commande ─────────────────────────────────────────
{
  console.log("\nMontants de la lettre");
  // Le cas vécu : Charlie (180 €, acompte 30, solde 150) puis Nina (169,20 €
  // sans acompte à l'inscription). Blocs figés : aRegler 199,20 / solde 150.
  // La commande, elle, a recalculé : acompte 60, solde 289,20.
  const lettre = { totalTTC: 349.2, aRegler: 199.2, solde: 150 };
  const commande = { totalTTC: 349.2, paidAmount: 0, acompteAmount: 60, soldeAmount: 289.2 };
  const m = montantsConfirmationDepuisCommande(lettre, commande);
  assert("même total : la commande fait foi", m.source === "commande");
  assert("acompte annoncé = 60 € (celui du lien)", eq(m.aRegler, 60), String(m.aRegler));
  assert("solde annoncé = 289,20 €", eq(m.solde, 289.2), String(m.solde));

  const dejaPaye = montantsConfirmationDepuisCommande(lettre, { ...commande, paidAmount: 60 });
  assert("acompte déjà réglé entre-temps : plus rien à réclamer maintenant", dejaPaye.aRegler === 0 && eq(dejaPaye.dejaRegle, 60));

  const autreCommande = montantsConfirmationDepuisCommande(lettre, { totalTTC: 500, paidAmount: 0, acompteAmount: 90 });
  assert("commande plus large que la lettre : on garde les sommes de la lettre", autreCommande.source === "lettre" && eq(autreCommande.aRegler, 199.2));

  const sansCommande = montantsConfirmationDepuisCommande(lettre, null);
  assert("commande introuvable : sommes de la lettre", sansCommande.source === "lettre" && eq(sansCommande.solde, 150));

  const sansAcompte = montantsConfirmationDepuisCommande({ totalTTC: 180, aRegler: 180, solde: 0 }, { totalTTC: 180, paidAmount: 0 });
  assert("commande sans acompte : tout est réclamé maintenant", eq(sansAcompte.aRegler, 180) && sansAcompte.solde === 0);
}

console.log(`\n──────────────────────────────────────────────────────────────`);
console.log(`  ${passed} réussis, ${failed} échoués`);
if (failed > 0) {
  console.log(`  Échecs : ${failures.join(", ")}`);
  console.log("──────────────────────────────────────────────────────────────\n");
  process.exit(1);
}
console.log("──────────────────────────────────────────────────────────────\n");
