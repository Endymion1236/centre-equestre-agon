import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { recipientName, activity, amount, fromName, message, validUntil } = await req.json();

    // Generate a unique voucher code
    const code = `BON-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Generate HTML voucher (will be converted to PDF client-side via print)
    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Outfit:wght@300;400;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Outfit', sans-serif; }
    .voucher {
      width: 800px; height: 400px; margin: 40px auto;
      background: linear-gradient(135deg, #0C1A2E 0%, #183878 50%, #2050A0 100%);
      border-radius: 20px; overflow: hidden; position: relative; color: white;
      display: flex;
    }
    .left { flex: 1; padding: 40px; display: flex; flex-direction: column; justify-content: space-between; }
    .right { width: 280px; background: rgba(255,255,255,0.06); backdrop-filter: blur(10px); padding: 40px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; border-left: 1px solid rgba(255,255,255,0.1); }
    .tag { font-size: 11px; font-weight: 700; color: #F0A010; text-transform: uppercase; letter-spacing: 3px; }
    .title { font-family: 'Libre Baskerville', serif; font-size: 28px; font-weight: 700; margin: 12px 0; line-height: 1.2; }
    .gold { color: #F4B840; }
    .subtitle { font-size: 14px; color: rgba(255,255,255,0.6); line-height: 1.6; }
    .amount { font-family: 'Libre Baskerville', serif; font-size: 52px; font-weight: 700; color: #F0A010; text-shadow: 0 2px 20px rgba(240,160,16,0.3); }
    .code { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.1); padding: 8px 20px; border-radius: 8px; margin-top: 16px; letter-spacing: 2px; }
    .valid { font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 12px; }
    .footer { font-size: 11px; color: rgba(255,255,255,0.3); }
    .message { font-size: 13px; color: rgba(255,255,255,0.5); font-style: italic; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="voucher">
    <div class="left">
      <div>
        <div class="tag">Bon Cadeau</div>
        <div class="title">Centre Equestre<br><span class="gold">d'Agon-Coutainville</span></div>
        <div class="subtitle">
          Pour : <strong style="color:white">${recipientName || "____________"}</strong><br>
          ${activity ? `Activité : <strong style="color:white">${activity}</strong><br>` : ""}
          De la part de : ${fromName || "____________"}
        </div>
        ${message ? `<div class="message">"${message}"</div>` : ""}
      </div>
      <div class="footer">
        56 Charrière du Commerce · 50230 Agon-Coutainville · 02 44 84 99 96 · ceagon@orange.fr
      </div>
    </div>
    <div class="right">
      <div class="amount">${amount || "—"}€</div>
      <div class="code">${code}</div>
      <div class="valid">Valable jusqu'au ${validUntil || "—"}</div>
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
