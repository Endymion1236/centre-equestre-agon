import assert from "node:assert/strict";
import {
  MOYENS_PAIEMENT_INSCRIPTION,
  estMoyenPaiementDiffere,
  libelleMoyenPaiementInscription,
  estCommandeInscriptionAnnuelle,
  doitAnnulerReservationLorsDesinscriptionAnnuelle,
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



assert.equal(
  estCommandeInscriptionAnnuelle({
    type: "inscription_annuelle",
    items: [{ activityTitle: "Adhésion annuelle" }],
  }),
  true,
  "le type inscription_annuelle suffit même si aucune ligne ne contient Forfait",
);
assert.equal(estCommandeInscriptionAnnuelle({ type: "stage", items: [] }), false);

const today = "2026-09-02";
assert.equal(
  doitAnnulerReservationLorsDesinscriptionAnnuelle(
    { type: "annual", status: "confirmed" },
    today,
  ),
  true,
  "une réservation annuelle confirmée sans date doit être annulée",
);
assert.equal(
  doitAnnulerReservationLorsDesinscriptionAnnuelle(
    { type: "annual", status: "pending_validation" },
    today,
  ),
  true,
  "une réservation annuelle différée doit être annulée",
);
assert.equal(
  doitAnnulerReservationLorsDesinscriptionAnnuelle(
    { type: "stage", status: "confirmed", date: "2026-09-01" },
    today,
  ),
  false,
  "une réservation ponctuelle passée reste dans l'historique",
);
assert.equal(
  doitAnnulerReservationLorsDesinscriptionAnnuelle(
    { type: "annual", status: "cancelled" },
    today,
  ),
  false,
  "une réservation déjà annulée reste idempotente",
);

console.log("✅ Moyens de paiement de l'inscription annuelle et RIB vérifiés");
