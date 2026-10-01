/**
 * tests/unit/controle-fec.test.ts — le contrôle de structure de Test Compta Démat, refait dans l'app.
 *   npx tsx tests/unit/controle-fec.test.ts
 */
import assert from "node:assert/strict";
import { CHAMPS_FEC, controlerStructureFec } from "../../src/lib/controle-fec";
import { construireFecComplet } from "../../src/lib/fec-complet";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}
const sec = (iso: string) => ({ seconds: Math.floor(new Date(iso).getTime() / 1000) });

test("un libellé sur deux lignes ou avec une tabulation ne casse plus le FEC (rejet Test Compta Démat d'octobre 2026)", () => {
  const facture = { id: "p", familyName: "Martin\tDupont", invoiceNumber: "F-1", totalTTC: 52.75, date: sec("2026-09-03T10:00:00Z"),
    items: [{ activityTitle: "Stage Toussaint\nGalop 3", priceHT: 50, priceTTC: 52.75, tva: 5.5 }] };
  const f = construireFecComplet({ factures: [facture], maintenant: new Date("2026-10-01"),
    encaissements: [{ id: "e", paymentId: "p", familyName: "Martin\r\nDupont", montant: 52.75, mode: "cb_terminal", date: sec("2026-09-03T10:00:00Z") }],
    tvaEncaissements: { payments: [facture], moisCeleris: [] } });
  assert.deepEqual(controlerStructureFec(f.contenu), []);
  assert.ok(f.contenu.includes("Stage Toussaint Galop 3"));
});

test("le contrôle voit une ligne coupée, une date fausse, un libellé vide, une écriture déséquilibrée", () => {
  const ent = CHAMPS_FEC.join("\t");
  const l = (o: Record<string, string>) => CHAMPS_FEC.map((c) => o[c] ?? "").join("\t");
  const base = { JournalCode: "VE", JournalLib: "Ventes", EcritureNum: "1", EcritureDate: "20260903", CompteNum: "41100000", CompteLib: "Clients", PieceRef: "F-1", PieceDate: "20260903", EcritureLib: "Créance", ValidDate: "20260903" };
  const contenu = [ent,
    l({ ...base, Debit: "10.00" }),
    l({ ...base, CompteNum: "70611000", CompteLib: "Cours", EcritureLib: "", Credit: "9.00" }),
    l({ ...base, EcritureNum: "2", EcritureDate: "20260931", Debit: "1" }).replace("Créance", "Cré\nance"),
  ].join("\n") + "\n";
  const e = controlerStructureFec(contenu);
  assert.ok(e.some((x) => /EcritureLib vide/.test(x)), "libellé vide");
  assert.ok(e.some((x) => /champs au lieu de 18/.test(x)), "ligne coupée");
  assert.ok(e.some((x) => /VE n° 1 déséquilibrée de 1.00/.test(x)), "déséquilibre");
  const date = controlerStructureFec([ent, l({ ...base, EcritureDate: "20260931", Debit: "1", Credit: "" }), l({ ...base, CompteNum: "706", Credit: "1" })].join("\n"));
  assert.ok(date.some((x) => /20260931/.test(x)), "31 septembre refusé");
});

test("un en-tête non conforme est signalé tout de suite", () => {
  assert.match(controlerStructureFec("JournalCode;JournalLib\n")[0], /En-tête non conforme/);
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
