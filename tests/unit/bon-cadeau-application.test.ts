/**
 * tests/unit/bon-cadeau-application.test.ts
 *
 * Appliquer un bon cadeau sur une commande, base simulée.
 *   npx tsx tests/unit/bon-cadeau-application.test.ts
 *
 * Ce que doit garantir la porte unique d'application : le bon est vérifié
 * (statut, solde, validité), le montant est plafonné (solde, reste dû,
 * plafond demandé), l'écriture passe en « avoir », la commande soldée reçoit
 * un numéro de facture, le bon diminue, et une famille ne règle que ses
 * propres commandes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function charger(path: string, dependencies: Record<string, unknown>) {
  const source = readFileSync(resolve(path), "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const module = { exports: {} as any };
  runInNewContext(outputText, {
    module, exports: module.exports, Date, Map, Set, String, Number, Boolean, JSON, Math, Intl, Array, Object, Promise, Error, RegExp,
    console: { error() {}, warn() {}, log() {} },
    require(name: string) {
      if (!(name in dependencies)) throw new Error(`Import non simulé : ${name}`);
      return dependencies[name];
    },
  }, { filename: path });
  return module.exports;
}

function fixture(opts: { bon?: any; payment?: any; encaissements?: any[] } = {}) {
  const bon: any = { code: "BON-TEST", montant: 50, solde: 50, statut: "actif", ...(opts.bon || {}) };
  const payment: any = { familyId: "famA", familyName: "Famille A", totalTTC: 80, paidAmount: 0, status: "pending", items: [{ activityTitle: "Carte 5 séances" }], ...(opts.payment || {}) };
  const encaissements: any[] = [...(opts.encaissements || [])];
  const journal: string[] = [];
  let numeroAttribue: string | null = null;
  let placesConfirmees = 0;
  const bonRef = { update: async (v: any) => { journal.push("bon.update"); Object.assign(bon, v); } };
  const payRef = {
    id: "pay1",
    get: async () => ({ exists: opts.payment !== null, data: () => payment }),
    update: async (v: any) => { journal.push("payment.update"); Object.assign(payment, v); },
  };
  const adminDb = {
    collection: (name: string) => {
      if (name === "bons-cadeaux") return {
        where: () => ({ limit: () => ({ get: async () => ({ empty: opts.bon === null, docs: [{ id: "bon1", data: () => bon }] }) }) }),
        doc: () => bonRef,
      };
      if (name === "payments") return { doc: () => payRef };
      if (name === "encaissements") return { where: () => ({ get: async () => ({ docs: encaissements.map(e => ({ data: () => e })) }) }) };
      throw new Error(`collection inattendue : ${name}`);
    },
  };
  const api = charger("src/lib/bon-cadeau-application.ts", {
    "firebase-admin/firestore": { FieldValue: { serverTimestamp: () => "TS", arrayUnion: (...v: any[]) => ({ arrayUnion: v }) } },
    "@/lib/firebase-admin": { adminDb },
    "@/lib/compta-encaissement-server": { createEncaissementServer: async (e: any) => { journal.push("encaissement"); encaissements.push(e); return "enc1"; } },
    "@/lib/invoice-number": { attribuerNumeroFacture: async () => { numeroAttribue = "F-2026-0042"; return { invoiceNumber: numeroAttribue, sequence: 42, year: 2026 }; } },
    "@/lib/places-tenues": { confirmerPlacesTenues: async () => { placesConfirmees++; return { confirmees: 0, reinscrites: 0 }; } },
  });
  return { api, bon, payment, encaissements, journal, numero: () => numeroAttribue, places: () => placesConfirmees };
}

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { process.exitCode = 1; console.error(`  ❌ ${name}`, e); }
}

async function main() {
  console.log("\n── Bon cadeau : vérification ──");

  await test("un bon actif, avec solde et non expiré, est utilisable", () => {
    const { api } = fixture();
    const bon = api.lireBon("b", { code: " bon-abc ", montant: 30, validUntil: "2026-12-31" });
    assert.equal(bon.code, "BON-ABC");
    assert.equal(bon.solde, 30, "sans champ solde, le solde vaut le montant");
    assert.equal(api.evaluerBon(bon, "2026-09-21").ok, true);
  });

  await test("épuisé, annulé, utilisé ou expiré : refusé avec une raison lisible", () => {
    const { api } = fixture();
    const base = { code: "BON-X", montant: 30 };
    assert.match(api.evaluerBon(api.lireBon("b", { ...base, solde: 0 }), "2026-09-21").raison, /épuisé/);
    assert.match(api.evaluerBon(api.lireBon("b", { ...base, statut: "annule" }), "2026-09-21").raison, /annulé/);
    assert.match(api.evaluerBon(api.lireBon("b", { ...base, statut: "utilise" }), "2026-09-21").raison, /utilisé/);
    assert.match(api.evaluerBon(api.lireBon("b", { ...base, validUntil: "2026-09-20" }), "2026-09-21").raison, /expiré le 2026-09-20/);
    assert.equal(api.evaluerBon(api.lireBon("b", { ...base, validUntil: "2026-09-21" }), "2026-09-21").ok, true, "valable le dernier jour inclus");
  });

  console.log("\n── Bon cadeau : application ──");

  await test("bon 50 € sur une commande de 80 € : 50 € appliqués, commande partielle, bon épuisé", async () => {
    const f = fixture();
    const r = await f.api.appliquerBonCadeau({ code: "bon-test", paymentId: "pay1", appliquePar: "nicolas@club.fr" });
    assert.equal(r.applique, 50);
    assert.equal(r.resteAPayer, 30);
    assert.equal(r.facturePayee, false);
    assert.equal(r.soldeRestantBon, 0);
    assert.equal(f.encaissements[0].mode, "avoir", "un bon est un crédit, pas une recette");
    assert.equal(f.encaissements[0].modeLabel, "Bon cadeau");
    assert.equal(f.encaissements[0].ref, "BON-TEST");
    assert.equal(f.payment.status, "partial");
    assert.equal(f.payment.paidAmount, 50);
    assert.equal(f.bon.statut, "utilise");
    assert.equal(f.numero(), null, "pas de numéro de facture tant que la commande n'est pas soldée");
    assert.equal(f.places(), 1, "les places tenues sont confirmées dès qu'un règlement arrive");
  });

  await test("bon 100 € sur 80 € dus : plafonné au reste, commande soldée et numérotée, 20 € restent sur le bon", async () => {
    const f = fixture({ bon: { montant: 100, solde: 100 } });
    const r = await f.api.appliquerBonCadeau({ code: "BON-TEST", paymentId: "pay1", appliquePar: "famille:famA", familleUid: "famA" });
    assert.equal(r.applique, 80);
    assert.equal(r.facturePayee, true);
    assert.equal(r.invoiceNumber, "F-2026-0042");
    assert.equal(f.payment.status, "paid");
    assert.equal(f.payment.invoiceNumber, "F-2026-0042");
    assert.equal(f.bon.solde, 20);
    assert.equal(f.bon.statut, "actif");
  });

  await test("plafond demandé (acompte de stage 30 €) : on n'applique que 30 €", async () => {
    const f = fixture({ bon: { montant: 100, solde: 100 }, payment: { totalTTC: 180 } });
    const r = await f.api.appliquerBonCadeau({ code: "BON-TEST", paymentId: "pay1", montantMax: 30, appliquePar: "admin" });
    assert.equal(r.applique, 30);
    assert.equal(r.resteAPayer, 150);
    assert.equal(f.bon.solde, 70);
  });

  await test("le réglé se relit dans le journal : un acompte déjà encaissé compte", async () => {
    const f = fixture({ bon: { montant: 100, solde: 100 }, payment: { totalTTC: 80, paidAmount: 30, status: "partial" }, encaissements: [{ montant: 30, mode: "especes" }] });
    const r = await f.api.appliquerBonCadeau({ code: "BON-TEST", paymentId: "pay1", appliquePar: "admin" });
    assert.equal(r.applique, 50);
    assert.equal(f.payment.paidAmount, 80);
    assert.equal(f.payment.paymentMode, "mixte");
    assert.equal(f.payment.status, "paid");
  });

  await test("une famille ne règle que ses commandes ; une commande soldée ou annulée est refusée", async () => {
    const f = fixture();
    await assert.rejects(() => f.api.appliquerBonCadeau({ code: "BON-TEST", paymentId: "pay1", familleUid: "autre", appliquePar: "famille:autre" }), /pas la vôtre/);
    assert.equal(f.journal.length, 0, "rien n'a été écrit");
    const g = fixture({ payment: { status: "paid", paidAmount: 80 } });
    await assert.rejects(() => g.api.appliquerBonCadeau({ code: "BON-TEST", paymentId: "pay1", appliquePar: "admin" }), /déjà réglée/);
    const h = fixture({ payment: { status: "cancelled" } });
    await assert.rejects(() => h.api.appliquerBonCadeau({ code: "BON-TEST", paymentId: "pay1", appliquePar: "admin" }), /annulée/);
  });

  await test("bon introuvable ou refusé : rien n'est écrit", async () => {
    const f = fixture({ bon: null });
    await assert.rejects(() => f.api.appliquerBonCadeau({ code: "BON-NOPE", paymentId: "pay1", appliquePar: "admin" }), /introuvable/);
    const g = fixture({ bon: { solde: 0 } });
    await assert.rejects(() => g.api.appliquerBonCadeau({ code: "BON-TEST", paymentId: "pay1", appliquePar: "admin" }), /épuisé/);
    assert.equal(g.journal.length, 0);
  });

  console.log(process.exitCode ? "\n❌ des tests ont échoué" : `\n✅ ${passed} tests passés`);
}
main();
