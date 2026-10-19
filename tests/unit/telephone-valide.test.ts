/**
 * tests/unit/telephone-valide.test.ts — un numéro joignable, exigé avant de réserver.
 *   npx tsx tests/unit/telephone-valide.test.ts
 */
import assert from "node:assert/strict";
import { telephoneValide } from "../../src/lib/phone";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };

test("numéros français et étrangers acceptés", () => {
  for (const t of ["06 12 34 56 78", "0612345678", "06.12.34.56.78", "02 33 47 00 00", "+33 6 12 34 56 78", "0033612345678", "+44 7911 123456"]) assert.equal(telephoneValide(t), true, t);
});
test("vide, trop court ou fantaisiste : refusé", () => {
  for (const t of ["", "   ", "06", "0612", "00000", "abc", "1234567890", "0012"]) assert.equal(telephoneValide(t), false, t);
  assert.equal(telephoneValide(undefined), false);
});
console.log(`✅ ${n} tests passés`);
