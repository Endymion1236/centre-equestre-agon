import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { chercherCreneauxBorne } from "@/lib/borne-creneaux";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * Outil « chercher_creneaux » de la borne Realtime.
 *
 * Pendant une conversation Realtime, le modèle demande un appel d'outil ;
 * c'est le NAVIGATEUR de la borne qui exécute cette route puis renvoie le
 * résultat au modèle via le data channel. La route reste donc authentifiée
 * (token Firebase de la tablette) et limitée en débit, exactement comme le
 * reste du système — le modèle n'a aucun accès direct à Firestore.
 *
 * LECTURE SEULE : données publiques uniquement (voir chercherCreneauxBorne).
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const rl = await checkRateLimit({
    uid: auth.uid,
    routeKey: "borne_creneaux",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const body = await req.json().catch(() => ({}));
    const result = await chercherCreneauxBorne({
      start: typeof body?.start === "string" ? body.start : undefined,
      end: typeof body?.end === "string" ? body.end : undefined,
      type: typeof body?.type === "string" ? body.type : undefined,
    });
    return NextResponse.json({ result });
  } catch (e: any) {
    console.error("[Borne creneaux] Erreur:", e?.message || e);
    return NextResponse.json({ result: "Erreur technique lors de la consultation du planning." });
  }
}
