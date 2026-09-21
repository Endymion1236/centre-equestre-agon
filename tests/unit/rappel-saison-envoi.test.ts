/**
 * tests/unit/rappel-saison-envoi.test.ts
 *
 * Le mail de reprise des cours : préparation et envoi, base et Resend simulés.
 *   npx tsx tests/unit/rappel-saison-envoi.test.ts
 *
 * Aucun email ne part, aucune base n'est touchée. On vérifie ce qui compte
 * pour un envoi de masse : regroupement par famille, exclusion des stages,
 * marqueur d'idempotence, et le fait qu'un aperçu n'envoie rien.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as rappelSaison from "../../src/lib/rappel-saison";
import * as emailTemplates from "../../src/lib/email-templates";
import * as dateLocal from "../../src/lib/date-local";

function charger(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const source = readFileSync(resolve(path), "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const module = { exports: {} as any };
  runInNewContext(outputText, {
    module, exports: module.exports, Date, Map, Set, String, Number, Boolean, JSON, Math, Intl, Array, Object, Promise, Error,
    process: { env: { RESEND_API_KEY: "re_test" } },
    console: { error() {}, warn() {}, log() {} },
    ...globals,
    require(name: string) {
      if (!(name in dependencies)) throw new Error(`Import non simulé : ${name}`);
      return dependencies[name];
    },
  }, { filename: path });
  return module.exports;
}

const creneau = (id: string, date: string, extra: Record<string, any>) => ({
  id, date, activityTitle: "Cours débutant", startTime: "17:00", endTime: "18:00", monitor: "Emeline", activityType: "cours", ...extra,
});

function fixture(opts: { creneaux?: any[]; flag?: any; resendOk?: boolean } = {}) {
  const envois: any[] = [];
  const logs: any[] = [];
  let flag: any = opts.flag ?? null;
  const familles: Record<string, any> = {
    famA: { parentEmail: "A@Exemple.fr", parentName: "Famille A" },
    famB: { parentEmail: "", parentName: "Famille sans email" },
  };
  const creneaux = opts.creneaux ?? [
    creneau("c1", "2026-09-21", { enrolled: [{ familyId: "famA", childId: "k1", childName: "Léa" }, { familyId: "famB", childId: "k9", childName: "Zoé" }] }),
    creneau("c2", "2026-09-23", { enrolled: [{ familyId: "famA", childId: "k2", childName: "Tom", familyEmail: "a@exemple.fr", familyName: "Famille A" }] }),
    creneau("c3", "2026-09-28", { enrolled: [{ familyId: "famA", childId: "k1", childName: "Léa" }] }), // semaine suivante : hors fenêtre
    creneau("s1", "2026-09-22", { activityType: "stage", enrolled: [{ familyId: "famA", childId: "k1", childName: "Léa" }] }),
    creneau("f1", "2026-09-22", { status: "closed", enrolled: [{ familyId: "famA", childId: "k1", childName: "Léa" }] }),
  ];
  const adminDb = {
    collection: (name: string) => {
      if (name === "system-flags") return { doc: () => ({
        get: async () => ({ exists: Boolean(flag), data: () => flag }),
        set: async (v: any) => { flag = v; },
      }) };
      if (name === "families") return { doc: (id: string) => ({ get: async () => ({ exists: Boolean(familles[id]), data: () => familles[id] }) }) };
      if (name === "creneaux") {
        const filtres: [string, string][] = [];
        const q: any = {
          where: (_f: string, op: string, v: string) => { filtres.push([op, v]); return q; },
          get: async () => ({ docs: creneaux
            .filter(c => filtres.every(([op, v]) => op === ">=" ? c.date >= v : c.date <= v))
            .map(c => ({ id: c.id, data: () => { const { id, ...rest } = c; return rest; } })) }),
        };
        return q;
      }
      throw new Error(`collection inattendue : ${name}`);
    },
  };
  const api = charger("src/lib/rappel-saison-envoi.ts", {
    "@/lib/firebase-admin": { adminDb },
    "@/lib/email-log": { logEmail: async (e: any) => { logs.push(e); } },
    "@/lib/email-guard": { isRecipientAllowed: (to: string) => !to.includes("bloque"), blockedLog: () => "" },
    "@/lib/date-local": dateLocal,
    "@/lib/email-templates": emailTemplates,
    "@/lib/rappel-saison": rappelSaison,
  }, {
    fetch: async (_url: string, init: any) => { envois.push(JSON.parse(init.body)); return { ok: opts.resendOk !== false, status: 500, text: async () => "boom" }; },
  });
  return { api, envois, logs, flag: () => flag };
}

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { process.exitCode = 1; console.error(`  ❌ ${name}`, e); }
}

async function main() {
  console.log("\n── Mail de reprise des cours ──");

  await test("la préparation regroupe par famille, exclut stages, fermés et semaine suivante, et n'envoie rien", async () => {
    const f = fixture();
    const prep = await f.api.preparerRappelSaison("2026-09-21");
    assert.equal(prep.finSemaine, "2026-09-27");
    assert.equal(prep.creneaux, 2, "c1 et c2 seulement");
    assert.equal(prep.familles.length, 1);
    assert.equal(prep.familles[0].email, "a@exemple.fr", "email normalisé en minuscules, une seule entrée pour la famille");
    assert.equal(prep.familles[0].slots.length, 2);
    assert.equal(JSON.stringify(prep.familles[0].slots.map((s: any) => s.enfants)), JSON.stringify([["Léa"], ["Tom"]]));
    assert.equal(prep.sansEmail, 1);
    assert.equal(prep.dejaEnvoye, null);
    assert.equal(f.envois.length, 0);
    assert.equal(f.flag(), null);
  });

  await test("l'envoi écrit un email par famille, journalise et pose le marqueur", async () => {
    const f = fixture();
    const r = await f.api.envoyerRappelSaison({ saisonDebut: "2026-09-21", sentBy: "nicolas@club.fr", context: "admin_saison_rappel" });
    assert.equal(r.skipped, false);
    assert.equal(r.emailsSent, 1);
    assert.equal(f.envois.length, 1);
    assert.equal(f.envois[0].to, "a@exemple.fr");
    assert.match(f.envois[0].html, /Léa/);
    assert.match(f.envois[0].html, /Tom/);
    assert.equal(f.logs[0].context, "admin_saison_rappel");
    assert.equal(f.logs[0].sentBy, "nicolas@club.fr");
    assert.equal(f.flag().emailsSent, 1);
    assert.equal(f.flag().sentBy, "nicolas@club.fr");
  });

  await test("déjà envoyé : rien ne repart sans « force »", async () => {
    const f = fixture({ flag: { sentAt: "2026-09-20T20:00:00.000Z", families: 1, emailsSent: 1, sentBy: "system" } });
    const r = await f.api.envoyerRappelSaison({ saisonDebut: "2026-09-21", sentBy: "system", context: "cron_saison_rappel" });
    assert.equal(r.skipped, true);
    assert.equal(f.envois.length, 0);
    assert.equal(r.dejaEnvoye.sentBy, "system");
  });

  await test("« force » renvoie et garde la trace du premier envoi", async () => {
    const f = fixture({ flag: { sentAt: "2026-09-20T20:00:00.000Z", families: 1, emailsSent: 1, sentBy: "system" } });
    const r = await f.api.envoyerRappelSaison({ saisonDebut: "2026-09-21", force: true, sentBy: "nicolas@club.fr", context: "admin_saison_rappel" });
    assert.equal(r.skipped, false);
    assert.equal(f.envois.length, 1);
    assert.equal(f.flag().renvoiDe, "2026-09-20T20:00:00.000Z");
  });

  await test("un refus de Resend est compté en erreur et journalisé, sans bloquer les autres", async () => {
    const f = fixture({ resendOk: false });
    const r = await f.api.envoyerRappelSaison({ saisonDebut: "2026-09-21", sentBy: "system", context: "cron_saison_rappel" });
    assert.equal(r.errors, 1);
    assert.equal(r.emailsSent, 0);
    assert.equal(f.logs[0].status, "failed");
  });

  await test("une date invalide est refusée avant toute lecture", async () => {
    const f = fixture();
    assert.equal(f.api.dateRentreeValide("2026-09-21"), true);
    assert.equal(f.api.dateRentreeValide("21/09/2026"), false);
    assert.equal(f.api.dateRentreeValide(undefined), false);
    await assert.rejects(() => f.api.preparerRappelSaison("2026-13-45"), /invalide/);
  });

  console.log(process.exitCode ? "\n❌ des tests ont échoué" : `\n✅ ${passed} tests passés`);
}
main();
