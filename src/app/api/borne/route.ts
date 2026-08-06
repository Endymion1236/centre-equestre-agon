import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { verifyAuth } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { chercherCreneauxBorne } from "@/lib/borne-creneaux";
import { bornePromptSysteme } from "@/lib/borne-prompt";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Borne d'accueil — assistant vocal en LECTURE SEULE.
 *
 * Contrairement à /api/agent (admin, écriture avec confirmation), cette
 * route ne dispose d'AUCUN outil d'écriture : la borne est un écran
 * public à l'accueil du club, manipulé par n'importe quel visiteur.
 * Une borne qui écrit en base = inscriptions fantômes, homonymes mal
 * appariés, enfants inscrits par erreur. La borne RENSEIGNE, l'inscription
 * réelle passe par l'espace cavalier (lien affiché à l'écran).
 *
 * Les données planning passent par toPublicPlanningSlot : jamais les noms
 * des inscrits ni les identifiants familles — uniquement places restantes,
 * horaires et tarifs, comme sur le planning public du site.
 */

// ── Outils LECTURE SEULE ──────────────────────────────────────────────────────

const tools: Anthropic.Tool[] = [
  {
    name: "chercher_creneaux",
    description:
      "Cherche les créneaux à venir (cours, stages, balades…) avec horaires, tarifs et places restantes. Utilise cet outil dès qu'on te demande des disponibilités, des dates, des prix de séances ou « est-ce qu'il reste de la place ».",
    input_schema: {
      type: "object" as const,
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
];

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 🔒 Auth obligatoire : la tablette borne reste connectée avec un compte
  // dédié. Pas de route ouverte au public — les appels IA/TTS sont facturés,
  // un endpoint anonyme serait une pompe à frais.
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  // 🚦 Rate limit : 20 questions / minute pour la borne (une conversation
  // normale en fait 2-4 ; au-delà c'est un bug de boucle ou un abus)
  const rl = await checkRateLimit({
    uid: auth.uid,
    routeKey: "borne",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const { question, history = [] } = await req.json();
    if (!question?.trim()) {
      return NextResponse.json({ error: "Question requise" }, { status: 400 });
    }

    const basePrompt = await bornePromptSysteme();
    const systemPrompt = `${basePrompt}

FORMAT DE RÉPONSE — réponds UNIQUEMENT en JSON valide, sans backticks :
{ "text": "ta réponse orale", "action": null }
Si la personne veut s'inscrire / réserver et que tu connais le créneau visé (les données contiennent [date_iso:YYYY-MM-DD] et [type:...]) :
{ "text": "…", "action": { "label": "Réserver ce créneau", "href": "/espace-cavalier/reserver?filter=TYPE&date=DATE_ISO" } }
Sinon pour une inscription générale : href = "/espace-cavalier/reserver".`;

    // Historique (alternance stricte user/assistant)
    const messages: Anthropic.MessageParam[] = [];
    for (const h of Array.isArray(history) ? history.slice(-10) : []) {
      if ((h.role === "user" || h.role === "assistant") && typeof h.content === "string") {
        if (messages.length === 0 || messages[messages.length - 1].role !== h.role) {
          messages.push({ role: h.role, content: h.content });
        }
      }
    }
    if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
      messages.push({ role: "user", content: question });
    } else {
      messages[messages.length - 1] = { role: "user", content: question };
    }

    let response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: systemPrompt,
      tools,
      messages,
    });

    // Boucle outils — max 3 tours (chercher_creneaux uniquement, lecture seule)
    let loopCount = 0;
    while (response.stop_reason === "tool_use" && loopCount < 3) {
      loopCount++;
      const toolUses = response.content.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        let result: string;
        try {
          result = tu.name === "chercher_creneaux"
            ? await chercherCreneauxBorne(tu.input as any)
            : `Outil inconnu : ${tu.name}`;
        } catch (e: any) {
          console.error("[Borne] Erreur outil:", e?.message || e);
          result = "Erreur technique lors de la consultation du planning.";
        }
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });

      response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system: systemPrompt,
        tools,
        messages,
      });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = (textBlock as Anthropic.TextBlock | undefined)?.text || "";

    // Parser le JSON structuré — fallback texte brut si le modèle a dérapé
    let text = raw.trim();
    let action: { label: string; href: string } | null = null;
    try {
      const cleaned = raw
        .replace(/^\s*```json\s*/i, "")
        .replace(/^\s*```\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      if (parsed?.text) {
        text = String(parsed.text);
        if (parsed.action?.href && parsed.action?.label) {
          const href = String(parsed.action.href);
          // Garde-fou : uniquement des liens internes vers l'espace cavalier
          if (href.startsWith("/espace-cavalier")) {
            action = { label: String(parsed.action.label), href };
          }
        }
      }
    } catch {
      // Texte brut — on le garde tel quel
    }

    if (!text) text = "Je n'ai pas pu répondre, désolé. Vous pouvez vous renseigner à l'accueil.";

    return NextResponse.json({ text, action });
  } catch (error: any) {
    console.error("[Borne] Erreur route:", error?.message || error);
    return NextResponse.json(
      { text: "Une erreur technique est survenue. L'équipe de l'accueil pourra vous renseigner.", action: null },
      { status: 200 },
    );
  }
}
