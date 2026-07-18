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

import type { ClubInfo } from "@/lib/club-info";

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
  const due = Math.round((inv.totalTTC - (inv.paidAmount || 0)) * 100) / 100;

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
          <ram:CategoryCode>S</ram:CategoryCode>
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
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${money(e.basis)}</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>${money(rate)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID><!-- profil EN 16931 -->
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(inv.invoiceNumber)}</ram:ID><!-- BT-1 -->
    <ram:TypeCode>380</ram:TypeCode><!-- 380 = facture commerciale -->
    <ram:IssueDateTime><udt:DateTimeString format="102">${toDate102(inv.invoiceDate)}</udt:DateTimeString></ram:IssueDateTime><!-- BT-2 -->
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lineXml}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
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
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${esc(club.tvaIntra)}</ram:ID><!-- BT-31 TVA intracom -->
        </ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(inv.buyer.name)}</ram:Name><!-- BT-44 -->
        ${inv.buyer.siren ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${esc(inv.buyer.siren)}</ram:ID></ram:SpecifiedLegalOrganization><!-- BT-47 -->` : ""}
        ${
          bAddr
            ? `<ram:PostalTradeAddress><ram:PostcodeCode>${esc(bAddr.cp)}</ram:PostcodeCode><ram:LineOne>${esc(bAddr.ligne)}</ram:LineOne><ram:CityName>${esc(bAddr.ville)}</ram:CityName><ram:CountryID>FR</ram:CountryID></ram:PostalTradeAddress>`
            : ""
        }
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
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
        ${inv.dueDate ? `<ram:DueDateDateTime><udt:DateTimeString format="102">${toDate102(inv.dueDate)}</udt:DateTimeString></ram:DueDateDateTime><!-- BT-9 -->` : `<ram:Description>Payable à réception</ram:Description>`}
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${money(sumHT)}</ram:LineTotalAmount><!-- BT-106 -->
        <ram:TaxBasisTotalAmount>${money(sumHT)}</ram:TaxBasisTotalAmount><!-- BT-109 -->
        <ram:TaxTotalAmount currencyID="EUR">${money(totalTax)}</ram:TaxTotalAmount><!-- BT-110 -->
        <ram:GrandTotalAmount>${money(inv.totalTTC)}</ram:GrandTotalAmount><!-- BT-112 -->
        <ram:TotalPrepaidAmount>${money(inv.paidAmount || 0)}</ram:TotalPrepaidAmount><!-- BT-113 acomptes -->
        <ram:DuePayableAmount>${money(due)}</ram:DuePayableAmount><!-- BT-115 -->
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}
