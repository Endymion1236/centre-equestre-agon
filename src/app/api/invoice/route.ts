import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CLUB = {
  name: "Centre Equestre d'Agon-Coutainville",
  address: "Route de la Plage, 50230 Agon-Coutainville",
  tel: "02 44 84 99 96",
  email: "ceagon@orange.fr",
  siret: "50756918400017",
  tvaIntra: "",
  iban: "", // À remplir : FR76 XXXX XXXX XXXX XXXX XXXX XXX
  bic: "", // À remplir : XXXXXXXX
  logoUrl: "/images/logo-ce-agon.png",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { invoiceNumber, date, familyName, familyEmail, items, totalHT, totalTVA, totalTTC, paidAmount, paymentMode, paymentDate } = body;

    // Générer le HTML de la facture
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
  body { padding: 40px; color: #333; font-size: 13px; }
  .header { display: flex; justify-content: space-between; margin-bottom: 30px; align-items: flex-start; }
  .logo-block { display: flex; align-items: center; gap: 12px; }
  .logo-img { width: 50px; height: 50px; border-radius: 8px; object-fit: contain; }
  .logo { font-size: 18px; font-weight: 700; color: #1e3a5f; }
  .logo-sub { font-size: 10px; color: #999; margin-top: 2px; }
  .invoice-title { text-align: right; }
  .invoice-title h1 { font-size: 24px; color: #1e3a5f; margin-bottom: 4px; }
  .invoice-title .num { font-size: 14px; color: #666; }
  .invoice-title .date { font-size: 12px; color: #999; }
  .parties { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .party { width: 45%; }
  .party-label { font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
  .party-name { font-size: 14px; font-weight: 600; color: #1e3a5f; }
  .party-detail { font-size: 12px; color: #666; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead th { background: #1e3a5f; color: white; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
  thead th:last-child, thead th:nth-child(3), thead th:nth-child(4) { text-align: right; }
  tbody td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 12px; }
  tbody td:last-child, tbody td:nth-child(3), tbody td:nth-child(4) { text-align: right; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 30px; }
  .totals-box { width: 250px; }
  .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 12px; }
  .totals-row.total { border-top: 2px solid #1e3a5f; padding-top: 10px; font-size: 16px; font-weight: 700; color: #1e3a5f; }
  .payment-info { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; margin-bottom: 20px; }
  .payment-info.unpaid { background: #fef2f2; border-color: #fecaca; }
  .payment-label { font-size: 11px; color: #166534; font-weight: 600; text-transform: uppercase; }
  .payment-info.unpaid .payment-label { color: #991b1b; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #eee; font-size: 10px; color: #999; text-align: center; line-height: 1.6; }
  .mentions { font-size: 10px; color: #999; margin-top: 20px; line-height: 1.5; }
</style></head><body>

<div class="header">
  <div class="logo-block">
    <img src="${CLUB.logoUrl}" class="logo-img" alt="Logo"/>
    <div>
      <div class="logo">${CLUB.name}</div>
      <div class="logo-sub">${CLUB.address}</div>
      <div class="logo-sub">${CLUB.tel} · ${CLUB.email}</div>
      <div class="logo-sub">SIRET : ${CLUB.siret}</div>
    </div>
  </div>
  <div class="invoice-title">
    <h1>FACTURE</h1>
    <div class="num">N° ${invoiceNumber}</div>
    <div class="date">${date}</div>
  </div>
</div>

<div class="parties">
  <div class="party">
    <div class="party-label">Émetteur</div>
    <div class="party-name">${CLUB.name}</div>
    <div class="party-detail">${CLUB.address}<br/>${CLUB.tel}<br/>${CLUB.email}</div>
  </div>
  <div class="party">
    <div class="party-label">Client</div>
    <div class="party-name">${familyName}</div>
    ${familyEmail ? `<div class="party-detail">${familyEmail}</div>` : ""}
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Désignation</th>
      <th>Cavalier</th>
      <th>HT</th>
      <th>TVA</th>
      <th>TTC</th>
    </tr>
  </thead>
  <tbody>
    ${(items || []).map((item: any) => `
      <tr>
        <td>${item.activityTitle || item.label || "—"}</td>
        <td>${item.childName || "—"}</td>
        <td>${(item.priceHT || 0).toFixed(2)}€</td>
        <td>${item.tva || 5.5}%</td>
        <td>${(item.priceTTC || 0).toFixed(2)}€</td>
      </tr>
    `).join("")}
  </tbody>
</table>

<div class="totals">
  <div class="totals-box">
    <div class="totals-row"><span>Total HT</span><span>${(totalHT || 0).toFixed(2)}€</span></div>
    <div class="totals-row"><span>TVA</span><span>${(totalTVA || 0).toFixed(2)}€</span></div>
    <div class="totals-row total"><span>Total TTC</span><span>${(totalTTC || 0).toFixed(2)}€</span></div>
  </div>
</div>

<div class="payment-info ${(paidAmount || 0) >= (totalTTC || 0) ? "" : "unpaid"}">
  <div class="payment-label">${(paidAmount || 0) >= (totalTTC || 0) ? "✅ Réglé" : "⏳ En attente de règlement"}</div>
  ${(paidAmount || 0) > 0 ? `<div style="font-size:12px;color:#333;margin-top:4px;">Montant réglé : ${(paidAmount || 0).toFixed(2)}€${paymentMode ? ` (${paymentMode})` : ""}${paymentDate ? ` le ${paymentDate}` : ""}</div>` : ""}
  ${(paidAmount || 0) < (totalTTC || 0) ? `<div style="font-size:12px;color:#991b1b;margin-top:4px;">Reste dû : ${((totalTTC || 0) - (paidAmount || 0)).toFixed(2)}€</div>` : ""}
  ${CLUB.iban && (paidAmount || 0) < (totalTTC || 0) ? `<div style="font-size:11px;color:#555;margin-top:8px;padding-top:8px;border-top:1px solid #eee;">
    <strong>Règlement par virement :</strong><br/>
    IBAN : ${CLUB.iban}<br/>
    BIC : ${CLUB.bic}<br/>
    Titulaire : ${CLUB.name}
  </div>` : ""}
</div>

<div class="mentions">
  Conditions de règlement : à réception. En cas de retard de paiement, des pénalités seront appliquées au taux légal en vigueur.<br/>
  Pas d'escompte pour règlement anticipé. Indemnité forfaitaire pour frais de recouvrement : 40€.
</div>

<div class="footer">
  ${CLUB.name} · ${CLUB.address}<br/>
  ${CLUB.tel} · ${CLUB.email} · SIRET ${CLUB.siret}
</div>

</body></html>`;

    return NextResponse.json({ success: true, html });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
