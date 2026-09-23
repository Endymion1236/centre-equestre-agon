import assert from "node:assert/strict";
import {
  TYPES_DOC_SALARIE,
  TYPES_DOC_MENSUELS,
  estDocMensuel,
  labelTypeDoc,
  emojiTypeDoc,
  labelPeriode,
} from "../../src/lib/docs-salaries";

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

console.log("\n── Coffre à documents des salariés ──");

test("les diplômes et le registre des horaires sont proposés dans le coffre", () => {
  const ids = TYPES_DOC_SALARIE.map(t => t.id);
  assert.ok(ids.includes("diplome"));
  assert.ok(ids.includes("registre_horaires"));
  assert.equal(labelTypeDoc("diplome"), "Diplôme / qualification");
  assert.equal(labelTypeDoc("registre_horaires"), "Registre des horaires");
});

test("chaque type a un identifiant unique, un libellé et un emoji", () => {
  const ids = TYPES_DOC_SALARIE.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of TYPES_DOC_SALARIE) {
    assert.ok(t.label.trim().length > 0, `libellé vide pour ${t.id}`);
    assert.ok(t.emoji.trim().length > 0, `emoji vide pour ${t.id}`);
  }
  assert.equal(ids[ids.length - 1], "autre", "« Autre document » reste en dernier");
});

test("la fiche de paie et le registre des horaires sont rattachés à un mois, pas les autres", () => {
  assert.equal(estDocMensuel("fiche_paie"), true);
  assert.equal(estDocMensuel("registre_horaires"), true);
  assert.equal(estDocMensuel("diplome"), false);
  assert.equal(estDocMensuel("contrat"), false);
  assert.equal(estDocMensuel("inconnu"), false);
  for (const t of TYPES_DOC_MENSUELS) assert.ok(TYPES_DOC_SALARIE.some(d => d.id === t));
});

test("un type inconnu (ancien document) garde un affichage neutre", () => {
  assert.equal(labelTypeDoc("truc"), "Document");
  assert.equal(emojiTypeDoc("truc"), "📎");
});

test("le mois s'affiche en français", () => {
  assert.equal(labelPeriode("2026-08"), "août 2026");
  assert.equal(labelPeriode(""), "");
  assert.equal(labelPeriode("n'importe"), "n'importe");
});

console.log(process.exitCode ? "\n❌ des tests ont échoué" : `\n✅ ${passes} tests passés`);
