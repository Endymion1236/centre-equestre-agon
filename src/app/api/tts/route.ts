import { NextRequest, NextResponse } from "next/server";
import { ElevenLabsClient } from "elevenlabs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEFAULT_VOICE_ID = "XB0fDUnXU5powFXDhCwa"; // Charlotte

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

export async function POST(request: NextRequest) {
  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: "ELEVENLABS_API_KEY non configurée" }, { status: 500 });
  }
  try {
    const { text, voiceId = DEFAULT_VOICE_ID } = await request.json();
    if (!text?.trim()) return NextResponse.json({ error: "Texte requis" }, { status: 400 });

    const truncated = text.slice(0, 500);

    const audioStream = await client.textToSpeech.convertAsStream(voiceId, {
      text: truncated,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
      output_format: "mp3_44100_128",
    });

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of audioStream) {
            controller.enqueue(chunk);
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new NextResponse(readableStream, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: any) {
    console.error("ElevenLabs TTS error:", error);
    return NextResponse.json({ error: error.message || "Erreur TTS" }, { status: 500 });
  }
}
