import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { verifyAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
// Augmenter la limite de taille pour les fichiers audio
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // 🔒 Auth obligatoire
  const auth = await verifyAuth(request);
  if (auth instanceof NextResponse) return auth;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY non configurée dans Vercel." },
      { status: 500 }
    );
  }
  const openai = new OpenAI({ apiKey });

  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: "Fichier audio requis" }, { status: 400 });
    }

    // Vérifier la taille (max 25 MB — limite Whisper)
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio trop long (max 25 MB)" }, { status: 400 });
    }

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "fr",
      prompt: "Bilan pédagogique équitation, galop, foulées, équilibre, position, cavalier, poney, cheval, moniteur, centre équestre.",
    });

    return NextResponse.json({
      success: true,
      text: transcription.text,
    });
  } catch (error: any) {
    console.error("Whisper error:", error);
    console.error("API error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
