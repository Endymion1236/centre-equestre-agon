/**
 * Envoi d'une relance de réinscription à une famille — admin.
 * POST /api/admin/reinscriptions/relance  body: { to, subject, body, familyId?, childName? }
 *
 * Respecte le garde-fou email (isRecipientAllowed) : en mode restreint, seuls les
 * admins reçoivent réellement — sinon l'envoi est "bloqué" (rien n'est envoyé).
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { Resend } from "resend";
import { isRecipientAllowed, blockedLog, refreshEmailMode } from "@/lib/email-guard";
import { logEmail } from "@/lib/email-log";

export const dynamic = "force-dynamic";

const FROM = process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM || "onboarding@resend.dev";
const BCC = process.env.RESEND_BCC_EMAIL || process.env.RESEND_BCC || "";

const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const { to, subject, body, familyId, childName } = await req.json().catch(() => ({}));
    if (!to || !subject || !body) return NextResponse.json({ error: "to, subject et body requis" }, { status: 400 });

    await refreshEmailMode();
    if (!isRecipientAllowed(to)) {
      console.log(blockedLog(to, "reinscription-relance"));
      return NextResponse.json({ blocked: true, message: "Envoi bloqué (mode restreint : seuls les admins reçoivent)." });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "RESEND_API_KEY absente — envoi impossible." }, { status: 500 });
    }
    const resend = new Resend(process.env.RESEND_API_KEY);

    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">${esc(body).replace(/\n/g, "<br>")}</div>`;

    await resend.emails.send({ from: FROM, to, ...(BCC ? { bcc: BCC } : {}), subject, html });
    await logEmail({ to, subject, context: "reinscription_relance", template: "reinscriptionRelance", status: "sent", familyId: familyId || "", sentBy: (auth as any)?.email || "admin" }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
