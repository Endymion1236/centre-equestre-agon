import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { refreshEmailMode, isEmailRestricted, isRecipientAllowed, blockedLog } from "@/lib/email-guard";

// ═══════════════════════════════════════════════════════════════════
// POST /api/admin/satisfaction-reponse  (admin uniquement)
//
// Répondre à un avis de satisfaction depuis la page admin.
// Deux actions :
//   - "rediger" : l'IA propose un BROUILLON de réponse à partir de l'avis
//     (note, aspects, commentaire). Aucun envoi — l'admin relit/modifie.
//   - "envoyer" : envoie la réponse par email à la famille. L'email est
//     re-résolu côté serveur depuis familyId (jamais fourni par le client),
//     le mode restreint s'applique, et la réponse est tracée sur l'avis
//     (reponse, reponseAt, reponseBy) → plus de double réponse.
// ═══════════════════════════════════════════════════════════════════

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const BCC_SUIVI = "ceagon50@gmail.com";

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const avisId = (body?.avisId || "").trim();
    if (!avisId || (action !== "rediger" && action !== "envoyer")) {
      return NextResponse.json({ error: "avisId et action (rediger|envoyer) requis.", status: "badRequest" }, { status: 400 });
    }

    const avisSnap = await adminDb.collection("avis-satisfaction").doc(avisId).get();
    if (!avisSnap.exists) {
      return NextResponse.json({ error: "Avis introuvable.", status: "missing" }, { status: 404 });
    }
    const avis = avisSnap.data() as any;

    // ── Rédaction IA (aucun envoi) ──
    if (action === "rediger") {
      const contexte = {
        famille: avis.familyName || "",
        enfant: avis.childName || "",
        stage: avis.stageLabel || avis.activityTitle || "",
        noteGlobale: avis.globalNote ?? null,
        aspects: avis.aspects || {},
        moniteurs: avis.moniteurs || [],
        recommande: avis.recommande ?? null,
        commentaire: avis.commentaire || "",
      };
      const msg = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 700,
        messages: [
          {
            role: "user",
            content: `Tu rédiges la réponse du Centre Équestre d'Agon-Coutainville à un avis de satisfaction laissé par une famille. Voici l'avis (JSON) : ${JSON.stringify(contexte)}

Règles :
- Ton chaleureux, personnel et concis (5-10 lignes max), en français, tutoiement INTERDIT (vouvoie la famille).
- Remercie sincèrement, reprends 1-2 éléments CONCRETS de leur avis (jamais générique).
- Si la note est basse ou le commentaire critique : reconnais le point sans te justifier longuement, dis ce que ça t'apporte, propose d'en parler (téléphone ou sur place). Ne promets RIEN de précis (pas de remboursement, pas d'engagement daté).
- Si l'avis est positif : remercie, souligne le plaisir d'accueillir l'enfant (utilise son prénom si fourni), invite à revenir.
- Termine par "L'équipe du Centre Équestre d'Agon-Coutainville".
- Réponds UNIQUEMENT avec le texte de l'email, sans objet, sans commentaire.`,
          },
        ],
      });
      const brouillon = msg.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("")
        .trim();
      return NextResponse.json({ ok: true, brouillon });
    }

    // ── Envoi ──
    const message = (body?.message || "").trim();
    if (!message) {
      return NextResponse.json({ error: "message requis.", status: "badRequest" }, { status: 400 });
    }
    if (avis.reponse) {
      return NextResponse.json({ error: "Une réponse a déjà été envoyée pour cet avis.", status: "already" }, { status: 409 });
    }
    if (!avis.familyId) {
      return NextResponse.json({ error: "Avis sans famille rattachée (pas d'email).", status: "noFamily" }, { status: 400 });
    }
    // Email re-résolu CÔTÉ SERVEUR depuis la famille.
    const famSnap = await adminDb.collection("families").doc(avis.familyId).get();
    const email = famSnap.exists ? ((famSnap.data() as any).parentEmail || "").trim().toLowerCase() : "";
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Email de la famille introuvable.", status: "noEmail" }, { status: 400 });
    }

    await refreshEmailMode();
    if (isEmailRestricted() && !isRecipientAllowed(email)) {
      console.warn(blockedLog(email, "satisfaction-reponse"));
      return NextResponse.json(
        { error: "Mode email restreint actif : ce destinataire n'est pas dans la liste autorisée.", status: "restricted" },
        { status: 403 }
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "RESEND_API_KEY manquant.", status: "config" }, { status: 500 });
    const resend = new Resend(apiKey);
    const subject = `Merci pour votre avis${avis.stageLabel ? ` — ${avis.stageLabel}` : ""}`;
    const { error } = await resend.emails.send({ from: FROM_EMAIL, to: email, bcc: BCC_SUIVI, subject, text: message });
    if (error) {
      return NextResponse.json({ error: `Resend : ${error.message || "échec"}`, status: "sendError" }, { status: 502 });
    }

    // Traçabilité sur l'avis (empêche la double réponse).
    await avisSnap.ref.update({
      reponse: message,
      reponseAt: FieldValue.serverTimestamp(),
      reponseBy: auth.email || auth.uid || "",
      reponseEmail: email,
    });
    console.log(`[satisfaction-reponse] réponse envoyée à ${email} (avis ${avisId})`);
    return NextResponse.json({ ok: true, email });
  } catch (e: any) {
    console.error("[satisfaction-reponse]", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur", status: "error" }, { status: 500 });
  }
}
