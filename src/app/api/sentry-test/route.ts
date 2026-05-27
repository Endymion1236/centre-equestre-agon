import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────
//  Route API de test Sentry (cote serveur)
// ─────────────────────────────────────────────────────────────────────────
// Appelee depuis /admin/sentry-test pour verifier que Sentry capture bien
// les erreurs serveur. Throw volontairement -> Sentry intercepte via
// onRequestError dans instrumentation.ts.

export async function POST() {
  throw new Error("Test erreur serveur Sentry — depuis /api/sentry-test");

  // unreachable mais TS ne le sait pas, on rassure le linter
  // eslint-disable-next-line @typescript-eslint/no-unreachable
  return NextResponse.json({ ok: false });
}
