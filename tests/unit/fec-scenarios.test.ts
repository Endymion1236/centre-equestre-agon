/**
 * tests/unit/fec-scenarios.test.ts — le « crash-test fiscal » du FEC.
 *
 * Des cas réels du club, passés dans le FEC mensuel (fec-complet) avec la
 * TVA sur les encaissements : à chaque mise à jour, on vérifie que le
 * fichier reste juste — écritures équilibrées, aucun montant négatif, rien
 * au compte d'attente sans raison, et la TVA exigible du mois égale à celle
 * de la déclaration (base encaissements).
 *   npx tsx tests/unit/fec-scenarios.test.ts
 */
import assert from "node:assert/strict";
import { construireFecComplet, tvaDuReglement, type EncaissementFec } from "../../src/lib/fec-complet";
import { preparerDeclarationTva } from "../../src/lib/declaration-tva";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const sec = (iso: string) => ({ seconds: Math.floor(new Date(iso).getTime() / 1000) });
const ht = (ttc: number, taux: number) => Math.round((ttc / (1 + taux / 100)) * 100) / 100;
const ligne = (activityTitle: string, ttc: number, tva: number) => ({ activityTitle, priceTTC: ttc, priceHT: ht(ttc, tva), tva });

type Facture = { id: string; familyName: string; invoiceNumber: string; totalTTC: number; status?: string; date: { seconds: number }; items: any[] };

function fec(factures: Facture[], encaissements: EncaissementFec[], opts: { tous?: EncaissementFec[]; payments?: Facture[]; moisCeleris?: string[] } = {}) {
  const payments = opts.payments || factures;
  const r = construireFecComplet({
    factures, encaissements, maintenant: new Date("2026-10-01"),
    numeroFactureDe: (id) => payments.find((p) => p.id === id)?.invoiceNumber,
    tvaEncaissements: { payments, moisCeleris: opts.moisCeleris || [], tousEncaissements: opts.tous || encaissements },
  });
  const lignes = r.contenu.split("\n").filter(Boolean).slice(1).map((l) => l.split("\t"));
  const cts = (v: string) => (v === "" ? 0 : Math.round(Number(v) * 100));
  /** Solde débit − crédit d'un compte, en euros. */
  const solde = (compte: string) => lignes.filter((c) => c[4] === compte).reduce((s, c) => s + cts(c[11]) - cts(c[12]), 0) / 100;
  return { r, lignes, solde, cts };
}

/** Les règles qui valent pour TOUT fichier produit. */
function controlesGeneraux(f: ReturnType<typeof fec>) {
  const parNumero = new Map<string, number>();
  for (const c of f.lignes) {
    assert.equal(c.length, 18, "18 colonnes");
    assert.ok(!c[11].startsWith("-") && !c[12].startsWith("-"), `montant négatif : ${c.join(" | ")}`);
    assert.ok(!(c[11] && c[12]), "débit et crédit sur la même ligne");
    parNumero.set(c[2], (parNumero.get(c[2]) || 0) + f.cts(c[11]) - f.cts(c[12]));
  }
  for (const [n, s] of parNumero) assert.equal(s, 0, `écriture ${n} déséquilibrée`);
  const numeros = [...parNumero.keys()].map(Number);
  assert.deepEqual(numeros, numeros.map((_, i) => i + 1), "numéros continus");
  assert.ok(!f.lignes.some((c) => /Écart de ventilation/.test(c[10])), "plus de rustine « Écart de ventilation »");
}

console.log("\n── TVA sur les encaissements ──");

test("facture de 180 € réglée 30 € : seule la TVA des 30 € devient exigible", () => {
  const f180: Facture = { id: "d", familyName: "DESHAYES", invoiceNumber: "F-2026-0200", totalTTC: 180, date: sec("2026-09-10T10:00:00Z"), items: [ligne("Stage", 180, 5.5)] };
  const f = fec([f180], [{ id: "e1", paymentId: "d", familyName: "DESHAYES", montant: 30, mode: "cb_terminal", date: sec("2026-09-10T11:00:00Z") }]);
  controlesGeneraux(f);
  assert.equal(f.solde("44574000"), -9.38 + 1.56, "TVA de la facture en attente, moins la part réglée");
  assert.equal(f.solde("44571200"), -1.56, "TVA exigible : 30 × 9,38 / 180");
  assert.equal(f.solde("41100000"), 150, "reste dû par le client");
});

test("forfait 699 € en 10× : chaque prélèvement rend exigible sa part, rien d'avance", () => {
  // 1re échéance : porte les lignes du forfait entier pour le montant d'une échéance.
  const premiere: Facture = { id: "f1", familyName: "Martin", invoiceNumber: "F-2026-0300", totalTTC: 69.9, date: sec("2026-09-05T10:00:00Z"),
    items: [ligne("Forfait annuel", 650, 5.5), ligne("Licence FFE", 25, 0), ligne("Adhésion", 24, 0)] };
  const f = fec([premiere], [{ id: "s1", paymentId: "f1", familyName: "Martin", montant: 69.9, mode: "prelevement_sepa", date: sec("2026-09-05T10:00:00Z") }]);
  controlesGeneraux(f);
  assert.equal(f.solde("44574000"), 0, "échéance payée : plus rien en attente");
  assert.equal(f.solde("44571200"), -3.39, "TVA 5,5 % d'une échéance (65,00 € sur 69,90, au prorata 650/699), pas du forfait entier");
  assert.equal(f.solde("47100000"), 0);
});

test("échéances qui ne tombent pas rond : le compte d'attente se solde au centime, d'un mois à l'autre", () => {
  const fac: Facture = { id: "x", familyName: "Leroy", invoiceNumber: "F-2026-0400", totalTTC: 100, date: sec("2026-09-01T10:00:00Z"), items: [ligne("Cours", 100, 5.5)] };
  const septembre: EncaissementFec[] = [
    { id: "a", paymentId: "x", familyName: "Leroy", montant: 33.33, mode: "cheque", date: sec("2026-09-01T10:00:00Z") },
    { id: "b", paymentId: "x", familyName: "Leroy", montant: 33.33, mode: "cheque", date: sec("2026-09-15T10:00:00Z") },
  ];
  const octobre: EncaissementFec[] = [{ id: "c", paymentId: "x", familyName: "Leroy", montant: 33.34, mode: "cheque", date: sec("2026-10-01T10:00:00Z") }];
  const tous = [...septembre, ...octobre];
  const sept = fec([fac], septembre, { tous });
  const oct = fec([], octobre, { tous, payments: [fac] });
  controlesGeneraux(sept); controlesGeneraux(oct);
  const tvaFacture = Math.round((100 - ht(100, 5.5)) * 100) / 100;
  assert.equal(Math.round((sept.solde("44571200") + oct.solde("44571200")) * 100) / 100, -tvaFacture, "toute la TVA, ni plus ni moins");
  assert.equal(Math.round((sept.solde("44574000") + oct.solde("44574000")) * 100), 0, "plus un centime en attente");
});

test("facture mixte licence 0 % + prestation 5,5 % : seule la TVA à 5,5 % bouge", () => {
  const fac: Facture = { id: "m", familyName: "Petit", invoiceNumber: "F-2026-0500", totalTTC: 155.5, date: sec("2026-09-02T10:00:00Z"),
    items: [ligne("Stage", 105.5, 5.5), ligne("Licence FFE", 50, 0)] };
  const f = fec([fac], [{ id: "e", paymentId: "m", familyName: "Petit", montant: 155.5, mode: "especes", date: sec("2026-09-02T10:00:00Z") }]);
  controlesGeneraux(f);
  assert.equal(f.solde("44571200"), -5.5);
  assert.equal(f.solde("53000000"), 155.5, "espèces en caisse");
  assert.ok(!f.lignes.some((c) => c[4].startsWith("4457") && /TVA 0%/.test(c[10])), "pas de ligne de TVA à 0 %");
});

test("CB, chèque différé, espèces : chaque mode sur son compte de trésorerie", () => {
  const fac = (id: string, n: string): Facture => ({ id, familyName: "Famille " + id, invoiceNumber: n, totalTTC: 52.75, date: sec("2026-09-03T10:00:00Z"), items: [ligne("Balade", 52.75, 5.5)] });
  const f = fec([fac("a", "F-1"), fac("b", "F-2"), fac("c", "F-3")], [
    { id: "1", paymentId: "a", familyName: "Famille a", montant: 52.75, mode: "cb_terminal", date: sec("2026-09-03T10:00:00Z") },
    { id: "2", paymentId: "b", familyName: "Famille b", montant: 52.75, mode: "cheque_differe", date: sec("2026-09-03T10:00:00Z") },
    { id: "3", paymentId: "c", familyName: "Famille c", montant: 52.75, mode: "especes", date: sec("2026-09-03T10:00:00Z") },
  ]);
  controlesGeneraux(f);
  assert.equal(f.solde("51150000"), 52.75);
  assert.equal(f.solde("51120000"), 52.75);
  assert.equal(f.solde("53000000"), 52.75);
  assert.equal(f.solde("44574000"), 0);
});

test("CB annulée par contre-passation : la TVA redevient en attente, rien n'est effacé", () => {
  const fac: Facture = { id: "k", familyName: "Roux", invoiceNumber: "F-2026-0600", totalTTC: 50, date: sec("2026-09-04T10:00:00Z"), items: [ligne("Halloween", 50, 5.5)] };
  const f = fec([fac], [
    { id: "p", paymentId: "k", familyName: "Roux", montant: 50, mode: "cb_terminal", date: sec("2026-09-04T10:00:00Z") },
    { id: "q", paymentId: "k", familyName: "Roux", montant: -50, mode: "cb_terminal", correctionDe: "p", date: sec("2026-09-04T12:00:00Z") },
  ]);
  controlesGeneraux(f);
  assert.equal(f.solde("44571200"), 0, "exigible puis annulée");
  assert.equal(f.solde("44574000"), -2.61, "de nouveau en attente");
  assert.ok(f.lignes.some((c) => /Contre-passation/.test(c[10])), "l'annulation est une écriture, pas une suppression");
});

test("règlement par avoir : la TVA a été rendue exigible quand l'argent est arrivé, pas de second virement", () => {
  const fac: Facture = { id: "v", familyName: "Blanc", invoiceNumber: "F-2026-0700", totalTTC: 26, date: sec("2026-09-06T10:00:00Z"), items: [ligne("Séance", 26, 5.5)] };
  const f = fec([fac], [{ id: "av", paymentId: "v", familyName: "Blanc", montant: 26, mode: "avoir", date: sec("2026-09-06T10:00:00Z") }]);
  controlesGeneraux(f);
  assert.equal(f.solde("44571200"), 0);
  assert.equal(f.solde("41910000"), 26, "avoir imputé");
});

test("facture d'un mois tenu dans Céleris réglée en septembre : sa TVA a déjà été déclarée, rien à virer", () => {
  const juillet: Facture = { id: "j", familyName: "Noir", invoiceNumber: "C-0712", totalTTC: 105.5, date: sec("2026-07-12T10:00:00Z"), items: [ligne("Stage", 105.5, 5.5)] };
  const f = fec([], [{ id: "e", paymentId: "j", familyName: "Noir", montant: 105.5, mode: "virement", date: sec("2026-09-02T10:00:00Z") }], { payments: [juillet], moisCeleris: ["2026-07", "2026-08"] });
  controlesGeneraux(f);
  assert.equal(f.solde("44571200"), 0);
  assert.equal(f.solde("44574000"), 0);
});

console.log("\n── Remises et écarts ──");

test("remise sur une ligne : produit et TVA AU DÉBIT, jamais de crédit négatif ni d'écart", () => {
  const fac: Facture = { id: "r", familyName: "Vert", invoiceNumber: "F-2026-0800", totalTTC: 200, date: sec("2026-09-07T10:00:00Z"),
    items: [ligne("Stage vacances", 263, 5.5), ligne("Remise fratrie", -63, 5.5)] };
  const f = fec([fac], [{ id: "e", paymentId: "r", familyName: "Vert", montant: 200, mode: "virement", date: sec("2026-09-07T10:00:00Z") }]);
  controlesGeneraux(f);
  const remise = f.lignes.filter((c) => c[0] === "VE" && /remise/i.test(c[10]));
  assert.equal(remise.length, 2, "ligne de produit et ligne de TVA de la remise");
  assert.ok(remise.every((c) => c[11] !== "" && c[12] === ""), "au débit");
  assert.equal(f.solde("47100000"), 0, "rien au compte d'attente");
  assert.equal(f.r.anomalies.length, 0);
});

test("détail illisible : l'écart va au 47100000 (à ventiler), jamais dans un produit, et c'est signalé", () => {
  const fac: Facture = { id: "i", familyName: "Gris", invoiceNumber: "F-2026-0900", totalTTC: 40, date: sec("2026-09-08T10:00:00Z"), items: [{ activityTitle: "Ancienne ligne", amount: 40 }] };
  const f = fec([fac], []);
  controlesGeneraux(f);
  assert.equal(f.solde("47100000"), -40);
  assert.ok(f.r.anomalies.some((a) => /47100000/.test(a)));
  assert.equal(f.r.resume.compteAttente, 40, "remonté pour la clôture du mois");
});

console.log("\n── Cohérence avec la déclaration ──");

test("la TVA exigible du FEC (4457x) = la TVA collectée de la CA3 en base encaissements", () => {
  const factures: Facture[] = [
    { id: "a", familyName: "A", invoiceNumber: "F-A", totalTTC: 180, status: "paid", date: sec("2026-09-10T10:00:00Z"), items: [ligne("Stage", 180, 5.5)] },
    { id: "b", familyName: "B", invoiceNumber: "F-B", totalTTC: 290, status: "paid", date: sec("2026-09-11T10:00:00Z"), items: [ligne("Pension", 240, 20), ligne("Licence FFE", 50, 0)] },
    { id: "c", familyName: "C", invoiceNumber: "F-C", totalTTC: 200, status: "paid", date: sec("2026-09-12T10:00:00Z"), items: [ligne("Stage", 263, 5.5), ligne("Remise", -63, 5.5)] },
  ];
  const enc: EncaissementFec[] = [
    { id: "1", paymentId: "a", familyName: "A", montant: 30, mode: "cb_terminal", date: sec("2026-09-10T10:00:00Z") },
    { id: "2", paymentId: "b", familyName: "B", montant: 145, mode: "virement", date: sec("2026-09-12T10:00:00Z") },
    { id: "3", paymentId: "c", familyName: "C", montant: 200, mode: "cheque", date: sec("2026-09-13T10:00:00Z") },
  ];
  const f = fec(factures, enc);
  controlesGeneraux(f);
  const exigibleFec = -(f.solde("44571200") + f.solde("44571700"));
  const ca3 = preparerDeclarationTva({ mois: ["2026-09"], base: "encaissements", payments: factures, encaissements: enc, celeris: {}, moisCeleris: [], deductible: { "2026-09": { immobilisations: 0, autresBiensServices: 0 } } });
  assert.ok(Math.abs(exigibleFec - ca3.collectee) <= 0.02, `FEC ${exigibleFec} € / CA3 ${ca3.collectee} €`);
});

test("tvaDuReglement : rien pour une facture à zéro ou un règlement nul", () => {
  const fac = { familyName: "Z", totalTTC: 0, items: [] };
  assert.deepEqual(tvaDuReglement(fac, 1000), []);
  assert.deepEqual(tvaDuReglement({ familyName: "Z", totalTTC: 10, items: [ligne("x", 10, 20)] }, 0), []);
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
