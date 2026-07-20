import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { gmailIsConnected, gmailListRecent, gmailConfigured, gmailAccount } from "@/lib/gmail";

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

  const compte = await gmailAccount();

  // Pagination : le client renvoie le pageToken reçu au chargement précédent.
  const pageToken = req.nextUrl.searchParams.get("pageToken") || undefined;

  try {
    const { messages, nextPageToken } = await gmailListRecent(25, pageToken);
    return NextResponse.json({ configured: true, connected: true, messages, nextPageToken, ...compte });
  } catch (e: any) {
    // "Mail service not enabled" = compte Google sans boite Gmail : message
    // clair plutot qu'un code HTTP brut.
    const brut = e?.message || "Erreur Gmail";
    const error = /mail service not enabled/i.test(brut)
      ? "Ce compte Google n'a pas de boite Gmail. Clique sur Reconnecter et choisis un compte @gmail.com."
      : brut;
    return NextResponse.json(
      { configured: true, connected: true, messages: [], nextPageToken: null, ...compte, error },
      { status: 200 }
    );
  }
}
