import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 🔒 Admin only
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const results: {
    anthropic: { cost: number | null; period: string; error?: string };
    openai: { cost: number | null; period: string; error?: string };
    elevenlabs: { used: number | null; limit: number | null; plan: string; error?: string };
  } = {
    anthropic: { cost: null, period: "" },
    openai: { cost: null, period: "" },
    elevenlabs: { used: null, limit: null, plan: "" },
  };

  // ── Anthropic ──────────────────────────────────────────────────────────
  try {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      // L'API Anthropic n'a pas d'endpoint billing public facilement accessible.
      // On utilise l'endpoint /v1/messages/count ou on note qu'il faut aller sur console.anthropic.com
      // Alternative : on peut tracker côté Firestore les appels faits via /api/ia
      results.anthropic = {
        cost: null,
        period: new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
        error: "Consultez console.anthropic.com/settings/billing",
      };
    } else {
      results.anthropic.error = "Clé non configurée";
    }
  } catch (e: any) {
    results.anthropic.error = e.message;
  }

  // ── OpenAI (Whisper) ───────────────────────────────────────────────────
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      // Dates du mois en cours
      const now = new Date();
      const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const endDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

      const res = await fetch(
        `https://api.openai.com/v1/organization/costs?start_time=${Math.floor(new Date(startDate).getTime() / 1000)}&end_time=${Math.floor(new Date(endDate + "T23:59:59").getTime() / 1000)}`,
        { headers: { Authorization: `Bearer ${openaiKey}` } }
      );
      if (res.ok) {
        const data = await res.json();
        // L'API costs retourne les coûts en centimes USD
        const totalCents = data.data?.reduce((s: number, d: any) =>
          s + (d.results?.reduce((s2: number, r: any) => s2 + (r.amount?.value || 0), 0) || 0), 0) || 0;
        results.openai = {
          cost: Math.round(totalCents) / 100,
          period: `${startDate} → ${endDate}`,
        };
      } else {
        // Fallback : pas d'accès billing, indiquer le lien
        results.openai = {
          cost: null,
          period: new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
          error: "Consultez platform.openai.com/usage",
        };
      }
    } else {
      results.openai.error = "Clé non configurée";
    }
  } catch (e: any) {
    results.openai.error = e.message;
  }

  // ── ElevenLabs ─────────────────────────────────────────────────────────
  try {
    const elevenKey = process.env.ELEVENLABS_API_KEY;
    if (elevenKey) {
      const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
        headers: { "xi-api-key": elevenKey },
      });
      if (res.ok) {
        const data = await res.json();
        results.elevenlabs = {
          used: data.character_count || 0,
          limit: data.character_limit || 0,
          plan: data.tier || "free",
        };
      } else {
        results.elevenlabs.error = "Erreur API ElevenLabs";
      }
    } else {
      results.elevenlabs.error = "Clé non configurée";
    }
  } catch (e: any) {
    results.elevenlabs.error = e.message;
  }

  return NextResponse.json(results);
}
