/**
 * tests/unit/lier-compte.test.ts
 *
 * Le rattachement d'un compte à sa fiche famille, base simulée.
 *   npx tsx tests/unit/lier-compte.test.ts
 *
 * Le cas qui a motivé ces tests : une fiche vide créée sous l'identifiant du
 * compte arrêtait la recherche pour toujours. La famille revenait
 * indéfiniment sur un espace vierge pendant que ses cavaliers dormaient sur
 * la fiche du bureau — vingt-quatre comptes dans ce cas au 21/09/2026.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as fusionReelle from "../../src/lib/fusion-familles";

const UID = "uid-compte";
const EMAIL = "parent@exemple.fr";

function charger(path: string, dependencies: Record<string, unknown>) {
  const source = readFileSync(resolve(path), "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const module = { exports: {} as any };
  runInNewContext(outputText, {
    module, exports: module.exports, Date, Map, Set, String, Number, Boolean, JSON, Math, Array, Object, Promise, Error,
    console: { error() {}, warn() {}, log() {} },
    require(name: string) {
      if (!(name in dependencies)) throw new Error(`Import non simulé : ${name}`);
      return dependencies[name];
    },
  }, { filename: path });
  return module.exports;
}

class Reponse {
  constructor(public body: any, public status: number = 200) {}
  static json(body: any, options?: any) { return new Reponse(body, options?.status ?? 200); }
}

const cavalier = (id: string, prenom: string) => ({ id, firstName: prenom, lastName: "DUPONT" });

function fixture(opts: {
  /** Fiche portant l'identifiant du compte ; absente par défaut. */
  propre?: Record<string, any> | null;
  /** Fiches trouvées sur l'adresse du jeton. */
  bureau?: Record<string, any>[];
  emailVerifie?: boolean;
} = {}) {
  const ecrits: { id: string; v: any }[] = [];
  const fusions: any[] = [];
  const stock: Record<string, any> = {};
  if (opts.propre) stock[UID] = opts.propre;

  const doc = (id: string) => ({
    get: async () => ({ exists: id in stock, data: () => stock[id] }),
    set: async (v: any) => {
      ecrits.push({ id, v });
      const suivant: Record<string, any> = { ...v };
      // `FieldValue.delete()` simulé : le champ disparaît du document.
      for (const k of Object.keys(suivant)) if (suivant[k] === "SUPPRIME") delete suivant[k];
      stock[id] = suivant;
    },
  });
  const collection = (name: string) => {
    if (name !== "families") throw new Error(`collection inattendue : ${name}`);
    const q: any = {
      where: () => q,
      get: async () => ({
        docs: (opts.bureau || []).map((f) => ({ id: f.id, data: () => { const { id, ...reste } = f; return reste; } })),
      }),
    };
    q.doc = doc;
    return q;
  };

  const route = charger("src/app/api/famille/lier-compte/route.ts", {
    "next/server": { NextResponse: Reponse },
    "@/lib/firebase-admin": { adminDb: { collection } },
    "@/lib/api-auth": { verifyAuth: async () => ({
      uid: UID, email: EMAIL, name: "Parent Test",
      email_verified: opts.emailVerifie !== false,
      firebase: { sign_in_provider: "google.com" },
    }) },
    "@/lib/fournisseur-connexion": { fournisseurDepuisJeton: () => "google" },
    "firebase-admin/firestore": { FieldValue: { serverTimestamp: () => "TS", delete: () => "SUPPRIME" } },
    "@/lib/fusion-familles": {
      ...fusionReelle,
      fusionnerFamilles: async (p: any) => { fusions.push(p); return { apercu: { reassign: { payments: 1 }, creneauxTouches: 2 }, applique: true }; },
    },
  });
  return { route, ecrits, fusions, stock };
}

let passes = 0;
async function test(nom: string, fn: () => Promise<void>) {
  try { await fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e?.message || e}`); process.exitCode = 1; }
}

async function main() {
  console.log("\n── Rattachement d'un compte à sa fiche ──");

  await test("une fiche déjà rattachée est rendue telle quelle, sans rien réécrire", async () => {
    const f = fixture({ propre: { parentName: "DUPONT", children: [cavalier("k1", "Léa")] }, bureau: [] });
    const r = await f.route.POST({});
    assert.equal(r.status, 200);
    assert.equal(r.body.family.children.length, 1);
    assert.equal(f.ecrits.length, 0, "aucune écriture");
    assert.equal(f.fusions.length, 0, "aucune fusion");
  });

  await test("fiche vide sous le compte + fiche du bureau : la vraie fiche est rattachée et prend le relais", async () => {
    // Le cas des 19 comptes bloqués : jusqu'ici la fiche vide arrêtait tout.
    const f = fixture({
      propre: { parentName: "Parent Test", parentEmail: EMAIL, parentPhone: "", children: [] },
      bureau: [{ id: "ficheBureau", parentName: "DUPONT Marie", parentEmail: EMAIL, parentPhone: "0600000000", address: "3 rue du Moulin", children: [cavalier("k1", "Léa"), cavalier("k2", "Tom")] }],
    });
    const r = await f.route.POST({});
    assert.equal(r.status, 200);
    assert.equal(r.body.family.children.length, 2, "les cavaliers arrivent sur le compte");
    assert.equal(r.body.family.parentPhone, "0600000000");
    assert.equal(r.body.family.authUid, UID);
    assert.equal(f.ecrits.length, 1);
    assert.equal(f.ecrits[0].id, UID);
    assert.equal(f.fusions.length, 1, "la fiche du bureau passe le relais");
    assert.equal(f.fusions[0].keepId, UID);
    assert.equal(f.fusions[0].mergeId, "ficheBureau");
    assert.equal(f.fusions[0].mergedBy, "system:lier-compte");
  });

  await test("ce que la famille avait saisi de son côté n'est pas perdu", async () => {
    const f = fixture({
      propre: { parentName: "Parent Test", parentEmail: EMAIL, parentPhone: "0611111111", children: [] },
      bureau: [{ id: "ficheBureau", parentName: "DUPONT Marie", parentEmail: EMAIL, parentPhone: "", children: [cavalier("k1", "Léa")] }],
    });
    const r = await f.route.POST({});
    assert.equal(r.body.family.parentPhone, "0611111111", "le bureau n'avait pas de téléphone : celui du compte reste");
    assert.equal(r.body.family.parentName, "DUPONT Marie", "le bureau fait foi quand il a rempli le champ");
  });

  await test("adresse non confirmée : rattachement refusé, rien n'est écrit", async () => {
    const f = fixture({
      emailVerifie: false,
      propre: { parentName: "Parent Test", children: [] },
      bureau: [{ id: "ficheBureau", parentEmail: EMAIL, children: [cavalier("k1", "Léa")] }],
    });
    const r = await f.route.POST({});
    assert.equal(r.status, 403);
    assert.equal(r.body.error, "EMAIL_NON_VERIFIE");
    assert.equal(f.ecrits.length, 0);
    assert.equal(f.fusions.length, 0);
  });

  await test("fiche vide et aucune fiche du bureau : elle est rendue, pas réécrite", async () => {
    const f = fixture({ propre: { parentName: "Parent Test", parentEmail: EMAIL, children: [] }, bureau: [] });
    const r = await f.route.POST({});
    assert.equal(r.status, 200);
    assert.equal(r.body.family.children.length, 0);
    assert.equal(f.ecrits.length, 0, "on ne récrit pas une fiche vierge par-dessus");
    assert.equal(r.body.cree, undefined);
  });

  await test("aucune fiche nulle part : une fiche vierge est créée", async () => {
    const f = fixture({ bureau: [] });
    const r = await f.route.POST({});
    assert.equal(r.body.cree, true);
    assert.equal(f.ecrits.length, 1);
    assert.equal(f.ecrits[0].v.authUid, UID);
    assert.equal(f.ecrits[0].v.parentEmail, EMAIL);
  });

  await test("la fiche rattachée ne garde aucun marqueur d'absorption", async () => {
    const f = fixture({
      propre: { parentName: "Parent Test", parentEmail: EMAIL, children: [] },
      bureau: [{ id: "ficheBureau", parentEmail: EMAIL, status: "active", children: [cavalier("k1", "Léa")] }],
    });
    const r = await f.route.POST({});
    assert.equal("status" in f.ecrits[0].v, false, "aucun champ status écrit");
    assert.equal(r.body.family.children.length, 1);
    // `FieldValue.delete()` dans un `set()` sans fusion lèverait une erreur
    // Firestore : la clé doit être absente, pas marquée à supprimer.
    assert.equal(JSON.stringify(f.ecrits[0].v).includes("SUPPRIME"), false);
  });

  await test("sa propre fiche et les fiches absorbées ne sont jamais candidates", async () => {
    const f = fixture({
      propre: { parentName: "Parent Test", parentEmail: EMAIL, children: [] },
      bureau: [
        { id: UID, parentEmail: EMAIL, children: [] },
        { id: "vieille", parentEmail: EMAIL, status: "merged", children: [cavalier("k1", "Léa")] },
      ],
    });
    const r = await f.route.POST({});
    assert.equal(r.body.family.children.length, 0);
    assert.equal(f.fusions.length, 0);
  });

  await test("deux fiches avec des cavaliers à la même adresse : on ne tranche pas", async () => {
    const f = fixture({
      bureau: [
        { id: "f1", parentEmail: EMAIL, children: [cavalier("k1", "Léa")] },
        { id: "f2", parentEmail: EMAIL, children: [cavalier("k2", "Tom")] },
      ],
    });
    const r = await f.route.POST({});
    assert.equal(r.body.cree, true, "fiche vierge plutôt que les enfants d'une famille au hasard");
    assert.equal(f.fusions.length, 0);
  });

  console.log(process.exitCode ? "\n❌ des tests ont échoué" : `\n✅ ${passes} tests passés`);
}
main();
