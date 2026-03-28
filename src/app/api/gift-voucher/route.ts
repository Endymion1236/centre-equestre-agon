import { getClubInfo } from "@/lib/club-info";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const CLUB = await getClubInfo();
  try {
    const body = await req.json();
    const { recipientName, offerDescription, amount, validUntil, code, buyerName } = body;

    // Generate HTML for the gift voucher
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Outfit:wght@300;400;600;700&display=swap');
  body { margin: 0; font-family: 'Outfit', sans-serif; }
  .voucher { width: 800px; min-height: 400px; background: linear-gradient(135deg, #0C1A2E 0%, #183878 40%, #2050A0 100%); color: white; padding: 50px; position: relative; overflow: hidden; }
  .voucher::before { content: ''; position: absolute; top: -50%; right: -20%; width: 400px; height: 400px; background: radial-gradient(circle, rgba(240,160,16,0.15) 0%, transparent 70%); }
  .logo { font-family: 'Libre Baskerville', serif; font-size: 16px; font-weight: 700; margin-bottom: 30px; }
  .logo span { color: #F0A010; }
  h1 { font-family: 'Libre Baskerville', serif; font-size: 36px; font-weight: 700; margin: 0 0 8px; }
  .gold { color: #F0A010; }
  .recipient { font-size: 24px; font-weight: 700; color: #F4B840; margin: 20px 0 5px; }
  .offer { font-size: 18px; color: rgba(255,255,255,0.8); margin-bottom: 20px; }
  .amount { font-family: 'Libre Baskerville', serif; font-size: 48px; font-weight: 700; color: #F0A010; margin: 15px 0; }
  .details { display: flex; gap: 40px; margin-top: 25px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.15); }
  .detail { font-size: 12px; color: rgba(255,255,255,0.5); }
  .detail strong { display: block; font-size: 14px; color: rgba(255,255,255,0.8); font-weight: 600; }
  .code { font-family: monospace; font-size: 20px; letter-spacing: 3px; color: #F4B840; background: rgba(240,160,16,0.15); padding: 8px 20px; border-radius: 8px; display: inline-block; margin-top: 10px; }
  .footer { margin-top: 30px; font-size: 11px; color: rgba(255,255,255,0.3); }
</style></head>
<body>
  <div class="voucher">
    <div class="logo">Centre Equestre <span>·</span> Agon-Coutainville</div>
    <h1>Bon <span class="gold">Cadeau</span></h1>
    <div class="recipient">Pour : ${recipientName}</div>
    <div class="offer">${offerDescription}</div>
    <div class="amount">${amount}€</div>
    <div class="code">${code}</div>
    <div class="details">
      <div class="detail">Offert par<strong>${buyerName}</strong></div>
      <div class="detail">Valable jusqu'au<strong>${validUntil}</strong></div>
      <div class="detail">Réservation<strong>${CLUB.tel}</strong></div>
    </div>
    <div class="footer">Centre Équestre Poney Club d'Agon-Coutainville · 56 Charrière du Commerce · 50230 Agon-Coutainville · ${CLUB.email}</div>
  </div>
</body>
</html>`;

    // Return HTML that can be printed as PDF by the browser
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
