import assert from "node:assert/strict";
import { verifierChaine, empreinteAttendue, type EncaissementVerifiable } from "../../src/lib/verification-chaine";

let passes = 0;
async function test(nom: string, fn: () => Promise<void>) {
  try { await fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

console.log("\n── Chaîne d'empreintes des encaissements ──");

/** Construit une chaîne saine de n écritures, comme le ferait createEncaissement. */
async function chaineSaine(montants: number[]): Promise<EncaissementVerifiable[]> {
  const out: EncaissementVerifiable[] = [];
  let precedent: string | undefined;
  for (let i = 0; i < montants.length; i++) {
    const enc: EncaissementVerifiable = {
      id: `e${i}`,
      familyName: `Famille ${i}`,
      montant: montants[i],
      mode: "especes",
      dateIso: `2026-09-0${i + 1}T10:00:00.000Z`,
      previousHash: precedent,
    };
    enc.hash = await empreinteAttendue(enc);
    precedent = enc.hash;
    out.push(enc);
  }
  return out;
}

async function main() {
  await test("une chaîne intacte est déclarée conforme", async () => {
    const r = await verifierChaine(await chaineSaine([10, 20, 30]));
    assert.equal(r.conforme, true);
    assert.equal(r.signes, 3);
    assert.deepEqual(r.empreintesInvalides, []);
    assert.deepEqual(r.chainonsRompus, []);
    assert.match(r.resume, /intacte/);
  });

  await test("un montant modifié après coup est détecté", async () => {
    const chaine = await chaineSaine([10, 20, 30]);
    chaine[1].montant = 999; // quelqu'un corrige une recette en base
    const r = await verifierChaine(chaine);
    assert.equal(r.conforme, false);
    assert.equal(r.empreintesInvalides.length, 1);
    assert.equal(r.empreintesInvalides[0].id, "e1");
    assert.match(r.empreintesInvalides[0].detail, /modifiée après/);
  });

  await test("une écriture supprimée casse le maillon suivant", async () => {
    const chaine = await chaineSaine([10, 20, 30]);
    const ampute = [chaine[0], chaine[2]]; // e1 effacé
    const r = await verifierChaine(ampute);
    assert.equal(r.conforme, false);
    assert.equal(r.chainonsRompus.length, 1);
    assert.equal(r.chainonsRompus[0].id, "e2");
  });

  await test("deux écritures simultanées forment une fourche détectable", async () => {
    const chaine = await chaineSaine([10, 20]);
    // Une troisième écriture chaînée sur e0 au lieu de e1 : la fourche que
    // produit l'absence de transaction sur le chaînage.
    const fourche: EncaissementVerifiable = {
      id: "e2",
      familyName: "Simultanée",
      montant: 30,
      mode: "cb",
      dateIso: "2026-09-03T10:00:00.000Z",
      previousHash: chaine[0].hash,
    };
    fourche.hash = await empreinteAttendue(fourche);
    const r = await verifierChaine([...chaine, fourche]);
    assert.equal(r.conforme, false);
    assert.equal(r.chainonsRompus.length, 1);
    assert.equal(r.chainonsRompus[0].id, "e2");
  });

  await test("les écritures sans empreinte sont signalées sans casser la chaîne", async () => {
    const chaine = await chaineSaine([10, 20]);
    const ancienne: EncaissementVerifiable = {
      id: "vieux",
      montant: 5,
      mode: "cheque",
      dateIso: "2026-08-01T10:00:00.000Z",
    };
    const r = await verifierChaine([ancienne, ...chaine]);
    assert.equal(r.conforme, true, "une écriture pré-dispositif ne vaut pas altération");
    assert.equal(r.sansEmpreinte.length, 1);
    assert.equal(r.sansEmpreinte[0].id, "vieux");
    assert.equal(r.signes, 2);
    assert.match(r.resume, /n'ont pas pu être vérifiées/);
  });

  await test("une chaîne vide est conforme", async () => {
    const r = await verifierChaine([]);
    assert.equal(r.conforme, true);
    assert.equal(r.total, 0);
  });

  await test("l'ordre de lecture n'influe pas sur le verdict", async () => {
    const chaine = await chaineSaine([10, 20, 30]);
    const melangee = [chaine[2], chaine[0], chaine[1]];
    const r = await verifierChaine(melangee);
    assert.equal(r.conforme, true);
  });

  console.log(`\n✅ ${passes} tests passés\n`);
}

void main();
