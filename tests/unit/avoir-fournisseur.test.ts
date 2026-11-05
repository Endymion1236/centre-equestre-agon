/**
 * tests/unit/avoir-fournisseur.test.ts — l'avoir d'un fournisseur, du Rapprochement au FEC et à la TVA.
 *   npx tsx tests/unit/avoir-fournisseur.test.ts
 */
import assert from "node:assert/strict";
import { avoirsDuMois, cleCreditReleve, controleRattachementAvoir, tvaAvoirsDuMois } from "../../src/lib/avoir-fournisseur";
import { cleLigneBancaire } from "../../src/app/admin/comptabilite/rapprochement-utils";
import { construireAchatsBanque } from "../../src/lib/fec-achats-banque";
import { controlerStructureFec } from "../../src/lib/controle-fec";
import { ENTETE_FEC } from "../../src/app/admin/comptabilite/fec-utils";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); } catch (e) { console.error(`  ❌ ${nom}\n`, e); process.exitCode = 1; }
}
const cols = (l: string) => l.split("\t");

// Octobre 2026 : « Avoir CARTE X4673 BRICOMARCHE 29/10 », 109,90 € crédités le 30/10.
const credit = { date: "30/10/2026", label: "Avoir CARTE X4673 BRICOMARCHE 29/10", amount: 109.9, matched: true, matchType: "Manuel",
  compteContrepartie: { id: "remboursement-fournisseur", compte: "40100000", libelle: "Remboursement fournisseur" } };
const piece = (x: any = {}) => ({ id: "piece-bricomarche", retire: false,
  extraction: { fournisseur: "Bricomarché", numero: "AV-2210", date: "2026-10-29", ttc: 109.9, tva: 18.32, typeDocument: "achat", devise: "EUR" },
  avoirFournisseur: { mois: "2026-10", cle: cleCreditReleve(credit), poste: "Fournitures & petit équipement (dont sellerie)" }, ...x });

test("la clé du crédit est celle du rapprochement", () => {
  assert.equal(cleCreditReleve(credit), cleLigneBancaire(credit));
});

test("avoirs du mois : rattachés, lisibles, hors pièces retirées et autres mois", () => {
  const a = avoirsDuMois([piece(), piece({ id: "r", retire: true }), piece({ id: "s", avoirFournisseur: { ...piece().avoirFournisseur, mois: "2026-09" } }),
    piece({ id: "t", extraction: { ttc: null } }), { id: "facture", extraction: { ttc: 50 } }], "2026-10");
  assert.deepEqual(a.map((x) => x.pieceId), ["piece-bricomarche"]);
  assert.equal(a[0].ttc, 109.9); assert.equal(a[0].tva, 18.32); assert.equal(a[0].dateIso, "2026-10-29");
  // Un avoir lu en négatif reste un montant positif.
  assert.equal(avoirsDuMois([piece({ extraction: { ...piece().extraction, ttc: -109.9, tva: -18.32 } })], "2026-10")[0].tva, 18.32);
});

test("TVA à retirer de la déductible : immobilisations à part", () => {
  const a = avoirsDuMois([piece(), piece({ id: "prusa", avoirFournisseur: { mois: "2026-10", cle: "x", poste: "Immobilisation — à amortir" }, extraction: { ttc: 57.21, tva: 9.54 } })], "2026-10");
  assert.deepEqual(tvaAvoirsDuMois(a), { immobilisations: 9.54, autresBiensServices: 18.32 });
});

test("contrôle du rattachement", () => {
  const ok = { mois: "2026-10", cle: cleCreditReleve(credit), poste: "Carburants", postesPermis: ["Carburants"], ttcLu: 109.9, montantCredit: 109.9 };
  assert.equal(controleRattachementAvoir(ok), null);
  assert.match(controleRattachementAvoir({ ...ok, poste: "" })!, /catégorie/);
  assert.match(controleRattachementAvoir({ ...ok, ttcLu: null })!, /montant/);
  assert.match(controleRattachementAvoir({ ...ok, ttcLu: 900 })!, /dépasse/);
  assert.match(controleRattachementAvoir({ ...ok, cle: "n'importe quoi" })!, /relevé/);
});

test("FEC : avoir joint = achat annulé en HA (charge et TVA), remboursement en BQ, lettrés, structure conforme", () => {
  const ab = construireAchatsBanque({ mois: "2026-10", numeroDepart: 1, debits: [], credits: [credit] as any, avoirs: avoirsDuMois([piece()], "2026-10") });
  const l = ab.lignes.map(cols);
  const ha = l.filter((c) => c[0] === "HA"), bq = l.filter((c) => c[0] === "BQ");
  assert.deepEqual(ha.map((c) => [c[4], c[11], c[12]]), [["401BRICO", "109,90", ""], ["60660000", "", "91,58"], ["44566000", "", "18,32"]]);
  assert.equal(ha[0][3], "20261029");
  assert.deepEqual(bq.map((c) => [c[4], c[11], c[12]]), [["51200000", "109,90", ""], ["401BRICO", "", "109,90"]]);
  assert.equal(ha[0][13], bq[1][13], "même code de lettrage");
  assert.notEqual(ha[0][2], bq[0][2], "deux écritures distinctes");
  assert.equal(ab.ecrituresAchats, 1); assert.equal(ab.ecrituresBanque, 1);
  assert.ok(!ab.anomalies.some((a) => /avoir du fournisseur|joignez son avoir/.test(a)));
  assert.deepEqual(controlerStructureFec([ENTETE_FEC, ...ab.lignes].join("\n") + "\n"), []);
});

test("FEC : sans avoir joint, comme avant, avec la consigne de le joindre", () => {
  const ab = construireAchatsBanque({ mois: "2026-10", numeroDepart: 1, debits: [], credits: [credit] as any });
  assert.equal(ab.lignes.map(cols).filter((c) => c[0] === "HA").length, 0);
  assert.ok(ab.anomalies.some((a) => /Joindre l'avoir/.test(a)));
});

test("FEC : avoir d'un autre montant que le remboursement = signalé, l'écart reste au fournisseur", () => {
  const ab = construireAchatsBanque({ mois: "2026-10", numeroDepart: 1, debits: [], credits: [credit] as any,
    avoirs: avoirsDuMois([piece({ extraction: { ...piece().extraction, ttc: 120, tva: 20 } })], "2026-10") });
  assert.ok(ab.anomalies.some((a) => /120,00 € sur la pièce pour 109,90 €/.test(a)));
});

if (process.exitCode) console.error("❌ échec"); else console.log(`✅ ${passes} tests passés`);
