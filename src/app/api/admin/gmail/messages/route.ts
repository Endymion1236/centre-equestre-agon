import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { gmailIsConnected, gmailListRecent, gmailConfigured } from "@/lib/gmail";

// GET /api/admin/gmail/messages — adminOnly. Statut + mails récents.
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  if (!gmailConfigured()) {
    return NextResponse.json({ configured: false, connected: false, messages: [] });
  }

  const connected = await gmailIsConnected();
  if (!connected) {
    return NextResponse.json({ configured: true, connected: false, messages: [] });
  }

  try {
    const messages = await gmailListRecent(12);
    return NextResponse.json({ configured: true, connected: true, messages });
  } catch (e: any) {
    return NextResponse.json(
      { configured: true, connected: true, messages: [], error: e?.message || "Erreur Gmail" },
      { status: 200 }
    );
  }
}
