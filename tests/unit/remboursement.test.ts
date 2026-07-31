/**
 * tests/unit/remboursement.test.ts
 *
 *   npx tsx tests/unit/remboursement.test.ts
 *
 * Repartition d'une annulation entre avoir et remboursement. C'est du
 * calcul financier : une erreur rend de l'argent en trop ou en moins, et
 * l'ecart n'apparait qu'a la cloture comptable. Les cas de refus comptent
 * donc autant que les cas nominaux.
 */

import {
  ACOMPTE_STAGE, repartitionParDefaut, resumeRepartition, validerRepartition,
} from "../../src/lib/remboursement";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires repartition annulation");
console.log("══════════════════════════════════════════════════════════════\n");

// ─── Cas des CGV ─────────────────────────────────────────────────
console.log("✓ Les trois cas prevus par les CGV :");
{
  const r = repartitionParDefaut(175, "anticipee");
  assert("plus de 3 semaines : tout rembourse", r.rembourse === 175 && r.avoir === 0);
}
{
  const r = repartitionParDefaut(175, "tardive");
  assert("tardive sans justificatif : rien rendu", r.rembourse === 0 && r.avoir === 0);
}
{
  // Le cas signale : 175 € encaisses, certificat medical
  const r = repartitionParDefaut(175, "certificat");
  assert("certificat : 30 € en avoir", r.avoir === ACOMPTE_STAGE, `got ${r.avoir}`);
  assert("certificat : 145 € rembourses", r.rembourse === 145, `got ${r.rembourse}`);
  assert("le total correspond a l'encaisse", r.avoir + r.rembourse === 175);
}

// ─── Le piege : moins que l'acompte ──────────────────────────────
console.log("\n✓ Somme encaissee inferieure a l'acompte :");
{
  // La famille n'a verse que l'acompte : rien a rembourser
  const r = repartitionParDefaut(30, "certificat");
  assert("30 € encaisses : tout en avoir", r.avoir === 30 && r.rembourse === 0);
}
{
  // Acompte partiel — ne JAMAIS crediter plus que l'encaisse
  const r = repartitionParDefaut(20, "certificat");
  assert("20 € encaisses : avoir plafonne a 20", r.avoir === 20, `got ${r.avoir}`);
  assert("aucun remboursement", r.rembourse === 0);
  assert("on ne distribue pas plus que l'encaisse", r.avoir + r.rembourse <= 20);
}
{
  const r = repartitionParDefaut(0, "certificat");
  assert("rien encaisse : rien a repartir", r.avoir === 0 && r.rembourse === 0);
}

// ─── Validation : refuser de distribuer plus que l'encaisse ──────
console.log("\n✓ Refus des repartitions impossibles :");
{
  const v = validerRepartition({ encaisse: 175, avoir: 30, rembourse: 200 });
  assert("total superieur a l'encaisse refuse", !v.valide, "rendrait de l'argent jamais recu");
  assert("message explicite", (v.erreur || "").includes("dépasse"));
}
{
  const v = validerRepartition({ encaisse: 175, avoir: 100, rembourse: 100 });
  assert("cumul superieur refuse", !v.valide);
}
{
  const v = validerRepartition({ encaisse: 175, avoir: -10, rembourse: 50 });
  assert("montant negatif refuse", !v.valide);
}
{
  const v = validerRepartition({ encaisse: 0, avoir: 0, rembourse: 0 });
  assert("aucune encaisse : refuse", !v.valide);
}
{
  const v = validerRepartition({ encaisse: 175, avoir: NaN, rembourse: 10 });
  assert("valeur non numerique refusee", !v.valide);
}

// ─── Validation : cas acceptes ───────────────────────────────────
console.log("\n✓ Repartitions acceptees :");
{
  const v = validerRepartition({ encaisse: 175, avoir: 30, rembourse: 145 });
  assert("repartition exacte acceptee", v.valide);
  assert("rien de conserve", v.conserve === 0);
}
{
  // Annulation tardive : le club conserve — distribuer moins est licite
  const v = validerRepartition({ encaisse: 175, avoir: 0, rembourse: 0 });
  assert("tout conserve accepte", v.valide);
  assert("conserve calcule", v.conserve === 175, `got ${v.conserve}`);
}
{
  const v = validerRepartition({ encaisse: 175, avoir: 30, rembourse: 100 });
  assert("repartition partielle acceptee", v.valide);
  assert("45 € conserves", v.conserve === 45, `got ${v.conserve}`);
}
{
  // Les arrondis de saisie ne doivent pas bloquer
  const v = validerRepartition({ encaisse: 100, avoir: 33.33, rembourse: 66.67 });
  assert("centimes tolerés", v.valide);
  const v2 = validerRepartition({ encaisse: 100, avoir: 33.34, rembourse: 66.67 });
  assert("un centime de trop tolere", v2.valide, "sinon la saisie devient impraticable");
  const v3 = validerRepartition({ encaisse: 100, avoir: 50, rembourse: 50.5 });
  assert("50 centimes de trop refuses", !v3.valide);
}

// ─── Resume affiche ──────────────────────────────────────────────
console.log("\n✓ Resume :");
{
  const t = resumeRepartition({ encaisse: 175, avoir: 30, rembourse: 145 });
  assert("mentionne le remboursement", t.includes("145.00 € remboursés"), t);
  assert("mentionne l'avoir", t.includes("30.00 € en avoir"), t);
}
{
  const t = resumeRepartition({ encaisse: 175, avoir: 0, rembourse: 0 });
  assert("conservation annoncee", t.includes("conservés"), t);
}
{
  const t = resumeRepartition({ encaisse: 175, avoir: 30, rembourse: 500 });
  assert("repartition invalide signalee", t.includes("dépasse"), t);
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  RESUME : ${passed} passes, ${failed} echoues`);
console.log("══════════════════════════════════════════════════════════════\n");
if (failed > 0) { console.log("\n❌ Echecs :"); failures.forEach(f => console.log("  • " + f)); process.exit(1); }
console.log("\n✅ Tous les tests sont passes !\n");
process.exit(0);
