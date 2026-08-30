/**
 * Tests de src/lib/rib-texte.ts
 *
 * Le cas de référence est un message réel : une famille avait recopié les
 * lignes de sa banque dans le corps du mail, sans pièce jointe. La lecture
 * assistée ne proposait alors aucun bouton.
 */
import assert from "node:assert/strict";
import { extraireRibDuTexte, contientUnRib } from "../../src/lib/rib-texte";

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

// Message réel (IBAN de test à clé valide).
const MAIL = `Bonjour,

Voici mes coordonnées bancaires :

C/C EUROCOMPTE CONFORT
MLE V CHAPDELAINE OU M S GIOT
RIB
15489 04706 00031290901 86
IBAN
FR14 2004 1010 0505 0001 3M02 606
BIC
CMCIFR2A

Cordialement`;

console.log("\n── Message réel, RIB dans le corps ──");

test("l'IBAN est extrait malgré les espaces", () => {
  const r = extraireRibDuTexte(MAIL);
  assert.ok(r, "aucun RIB trouvé");
  assert.equal(r!.iban, "FR1420041010050500013M02606");
});

test("le BIC est extrait", () => {
  assert.equal(extraireRibDuTexte(MAIL)!.bic, "CMCIFR2A");
});

test("le titulaire est repris de la ligne en capitales", () => {
  assert.equal(extraireRibDuTexte(MAIL)!.titulaire, "MLE V CHAPDELAINE OU M S GIOT");
});

test("le libellé du produit bancaire n'est pas pris pour le titulaire", () => {
  assert.notEqual(extraireRibDuTexte(MAIL)!.titulaire, "C/C EUROCOMPTE CONFORT");
});

console.log("\n── Ce qui doit être refusé ──");

test("un IBAN à clé de contrôle fausse est REJETÉ", () => {
  // Dernier chiffre modifié : la clé modulo 97 ne tombe plus juste.
  const faux = MAIL.replace("3M02 606", "3M02 607");
  assert.equal(extraireRibDuTexte(faux), null, "un IBAN invalide a été accepté");
});

test("un texte sans IBAN ne renvoie rien", () => {
  assert.equal(extraireRibDuTexte("Bonjour, je confirme l'inscription d'Eléonore. Merci !"), null);
});

test("une référence client qui ressemble à un IBAN est ignorée", () => {
  assert.equal(extraireRibDuTexte("Votre référence : FR00 1234 5678 9012 3456 7890 123"), null);
});

test("un texte vide ou absent ne fait pas planter", () => {
  assert.equal(extraireRibDuTexte(""), null);
  assert.equal(extraireRibDuTexte(undefined as any), null);
  assert.equal(extraireRibDuTexte(null as any), null);
});

console.log("\n── Variantes d'écriture ──");

test("un IBAN écrit d'un seul bloc est reconnu", () => {
  const r = extraireRibDuTexte("Mon IBAN : FR1420041010050500013M02606 merci");
  assert.equal(r!.iban, "FR1420041010050500013M02606");
});

test("un IBAN en minuscules est reconnu", () => {
  const r = extraireRibDuTexte("iban fr14 2004 1010 0505 0001 3m02 606");
  assert.equal(r!.iban, "FR1420041010050500013M02606");
});

test("l'absence de BIC n'empêche pas l'extraction", () => {
  const r = extraireRibDuTexte("IBAN FR14 2004 1010 0505 0001 3M02 606");
  assert.ok(r);
  assert.equal(r!.bic, null);
});

test("un BIC d'un autre pays que l'IBAN est écarté", () => {
  // DEUTDEFF est un BIC allemand valide ; l'IBAN est français.
  const r = extraireRibDuTexte("IBAN FR14 2004 1010 0505 0001 3M02 606\nBIC DEUTDEFF");
  assert.equal(r!.bic, null, "un BIC incohérent avec le pays a été retenu");
});

console.log("\n── Détection pour l'affichage du bouton ──");

test("contientUnRib suit extraireRibDuTexte", () => {
  assert.equal(contientUnRib(MAIL), true);
  assert.equal(contientUnRib("Bonjour, à bientôt"), false);
});

console.log(`\n✅ ${passes} tests passés\n`);
