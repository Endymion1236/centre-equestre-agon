import assert from "node:assert/strict";
import { test } from "node:test";
import { construireEtatAnnuel, lireBalanceAnnuelle, verifierComparatif } from "../../src/lib/etats-annuels";
import { brouillonFiscalVide, construirePreparationFiscale } from "../../src/lib/preparation-fiscale";
import { genererEtatsAnnuelsPdf } from "../../src/lib/etats-annuels-pdf";
import { PDFDocument } from "pdf-lib";
import type { BalanceCompte } from "../../src/lib/documents-comptables";

const periode = { debut: "2024-07-01", fin: "2025-06-30" };
const avant = { debut: "2023-07-01", fin: "2024-06-30" };
function balance(soldes: [string, number][]): BalanceCompte[] {
  const lignes = [...soldes, ["10100000", -soldes.reduce((s, c) => s + c[1], 0)] as [string, number]];
  return lignes.map(([compte, solde]) => ({ compte, solde, libelle: `Compte fictif ${compte}`, debit: Math.max(0, solde), credit: Math.max(0, -solde) }));
}
test("brut/amort/net : 28, 29, 39, 49, 59 réduisent l'actif, sans créer de dettes", () => {
  const b = balance([["21540000", 200000], ["28154000", -50000], ["29154000", -10000], ["30140000", 5000], ["39100000", -1000], ["411CLIENT", 10000], ["49100000", -2000], ["50300000", 8000], ["59030000", -500], ["512BANQUE", -4000], ["60141000", 30000], ["70600000", -100000]]);
  const n = construireEtatAnnuel(b, periode), copie = structuredClone(b);
  assert.equal(n.brut, 223000); assert.equal(n.amortissements, 63500); assert.equal(n.totalActif, 159500); assert.equal(n.totalPassif, 159500);
  assert.equal(n.actif.find(r => r.code === "AP")?.net, 140000);
  assert.equal(n.actif.find(r => r.code === "BZ")?.net, 8000);
  assert.equal(n.passif.find(r => r.code === "DQ")?.net, 4000);
  assert.equal(n.resultat, 70000); assert.equal(n.achats, 30000); assert.deepEqual(b, copie);
});
test("un compte fournisseur débiteur reste une créance, un client créditeur une dette", () => {
  const n = construireEtatAnnuel(balance([["401DEB", 1000], ["401CRED", -2000], ["411CRED", -3000], ["411DEB", 4000]]), periode);
  assert.equal(n.actif.find(r => r.code === "CD")?.brut, 1000); assert.equal(n.actif.find(r => r.code === "BZ")?.brut, 4000);
  assert.equal(n.passif.find(r => r.code === "DT")?.net, 2000); assert.equal(n.passif.find(r => r.code === "DS")?.net, 3000);
});
test("une ventilation manuelle déplace le poste sans changer le total et interdit un amortissement au passif", () => {
  const b = balance([["24313000", 40000], ["28431000", -5000]]);
  const n = construireEtatAnnuel(b, periode, { "24313000": "AT", "28431000": "AT" });
  assert.equal(n.actif.find(r => r.code === "AT")?.net, 35000);
  assert.throws(() => construireEtatAnnuel(b, periode, { "28431000": "DP" }), /correcteur/);
  assert.throws(() => construireEtatAnnuel(b, periode, { "24313000": "INCONNU" }), /invalide/);
});
test("N-1 : balance CSV complète, guillemets, doublons et contrôle des périodes", () => {
  const b = lireBalanceAnnuelle('\uFEFFCompte;Libelle;Debit;Credit\r\n512;"Banque; fictive";1 000,50;0\r\n101;Capital;0;1 000,50');
  assert.equal(construireEtatAnnuel(b, avant).totalActif, 100050);
  assert.throws(() => construireEtatAnnuel([...b, b[0]], avant), /double/);
  assert.throws(() => construireEtatAnnuel(b.slice(0, 1), avant), /équilibrée/);
  assert.throws(() => verifierComparatif(periode, { debut: "2024-01-01", fin: "2024-07-01" }), /chevauchement/);
  assert.deepEqual(verifierComparatif(periode, avant), []);
  assert.equal(verifierComparatif(periode, { debut: "2024-01-01", fin: "2024-06-30" }).length, 1);
  assert.throws(() => lireBalanceAnnuelle('Compte;Libelle;Debit;Credit\n512;Banque;;1'), /zéro explicite/);
});
test("aucune charge dans la source : alerte visible et achats absents, pas un bénéfice attesté", () => {
  const n = construireEtatAnnuel(balance([["411CLIENT", 12000], ["70600000", -12000]]), periode);
  assert.equal(n.comptesAchats, 0); assert.ok(n.avertissements.some(s => s.includes("Aucun compte d’achats")));
});
test("les données fiscales manquantes ne deviennent pas zéro ; résultat calculé après saisie seulement", () => {
  const n = construireEtatAnnuel(balance([["60100000", 10000], ["70600000", -35245]]), periode);
  const brouillon = brouillonFiscalVide();
  const initial = construirePreparationFiscale(n, null, brouillon);
  assert.equal(initial.tableaux.length, 15); assert.equal(initial.resultatFiscal, null); assert.ok(initial.manquants > 100);
  for (const t of initial.tableaux) for (const l of t.lignes) for (const c of l.cellules) if (c.saisie && c.valeur === null) brouillon.valeurs[c.cle] = c.type === "montant" ? "0" : "Néant";
  brouillon.valeurs["2151.WB.valeur"] = "100,25";
  const rempli = construirePreparationFiscale(n, null, brouillon);
  assert.equal(rempli.resultatFiscal, 35200); // 252,45 -> 252 et 100,25 -> 100 ; pas d'arrondi global.
  brouillon.valeurs["2151.WB.valeur"] = "";
  assert.equal(construirePreparationFiscale(n, null, brouillon).resultatFiscal, null);
  brouillon.valeurs["2151.WB.valeur"] = "-1";
  assert.throws(() => construirePreparationFiscale(n, null, brouillon), /positif/);
});
test("mouvements d'immobilisations et échéances : les incohérences sont détectées", () => {
  const n = construireEtatAnnuel(balance([["21540000", 200000]]), periode);
  const p = construireEtatAnnuel(balance([["21540000", 100000]]), avant);
  const b = brouillonFiscalVide(); b.valeurs = { "2147.AP.acquisitions": "100", "2147.AP.virements": "0", "2147.AP.sorties": "0" };
  assert.ok(construirePreparationFiscale(n, p, b).tableaux.find(t => t.id === "2147")!.controles.some(c => c.includes("matériel")));
  b.valeurs["2147.AP.acquisitions"] = "1000";
  assert.equal(construirePreparationFiscale(n, p, b).tableaux.find(t => t.id === "2147")!.controles.length, 0);
});
test("millésime, champs inconnus et montants calculés : validation stricte", () => {
  const n = construireEtatAnnuel(balance([["60100000", 10000]]), periode);
  assert.throws(() => construirePreparationFiscale(n, null, { ...brouillonFiscalVide(), millesime: 2027 as 2025 }), /millésime/);
  assert.throws(() => construirePreparationFiscale(n, null, { ...brouillonFiscalVide(), valeurs: { "2151.WA.valeur": "1000" } }), /calculée/);
  assert.throws(() => construirePreparationFiscale(n, null, { ...brouillonFiscalVide(2026), valeurs: { "2151.XS.valeur": "1" } }), /inconnue/);
  assert.ok(construirePreparationFiscale(n, null, brouillonFiscalVide()).tableaux.find(t => t.id === "2146bis")!.lignes.some(l => l.id === "HA"));
  assert.ok(!construirePreparationFiscale(n, null, brouillonFiscalVide(2026)).tableaux.find(t => t.id === "2146bis")!.lignes.some(l => l.id === "HA"));
});
test("un montant proposé effacé redevient inconnu et ne contamine pas les calculs en zéro", () => {
  const n = construireEtatAnnuel(balance([["60100000", 10000]]), periode), b = brouillonFiscalVide();
  b.valeurs["2146bis.HA.valeur"] = "";
  const t = construirePreparationFiscale(n, null, b).tableaux.find(t => t.id === "2146bis")!;
  assert.equal(t.lignes.find(l => l.id === "HE")!.cellules[0].valeur, null);
});
test("PDF annuel et tableaux fiscaux seuls : génération complète et pages A4", async () => {
  const n = construireEtatAnnuel(balance([["21540000", 400000], ["28154000", -100000], ["60141000", 50000], ["70600000", -100000]]), periode);
  const p = construireEtatAnnuel(balance([["21540000", 300000], ["60142000", 20000]]), avant);
  const d = { n, precedent: p, sourcePrecedente: "Balance fictive N-1", fiscal: construirePreparationFiscale(n, p, brouillonFiscalVide()), avertissements: [] };
  for (const seul of [false, true]) {
    const bytes = await genererEtatsAnnuelsPdf(d, { nom: "Exploitation fictive de test" }, "a".repeat(64), ["Source fictive"], seul);
    const pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() >= 15); assert.ok(pdf.getPageCount() < 100);
    assert.equal(pdf.getSubject(), "a".repeat(64));
    assert.ok(pdf.getPages().every(p => Math.abs(p.getWidth() - 595.28) < 1 && Math.abs(p.getHeight() - 841.89) < 1));
  }
});
