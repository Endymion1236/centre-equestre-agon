import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY non configurée" }, { status: 500 });
  }
  try {
    const { text, voice = "nova" } = await request.json();
    if (!text?.trim()) return NextResponse.json({ error: "Texte requis" }, { status: 400 });

    // Tronquer à 500 caractères max pour les réponses vocales
    const truncated = text.slice(0, 500);

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice, // alloy, echo, fable, onyx, nova, shimmer
      input: truncated,
      speed: 1.0,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: any) {
    console.error("TTS error:", error);
    return NextResponse.json({ error: error.message || "Erreur TTS" }, { status: 500 });
  }
}
