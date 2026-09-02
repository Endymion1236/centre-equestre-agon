import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { chercherCreneauxBorneDetaille } from "@/lib/borne-creneaux";

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
    const { texte, cartes } = await chercherCreneauxBorneDetaille({
      start: typeof body?.start === "string" ? body.start : undefined,
      end: typeof body?.end === "string" ? body.end : undefined,
      type: typeof body?.type === "string" ? body.type : undefined,
    });
    // `result` : le texte lu par le modèle. `creneaux` : les cartes que la
    // borne affiche à l'écran, avec un code QR pour réserver depuis son
    // téléphone (la tablette reste sur le compte du club).
    return NextResponse.json({ result: texte, creneaux: cartes });
  } catch (e: any) {
    console.error("[Borne creneaux] Erreur:", e?.message || e);
    return NextResponse.json({ result: "Erreur technique lors de la consultation du planning." });
  }
}

/**
 * Préchauffage : la page borne appelle ce GET dès son affichage pour
 * réveiller la fonction serverless (imports firebase-admin compris)
 * AVANT que le visiteur n'appuie sur le bouton. Sans ça, le premier
 * démarrage de conversation payait 1 à 3 s de démarrage à froid Vercel.
 * Aucune donnée, aucun coût : juste un chargement de module.
 */
export async function GET() {
  return NextResponse.json({ ok: true });
}
