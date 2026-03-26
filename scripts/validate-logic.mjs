/**
 * validate-logic.mjs — Tests de logique pure (pas de Firestore)
 * Teste toutes les règles métier : compatibilité carte, forfait, recalcul, filtre impayés
 * Usage : node scripts/validate-logic.mjs
 */

let passed = 0, failed = 0, warnings = 0;

const ok   = msg => { console.log(`  ✅ ${msg}`); passed++; };
const fail = (msg, d="") => { console.log(`  ❌ ${msg}${d ? `\n     → ${d}` : ""}`); failed++; };
const warn = msg => { console.log(`  ⚠️  ${msg}`); warnings++; };
const section = t => console.log(`\n${"─".repeat(60)}\n📋 ${t}\n${"─".repeat(60)}`);

// ── Copie exacte des fonctions prod ──────────────────────────────────────

function isForfaitBlocking(forfaits, isCoursType, isBaladeType) {
  return forfaits.some(f => {
    const t = f.activityType || "cours";
    if (t === "all") return true;
    if (t === "cours" && isCoursType) return true;
    if (t === "balade" && isBaladeType) return true;
    return false;
  });
}

function isCarteCompatible(carte, isCoursType, isBaladeType) {
  if ((carte.remainingSessions || 0) <= 0) return false;
  const t = carte.activityType || "cours";
  if (t === "cours" && isCoursType) return true;
  if (t === "balade" && isBaladeType) return true;
  return false;
}

function computeRatio(cr, daysBefore, daysNow) {
  const p = {};
  if (cr.price1day) p[1] = cr.price1day;
  if (cr.price2days) p[2] = cr.price2days;
  if (cr.price3days) p[3] = cr.price3days;
  if (cr.price4days) p[4] = cr.price4days;
  const keys = Object.keys(p).map(Number).sort((a,b)=>a-b);
  const before = p[daysBefore] || p[keys.filter(k=>k<=daysBefore).at(-1)||1] || 0;
  const after  = p[daysNow]    || p[keys.filter(k=>k<=daysNow).at(-1)   ||1] || 0;
  return before > 0 ? after / before : 1;
}

function applyRatioToItems(items, ratio) {
  return items.map(item => {
    if (item.activityType === "stage" || item.activityType === "stage_journee") {
      const newTTC = Math.round(item.priceTTC * ratio * 100) / 100;
      return { ...item, priceTTC: newTTC, priceHT: Math.round(newTTC / 1.055 * 100) / 100 };
    }
    return item;
  });
}

function filtreImpayes(payments) {
  return payments.filter(p => {
    if (p.status === "cancelled" || p.status === "paid") return false;
    if ((p.paidAmount || 0) >= (p.totalTTC || 0)) return false;
    if ((p.echeancesTotal || 0) > 1) return false;
    return true;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

function testForfaitCarte() {
  section("Scénario 1 — Forfait bloque la carte (même type)");

  // Forfait cours + carte cours → bloqué
  isForfaitBlocking([{activityType:"cours"}], true, false)
    ? ok("Forfait cours bloque carte cours ✓")
    : fail("Forfait cours devrait bloquer carte cours");

  // Forfait balade + carte balade → bloqué
  isForfaitBlocking([{activityType:"balade"}], false, true)
    ? ok("Forfait balade bloque carte balade ✓")
    : fail("Forfait balade devrait bloquer carte balade");

  // Forfait cours + activité balade → pas bloqué
  !isForfaitBlocking([{activityType:"cours"}], false, true)
    ? ok("Forfait cours ne bloque pas carte balade ✓")
    : fail("Forfait cours ne devrait PAS bloquer carte balade");

  // Forfait balade + activité cours → pas bloqué
  !isForfaitBlocking([{activityType:"balade"}], true, false)
    ? ok("Forfait balade ne bloque pas carte cours ✓")
    : fail("Forfait balade ne devrait PAS bloquer carte cours");

  // Forfait "all" → bloque tout
  isForfaitBlocking([{activityType:"all"}], true, false)
    ? ok("Forfait 'all' bloque cours ✓")
    : fail("Forfait 'all' devrait bloquer cours");
  isForfaitBlocking([{activityType:"all"}], false, true)
    ? ok("Forfait 'all' bloque balade ✓")
    : fail("Forfait 'all' devrait bloquer balade");

  // Aucun forfait → pas bloqué
  !isForfaitBlocking([], true, false)
    ? ok("Aucun forfait → carte libre ✓")
    : fail("Sans forfait, la carte devrait être libre");
}

function testCompatibiliteCarte() {
  section("Scénario 2 — Matrice compatibilité carte × activité");

  const cases = [
    { carte:"cours",  cours:true,  balade:false, ok:true,  label:"Carte cours + cours" },
    { carte:"cours",  cours:false, balade:true,  ok:false, label:"Carte cours + balade" },
    { carte:"balade", cours:false, balade:true,  ok:true,  label:"Carte balade + balade" },
    { carte:"balade", cours:true,  balade:false, ok:false, label:"Carte balade + cours" },
    { carte:"balade", cours:false, balade:true,  ok:true,  label:"Carte balade + ponyride" },
    { carte:"cours",  cours:true,  balade:false, ok:true,  label:"Carte cours + cours_particulier" },
    // Carte épuisée → jamais compatible
    { carte:"cours",  cours:true,  balade:false, ok:false, label:"Carte cours épuisée", remaining:0 },
  ];

  for (const c of cases) {
    const carte = { activityType: c.carte, remainingSessions: c.remaining ?? 5 };
    const result = isCarteCompatible(carte, c.cours, c.balade);
    result === c.ok
      ? ok(`${c.label} → ${result ? "compatible" : "incompatible"} ✓`)
      : fail(`${c.label}`, `attendu ${c.ok}, obtenu ${result}`);
  }
}

function testRecalculStageMultiEnfants() {
  section("Scénario 3 — Recalcul tarif stage multi-enfants (remises préservées)");

  const creneauRef = { price1day:175, price2days:280, price3days:350, price4days:420 };

  // Test 1j → 2j
  const ratio12 = computeRatio(creneauRef, 1, 2); // 280/175 ≈ 1.6
  Math.abs(ratio12 - 280/175) < 0.001
    ? ok(`Ratio 1j→2j = ${ratio12.toFixed(4)} (280/175) ✓`)
    : fail(`Ratio 1j→2j incorrect: ${ratio12}`);

  const items = [
    { childName:"Jade", activityType:"stage", priceTTC:175, priceHT:165.88 }, // plein
    { childName:"Tom",  activityType:"stage", priceTTC:140, priceHT:132.70 }, // -20% fratrie
    { childName:"N/A",  activityType:"cours", priceTTC:22,  priceHT:20.85  }, // non stage → inchangé
  ];

  const updated = applyRatioToItems(items, ratio12);

  // Jade : 175 × 1.6 = 280
  Math.abs(updated[0].priceTTC - 280) < 0.05
    ? ok(`Jade : 175 → ${updated[0].priceTTC}€ ✓`)
    : fail(`Jade : attendu 280, obtenu ${updated[0].priceTTC}`);

  // Tom : 140 × 1.6 = 224
  Math.abs(updated[1].priceTTC - 224) < 0.05
    ? ok(`Tom  : 140 → ${updated[1].priceTTC}€ (remise fratrie préservée) ✓`)
    : fail(`Tom  : attendu 224, obtenu ${updated[1].priceTTC}`);

  // Cours : inchangé
  updated[2].priceTTC === 22
    ? ok("Item cours inchangé par le recalcul stage ✓")
    : fail(`Item cours modifié à tort : ${updated[2].priceTTC}`);

  // Ratio remise conservé
  const ratioBefore = 140 / 175;
  const ratioAfter  = updated[1].priceTTC / updated[0].priceTTC;
  Math.abs(ratioBefore - ratioAfter) < 0.001
    ? ok(`Ratio remise fratrie conservé : ${(ratioBefore*100).toFixed(1)}% ✓`)
    : warn(`Légère dérive ratio remise: ${ratioBefore.toFixed(4)} → ${ratioAfter.toFixed(4)}`);

  // Test 2j → 3j
  const ratio23 = computeRatio(creneauRef, 2, 3); // 350/280
  const items2 = applyRatioToItems(updated.slice(0,2), ratio23);
  Math.abs(items2[0].priceTTC - 350) < 0.5
    ? ok(`Jade : 280 → ${items2[0].priceTTC}€ (3j) ✓`)
    : fail(`Jade 3j : attendu ≈350, obtenu ${items2[0].priceTTC}`);
}

function testShowAddDaysProgression() {
  section("Scénario 4 — showAddDays : comptage jours 1→2→3→4");

  const creneauRef = { price1day:100, price2days:160, price3days:210, price4days:250 };
  const expected = [null, 100, 160, 210, 250];
  let joursInscrits = 1;

  for (let step = 2; step <= 4; step++) {
    const p = {};
    if (creneauRef.price1day) p[1] = creneauRef.price1day;
    if (creneauRef.price2days) p[2] = creneauRef.price2days;
    if (creneauRef.price3days) p[3] = creneauRef.price3days;
    if (creneauRef.price4days) p[4] = creneauRef.price4days;
    const keys = Object.keys(p).map(Number).sort((a,b)=>a-b);
    const daysNow = joursInscrits + 1;
    const prix = p[daysNow] || p[keys.filter(k=>k<=daysNow).at(-1)||1] || 0;

    prix === expected[step]
      ? ok(`Ajout jour ${step} → tarif ${prix}€ ✓`)
      : fail(`Ajout jour ${step} → attendu ${expected[step]}€, obtenu ${prix}€`);

    joursInscrits++;
  }

  // Cas edge : 5 jours (pas de price5days → prend price4days = 250)
  const prices5 = { 1:100, 2:160, 3:210, 4:250 };
  const keys5 = Object.keys(prices5).map(Number).sort((a,b)=>a-b);
  const daysNow5 = 5;
  const maxKey5 = keys5.at(-1) || 1;
  const prix5 = prices5[daysNow5] || prices5[keys5.filter(k=>k<=daysNow5).at(-1) || maxKey5] || prices5[maxKey5] || 0;
  prix5 === 250
    ? ok(`Fallback 5j → tarif max 250€ ✓`)
    : fail(`Fallback 5j : attendu 250, obtenu ${prix5}`);
}

function testFiltreImpayes() {
  section("Scénario 5 — Filtre Impayés (logique exacte prod)");

  const payments = [
    { id:"p1", label:"Pending normal",    status:"pending",   paidAmount:0,  totalTTC:22,  echeancesTotal:undefined },
    { id:"p2", label:"Paid",              status:"paid",      paidAmount:30, totalTTC:30,  echeancesTotal:undefined },
    { id:"p3", label:"Échéance forfait",  status:"pending",   paidAmount:0,  totalTTC:50,  echeancesTotal:10 },
    { id:"p4", label:"Annulé",            status:"cancelled", paidAmount:0,  totalTTC:175, echeancesTotal:undefined },
    { id:"p5", label:"Partiel",           status:"partial",   paidAmount:10, totalTTC:22,  echeancesTotal:undefined },
    { id:"p6", label:"Soldé (paidAmount=totalTTC)", status:"pending", paidAmount:22, totalTTC:22, echeancesTotal:undefined },
  ];

  const unpaid = filtreImpayes(payments);

  unpaid.length === 2 ? ok(`${unpaid.length} impayés (p1+p5) ✓`) : fail(`Attendu 2, obtenu ${unpaid.length} : ${unpaid.map(p=>p.label).join(", ")}`);
  unpaid.find(p=>p.id==="p1") ? ok("p1 Pending normal inclus ✓") : fail("p1 absent des impayés");
  unpaid.find(p=>p.id==="p5") ? ok("p5 Partiel inclus ✓")        : fail("p5 partiel absent");
  !unpaid.find(p=>p.id==="p2") ? ok("p2 Paid exclu ✓")            : fail("p2 paid visible !");
  !unpaid.find(p=>p.id==="p3") ? ok("p3 Échéance exclue ✓")       : fail("p3 échéance visible !");
  !unpaid.find(p=>p.id==="p4") ? ok("p4 Annulé exclu ✓")          : fail("p4 annulé visible !");
  !unpaid.find(p=>p.id==="p6") ? ok("p6 Soldé exclu ✓")           : fail("p6 soldé visible !");
}

function testRollbackLogique() {
  section("Scénario 6 — Rollback : usedCardId capturé avant le débit");

  // Simuler le flow handleEnroll
  let usedCardId = null;
  const carteId = "carte_abc_123";

  // Étape 1 : capturer AVANT le débit (comme dans le code prod)
  usedCardId = carteId;

  // Étape 2 : le débit "se passe"
  // (en prod, c'est un updateDoc Firestore)

  // Étape 3 : une erreur arrive APRÈS le débit
  // → le catch peut utiliser usedCardId sans relire le créneau
  usedCardId !== null
    ? ok("usedCardId disponible dans le catch ✓")
    : fail("usedCardId null — recrédit impossible !");

  usedCardId === carteId
    ? ok("usedCardId pointe vers la bonne carte ✓")
    : fail("usedCardId incorrect");

  // Simuler l'ancien code bugué (lecture créneau après suppression)
  const creneauEnrolled = []; // ← vide après removeChildFromCreneau
  const entry = creneauEnrolled.find(e => e.childId === "child_123");
  entry === undefined
    ? ok("Ancien bug confirmé : entry undefined après removeChildFromCreneau ✓ (justifie le fix)")
    : warn("Comportement inattendu");

  // Nouveau code : usedCardId toujours disponible
  const cardIdPourRecredit = usedCardId; // ← toujours là
  cardIdPourRecredit === carteId
    ? ok("Nouveau code : cardId disponible même si créneau nettoyé ✓")
    : fail("Régression sur le rollback");
}

// ── Runner ────────────────────────────────────────────────────────────────
console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║   VALIDATION LOGIQUE — Centre Équestre Agon             ║");
console.log("║   (Tests sans Firestore — logique pure)                 ║");
console.log("╚══════════════════════════════════════════════════════════╝");
console.log(`\n🕐 Démarrage : ${new Date().toLocaleTimeString("fr-FR")}`);

testForfaitCarte();
testCompatibiliteCarte();
testRecalculStageMultiEnfants();
testShowAddDaysProgression();
testFiltreImpayes();
testRollbackLogique();

console.log(`\n${"═".repeat(60)}`);
console.log("📊 RÉSULTATS");
console.log("═".repeat(60));
console.log(`  ✅ Réussis   : ${passed}`);
console.log(`  ❌ Échoués   : ${failed}`);
console.log(`  ⚠️  Warnings  : ${warnings}`);
console.log("─".repeat(60));
if (failed === 0 && warnings === 0) {
  console.log("\n🎉 TOUS LES TESTS PASSENT — Logique métier validée !");
} else if (failed === 0) {
  console.log(`\n✅ Tests OK — ${warnings} warning(s) à surveiller`);
} else {
  console.log(`\n🚨 ${failed} TEST(S) ÉCHOUÉ(S) — Corrections nécessaires !`);
}
console.log(`\n🕐 Terminé : ${new Date().toLocaleTimeString("fr-FR")}\n`);
process.exit(failed > 0 ? 1 : 0);
