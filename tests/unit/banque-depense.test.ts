import assert from "node:assert/strict";
import { test } from "node:test";
import { banqueDepense, verifierChoixBanque } from "../../src/lib/banque-depense";
import { comptesProposes, construireExportVentilationAchats } from "../../src/lib/ventilation-achats";
import { CENTRE_IBAN, CENTRE_IBAN_AFFICHE } from "../../src/lib/coordonnees-bancaires";
const commission = { id: "commission", fournisseur: "Com Carte", poste: "Frais bancaires & commissions (CB, Stripe)", montant: 1.19, source: "releve-bancaire" };

test("62710000 identifie la commission, pas la banque : le compte courant générique reste à préciser", () => {
  for (const compte of [undefined, "", "Compte courant", "62710000"]) {
    const p = comptesProposes({ ...commission, compte });
    assert.equal(p.imputation.compte, "62710000"); assert.equal(p.banque.compte, "");
    assert.deepEqual(p.controles, ["Compte de prélèvement à préciser."]);
  }
});
test("ancien import : le numéro exact du compte du centre dans la référence identifie le prélèvement", () => {
  const numero = CENTRE_IBAN.slice(14, 25);
  for (const compte of [undefined, "Compte courant"]) for (const reference of [`Relevé n°008 du 31-08-2026_CCOU ${numero} CENTRE EQUESTRE.pdf`, `Relevé ${CENTRE_IBAN}.pdf`, `Relevé ${CENTRE_IBAN_AFFICHE}.pdf`]) {
    const p = comptesProposes({ ...commission, compte, note: reference });
    assert.equal(p.banque.compte, "51200000"); assert.equal(p.banque.origine, "reference-releve"); assert.equal(p.aVentiler, false);
  }
});
test("un nom de fichier générique, un numéro partiel ou une autre banque ne suffit pas", () => {
  const numero = CENTRE_IBAN.slice(14, 25);
  for (const note of ["Relevé CA20260905.pdf", "Relevé 393432.pdf", `Relevé 9${numero}9.pdf`, `Facture ${numero}.pdf`])
    assert.equal(banqueDepense({ ...commission, note }).compte, "");
  assert.equal(banqueDepense({ ...commission, compte: "CIC courant", note: `Relevé ${numero}.pdf` }).compte, "");
  assert.equal(banqueDepense({ ...commission, source: "saisie", note: `Relevé ${numero}.pdf` }).compte, "");
});
test("le choix confirmé prime, sans modifier les données d'import, et se retrouve dans le CSV", () => {
  const ligne = { ...commission, compte: "Compte courant", compteBanqueConfirme: "51200000" };
  const avant = JSON.stringify(ligne), p = comptesProposes(ligne);
  assert.equal(p.banque.compte, "51200000"); assert.equal(p.banque.origine, "confirmee"); assert.equal(p.aVentiler, false);
  assert.equal(JSON.stringify(ligne), avant);
  const csv = construireExportVentilationAchats([ligne]);
  assert.match(csv, /"Compte courant";"51200000"/); assert.match(csv, /"confirmee"/);
  assert.equal(banqueDepense({ ...ligne, compte: "CA courant", compteBanqueConfirme: "51220000" }).compte, "51220000");
});
test("les comptes FFE club et compétition restent distincts", () => {
  assert.equal(banqueDepense({ compte: "FFE club" }).compte, "51730000");
  assert.equal(banqueDepense({ compte: "FFE compét" }).compte, "51740000");
  assert.equal(banqueDepense({ compte: "Excédent Pro" }).compte, "51220000");
});
test("choix bancaire limité à la liste et modifications concurrentes refusées", () => {
  assert.equal(verifierChoixBanque(commission, "51200000", null), "51200000");
  for (const compte of ["62710000", "51299999", "Crédit Agricole", "", undefined, {}])
    assert.throws(() => verifierChoixBanque(commission, compte, null), /liste/);
  assert.throws(() => verifierChoixBanque({ ...commission, source: "saisie" }, "51200000", null), /relevé bancaire/);
  assert.throws(() => verifierChoixBanque({ ...commission, compteBanqueConfirme: "51220000" }, "51200000", null), /actualisez/);
});
test("retirer la confirmation rétablit l'identification du relevé, sans banque inventée", () => {
  assert.equal(verifierChoixBanque({ ...commission, compteBanqueConfirme: "51200000" }, null, "51200000"), null);
  assert.equal(banqueDepense({ ...commission, compteBanqueConfirme: null }).compte, "");
  assert.equal(banqueDepense({ ...commission, compte: "CA courant", compteBanqueConfirme: null }).compte, "51200000");
});
