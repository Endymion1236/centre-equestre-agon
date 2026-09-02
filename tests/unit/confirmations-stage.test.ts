/**
 * tests/unit/confirmations-stage.test.ts
 *
 * La lettre de confirmation de stage, telle que la reçoit une famille inscrite
 * depuis l'administration.
 *   npx tsx tests/unit/confirmations-stage.test.ts
 *
 * Deux régressions signalées le 31 août 2026 sont figées ici :
 *
 *   1. Cinq enfants répartis sur trois stages produisaient trois emails
 *      presque identiques — un par passage dans le panneau d'inscription —
 *      alors que la famille ne reçoit qu'un seul lien de paiement. Un seul
 *      message doit porter les trois stages et un total unique.
 *
 *   2. Ce message annonçait « Votre inscription est confirmée » sans qu'un
 *      euro ait été encaissé, alors que le déroulé courant est : on inscrit,
 *      la commande part aux impayés, le lien de paiement suit. Tant que rien
 *      n'est reçu, la lettre parle de place retenue et de somme à régler.
 */

import { emailTemplates as T } from "../../src/lib/email-templates";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

/** Texte lisible du message, sans balises ni entités — ce que lit la famille. */
const lisible = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires — confirmations de stage");
console.log("══════════════════════════════════════════════════════════════\n");

const TROIS_STAGES = [
  {
    stageTitle: "Stage poney — Toussaint",
    dates: "lun. 19 au ven. 23 octobre",
    enfants: [
      { name: "Léa Lefèvre", prix: 145, remise: 0 },
      { name: "Tom Lefèvre", prix: 130, remise: 15 },
    ],
  },
  {
    stageTitle: "Stage galop 2 — Toussaint",
    dates: "lun. 26 au mer. 28 octobre",
    enfants: [
      { name: "Jules Lefèvre", prix: 120, remise: 0 },
      { name: "Alice Lefèvre", prix: 105, remise: 15 },
    ],
  },
  {
    stageTitle: "Stage baby-poney",
    dates: "jeu. 29 octobre",
    enfants: [{ name: "Rose Lefèvre", prix: 45, remise: 0 }],
  },
];

// ─── 1. Cinq cavaliers, trois stages, une seule lettre
console.log("✓ Trois stages tiennent dans un seul message :");
{
  const { subject, html } = T.confirmationStages({
    parentName: "Marie Lefèvre",
    stages: TROIS_STAGES,
    totalTTC: 545,
    aRegler: 545,
    solde: 0,
  });
  const texte = lisible(html);

  assert("le sujet annonce les 3 stages", subject.includes("3 stages"), subject);
  for (const enfant of ["Léa", "Tom", "Jules", "Alice", "Rose"]) {
    assert(`${enfant} figure dans la lettre`, texte.includes(enfant));
  }
  for (const stage of TROIS_STAGES) {
    assert(`le stage « ${stage.stageTitle} » a son panneau`, texte.includes(stage.stageTitle));
  }
  assert("le total des trois stages est annoncé", texte.includes("545,00"), texte.slice(0, 200));
  assert("les dates de chaque stage sont reprises",
    TROIS_STAGES.every(s => texte.includes(s.dates)));
}

// ─── 1 bis. L'heure à laquelle se présenter
console.log("\n✓ Les horaires du stage sont annoncés :");
{
  const { html } = T.confirmationStages({
    parentName: "Marie Lefèvre",
    stages: [{ ...TROIS_STAGES[0], horaires: "10h00–12h00" }],
    totalTTC: 275,
    aRegler: 275,
    solde: 0,
  });
  const texte = lisible(html);
  assert("la ligne Horaires figure dans le panneau du stage", texte.includes("Horaires") && texte.includes("10h00–12h00"));
}

// ─── 2. Rien d'encaissé : place retenue, pas inscription confirmée
console.log("\n✓ Sans règlement reçu, la lettre ne confirme rien :");
{
  const { subject, html } = T.confirmationStages({
    parentName: "Marie Lefèvre",
    stages: TROIS_STAGES,
    totalTTC: 545,
    aRegler: 545,
    solde: 0,
  });
  const texte = lisible(html);

  assert("le sujet annonce un règlement à venir",
    subject.includes("règlement à venir"), subject);
  assert("le sujet ne dit pas « confirmée »",
    !/confirmée/i.test(subject), subject);
  assert("le corps ne dit pas « votre inscription est confirmée »",
    !/inscription(s)? (est|sont) confirmée/i.test(texte));
  assert("le corps annonce des places retenues",
    /places sont retenues/i.test(texte));
  assert("la somme à régler est annoncée", texte.includes("À régler"));
}

// ─── 3. Acompte : ce qui est dû maintenant, et le solde ensuite
console.log("\n✓ Avec acompte, les deux échéances sont distinctes :");
{
  const { subject, html } = T.confirmationStages({
    parentName: "Marie Lefèvre",
    stages: TROIS_STAGES,
    totalTTC: 545,
    aRegler: 150, // 30 € par enfant, les cinq réunis
    solde: 395,
    dateSolde: "12 octobre",
    lienSepare: true,
  });
  const texte = lisible(html);

  assert("le sujet parle d'acompte", subject.includes("acompte"), subject);
  assert("l'acompte des cinq enfants est annoncé", texte.includes("150,00"));
  assert("le solde est annoncé", texte.includes("395,00"));
  assert("la date d'échéance du solde est donnée", texte.includes("12 octobre"));
  assert("le lien de paiement séparé est annoncé",
    /message séparé/i.test(texte));
  assert("aucun bouton de règlement quand le lien part à part",
    !/Régler l'acompte/i.test(texte));
}

// ─── 4. Un seul stage : le message reste au singulier
console.log("\n✓ Un seul stage garde le ton d'avant :");
{
  const { subject, html } = T.confirmationStages({
    parentName: "Marie Lefèvre",
    stages: [TROIS_STAGES[0]],
    totalTTC: 275,
    aRegler: 275,
    solde: 0,
  });
  const texte = lisible(html);

  assert("le sujet nomme le stage", subject.includes("Stage poney — Toussaint"), subject);
  assert("le corps parle d'UNE place retenue", /La place est retenue/i.test(texte));
  assert("le bouton de règlement est proposé", /Régler mon inscription/i.test(texte));
}

// ─── 5. Acompte déjà encaissé entre l'inscription et l'envoi
console.log("\n✓ Un acompte reçu entre-temps n'est pas réclamé deux fois :");
{
  const { subject, html } = T.confirmationStages({
    parentName: "Marie Lefèvre",
    stages: TROIS_STAGES,
    totalTTC: 545,
    aRegler: 0, // les 150 € d'acompte ont été réglés en ligne, déduits à l'envoi
    solde: 395,
    dejaRegle: 150,
    dateSolde: "12 octobre",
  });
  const texte = lisible(html);

  assert("l'inscription est confirmée", /Inscription confirmée/i.test(subject), subject);
  assert("l'acompte reçu est affiché", /Acompte reçu/i.test(texte));
  assert("plus rien n'est réclamé aujourd'hui", !/Ce qu'il reste à faire/i.test(texte));
  assert("le solde à venir est rappelé", /Reste à venir/i.test(texte) && texte.includes("395,00"));
}

// ─── 6. Tout réglé : là, et seulement là, on confirme
console.log("\n✓ Une commande soldée est confirmée :");
{
  const { subject, html } = T.confirmationStages({
    parentName: "Marie Lefèvre",
    stages: TROIS_STAGES,
    totalTTC: 545,
    aRegler: 0,
    solde: 0,
    dejaRegle: 545,
  });
  const texte = lisible(html);

  assert("le sujet confirme l'inscription", /Inscription confirmée/i.test(subject), subject);
  assert("le paiement reçu est affiché", /Paiement confirmé/i.test(texte));
  assert("plus rien n'est réclamé", !/Ce qu'il reste à faire/i.test(texte));
}

console.log(`\n──────────────────────────────────────────────────────────────`);
console.log(`  ${passed} réussis, ${failed} échoués`);
if (failed > 0) {
  console.log(`  Échecs : ${failures.join(", ")}`);
  console.log("──────────────────────────────────────────────────────────────\n");
  process.exit(1);
}
console.log("──────────────────────────────────────────────────────────────\n");
