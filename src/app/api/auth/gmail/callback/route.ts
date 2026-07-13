import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { gmailExchangeCode } from "@/lib/gmail";

// GET /api/auth/gmail/callback — appelé par Google après consentement.
// Pas de verifyAuth (c'est Google qui redirige le navigateur) : on vérifie
// le `state` généré à l'initiation pour une protection CSRF basique.
export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  const back = (status: string) => NextResponse.redirect(`${base.replace(/\/$/, "")}/admin/boite?gmail=${status}`);

  if (error) return back("refused");
  if (!code || !state) return back("error");

  try {
    const snap = await adminDb.collection("settings").doc("gmail_oauth").get();
    const pending = snap.exists ? (snap.data() as any).pendingState : null;
    if (!pending || pending !== state) return back("state");

    await gmailExchangeCode(code);
    await adminDb.collection("settings").doc("gmail_oauth").set({ pendingState: null }, { merge: true });
    return back("connected");
  } catch (e) {
    console.error("[gmail callback]", e);
    return back("error");
  }
}
