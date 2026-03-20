import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { invoiceNumber, date, familyName, familyAddress, items, totalHT, totalTVA, totalTTC, paymentMode, paymentRef, paidAmount, status } = await req.json();

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Facture ${invoiceNumber}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Outfit', sans-serif; color: #0C1A2E; font-size: 12px; }
    .page { width: 210mm; min-height: 297mm; padding: 20mm 25mm; margin: 0 auto; position: relative; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .logo-block h1 { font-size: 22px; font-weight: 700; color: #2050A0; }
    .logo-block p { font-size: 11px; color: #5A6A80; line-height: 1.6; }
    .invoice-info { text-align: right; }
    .invoice-info .number { font-size: 20px; font-weight: 700; color: #2050A0; }
    .invoice-info .date { font-size: 12px; color: #5A6A80; margin-top: 4px; }
    .status { display: inline-block; padding: 4px 16px; border-radius: 20px; font-size: 11px; font-weight: 600; margin-top: 8px; }
    .status-paid { background: #E8F5E9; color: #2E7D32; }
    .status-partial { background: #FFF3E0; color: #E65100; }
    .status-pending { background: #FFF8E1; color: #F57F17; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .party { width: 48%; }
    .party-label { font-size: 10px; font-weight: 600; color: #5A6A80; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .party-name { font-size: 14px; font-weight: 700; color: #0C1A2E; }
    .party-detail { font-size: 11px; color: #5A6A80; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { background: #2050A0; color: white; padding: 10px 12px; text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
    th:last-child, th:nth-child(3), th:nth-child(4) { text-align: right; }
    td { padding: 10px 12px; border-bottom: 1px solid #E8EDF5; font-size: 12px; }
    td:last-child, td:nth-child(3), td:nth-child(4) { text-align: right; }
    tr:nth-child(even) { background: #F8FAFD; }
    .totals { display: flex; justify-content: flex-end; }
    .totals-table { width: 280px; }
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 12px; }
    .totals-row.total { border-top: 2px solid #2050A0; padding-top: 10px; margin-top: 4px; font-size: 16px; font-weight: 700; color: #2050A0; }
    .payment-info { background: #F8FAFD; border-radius: 8px; padding: 16px; margin-top: 30px; }
    .payment-info h4 { font-size: 11px; font-weight: 600; color: #5A6A80; text-transform: uppercase; margin-bottom: 8px; }
    .payment-info p { font-size: 12px; color: #0C1A2E; }
    .footer { position: absolute; bottom: 15mm; left: 25mm; right: 25mm; text-align: center; font-size: 9px; color: #9AA5B4; border-top: 1px solid #E8EDF5; padding-top: 10px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .page { padding: 15mm 20mm; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="logo-block">
        <h1>Centre Equestre</h1>
        <h1 style="color:#F0A010;font-size:16px;">d'Agon-Coutainville</h1>
        <p style="margin-top:8px;">
          56 Charriere du Commerce<br>
          50230 Agon-Coutainville<br>
          Tel : 02 44 84 99 96<br>
          ceagon@orange.fr
        </p>
      </div>
      <div class="invoice-info">
        <div class="number">FACTURE</div>
        <div class="number" style="font-size:16px;">${invoiceNumber}</div>
        <div class="date">Date : ${date}</div>
        <div class="status ${status === 'paid' ? 'status-paid' : status === 'partial' ? 'status-partial' : 'status-pending'}">
          ${status === 'paid' ? 'PAYEE' : status === 'partial' ? 'PARTIELLEMENT PAYEE' : 'EN ATTENTE'}
        </div>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <div class="party-label">Emetteur</div>
        <div class="party-name">Centre Equestre Poney Club</div>
        <div class="party-detail">
          SIRET : [A completer]<br>
          TVA intracommunautaire : [A completer]
        </div>
      </div>
      <div class="party" style="text-align:right;">
        <div class="party-label">Client</div>
        <div class="party-name">${familyName || '—'}</div>
        <div class="party-detail">${familyAddress || ''}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:45%">Designation</th>
          <th style="width:15%">TVA</th>
          <th style="width:20%">Prix HT</th>
          <th style="width:20%">Prix TTC</th>
        </tr>
      </thead>
      <tbody>
        ${(items || []).map((item: any) => `
        <tr>
          <td>${item.activityTitle || item.label || '—'}</td>
          <td>${item.tva || 5.5}%</td>
          <td>${(item.priceHT || 0).toFixed(2)} EUR</td>
          <td>${(item.priceTTC || 0).toFixed(2)} EUR</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-table">
        <div class="totals-row"><span>Total HT</span><span>${(totalHT || 0).toFixed(2)} EUR</span></div>
        <div class="totals-row"><span>TVA</span><span>${(totalTVA || 0).toFixed(2)} EUR</span></div>
        <div class="totals-row total"><span>Total TTC</span><span>${(totalTTC || 0).toFixed(2)} EUR</span></div>
      </div>
    </div>

    <div class="payment-info">
      <h4>Reglement</h4>
      <p>
        Mode : ${paymentMode || '—'}<br>
        ${paymentRef ? `Reference : ${paymentRef}<br>` : ''}
        Montant regle : ${(paidAmount || 0).toFixed(2)} EUR
        ${(paidAmount || 0) < (totalTTC || 0) ? `<br>Reste du : ${((totalTTC || 0) - (paidAmount || 0)).toFixed(2)} EUR` : ''}
      </p>
    </div>

    <div class="footer">
      Centre Equestre Poney Club d'Agon-Coutainville — 56 Charriere du Commerce, 50230 Agon-Coutainville<br>
      SIRET : [A completer] — TVA : [A completer] — Tel : 02 44 84 99 96 — ceagon@orange.fr
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
