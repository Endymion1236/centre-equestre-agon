/**
 * tests/unit/rapprochement-matching.test.ts
 *
 * Le rapprochement automatique du relevé bancaire.
 *   npx tsx tests/unit/rapprochement-matching.test.ts
 *
 * Ce calcul décidait seul, sans aucun test, quelle recette correspond à quelle
 * ligne du relevé. Les cas vérifiés ici sont ceux qui se présentent vraiment :
 * le versement CAWL amputé de sa commission, la remise CB dont une transaction
 * a été refusée, la remise SEPA, et surtout l'unicité — deux lignes de même
 * montant ne doivent jamais se partager la même recette.
 */

import { rapprocherReleve } from "../../src/app/admin/comptabilite/rapprochement-matching";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

/** Un encaissement daté, tel que Firestore le rend. */
const enc = (id: string, montant: number, mode: string, jour: string, familyName = "Famille") => ({
  id, montant, mode, familyName,
  date: { seconds: Math.floor(new Date(`${jour}T12:00:00Z`).getTime() / 1000) },
});

const ligne = (date: string, label: string, amount: number) => ({
  date, label, amount, matched: false, matchType: "", matchDetail: "",
});

const etatVide = {
  encaissementsCompta: [], payments: [], remises: [], remisesSepa: [],
  period: "2026-09", bankLines: [],
};

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires — rapprochement automatique");
console.log("══════════════════════════════════════════════════════════════\n");

console.log("✓ Versement CAWL, net de commission :");
{
  // 350 € encaissés en CB en ligne ; la banque crédite 339,60 €
  // (350 − 2,9 % − 0,25 €). Sans la tolérance sur les frais, la ligne
  // resterait non rapprochée et l'écart passerait pour une recette manquante.
  const encaissements = [enc("e1", 350, "cb_online", "2026-09-03")];
  const r = rapprocherReleve(
    [ligne("10/09/2026", "VIR CAWL PAIEMENT", 339.60)],
    { ...etatVide, encaissementsCompta: encaissements },
  );
  assert("la ligne est rapprochée", r.finalMatched[0].matched, r.finalMatched[0].matchDetail);
  assert("reconnue comme CB en ligne", r.finalMatched[0].matchType === "CB en ligne", r.finalMatched[0].matchType);
  assert("l'encaissement est consommé", r.usedEncIds.has("e1"));
}

console.log("\n✓ Remise CB terminal : le total de la journée :");
{
  // Trois CB saisies le 5 (100 + 200 + 50 = 350) ; la banque remet 350 le 6.
  const encaissements = [
    enc("c1", 100, "cb_terminal", "2026-09-05"),
    enc("c2", 200, "cb_terminal", "2026-09-05"),
    enc("c3", 50, "cb_terminal", "2026-09-05"),
  ];
  const r = rapprocherReleve(
    [ligne("06/09/2026", "REMISE CB", 350)],
    { ...etatVide, encaissementsCompta: encaissements },
  );
  assert("la remise est rapprochée", r.finalMatched[0].matched, r.finalMatched[0].matchDetail);
  assert("les trois CB de la journée sont consommées", r.usedEncIds.size === 3, `${r.usedEncIds.size}`);
}

console.log("\n✓ Remise CB partielle : volontairement laissée à traiter :");
{
  // Même journée, mais la banque ne remet que 300 : le compte n'y est pas.
  // Chercher la combinaison qui tombe juste a été DÉSACTIVÉ le 28/04 après un
  // cas réel (495 € attribués à la mauvaise remise) : faute de connaître
  // l'heure des transactions, on ne peut pas distinguer deux CB de même
  // montant le même jour. La ligne doit donc rester « à traiter », pour être
  // pointée par le détail collé depuis le site de la banque.
  //
  // Ce test existe pour empêcher qu'on réactive ce rapprochement sans le
  // vouloir : s'il échoue, c'est que le mélange entre remises est revenu.
  const encaissements = [
    enc("c1", 100, "cb_terminal", "2026-09-05"),
    enc("c2", 200, "cb_terminal", "2026-09-05"),
    enc("c3", 50, "cb_terminal", "2026-09-05"),
  ];
  const r = rapprocherReleve(
    [ligne("06/09/2026", "REMISE CB", 300)],
    { ...etatVide, encaissementsCompta: encaissements },
  );
  assert("la remise reste à traiter", !r.finalMatched[0].matched, r.finalMatched[0].matchDetail);
  assert("aucune CB n'est consommée à tort", r.usedEncIds.size === 0, `${r.usedEncIds.size}`);
}

console.log("\n✓ Remise SEPA : le total du lot :");
{
  const r = rapprocherReleve(
    [ligne("08/09/2026", "PRLV SEPA REMISE ICS", 1250)],
    {
      ...etatVide,
      remisesSepa: [{ id: "rs1", numero: 12, montantTotal: 1250, nbTransactions: 8, datePrelevement: "2026-09-08" }],
    },
  );
  assert("le lot est reconnu", r.finalMatched[0].matched, r.finalMatched[0].matchDetail);
  assert("classé en prélèvement SEPA", r.finalMatched[0].matchType === "Prélèvement SEPA", r.finalMatched[0].matchType);
  assert("la remise est consommée", r.usedRemiseSepaIds.has("rs1"));
}

console.log("\n✓ Un rejet SEPA laisse la ligne non rapprochée :");
{
  // La banque crédite 1 037 € au lieu de 1 250 : un prélèvement de 213 € a été
  // rejeté. La ligne ne doit PAS se rapprocher — c'est ce silence qui alerte.
  const r = rapprocherReleve(
    [ligne("08/09/2026", "PRLV SEPA REMISE ICS", 1037)],
    {
      ...etatVide,
      remisesSepa: [{ id: "rs1", numero: 12, montantTotal: 1250, nbTransactions: 8, datePrelevement: "2026-09-08" }],
    },
  );
  assert("la ligne reste à traiter", !r.finalMatched[0].matched, r.finalMatched[0].matchDetail);
  assert("le lot n'est pas consommé à tort", !r.usedRemiseSepaIds.has("rs1"));
}

console.log("\n✓ Remise SEPA au libellé Crédit Agricole (« Avis de prélèvement emis PREL ECH DU ») :");
{
  // Le 02/09/2026, la banque crédite 300 € sous « Avis de prélèvement emis
  // PREL ECH DU 02/09/26 » : ni PRLV, ni SEPA dans le libellé. La remise
  // n°14 (une échéance de pension, déposée) totalise 300 €. La ligne restait
  // « à traiter ». Elle doit se rapprocher de la remise, et l'écriture du
  // journal née du dépôt (sepaEcheanceId) doit être consommée avec elle.
  const encaissements = [
    { ...enc("s1", 300, "prelevement_sepa", "2026-08-28", "ENAUX"), sepaEcheanceId: "ech1" },
    { ...enc("s2", 45, "prelevement_sepa", "2026-08-28", "MARTIN"), sepaEcheanceId: "ech2" },
  ];
  const r = rapprocherReleve(
    [ligne("02/09/2026", "Avis de prélèvement emis PREL ECH DU 02/09/26", 300)],
    {
      ...etatVide,
      encaissementsCompta: encaissements,
      remisesSepa: [{ id: "rs14", numero: 14, montantTotal: 300, nbTransactions: 1, datePrelevement: "2026-09-02", echeanceIds: ["ech1"] }],
    },
  );
  const l = r.finalMatched[0];
  assert("la ligne est rapprochée", l.matched, l.matchDetail);
  assert("classée en prélèvement SEPA", l.matchType === "Prélèvement SEPA", l.matchType);
  assert("la remise est consommée", r.usedRemiseSepaIds.has("rs14"));
  assert("l'écriture de la remise est consommée", r.usedEncIds.has("s1"));
  assert("celle d'une autre remise ne l'est pas", !r.usedEncIds.has("s2"));
  assert("l'écriture figure dans le détail de la ligne", (l.matchedEncs || []).length === 1 && l.matchedEncs![0].familyName === "ENAUX");
  assert("la remise est référencée sur la ligne", l.remiseSepaId === "rs14", l.remiseSepaId);
}

console.log("\n✓ Remise SEPA de 40 prélèvements : toutes les écritures suivent :");
{
  const encaissements: any[] = [];
  const echeanceIds: string[] = [];
  for (let i = 0; i < 40; i++) {
    encaissements.push({ ...enc(`s${i}`, 57, "prelevement_sepa", "2026-09-01", `FAMILLE${i}`), sepaEcheanceId: `ech${i}` });
    echeanceIds.push(`ech${i}`);
  }
  const r = rapprocherReleve(
    [ligne("05/09/2026", "AVIS DE PRELEVEMENT EMIS PREL ECH DU 05/09/26", 2280)],
    {
      ...etatVide,
      encaissementsCompta: encaissements,
      remisesSepa: [{ id: "rs15", numero: 15, montantTotal: 2280, nbTransactions: 40, datePrelevement: "2026-09-05", echeanceIds }],
    },
  );
  assert("la ligne est rapprochée", r.finalMatched[0].matched, r.finalMatched[0].matchDetail);
  assert("les 40 écritures sont consommées", r.usedEncIds.size === 40, `${r.usedEncIds.size}`);
}

console.log("\n✓ Un prélèvement sans remise correspondante reste à traiter :");
{
  // Pas de rapprochement « au montant » sur un prélèvement : sans remise SEPA
  // de ce total, la ligne attend le pointage manuel plutôt que de prendre
  // n'importe quel encaissement de 300 €.
  const encaissements = [enc("x1", 300, "cheque", "2026-09-02", "DURAND")];
  const r = rapprocherReleve(
    [ligne("02/09/2026", "Avis de prélèvement emis PREL ECH DU 02/09/26", 300)],
    { ...etatVide, encaissementsCompta: encaissements },
  );
  assert("la ligne reste à traiter", !r.finalMatched[0].matched, r.finalMatched[0].matchDetail);
  assert("le chèque n'est pas consommé", r.usedEncIds.size === 0);
}

console.log("\n✓ Virement reçu pour une facture créée en attente (sans mode de paiement) :");
{
  // Nicolas crée la facture « pension » de 300 € pour la famille Enaux, en
  // attendant leur virement. Elle n'a pas de mode de paiement. Le virement
  // arrive : « Virement en votre faveur M OU MME HENRI ENAUX … ». La facture
  // doit être reconnue par le nom et le montant.
  const payments = [{
    id: "f1", familyName: "Enaux", totalTTC: 300, paidAmount: 0, status: "pending", paymentMode: "",
    date: { seconds: Math.floor(new Date("2026-08-30T12:00:00Z").getTime() / 1000) },
  }];
  const r = rapprocherReleve(
    [ligne("01/09/2026", "Virement en votre faveur M OU MME HENRI ENAUX C08V26244L0 - pension Dalhia", 300)],
    { ...etatVide, payments },
  );
  const l = r.finalMatched[0];
  assert("la ligne est rapprochée", l.matched, l.matchDetail);
  assert("reliée à la facture", l.manualPaymentId === "f1", l.manualPaymentId);
  assert("sans réserve (nom + montant)", !l.uncertain);
  assert("la facture est consommée", r.usedPaymentIds.has("f1"));
}

console.log("\n✓ Une facture sans mode n'est pas candidate pour un prélèvement :");
{
  const payments = [{
    id: "f1", familyName: "Enaux", totalTTC: 300, paidAmount: 0, status: "pending", paymentMode: "",
    date: { seconds: Math.floor(new Date("2026-08-30T12:00:00Z").getTime() / 1000) },
  }];
  const r = rapprocherReleve(
    [ligne("02/09/2026", "Avis de prélèvement emis PREL ECH DU 02/09/26", 300)],
    { ...etatVide, payments },
  );
  assert("la ligne reste à traiter", !r.finalMatched[0].matched, r.finalMatched[0].matchDetail);
  assert("la facture n'est pas consommée", r.usedPaymentIds.size === 0);
}

console.log("\n✓ Unicité : deux lignes de même montant :");
{
  // Deux virements de 120 € le même jour, mais une seule recette de 120 € en
  // base. La seconde ligne ne doit pas se rapprocher de la même recette.
  const encaissements = [enc("v1", 120, "virement", "2026-09-04", "DUPONT")];
  const r = rapprocherReleve(
    [ligne("04/09/2026", "VIR DE DUPONT", 120), ligne("04/09/2026", "VIR DE DUPONT", 120)],
    { ...etatVide, encaissementsCompta: encaissements },
  );
  const rapprochees = r.finalMatched.filter(l => l.matched).length;
  assert("une seule ligne est rapprochée", rapprochees === 1, `${rapprochees}`);
  assert("un seul encaissement consommé", r.usedEncIds.size === 1, `${r.usedEncIds.size}`);
}

console.log("\n✓ Un pointage manuel survit au ré-import :");
{
  const precedentes = [{
    ...ligne("04/09/2026", "VIR INCONNU", 80),
    matched: true, matchType: "Manuel", matchDetail: "Pointé à la main",
  }];
  const r = rapprocherReleve(
    [ligne("04/09/2026", "VIR INCONNU", 80)],
    { ...etatVide, bankLines: precedentes },
  );
  assert("le pointage est conservé", r.finalMatched[0].matchType === "Manuel", r.finalMatched[0].matchType);
  assert("son motif aussi", r.finalMatched[0].matchDetail === "Pointé à la main", r.finalMatched[0].matchDetail);
  assert("il est compté comme préservé", r.manuelsPreserves === 1, `${r.manuelsPreserves}`);
  assert("et pas comme recalculé", r.autoOverwritten === 0, `${r.autoOverwritten}`);
}

console.log("\n✓ Une ligne ignorée le reste :");
{
  const precedentes = [{
    ...ligne("04/09/2026", "FRAIS TENUE DE COMPTE", 12),
    matched: true, matchType: "Ignoré", matchDetail: "Hors périmètre",
  }];
  const r = rapprocherReleve(
    [ligne("04/09/2026", "FRAIS TENUE DE COMPTE", 12)],
    { ...etatVide, bankLines: precedentes },
  );
  assert("elle reste ignorée", r.finalMatched[0].matchType === "Ignoré", r.finalMatched[0].matchType);
}

console.log("\n✓ Relevé sans correspondance :");
{
  const r = rapprocherReleve(
    [ligne("04/09/2026", "VIR DE INCONNU", 999)],
    etatVide,
  );
  assert("la ligne ressort non rapprochée", !r.finalMatched[0].matched);
  assert("rien n'est consommé", r.usedEncIds.size === 0 && r.usedPaymentIds.size === 0);
}

console.log("\n✓ Relevé vide :");
{
  const r = rapprocherReleve([], etatVide);
  assert("aucune ligne", r.finalMatched.length === 0);
  assert("aucun avertissement", r.autoOverwritten === 0);
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  RESUME : ${passed} passes, ${failed} echoues`);
console.log("══════════════════════════════════════════════════════════════\n");
if (failed > 0) { console.log("Echecs :"); failures.forEach(f => console.log(`  - ${f}`)); process.exit(1); }
console.log("✅ Tous les tests sont passes !\n");
