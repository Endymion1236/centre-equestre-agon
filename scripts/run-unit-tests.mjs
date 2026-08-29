#!/usr/bin/env node
/**
 * Lance TOUS les tests unitaires de tests/unit/.
 *
 * Le script `test:unit` énumérait les fichiers un par un dans package.json.
 * Trois d'entre eux — caisse-mouvements, lissage-ete, temps-travail — avaient
 * été oubliés à l'ajout : mouvements de caisse, lissage des tarifs d'été et
 * temps de travail des salariés n'étaient donc jamais vérifiés, alors que les
 * trois passaient (audit 29/08/2026, Q2).
 *
 * On découvre désormais les fichiers : tout nouveau test est pris en compte
 * sans rien à modifier ici.
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const dossier = join(racine, "tests", "unit");

const fichiers = readdirSync(dossier)
  .filter((f) => f.endsWith(".test.ts"))
  .sort();

if (fichiers.length === 0) {
  console.error("Aucun test unitaire trouvé dans tests/unit/");
  process.exit(1);
}

console.log(`\n🧪 ${fichiers.length} fichiers de tests unitaires\n`);

const echecs = [];
for (const f of fichiers) {
  const r = spawnSync("npx", ["tsx", join(dossier, f)], {
    stdio: "inherit",
    cwd: racine,
    shell: process.platform === "win32",
  });
  if (r.status !== 0) echecs.push(f);
}

console.log("\n" + "═".repeat(62));
if (echecs.length === 0) {
  console.log(`✅ ${fichiers.length}/${fichiers.length} fichiers de tests passés`);
  process.exit(0);
}
console.error(`❌ ${echecs.length} fichier(s) en échec : ${echecs.join(", ")}`);
process.exit(1);
