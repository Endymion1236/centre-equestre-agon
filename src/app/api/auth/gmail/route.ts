import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { gmailAuthUrl, gmailConfigured, gmailRedirectUri } from "@/lib/gmail";

// GET /api/auth/gmail — adminOnly. Renvoie l'URL de consentement Google.
// La page admin la récupère puis redirige le navigateur dessus.
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  if (!gmailConfigured()) {
    return NextResponse.json(
      { error: "GMAIL_OAUTH_CLIENT_ID / GMAIL_OAUTH_CLIENT_SECRET manquants dans Vercel" },
      { status: 400 }
    );
  }

  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  await adminDb.collection("settings").doc("gmail_oauth").set({ pendingState: state }, { merge: true });

  return NextResponse.json({ url: gmailAuthUrl(state), redirectUri: gmailRedirectUri() });
}
