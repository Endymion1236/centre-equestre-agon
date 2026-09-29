/**
 * POST /api/ia/preparation-seance { texte, seance }
 *
 * Analyse la note de préparation d'une reprise (règles, schéma et consigne
 * dans lib/analyse-preparation-seance). Réservé à l'équipe du club.
 * Réponse : { success: true, analyse } ou { error }.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { verifyAuth } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  CONSIGNE_PREPARATION,
  SCHEMA_ANALYSE_PREPARATION,
  construireDemandePreparation,
  normaliserAnalysePreparation,
  type ContextePreparation,
} from "@/lib/analyse-preparation-seance";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { staffOnly: true });
  if (auth instanceof NextResponse) return auth;
  const rl = await checkRateLimit({ uid: auth.uid, routeKey: "ia-preparation-seance", limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Clé d'analyse absente (ANTHROPIC_API_KEY)." }, { status: 500 });

  try {
    const body = await req.json().catch(() => ({}));
    const note = String(body?.texte || "").trim();
    if (note.length < 5) return NextResponse.json({ error: "La préparation est trop courte pour être analysée." }, { status: 400 });
    if (note.length > 8000) return NextResponse.json({ error: "Préparation trop longue (8 000 caractères au plus)." }, { status: 400 });
    const seance = (body?.seance && typeof body.seance === "object" ? body.seance : {}) as ContextePreparation;

    const client = new Anthropic({ apiKey });
    const response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // Mise au propre courte et bien cadrée : un effort bas suffit et répond vite.
      output_config: { effort: "low", format: jsonSchemaOutputFormat(SCHEMA_ANALYSE_PREPARATION) },
      system: CONSIGNE_PREPARATION,
      messages: [{ role: "user", content: construireDemandePreparation(note, seance) }],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "L'analyse a été refusée pour cette préparation. La note elle-même reste enregistrable." }, { status: 422 });
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return NextResponse.json({ error: "L'analyse n'a pas pu être lue. Réessayez ; la préparation reste enregistrable sans elle." }, { status: 502 });
    }
    return NextResponse.json({ success: true, analyse: normaliserAnalysePreparation(response.parsed_output) });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Service d'analyse saturé, réessayez dans une minute." }, { status: 429 });
    }
    if (e instanceof Anthropic.APIError) {
      console.error("[ia/preparation-seance] API", e.status, e.message);
      return NextResponse.json({ error: `Analyse indisponible (erreur ${e.status ?? "?"}).` }, { status: 502 });
    }
    console.error("[ia/preparation-seance]", e);
    return NextResponse.json({ error: "Analyse indisponible pour le moment." }, { status: 500 });
  }
}
