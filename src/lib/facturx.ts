/**
 * Générateur Factur-X — profil EN 16931, syntaxe CII (UN/CEFACT).
 *
 * Produit le XML normalisé de la réforme française de la facturation
 * électronique à partir d'une facture définitive (doc `payments` avec
 * `invoiceNumber`). C'est ce XML que les Plateformes Agréées valident ;
 * l'étape suivante (embarquer le XML dans un PDF/A-3) viendra ensuite.
 *
 * Références de champs (Business Terms EN 16931) en commentaire.
 */

import { MENTIONS_PAIEMENT } from "@/lib/mentions-facture";
import type { ClubInfo } from "@/lib/club-info";

/**
 * SIREN (9 chiffres) d'une fiche famille pro, pour le routage de la
 * facture électronique (BT-47 / BT-49).
 *
 * Deux générations de fiches coexistent : la création stocke un `siret`
 * (14 chiffres, saisi dans « Nouvelle famille »), la modification stocke
 * un `siren`. Le SIREN est simplement les 9 premiers chiffres du SIRET, on
 * accepte donc les deux. Retourne undefined si rien d'exploitable (famille
 * particulière, ou numéro mal saisi).
 */
/** Types de compte famille relevant de la facturation électronique B2B
 *  (réforme 2026-2027) : la facture doit transiter par la Plateforme Agréée.
 *  Les particuliers restent hors périmètre (B2C → e-reporting seulement). */
export const COMPTES_PROFESSIONNELS = ["asso", "collectivite", "entreprise"] as const;

export function estCompteProfessionnel(f: { accountType?: unknown } | null | undefined): boolean {
  return !!f && (COMPTES_PROFESSIONNELS as readonly string[]).includes(String(f.accountType || ""));
}

export function sirenDepuisFiche(f: { siren?: unknown; siret?: unknown } | null | undefined): string | undefined {
  if (!f) return undefined;
  const siren = String(f.siren ?? "").replace(/\D/g, "");
  if (/^\d{9}$/.test(siren)) return siren;
  const siret = String(f.siret ?? "").replace(/\D/g, "");
  if (/^\d{14}$/.test(siret)) return siret.slice(0, 9);
  return undefined;
}

const esc = (s: any) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/** "56 Charrière du Commerce, 50230 Agon-Coutainville" → {ligne, cp, ville} */
function parseAddress(addr: string): { ligne: string; cp: string; ville: string } {
  const m = addr.match(/^(.*?),?\s*(\d{5})\s+(.+)$/);
  if (m) return { ligne: m[1].replace(/,\s*$/, "").trim(), cp: m[2], ville: m[3].trim() };
  return { ligne: addr, cp: "", ville: "" };
}

function toDate102(d: any): string {
  let dt: Date;
  if (d?.toDate) dt = d.toDate();
  else if (d?.seconds) dt = new Date(d.seconds * 1000);
  else if (typeof d === "string") dt = new Date(d);
  else if (d instanceof Date) dt = d;
  else dt = new Date();
  if (isNaN(dt.getTime())) dt = new Date();
  return dt.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * Catégorie de TVA d'une ligne (BT-151 / BT-118). Une ligne à 0 % (licence
 * refacturée, activité exonérée) était déclarée « S » (taux normal) à 0 % :
 * refusée par la norme (BR-S-05, contrôle Super PDP du 07/11/2026). Elle est
 * « E », exonérée, avec un motif (BT-120, exigé par BR-E-10).
 */
export function categorieTva(rate: number): "S" | "E" {
  return rate === 0 ? "E" : "S";
}
/** Motif d'exonération porté par la ventilation à 0 % — référence légale à confirmer par le cabinet. */
export const MOTIF_EXONERATION_TVA = "Exonération de TVA";

export interface FacturXInput {
  invoiceNumber: string; // BT-1
  invoiceDate: any; // BT-2 (Timestamp/Date/string)
  buyer: {
    name: string; // BT-44
    email?: string;
    siren?: string; // BT-47 (clients pros/collectivités)
    address?: string;
  };
  items: { label: string; priceHT: number; tva: number; priceTTC: number }[];
  totalTTC: number;
  paidAmount: number; // acomptes déjà réglés (BT-113)
  dueDate?: any; // BT-9 (échéance — début du stage par ex.)
  /** Date du paiement (BT-9 d'une facture déjà payée, cadre B2/S2/M2). Défaut : date d'émission. */
  paymentDate?: any;
  /** BT-23 cadre de facturation France (XP Z12-012, BR-FR-08).
   *  Prestations du centre = Services → "S1" (à régler) / "S2" (déjà payée). */
  businessProcess?: string;
}

export function buildFacturXXml(inv: FacturXInput, club: ClubInfo): string {
  const siren = (club.siret || "").replace(/\s/g, "").slice(0, 9);
  const siret = (club.siret || "").replace(/\s/g, "");
  const vAddr = parseAddress(club.address || "");
  const bAddr = inv.buyer.address ? parseAddress(inv.buyer.address) : null;

  // ── Lignes + ventilation TVA par taux ──
  const lines = inv.items.filter((i) => typeof i.priceTTC === "number");
  const byRate = new Map<number, { basis: number; tax: number }>();
  let sumHT = 0;
  for (const it of lines) {
    const rate = typeof it.tva === "number" ? it.tva : 5.5;
    const ht = typeof it.priceHT === "number" ? it.priceHT : Math.round((it.priceTTC / (1 + rate / 100)) * 100) / 100;
    sumHT += ht;
    const e = byRate.get(rate) || { basis: 0, tax: 0 };
    e.basis += ht;
    byRate.set(rate, e);
  }
  sumHT = Math.round(sumHT * 100) / 100;
  // TVA par taux calculée sur l'assiette du taux ; ajustement du dernier
  // taux pour que HT + TVA == TTC exactement (cohérence exigée en validation).
  let totalTax = Math.round((inv.totalTTC - sumHT) * 100) / 100;
  const rates = [...byRate.entries()];
  let allocated = 0;
  rates.forEach(([rate, e], idx) => {
    e.basis = Math.round(e.basis * 100) / 100;
    if (idx < rates.length - 1) {
      e.tax = Math.round(e.basis * (rate / 100) * 100) / 100;
      allocated += e.tax;
    } else {
      e.tax = Math.round((totalTax - allocated) * 100) / 100;
    }
  });
  // Facture déjà payée (cadre B2/S2/M2) : BT-113 = total, BT-115 = 0
  // (BR-FR-CO-09). Les écrans transmettaient 0 payé avec S2 : refus de la PA.
  const dejaPayee = /^[BSM]2$/.test(inv.businessProcess || "");
  const paye = dejaPayee ? inv.totalTTC : (inv.paidAmount || 0);
  const due = Math.round((inv.totalTTC - paye) * 100) / 100;

  const lineXml = lines
    .map((it, i) => {
      const rate = typeof it.tva === "number" ? it.tva : 5.5;
      const ht = typeof it.priceHT === "number" ? it.priceHT : Math.round((it.priceTTC / (1 + rate / 100)) * 100) / 100;
      return `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${i + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${esc(it.label)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${money(ht)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="C62">1</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${categorieTva(rate)}</ram:CategoryCode>
          <ram:RateApplicablePercent>${money(rate)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${money(ht)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`;
    })
    .join("");

  const taxXml = rates
    .map(
      ([rate, e]) => `
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${money(e.tax)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>${categorieTva(rate) === "E" ? `
        <ram:ExemptionReason>${esc(MOTIF_EXONERATION_TVA)}</ram:ExemptionReason><!-- BT-120 -->` : ""}
        <ram:BasisAmount>${money(e.basis)}</ram:BasisAmount>
        <ram:CategoryCode>${categorieTva(rate)}</ram:CategoryCode>
        <ram:RateApplicablePercent>${money(rate)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`
    )
    .join("");

  // BT-9 : facture déjà payée (cadre B2/S2/M2), l'échéance est la date du
  // paiement (BR-FR-CO-09, refus constaté au contrôle Super PDP le
  // 07/11/2026). Une facture est numérotée quand elle est soldée : sa date
  // d'émission tient lieu de date de paiement à défaut d'autre.
  const echeance = dejaPayee ? (inv.paymentDate ?? inv.invoiceDate) : inv.dueDate;

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    ${inv.businessProcess ? `<ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>${esc(inv.businessProcess)}</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter><!-- BT-23 cadre de facturation FR -->` : ""}
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID><!-- profil EN 16931 -->
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(inv.invoiceNumber)}</ram:ID><!-- BT-1 -->
    <ram:TypeCode>380</ram:TypeCode><!-- 380 = facture commerciale -->
    <ram:IssueDateTime><udt:DateTimeString format="102">${toDate102(inv.invoiceDate)}</udt:DateTimeString></ram:IssueDateTime><!-- BT-2 -->${MENTIONS_PAIEMENT.map((m) => `
    <ram:IncludedNote><ram:Content>${esc(m.texte)}</ram:Content><ram:SubjectCode>${m.code}</ram:SubjectCode></ram:IncludedNote>`).join("")}<!-- BG-1 mentions obligatoires (BR-FR-05) -->
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lineXml}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:GlobalID schemeID="0009">${esc(siret)}</ram:GlobalID><!-- SIRET (schéma EAS 0009) -->
        <ram:Name>${esc(club.legalName || club.nom)}</ram:Name><!-- BT-27 -->
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${esc(siren)}</ram:ID><!-- BT-30 SIREN -->
        </ram:SpecifiedLegalOrganization>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(vAddr.cp)}</ram:PostcodeCode>
          <ram:LineOne>${esc(vAddr.ligne)}</ram:LineOne>
          <ram:CityName>${esc(vAddr.ville)}</ram:CityName>
          <ram:CountryID>FR</ram:CountryID><!-- BT-40 -->
        </ram:PostalTradeAddress>
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="0009">${esc(siret)}</ram:URIID><!-- BT-34 adresse électronique de routage (SIRET) -->
        </ram:URIUniversalCommunication>
        ${
          (club.tvaIntra || "").trim()
            ? `<ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${esc((club.tvaIntra || "").replace(/\s/g, ""))}</ram:ID><!-- BT-31 TVA intracom -->
        </ram:SpecifiedTaxRegistration>`
            : ""
        }
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        ${inv.buyer.siren ? `<ram:GlobalID schemeID="0002">${esc(inv.buyer.siren)}</ram:GlobalID>` : ""}
        <ram:Name>${esc(inv.buyer.name)}</ram:Name><!-- BT-44 -->
        ${inv.buyer.siren ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${esc(inv.buyer.siren)}</ram:ID></ram:SpecifiedLegalOrganization><!-- BT-47 -->` : ""}
        ${
          bAddr
            ? `<ram:PostalTradeAddress><ram:PostcodeCode>${esc(bAddr.cp)}</ram:PostcodeCode><ram:LineOne>${esc(bAddr.ligne)}</ram:LineOne><ram:CityName>${esc(bAddr.ville)}</ram:CityName><ram:CountryID>FR</ram:CountryID></ram:PostalTradeAddress>`
            : ""
        }
        ${
          inv.buyer.siren
            ? `<ram:URIUniversalCommunication><ram:URIID schemeID="0002">${esc(inv.buyer.siren)}</ram:URIID></ram:URIUniversalCommunication><!-- BT-49 routage acheteur (SIREN) -->`
            : inv.buyer.email
            ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(inv.buyer.email)}</ram:URIID></ram:URIUniversalCommunication><!-- BT-49 routage acheteur (email, schéma EM) -->`
            : ""
        }
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      ${inv.dueDate ? `<ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${toDate102(inv.dueDate)}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent><!-- BT-72 date de réalisation de la prestation -->` : ""}
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>${esc(inv.invoiceNumber)}</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode><!-- BT-5 -->
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>30</ram:TypeCode><!-- 30 = virement -->
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${esc((club.iban || "").replace(/\s/g, ""))}</ram:IBANID><!-- BT-84 -->
        </ram:PayeePartyCreditorFinancialAccount>
      </ram:SpecifiedTradeSettlementPaymentMeans>${taxXml}
      <ram:SpecifiedTradePaymentTerms>
        ${echeance ? `<ram:DueDateDateTime><udt:DateTimeString format="102">${toDate102(echeance)}</udt:DateTimeString></ram:DueDateDateTime><!-- BT-9 -->` : `<ram:Description>Payable à réception</ram:Description>`}
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${money(sumHT)}</ram:LineTotalAmount><!-- BT-106 -->
        <ram:TaxBasisTotalAmount>${money(sumHT)}</ram:TaxBasisTotalAmount><!-- BT-109 -->
        <ram:TaxTotalAmount currencyID="EUR">${money(totalTax)}</ram:TaxTotalAmount><!-- BT-110 -->
        <ram:GrandTotalAmount>${money(inv.totalTTC)}</ram:GrandTotalAmount><!-- BT-112 -->
        <ram:TotalPrepaidAmount>${money(paye)}</ram:TotalPrepaidAmount><!-- BT-113 acomptes -->
        <ram:DuePayableAmount>${money(due)}</ram:DuePayableAmount><!-- BT-115 -->
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}
