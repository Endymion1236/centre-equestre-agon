import assert from "node:assert/strict";
import {
  MOYENS_PAIEMENT_INSCRIPTION,
  estMoyenPaiementDiffere,
  libelleMoyenPaiementInscription,
} from "../../src/lib/inscription-annuelle-paiement";
import {
  CENTRE_BENEFICIARY,
  CENTRE_BIC,
  CENTRE_IBAN,
  CENTRE_IBAN_AFFICHE,
} from "../../src/lib/coordonnees-bancaires";

const ids = MOYENS_PAIEMENT_INSCRIPTION.map((option) => option.id);

assert.deepEqual(
  ids,
  ["cb", "cheque", "especes", "virement", "cb_terminal"],
  "la page doit proposer les cinq moyens dans un ordre stable",
);

assert.equal(estMoyenPaiementDiffere("cb"), false, "la CB en ligne reste le seul flux CAWL immédiat");
for (const mode of ["cheque", "especes", "virement", "cb_terminal"] as const) {
  assert.equal(estMoyenPaiementDiffere(mode), true, `${mode} doit passer par la validation du club`);
}

assert.equal(libelleMoyenPaiementInscription("virement"), "Virement");
assert.equal(libelleMoyenPaiementInscription("cb_terminal"), "CB au club");

assert.equal(CENTRE_BENEFICIARY, "EARL Centre Equestre PC Agon-Coutainville");
assert.equal(CENTRE_IBAN, "FR7616606100640013539343253");
assert.equal(CENTRE_IBAN_AFFICHE.replace(/\s/g, ""), CENTRE_IBAN);
assert.equal(CENTRE_BIC, "AGRIFRPP866");

console.log("✅ Moyens de paiement de l'inscription annuelle et RIB vérifiés");
