import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { bornePromptSysteme } from "@/lib/borne-prompt";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Crée une session éphémère OpenAI Realtime pour la borne d'accueil.
 *
 * Le navigateur ne voit JAMAIS la clé OpenAI : cette route génère un
 * client secret à durée de vie courte (~1 min pour établir la connexion
 * WebRTC), avec les instructions et les outils verrouillés CÔTÉ SERVEUR.
 * Le client ne peut donc ni changer le prompt, ni ajouter d'outils.
 *
 * Comme pour /api/borne : LECTURE SEULE. L'unique outil (chercher_creneaux)
 * est exécuté par le client via /api/borne/creneaux, elle-même authentifiée
 * et limitée en débit.
 */
export async function POST(req: NextRequest) {
  // 🔒 Auth : la tablette borne reste connectée avec un compte Firebase
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  // 🚦 6 sessions / minute max : une session couvre toute une conversation,
  // en créer plus vite est le signe d'une boucle de reconnexion ou d'un abus
  // (chaque minute de conversation Realtime a un coût audio non négligeable)
  const rl = await checkRateLimit({
    uid: auth.uid,
    routeKey: "borne_session",
    limit: 6,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY non configurée" }, { status: 500 });
  }

  const instructions = await bornePromptSysteme();

  try {
    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: "gpt-realtime",
          instructions,
          audio: {
            input: {
              // VAD sémantique : le modèle attend la fin réelle de la phrase
              // au lieu de couper sur un silence court — crucial avec des
              // enfants qui hésitent
              turn_detection: { type: "semantic_vad" },
            },
            output: {
              voice: "marin",
            },
          },
          tools: [
            {
              type: "function",
              name: "chercher_creneaux",
              description:
                "Cherche les créneaux à venir (cours, stages, balades…) avec horaires, tarifs et places restantes. À utiliser pour toute question de disponibilité, date ou prix de séance.",
              parameters: {
                type: "object",
                properties: {
                  start: { type: "string", description: "Date de début YYYY-MM-DD (défaut : aujourd'hui)" },
                  end: { type: "string", description: "Date de fin YYYY-MM-DD (défaut : début + 42 jours, max +120 jours)" },
                  type: {
                    type: "string",
                    enum: ["cours", "stage", "stage_journee", "balade", "competition", "anniversaire"],
                    description: "Filtrer par type d'activité (optionnel)",
                  },
                },
              },
            },
          ],
          tool_choice: "auto",
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[Borne session] OpenAI a refusé la création:", res.status, errBody.slice(0, 500));
      return NextResponse.json({ error: "Impossible de créer la session vocale" }, { status: 502 });
    }

    const data = await res.json();
    // On ne renvoie que le strict nécessaire au navigateur
    return NextResponse.json({ clientSecret: data.value, expiresAt: data.expires_at ?? null });
  } catch (e: any) {
    console.error("[Borne session] Erreur:", e?.message || e);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
