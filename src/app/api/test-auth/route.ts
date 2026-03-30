/**
 * /api/test-auth
 *
 * Route UNIQUEMENT disponible en environnement de test (NODE_ENV !== "production").
 * Reçoit un Firebase ID token et crée un cookie de session que Playwright peut
 * persister dans son storageState.
 *
 * Utilisé exclusivement par auth.setup.ts pour bootstrapper les sessions de test.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  // 🔒 Bloquer en production
  if (process.env.NODE_ENV === "production" && !process.env.PLAYWRIGHT_TEST_MODE) {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  try {
    const { idToken, email } = await req.json();

    if (!idToken || !email) {
      return NextResponse.json({ error: "idToken and email required" }, { status: 400 });
    }

    // Vérifier le token Firebase
    const decoded = await adminAuth.verifyIdToken(idToken);

    if (decoded.email !== email) {
      return NextResponse.json({ error: "Token email mismatch" }, { status: 401 });
    }

    // Créer un session cookie Firebase (5 minutes pour les tests)
    const expiresIn = 5 * 60 * 1000;
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });

    const response = NextResponse.json({
      ok: true,
      uid: decoded.uid,
      email: decoded.email,
    });

    response.cookies.set("firebase-session", sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: expiresIn / 1000,
      path: "/",
      sameSite: "lax",
    });

    return response;
  } catch (error: any) {
    console.error("[test-auth]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
