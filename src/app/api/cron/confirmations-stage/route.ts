/**
 * GET /api/cron/confirmations-stage  (toutes les 5 minutes)
 *
 * Envoie les confirmations de stage arrivées à échéance. Le regroupement est
 * décrit dans lib/stage-confirmations : après une inscription, la lettre
 * attend quelques minutes que les stages suivants de la même famille la
 * rejoignent, puis part une seule fois.
 *
 * Une file dont l'échéance n'est pas atteinte est laissée telle quelle : ce
 * cron peut donc tourner aussi souvent qu'on veut sans couper un regroupement
 * en cours.
 */

import { NextRequest, NextResponse } from "next/server";
import { envoyerConfirmationsDues } from "@/lib/stage-confirmations";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resultats = await envoyerConfirmationsDues();
    const envoyes = resultats.filter((r) => r.sent);
    return NextResponse.json({
      ok: true,
      examines: resultats.length,
      envoyes: envoyes.length,
      details: resultats,
    });
  } catch (e: any) {
    console.error("[cron confirmations-stage]", e);
    return NextResponse.json({ error: "Erreur d'envoi des confirmations" }, { status: 500 });
  }
}
