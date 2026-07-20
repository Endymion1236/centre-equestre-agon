/**
 * POST /api/admin/gmail/voicemail — adminOnly.
 *
 * Transforme un mail du répondeur StandardFacile en texte exploitable par
 * l'assistant boîte de réception :
 *   1. télécharge le MP3 joint au mail (API Gmail)
 *   2. le transcrit (gpt-4o-transcribe, fallback whisper-1)
 *   3. rapproche le numéro appelant d'une famille existante
 *
 * Sortie = un "faux mail" (from / subject / body) que la page peut envoyer tel
 * quel à /api/admin/inbox-assistant. Aucun traitement spécifique en aval :
 * un message vocal transcrit est un mail comme un autre.
 *
 * Body : { messageId, attachmentId, subject }
 */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { verifyAuth } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { adminDb } from "@/lib/firebase-admin";
import { gmailIsConnected, gmailGetAttachment } from "@/lib/gmail";
import { parseObjetRepondeur, objetTranscription } from "@/lib/standardfacile";
import { findFamilyByPhone, phoneDisplay } from "@/lib/phone";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vocabulaire du club : améliore nettement la transcription des noms propres
// et du jargon (un appelant qui dit "je voudrais inscrire ma fille au galop 2").
const PROMPT_TRANSCRIPTION =
  "Message vocal laissé au Centre Équestre Poney Club d'Agon-Coutainville. " +
  "Vocabulaire : stage, reprise, poney, cheval, galop, cavalier, balade, " +
  "pony games, baptême, anniversaire, licence, moniteur, Coutainville, Agon.";

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  // Transcription facturée à la minute d'audio → on borne.
  const rl = await checkRateLimit({
    uid: auth.uid,
    routeKey: "voicemail",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY non configurée." }, { status: 500 });
  }

  try {
    const { messageId, attachmentId, subject } = await req.json();
    if (!messageId || !attachmentId) {
      return NextResponse.json(
        { error: "messageId et attachmentId requis" },
        { status: 400 }
      );
    }
    if (!(await gmailIsConnected())) {
      return NextResponse.json({ error: "Gmail non connecté" }, { status: 400 });
    }

    // ── 1. Numéro appelant + durée (lus dans l'objet du mail) ──────────
    const info = parseObjetRepondeur(subject || "");
    if (!info) {
      return NextResponse.json(
        { error: "Objet non reconnu comme un message StandardFacile" },
        { status: 400 }
      );
    }

    // Message d'1 ou 2 secondes : l'appelant a raccroché. Inutile de payer
    // une transcription pour du silence.
    if (info.troopCourt) {
      return NextResponse.json({
        vocal: true,
        vide: true,
        numero: info.numero,
        numeroLisible: info.anonyme ? "" : phoneDisplay(info.numero),
        dureeSec: info.dureeSec,
        from: "",
        subject: objetTranscription(info, phoneDisplay(info.numero)),
        body: "(Message vide — l'appelant a raccroché immédiatement.)",
        famille: null,
      });
    }

    // ── 2. Téléchargement + transcription ─────────────────────────────
    const audio = await gmailGetAttachment(messageId, attachmentId);
    if (audio.length > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio trop volumineux (max 25 Mo)" }, { status: 400 });
    }

    const file = new File([new Uint8Array(audio)], "message.mp3", { type: "audio/mpeg" });
    const openai = new OpenAI({ apiKey });
    const primaryModel = process.env.WHISPER_MODEL || "gpt-4o-transcribe";

    let transcription;
    try {
      transcription = await openai.audio.transcriptions.create({
        file,
        model: primaryModel,
        language: "fr",
        prompt: PROMPT_TRANSCRIPTION,
      });
    } catch (primaryErr: any) {
      if (primaryModel === "whisper-1") throw primaryErr;
      console.warn(
        `[voicemail] échec ${primaryModel}, fallback whisper-1 :`,
        primaryErr?.message || primaryErr
      );
      transcription = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        language: "fr",
        prompt: PROMPT_TRANSCRIPTION,
      });
    }

    const texte = (transcription.text || "").trim();

    // ── 3. Rapprochement famille par numéro ───────────────────────────
    let famille = null;
    if (info.numero) {
      try {
        famille = await findFamilyByPhone(adminDb, info.numero);
      } catch (e) {
        console.warn("[voicemail] rapprochement famille impossible :", (e as any)?.message);
      }
    }

    const numeroLisible = info.anonyme ? "" : phoneDisplay(info.numero);

    // Le corps reprend le contexte téléphonique EN PLUS de la transcription :
    // l'assistant sait ainsi qu'il traite un appel (pas de "bonjour, suite à
    // votre mail…" dans le brouillon de réponse).
    const entete = famille
      ? `Message vocal laissé au répondeur par ${famille.parentName} (${numeroLisible}).`
      : info.anonyme
        ? "Message vocal laissé au répondeur depuis un numéro masqué."
        : `Message vocal laissé au répondeur par le ${numeroLisible} (numéro inconnu de la base).`;

    return NextResponse.json({
      vocal: true,
      vide: false,
      numero: info.numero,
      numeroLisible,
      dureeSec: info.dureeSec,
      // Si la famille est reconnue, on pré-remplit son email : le brouillon de
      // réponse et le bouton "Envoyer" fonctionnent sans ressaisie.
      from: famille?.parentEmail || "",
      subject: objetTranscription(info, numeroLisible),
      body: `${entete}\n\nTranscription :\n${texte}`,
      transcription: texte,
      famille,
    });
  } catch (e: any) {
    console.error("[voicemail]", e?.message || e);
    return NextResponse.json({ error: e?.message || "Erreur interne" }, { status: 500 });
  }
}
