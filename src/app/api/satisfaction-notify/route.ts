/**
 * POST /api/satisfaction-notify
 *
 * Notifie le centre par email qu'une famille a laisse un avis de
 * satisfaction. Accessible a TOUT utilisateur connecte (pas seulement
 * admin), contrairement a /api/send-email qui est admin-only.
 *
 * Pourquoi une route dediee : la page satisfaction cote famille appelait
 * /api/send-email, mais cette route exige le claim admin. Une famille
 * n'etant pas admin, l'appel etait rejete (403) et l'email n'arrivait
 * jamais -- en silence (fire-and-forget cote client).
 *
 * Securite : la famille ne fournit QUE les donnees de l'avis (note,
 * commentaire, activite). Le HTML, le destinataire (toujours le centre)
 * et le sujet sont construits cote serveur. Impossible de detourner la
 * route pour spammer des tiers.
 *
 * Body : { globalNote: number, commentaire?: string, activityTitle?: string,
 *          parentName?: string, aspects?: Record<string, number> }
 */

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { verifyAuth } from "@/lib/api-auth";
import { logEmail } from "@/lib/email-log";
import { isRecipientAllowed, blockedLog, refreshEmailMode } from "@/lib/email-guard";

export const dynamic = "force-dynamic";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const OWNER_EMAIL = process.env.RESEND_OWNER_EMAIL || process.env.NEXT_PUBLIC_OWNER_EMAIL || "ceagon50@gmail.com";
const TEST_MODE = !process.env.RESEND_FROM_EMAIL || process.env.RESEND_TEST_MODE === "true";

export async function POST(req: NextRequest) {
  // Auth : utilisateur connecte (famille ou admin), PAS de claim admin requis
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "RESEND_API_KEY non configuree" }, { status: 500 });
    }
    const resend = new Resend(apiKey);

    const body = await req.json();
    const globalNote = Number(body.globalNote) || 0;
    const commentaire = String(body.commentaire || "").trim().slice(0, 2000);
    const activityTitle = String(body.activityTitle || "Général").slice(0, 200);
    const parentName = String(body.parentName || "Une famille").slice(0, 200);
    const aspects = (body.aspects && typeof body.aspects === "object") ? body.aspects : {};

    if (globalNote < 1 || globalNote > 5) {
      return NextResponse.json({ error: "Note invalide" }, { status: 400 });
    }

    // Echappement basique anti-injection HTML sur les champs libres
    const esc = (s: string) => s.replace(/[<>&"']/g, c => ({
      "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;",
    }[c] || c));

    const stars = "⭐".repeat(globalNote) + "☆".repeat(5 - globalNote);

    // Detail des aspects (sous-notes par critere) si fournis
    const aspectsHtml = Object.keys(aspects).length > 0
      ? `<div style="margin:12px 0;">
          ${Object.entries(aspects).map(([k, v]) =>
            `<div style="font-size:13px;color:#555;margin:2px 0;">${esc(k)} : ${"⭐".repeat(Number(v) || 0)}</div>`
          ).join("")}
        </div>`
      : "";

    const subject = `${"⭐".repeat(globalNote)} Avis satisfaction — ${parentName}`;
    const html = `<div style="font-family:sans-serif;max-width:520px;padding:24px;">
      <p><strong>${esc(parentName)}</strong> a laissé un avis de satisfaction :</p>
      <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0;font-size:18px;">${stars} <strong>${globalNote}/5</strong></p>
        <p style="margin:8px 0 0;color:#555;font-size:13px;">Activité : ${esc(activityTitle)}</p>
        ${aspectsHtml}
        ${commentaire ? `<p style="margin:8px 0 0;color:#333;font-size:14px;font-style:italic;">« ${esc(commentaire)} »</p>` : ""}
      </div>
      <p style="font-size:12px;color:#888;">Retrouve tous les avis dans l'espace admin → Satisfaction.</p>
    </div>`;

    const finalTo = TEST_MODE && process.env.RESEND_OWNER_EMAIL
      ? [process.env.RESEND_OWNER_EMAIL]
      : [OWNER_EMAIL];

    // 🔒 Garde-fou phase de préparation.
    await refreshEmailMode();
    const finalAllowed = finalTo.filter((e: string) => isRecipientAllowed(e));
    if (finalAllowed.length === 0) {
      console.warn(blockedLog(finalTo.join(", "), "espace_cavalier_satisfaction"));
      return NextResponse.json({ skipped: true, reason: "mode_restreint" }, { status: 200 });
    }

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: finalAllowed,
      subject: TEST_MODE ? `[TEST] ${subject}` : subject,
      html,
    });

    if (error) {
      console.error("satisfaction-notify resend error:", error);
      await logEmail({
        to: finalTo, subject,
        context: "espace_cavalier_satisfaction",
        template: "satisfaction-notify",
        status: "failed", error: (error as any)?.message || String(error),
        sentBy: (auth as any)?.uid || "famille",
      });
      return NextResponse.json({ error: "Erreur envoi" }, { status: 500 });
    }

    await logEmail({
      to: finalTo, subject,
      context: "espace_cavalier_satisfaction",
      template: "satisfaction-notify",
      status: "sent",
      sentBy: (auth as any)?.uid || "famille",
    });

    return NextResponse.json({ success: true, messageId: data?.id });
  } catch (e: any) {
    console.error("satisfaction-notify fatal:", e);
    return NextResponse.json({ error: e?.message || "Erreur interne" }, { status: 500 });
  }
}
