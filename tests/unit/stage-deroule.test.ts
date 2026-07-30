/**
 * tests/unit/stage-deroule.test.ts
 *
 * Tests du bloc « deroule de la seance » insere dans les emails de stage.
 *   npx tsx tests/unit/stage-deroule.test.ts
 *
 * Enjeu : ce bloc part aux familles. La regle non negociable est qu'un
 * reglage incomplet ne produit RIEN — annoncer un deroule invente
 * aggraverait les reclamations qu'il doit justement faire disparaitre.
 */

import { derouleEstRempli, renderDerouleStage, renderDerouleTexte, STAGE_DEROULE_VIDE } from "../../src/lib/stage-deroule";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires deroule de stage");
console.log("══════════════════════════════════════════════════════════════\n");

const complet = {
  sequence1Titre: "1re heure — Équitation montée",
  sequence1Detail: "Travail en carrière, jeux à poney",
  sequence2Titre: "2e heure — Atelier à pied",
  sequence2Detail: "Pansage, soins et connaissance du poney",
};

// ─── Regle de securite : rien tant que ce n'est pas rempli ────────
console.log("✓ Reglage incomplet = aucun bloc :");
{
  assert("reglage vide", renderDerouleStage(STAGE_DEROULE_VIDE) === "");
  assert("null", renderDerouleStage(null) === "");
  assert("undefined", renderDerouleStage(undefined) === "");
  assert("titre 2 manquant", renderDerouleStage({ ...complet, sequence2Titre: "" }) === "");
  assert("titre 1 manquant", renderDerouleStage({ ...complet, sequence1Titre: "" }) === "");
  assert("titres en espaces seuls", renderDerouleStage({ ...complet, sequence1Titre: "   " }) === "");
  assert("details seuls ne suffisent pas", renderDerouleStage({
    sequence1Titre: "", sequence1Detail: "du poney", sequence2Titre: "", sequence2Detail: "des soins",
  }) === "");
}

// ─── Cas nominal ─────────────────────────────────────────────────
console.log("\n✓ Reglage complet :");
{
  const html = renderDerouleStage(complet);
  assert("bloc genere", html.length > 0);
  assert("titre 1 present", html.includes("1re heure"));
  assert("titre 2 present", html.includes("2e heure"));
  assert("detail 1 present", html.includes("Travail en carrière"));
  assert("detail 2 present", html.includes("Pansage"));
  assert("intitule explicite", html.includes("Comment se déroule la séance"));
  assert("numerotation 1 et 2", html.includes(">1<") && html.includes(">2<"));
}
{
  // Le detail est facultatif
  const html = renderDerouleStage({ ...complet, sequence1Detail: "", sequence2Detail: "" });
  assert("titres seuls suffisent", html.length > 0);
  assert("pas de ligne de detail vide", !html.includes("margin-top:2px;\"></div>"));
}

// ─── Note complementaire ─────────────────────────────────────────
console.log("\n✓ Note complementaire :");
{
  const html = renderDerouleStage({ ...complet, note: "L'ordre peut être inversé selon les groupes." });
  assert("note affichee", html.includes("inversé selon les groupes"));
  const sansNote = renderDerouleStage({ ...complet, note: "   " });
  assert("note vide ignoree", !sansNote.includes("<p style=\"margin:8px 0 0;color:#92400e;font-size:12px;\">"));
}

// ─── Securite HTML ───────────────────────────────────────────────
console.log("\n✓ Echappement HTML :");
{
  const html = renderDerouleStage({
    ...complet,
    sequence1Titre: '<script>alert("x")</script>',
  });
  assert("balise neutralisee", !html.includes("<script>"), "injection possible");
  assert("texte conserve echappe", html.includes("&lt;script&gt;"));
}
{
  const html = renderDerouleStage({ ...complet, sequence2Detail: 'Soins & "brossage"' });
  assert("esperluette echappee", html.includes("&amp;"));
  assert("guillemets echappes", html.includes("&quot;"));
}

// ─── Version texte ───────────────────────────────────────────────
console.log("\n✓ Version texte (apercu admin) :");
{
  const txt = renderDerouleTexte(complet);
  assert("deux lignes numerotees", txt.split("\n").length === 2, txt);
  assert("commence par 1.", txt.startsWith("1. "));
  assert("apercu vide si incomplet", renderDerouleTexte(STAGE_DEROULE_VIDE) === "");
  const avecNote = renderDerouleTexte({ ...complet, note: "Ordre variable" });
  assert("note ajoutee en 3e ligne", avecNote.split("\n").length === 3);
}

// ─── Predicat ────────────────────────────────────────────────────
console.log("\n✓ derouleEstRempli :");
{
  assert("complet -> true", derouleEstRempli(complet));
  assert("vide -> false", !derouleEstRempli(STAGE_DEROULE_VIDE));
  assert("null -> false", !derouleEstRempli(null));
  assert("un seul titre -> false", !derouleEstRempli({ sequence1Titre: "A", sequence2Titre: "" }));
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  RESUME : ${passed} passes, ${failed} echoues`);
console.log("══════════════════════════════════════════════════════════════\n");
if (failed > 0) { console.log("\n❌ Echecs :"); failures.forEach(f => console.log("  • " + f)); process.exit(1); }
console.log("\n✅ Tous les tests sont passes !\n");
process.exit(0);
