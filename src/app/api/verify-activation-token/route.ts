/**
 * POST /api/verify-activation-token
 *
 * Route PUBLIQUE. Echange un token d'activation "maison" (duree 7 jours,
 * stocke dans Firestore) contre un Firebase custom token, que le client
 * utilise ensuite avec signInWithCustomToken pour se connecter.
 *
 * Body : { token: string }
 *
 * Reponse :
 *   - 200 { ok: true, customToken }    -> succes
 *   - 200 { ok: false, error: 'expired'|'used'|'not_found'|'internal' }
 *     (on renvoie 200 meme en cas d'echec metier pour que le client gere
 *      proprement l'affichage ; le code 'error' precise la cause)
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyActivationToken } from "@/lib/activation-token";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 200 });
  }

  const token = (body.token || "").trim();
  const result = await verifyActivationToken(token);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
  }

  return NextResponse.json({ ok: true, customToken: result.customToken }, { status: 200 });
}
