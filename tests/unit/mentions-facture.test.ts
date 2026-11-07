/**
 * tests/unit/mentions-facture.test.ts — Factur-X accepté par une plateforme
 * agréée (contrôle Super PDP du 07/11/2026 : EN 16931 + règles BR-FR).
 *   npx tsx tests/unit/mentions-facture.test.ts
 */
import assert from "node:assert/strict";
import { buildFacturXXml, categorieTva } from "../../src/lib/facturx";
import { MENTIONS_PAIEMENT, mentionsPaiementTexte } from "../../src/lib/mentions-facture";
import { CLUB_DEFAUTS } from "../../src/lib/club-info-defauts";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };

const base = {
  invoiceNumber: "F-2026-0001", invoiceDate: "2026-11-07", totalTTC: 174,
  items: [{ label: "Séances", priceHT: 136.49, tva: 5.5, priceTTC: 144 }, { label: "Licence FFE", priceHT: 30, tva: 0, priceTTC: 30 }],
  buyer: { name: "Mairie", siren: "215000141", address: "Place de la Mairie, 50230 Agon-Coutainville" },
};

test("BR-FR-05 : les trois mentions de paiement, avec leurs codes", () => {
  const xml = buildFacturXXml({ ...base, paidAmount: 0, businessProcess: "S1", dueDate: "2026-12-07" }, CLUB_DEFAUTS);
  for (const code of ["PMT", "PMD", "AAB"]) assert.match(xml, new RegExp(`<ram:SubjectCode>${code}</ram:SubjectCode>`));
  assert.equal(MENTIONS_PAIEMENT.length, 3);
  assert.match(mentionsPaiementTexte(), /40 €.*taux d'intérêt légal.*escompte/);
});
test("BR-FR-CO-09 : facture déjà payée (S2) = tout payé, rien à payer, échéance à la date d'émission", () => {
  const xml = buildFacturXXml({ ...base, paidAmount: 0, businessProcess: "S2", dueDate: "2026-11-20" }, CLUB_DEFAUTS);
  assert.match(xml, /<ram:TotalPrepaidAmount>174\.00<\/ram:TotalPrepaidAmount>/);
  assert.match(xml, /<ram:DuePayableAmount>0\.00<\/ram:DuePayableAmount>/);
  assert.match(xml, /<ram:DueDateDateTime><udt:DateTimeString format="102">20261107</);
});
test("facture à régler (S1) : rien de payé, échéance demandée", () => {
  const xml = buildFacturXXml({ ...base, paidAmount: 0, businessProcess: "S1", dueDate: "2026-12-07" }, CLUB_DEFAUTS);
  assert.match(xml, /<ram:DuePayableAmount>174\.00<\/ram:DuePayableAmount>/);
  assert.match(xml, /<ram:DueDateDateTime><udt:DateTimeString format="102">20261207</);
});
test("BR-S-05 / BR-E-10 : une ligne à 0 % est exonérée (E) avec un motif, jamais « S » à 0 %", () => {
  assert.equal(categorieTva(0), "E");
  assert.equal(categorieTva(5.5), "S");
  const xml = buildFacturXXml({ ...base, paidAmount: 0, businessProcess: "S1" }, CLUB_DEFAUTS);
  assert.match(xml, /<ram:ExemptionReason>[^<]+<\/ram:ExemptionReason>/);
  assert.doesNotMatch(xml, /<ram:CategoryCode>S<\/ram:CategoryCode>\s*<ram:RateApplicablePercent>0\.00</);
});
console.log(`✅ ${n} tests passés`);
